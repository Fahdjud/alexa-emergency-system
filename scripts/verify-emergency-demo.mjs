// Isolated component verification: no browser, network, or AWS access.
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import ts from "typescript"
const source = ts.transpileModule(
  fs.readFileSync("components/alexa/alexa-assistant.tsx", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }
).outputText

function setup(speech = false) {
  let clock = 0,
    sequence = 0
  const timers = new Map(),
    calls = [],
    messages = [],
    cleanups = []
  const elements = []
  let utterance
  const jsx = (type, props) => {
    const element = { type, props }
    elements.push(element)
    return element
  }
  const context = {
    exports: {},
    require: (name) => {
      if (name === "react")
        return {
          useState: (initial) => [
            initial,
            (update) => {
              if (typeof update === "function" && Array.isArray(initial)) {
                const next = update(messages.slice())
                messages.splice(0, messages.length, ...next)
              }
            },
          ],
          useRef: (current) => ({ current }),
          useEffect: (effect) => {
            const cleanup = effect()
            if (cleanup) cleanups.push(cleanup)
          },
        }
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx }
      if (name === "@/lib/client/monitor-settings")
        return { deviceTokenStore: { read: () => "test-device-token" } }
      if (name === "./data")
        return { getDemoReply: () => "Demo reply", suggestions: [] }
      return new Proxy({}, { get: (_, key) => key })
    },
    window: speech
      ? {
          speechSynthesis: {
            cancel() {},
            speak(value) {
              utterance = value
            },
          },
        }
      : {},
    SpeechSynthesisUtterance: function (text) {
      this.text = text
    },
    crypto: { randomUUID: () => `event-${++sequence}` },
    Date: class extends Date {
      static now() {
        return clock
      }
    },
    setTimeout: (fn, delay) => {
      const id = ++sequence
      timers.set(id, { fn, at: clock + delay })
      return id
    },
    clearTimeout: (id) => timers.delete(id),
    setInterval: () => ++sequence,
    clearInterval() {},
    fetch: async (url, options) => {
      calls.push({
        url,
        event: JSON.parse(options.body),
        authorization: options.headers.Authorization,
      })
      return {
        ok: true,
        json: async () => ({
          status: "published",
          eventId: calls.at(-1).event.id,
        }),
      }
    },
  }
  vm.runInNewContext(source, context)
  context.exports.AlexaAssistant()
  const header = elements.find((item) => item.type === "AlexaHeader").props
  const composer = elements.find(
    (item) => item.type === "MessageComposer"
  ).props
  const advance = (milliseconds) => {
    const target = clock + milliseconds
    for (;;) {
      const entry = [...timers]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0]
      if (!entry) break
      clock = entry[1].at
      timers.delete(entry[0])
      entry[1].fn()
    }
    clock = target
  }
  return {
    header,
    composer,
    advance,
    calls,
    messages,
    cleanups,
    spoken: () => utterance,
  }
}

async function verify() {
  for (const delay of [0, 4999, 5000, 9999]) {
    const demo = setup()
    demo.header.onSimulateFall()
    demo.advance(delay)
    demo.composer.onConfirmOkay()
    demo.advance(30000)
    assert.equal(
      demo.calls.length,
      0,
      `Cancellation at ${delay}ms must prevent requests`
    )
    assert.match(demo.messages.at(-1).text, /No alert was sent/)
  }
  const demo = setup()
  demo.header.onSimulateFall()
  demo.header.onSimulateFall()
  demo.advance(4999)
  assert.equal(demo.calls.length, 0)
  demo.advance(1)
  assert.match(demo.messages.at(-1).text, /Please respond/)
  demo.advance(4999)
  assert.equal(demo.calls.length, 0)
  demo.advance(1)
  demo.header.onSimulateFall()
  demo.composer.onConfirmOkay()
  demo.advance(30000)
  assert.equal(demo.calls.length, 1)
  assert.equal(demo.calls[0].url, "/api/emergency")
  assert.equal(demo.calls[0].authorization, "Bearer test-device-token")
  assert.equal(demo.calls[0].event.type, "Possible Fall")
  assert.match(demo.calls[0].event.message, /Demo simulation/)
  await new Promise((resolve) => setImmediate(resolve))
  assert.match(demo.messages.at(-1).text, /sent to SNS/)
  demo.header.onSimulateFall()
  demo.advance(10000)
  assert.equal(demo.calls.length, 2)
  assert.notEqual(demo.calls[0].event.id, demo.calls[1].event.id)
  const spoken = setup(true)
  spoken.header.onSimulateFall()
  spoken.advance(1000)
  assert.equal(spoken.calls.length, 0)
  spoken.spoken().onend()
  spoken.advance(5000)
  const lateCallback = spoken.spoken().onend
  spoken.composer.onConfirmOkay()
  lateCallback()
  spoken.advance(30000)
  assert.equal(spoken.calls.length, 0)
  const fallback = setup(true)
  fallback.header.onSimulateFall()
  fallback.advance(40000)
  assert.equal(fallback.calls.length, 1)
  const unmounted = setup()
  unmounted.header.onSimulateFall()
  unmounted.cleanups.forEach((cleanup) => cleanup())
  unmounted.advance(30000)
  assert.equal(unmounted.calls.length, 0)
  console.log(
    "Passed: both cancellation stages, 5s windows, duplicate guard, unique events, speech fallback, late callbacks, and unmount cleanup. All requests mocked."
  )
}
verify().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
