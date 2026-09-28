import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { devices } from "./data"

type DevicesPanelProps = {
  open: boolean
  onClose: () => void
}

const deviceToneClasses = {
  cyan: "bg-[#102e40] text-[#63d6df]",
  amber: "bg-[#342d21] text-[#edc16e]",
  blue: "bg-[#172a3b] text-[#89c5e6]",
}

function DeviceList() {
  return (
    <div className="mt-0.5 grid">
      {devices.map(({ icon: Icon, name, room, detail, tone }) => (
        <article className="flex min-h-[62px] min-w-0 items-center gap-2.5 border-b border-[#263a51] px-0.5 py-[9px]" key={name}>
          <span className={`grid size-[37px] shrink-0 place-items-center rounded-lg ${deviceToneClasses[tone]}`}>
            <Icon size={19} strokeWidth={1.8} />
          </span>
          <span className="grid min-w-0 flex-1 gap-[3px]">
            <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold text-[#e8eef5]">{name}</strong>
            <small className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[#9baabc] max-[640px]:text-[11px]">
              {room} <span className="px-0.5 text-[#72849a]">·</span> {detail}
            </small>
          </span>
        </article>
      ))}
    </div>
  )
}

export function DevicesPanel({ open, onClose }: DevicesPanelProps) {
  return (
    <>
      <aside className="flex min-w-0 flex-col border-l border-[#23354a] bg-[#0e1928] px-[18px] pt-[26px] pb-[15px] max-[1120px]:px-[14px] max-[640px]:hidden" aria-label="Connected devices">
        <div className="mb-3 flex items-center">
          <h2 className="m-0 text-[23px] font-normal text-[#f0f4f8]">Devices</h2>
        </div>
        <DeviceList />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end bg-[#020712]/75 backdrop-blur-[2px] min-[641px]:hidden" onClick={onClose}>
          <section
            className="relative max-h-[78dvh] w-full overflow-y-auto rounded-t-[22px] border border-[#28415b] bg-[#0d1928] px-5 pt-3 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-[0_-16px_48px_#000b]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-devices-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-[#435469]" />
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h2 className="m-0 text-lg font-semibold text-[#f0f4f8]" id="mobile-devices-title">Your devices</h2>
                <p className="mt-1 mb-0 text-xs text-[#99a9bc]">3 devices connected</p>
              </div>
              <Button
                className="border-[#2a4057] text-[#bdc9d6] hover:bg-[#17273a] hover:text-white focus-visible:ring-[#00c8f4]"
                variant="outline"
                size="icon"
                aria-label="Close devices"
                autoFocus
                onClick={onClose}
              >
                <X size={17} />
              </Button>
            </div>
            <DeviceList />
          </section>
        </div>
      )}
    </>
  )
}