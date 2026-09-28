"use client"

import { useEffect, useRef } from "react"
import { ArrowUp, AudioLines } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { ChatMessage, Suggestion } from "./types"

type WelcomePanelProps = {
  suggestions: Suggestion[]
  onSuggestion: (suggestion: string) => void
}

export function WelcomePanel({ suggestions, onSuggestion }: WelcomePanelProps) {
  return (
    <section className="m-auto flex w-[calc(100%-40px)] max-w-[620px] flex-col items-center justify-center px-0 py-[22px] pb-8 text-center max-[640px]:w-[calc(100%-32px)] max-[640px]:py-[18px] max-[640px]:pb-6" aria-labelledby="welcome-heading">
      <div className="mb-7 grid size-28 shrink-0 place-items-center rounded-full border border-[#205170] bg-[#0d1e30] shadow-[0_0_0_8px_#0b1421,0_0_0_9px_#142b41] max-[640px]:mb-6 max-[640px]:size-[94px]">
        <span className="grid size-[79px] place-items-center rounded-full border border-[#26718a] bg-[#10283a] text-[#58d9f3] max-[640px]:size-[67px]">
          <AudioLines size={37} strokeWidth={1.7} />
        </span>
      </div>
      <h1 className="m-0 text-[42px] font-normal leading-[1.15] text-[#f3f4f5] max-[640px]:text-[32px] max-[390px]:text-[29px]">
        Hi, Jamie<span className="text-[#00c8f4]">.</span>
      </h1>
      <p className="mt-2 mb-0 text-sm leading-[1.7] text-[#a7adb2] max-[640px]:text-[13px]">What can I help with?</p>
      <div className="mt-[26px] flex max-w-[450px] flex-wrap justify-center gap-[9px] max-[640px]:mt-[21px] max-[640px]:w-full max-[640px]:max-w-[360px] max-[640px]:gap-[7px]">
        {suggestions.map(({ icon: Icon, label }) => (
          <Button
            className="h-auto min-h-10 gap-2 whitespace-normal border-[#263c53] bg-[#101e2d] px-3 py-2 text-[11px] text-[#d4e0ec] hover:border-[#287b95] hover:bg-[#14283b] hover:text-white focus-visible:ring-[#00c8f4] max-[640px]:min-h-9 max-[640px]:px-2.5 max-[640px]:text-[10px] max-[390px]:text-[9px]"
            variant="outline"
            size="sm"
            key={label}
            onClick={() => onSuggestion(label)}
          >
            <Icon className="text-[#54cfe8]" size={16} />
            {label}
            <ArrowUp className="ml-0.5 rotate-45 text-[#92999f]" size={14} />
          </Button>
        ))}
      </div>
    </section>
  )
}

type ConversationThreadProps = {
  messages: ChatMessage[]
}

export function ConversationThread({ messages }: ConversationThreadProps) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  return (
    <section className="mx-auto w-[calc(100%-64px)] max-w-[690px] px-0 pt-[30px] pb-[45px] max-[850px]:w-[calc(100%-44px)] max-[640px]:w-[calc(100%-28px)]" aria-label="Conversation with Alexa" aria-live="polite">
      <div className="mb-[26px] text-center text-[10px] font-bold tracking-[0.1em] text-[#858b92]">TODAY</div>
      {messages.map((message) => (
        <article className={`mb-[25px] flex items-start gap-[11px] ${message.role === "user" ? "justify-end" : "justify-start"}`} key={message.id}>
          {message.role === "alexa" && (
            <span className="grid size-[29px] shrink-0 place-items-center rounded-full bg-[#102b3c] text-[#55dafa]">
              <AudioLines size={17} />
            </span>
          )}
          <div className={`max-w-[min(82%,500px)] ${message.role === "user" ? "rounded-[12px_12px_3px_12px] border border-[#21405b] bg-[#102238] px-[15px] py-[11px]" : ""}`}>
            {message.role === "alexa" && <span className="mb-1.5 block text-[11px] font-bold text-[#65d6eb]">Alexa</span>}
            <p className="m-0 break-words text-[13px] leading-[1.7] text-[#d9dcdf]">{message.text}</p>
            {message.role === "alexa" && <span className="mt-[9px] block text-[10px] text-[#858b92]">Alexa preview</span>}
          </div>
        </article>
      ))}
      <div ref={endRef} />
    </section>
  )
}