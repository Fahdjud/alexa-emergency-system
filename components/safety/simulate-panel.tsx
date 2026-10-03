"use client"

/*
 * simulate-panel.tsx: buttons that fake a trigger for each incident in the
 * config, without making the actual sound.
 *
 * Why this file exists: demos happen in noisy halls, and nobody wants to
 * scream or break glass to test. The simulated trigger goes through exactly
 * the same flow as a real one.
 */
import { Button } from "@/components/ui/button"
import { INCIDENTS } from "@/lib/safety/incidents"
import type { IncidentDefinition, TriggerMatch } from "@/lib/safety/types"

type Props = {
  disabled: boolean
  onSimulate: (match: TriggerMatch) => void
}

export function SimulatePanel({ disabled, onSimulate }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {INCIDENTS.map((incident) => (
        <Button
          className="border-[#263c53] bg-[#101e2d] text-[#d4e0ec] hover:border-[#287b95] hover:bg-[#14283b] hover:text-white"
          variant="outline"
          size="sm"
          key={incident.id}
          disabled={disabled}
          onClick={() => onSimulate(simulatedMatch(incident))}
        >
          {incident.label}
        </Button>
      ))}
    </div>
  )
}

/** Uses the incident's first sound trigger if it has one, otherwise its first English phrase. */
function simulatedMatch(incident: IncidentDefinition): TriggerMatch {
  const sound = incident.triggerSounds[0]
  if (sound) return { incidentId: incident.id, source: "sound", label: sound.label, score: 1 }
  return { incidentId: incident.id, source: "speech", phrase: incident.triggerPhrases.en[0] ?? "", language: "en" }
}
