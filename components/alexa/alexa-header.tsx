import { House } from "lucide-react"
import Image from "next/image"

type AlexaHeaderProps = {
  onOpenDevices: () => void
}

export function AlexaHeader({ onOpenDevices }: AlexaHeaderProps) {
  return (
    <header className="flex h-[66px] shrink-0 items-center justify-between gap-4 border-b border-[#23354a] bg-[#0b1421] px-[30px] max-[640px]:h-[58px] max-[640px]:px-4">
      <a className="inline-flex items-center no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00c8f4]" href="#home" aria-label="Alexa home">
        <Image src="/brand/alexa-logo.png" alt="" width={120} height={68} className="h-11 w-auto brightness-0 invert" />
      </a>
      <div className="inline-flex items-center gap-2 text-xs text-[#b3c0ce] max-[640px]:hidden">
        <span className="size-[7px] rounded-full bg-[#6eb687]" />
        3 devices online
      </div>
      <button
        className="hidden h-9 items-center gap-2 rounded-lg border border-[#254765] bg-[#102238] px-3 text-xs font-medium text-[#d7e7f4] transition-colors hover:border-[#34708e] hover:bg-[#142b43] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00c8f4] max-[640px]:inline-flex"
        type="button"
        onClick={onOpenDevices}
        aria-haspopup="dialog"
      >
        <House size={15} className="text-[#48d4f2]" />
        Devices
        <span className="rounded-full bg-[#183550] px-1.5 py-0.5 text-[10px] text-[#90dff0]">3</span>
      </button>
    </header>
  )
}