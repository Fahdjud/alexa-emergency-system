import { useState, type FormEvent } from "react"
import { ArrowUp, Keyboard, Mic } from "lucide-react"

import { Button } from "@/components/ui/button"

type MessageComposerProps = {
  draft: string
  voiceState: "idle" | "starting" | "listening" | "processing"
  voiceNotice: string
  onDraftChange: (draft: string) => void
  onSend: () => void
  onToggleListening: () => void
}

export function MessageComposer({
  draft,
  voiceState,
  voiceNotice,
  onDraftChange,
  onSend,
  onToggleListening,
}: MessageComposerProps) {
  const [inputMode, setInputMode] = useState<"voice" | "text">("voice")
  const voiceBusy = voiceState !== "idle"

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSend()
  }

  return (
    <div className="mx-auto w-[calc(100%-64px)] max-w-[690px] shrink-0 self-center pb-[17px] max-[850px]:w-[calc(100%-44px)] max-[640px]:w-[calc(100%-28px)] max-[640px]:pb-[max(12px,env(safe-area-inset-bottom))]">
      {voiceNotice && <p className="mb-[9px] text-center text-[11px] text-[#e2b78e]" role="status">{voiceNotice}</p>}
      <form className="rounded-[10px] border border-[#263d54] bg-[#0e1b2a] pt-3 pr-[13px] pb-[9px] pl-4 shadow-[0_8px_28px_#02060c99] transition-[border-color,box-shadow] focus-within:border-[#168aa4] focus-within:shadow-[0_0_0_3px_#102f43] motion-reduce:transition-none" onSubmit={handleSubmit}>
        <div className="mb-3 flex rounded-lg border border-[#233850] bg-[#091523] p-1" role="group" aria-label="Choose input method">
          <Button
            className={`h-9 flex-1 gap-2 text-xs font-medium focus-visible:ring-[#00c8f4] ${inputMode === "voice" ? "bg-[#16334a] text-[#72def2] hover:bg-[#1b405a] hover:text-[#a7effb]" : "text-[#8fa2b6] hover:bg-[#132338] hover:text-[#d6e2ee]"}`}
            variant="ghost"
            type="button"
            aria-pressed={inputMode === "voice"}
            disabled={voiceBusy}
            onClick={() => setInputMode("voice")}
          >
            <Mic size={15} />Voice
          </Button>
          <Button
            className={`h-9 flex-1 gap-2 text-xs font-medium focus-visible:ring-[#00c8f4] ${inputMode === "text" ? "bg-[#16334a] text-[#72def2] hover:bg-[#1b405a] hover:text-[#a7effb]" : "text-[#8fa2b6] hover:bg-[#132338] hover:text-[#d6e2ee]"}`}
            variant="ghost"
            type="button"
            aria-pressed={inputMode === "text"}
            disabled={voiceBusy}
            onClick={() => setInputMode("text")}
          >
            <Keyboard size={15} />Text
          </Button>
        </div>

        {inputMode === "text" ? (
          <>
            <textarea
              className="block max-h-[120px] min-h-[64px] w-full resize-y border-0 bg-transparent text-[13px] leading-[1.6] text-[#f3f6fa] outline-none placeholder:text-[#8393a5]"
              aria-label="Message Alexa"
              placeholder="Type a message..."
              value={draft}
              rows={2}
              autoFocus
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  onSend()
                }
              }}
            />
            <div className="flex min-h-[38px] items-center justify-between gap-3">
              <span className="text-[10px] text-[#858b92]">Alexa can make mistakes</span>
              <Button
                className="bg-[#00c8f4] text-[#06131c] hover:bg-[#59ddf5] disabled:bg-[#26394c] disabled:text-[#718197] focus-visible:ring-[#00c8f4]"
                size="icon"
                type="submit"
                aria-label="Send message"
                disabled={!draft.trim()}
              >
                <ArrowUp size={17} />
              </Button>
            </div>
          </>
        ) : (
          <div className="flex min-h-[104px] flex-col items-center justify-center gap-2">
            <Button
              className={`h-12 min-w-[176px] gap-2.5 rounded-lg px-5 text-sm font-semibold focus-visible:ring-[#00c8f4] ${voiceState === "listening" ? "border border-[#2383a3] bg-[#102c42] text-[#a4efff] hover:bg-[#163951]" : voiceState === "starting" || voiceState === "processing" ? "bg-[#24516a] text-white hover:bg-[#2b617c]" : "bg-[#00c8f4] text-[#06131c] hover:bg-[#59ddf5]"}`}
              variant={voiceState === "idle" ? "default" : "outline"}
              type="button"
              aria-label={voiceState === "listening" ? "Stop listening to Alexa" : voiceState === "starting" ? "Cancel microphone startup" : "Talk to Alexa"}
              aria-pressed={voiceState === "listening"}
              disabled={voiceState === "processing"}
              onClick={onToggleListening}
            >
              <Mic size={21} strokeWidth={2.1} className={voiceState === "listening" ? "animate-pulse" : ""} />
              <span>{voiceState === "idle" ? "Talk to Alexa" : voiceState === "starting" ? "Starting mic..." : voiceState === "listening" ? "Stop listening" : "Working..."}</span>
            </Button>
            <p className="m-0 min-h-4 text-[11px] text-[#a8bacb]" role="status" aria-live="polite">
              {voiceState === "starting" && "Waiting for microphone access..."}
              {voiceState === "listening" && "Alexa is listening. Tap to stop."}
              {voiceState === "processing" && "Heard you. One moment..."}
            </p>
          </div>
        )}
      </form>
      <p className="mt-[11px] mb-0 flex items-center justify-center gap-[7px] text-[10px] text-[#858b92]">
        <span className="size-1.5 rounded-full bg-[#6eb687]" />
        Your conversation stays on this device
      </p>
    </div>
  )
}