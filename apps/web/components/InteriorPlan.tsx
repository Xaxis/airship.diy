'use client'

import { useState } from 'react'

/**
 * The gondola in plan, with what is actually in each room.
 *
 * The inboard profile shows where the rooms are on the ship. This shows what is
 * inside them, which is the drawing anyone deciding whether they could live here
 * would actually want. It is the same fittings the mass statement counted and
 * the same footprints the floor-area check used, so a room cannot look roomy
 * here and be a locker in the assessment.
 *
 * Fittings are laid out by a simple shelf packer rather than by hand: each is
 * placed along the outboard edges first, because that is where a boat's
 * furniture goes and it is what leaves a usable passage down the middle.
 */

export interface PlanFitting {
  readonly id: string
  readonly name: string
  readonly kind: string
  readonly sleeps: number
  readonly footprint: number
  readonly volume: number
  readonly mass: number
  readonly note: string | null
}

export interface PlanRoom {
  readonly id: string
  readonly name: string
  readonly station: number
  readonly width: number
  readonly length: number
  readonly floorArea: number
  readonly occupied: number
  readonly freeFraction: number
  readonly stowage: number
  readonly fitoutMass: number
  readonly headroom: number
  readonly sleeps: number
  readonly exits: number
  readonly findings: readonly string[]
  readonly fittings: readonly PlanFitting[]
}

const KIND_COLOR: Record<string, string> = {
  berth: '#3987e5',
  seating: '#3987e5',
  worktop: '#c98500',
  appliance: '#d95926',
  stowage: '#199e70',
  sanitary: '#d55181',
  instrument: '#9085e9',
  passage: '#232b35',
}

export function InteriorPlan({ rooms }: { rooms: readonly PlanRoom[] }) {
  const [selected, setSelected] = useState<string | null>(null)

  const ordered = [...rooms].sort((a, b) => a.station - b.station)
  const totalLength = ordered.reduce((s, r) => s + r.length, 0)
  const maxWidth = Math.max(...ordered.map((r) => r.width))

  /** @derived A little between rooms so the bulkheads read. */
  const BULKHEAD = 0.15
  const pad = 1.2
  const viewWidth = totalLength + BULKHEAD * (ordered.length - 1) + pad * 2
  const viewHeight = maxWidth + pad * 2

  let cursor = pad

  return (
    <div>
      <figure className="border border-[var(--color-rule)] bg-[var(--color-panel)]">
        <div className="scroll-x">
          <svg
            viewBox={`0 0 ${viewWidth} ${viewHeight}`}
            className="block w-full min-w-[780px]"
            role="img"
            aria-label="Gondola interior plan, looking down"
          >
            {ordered.map((room) => {
              const x = cursor
              cursor += room.length + BULKHEAD
              const y = pad + (maxWidth - room.width) / 2
              const isSelected = selected === room.id

              // Pack the fittings along the two outboard edges, taking whichever
              // has more room left, which is where a boat's furniture goes and
              // what leaves a passage down the middle.
              //
              // Each run is CLAMPED to the space remaining on its edge, and its
              // depth grows to keep the area right. Without the clamp a long
              // settee runs straight out through the bulkhead, which is exactly
              // the kind of drawing that looks fine and means nothing.
              const inset = 0.1
              const usable = room.length - inset * 2
              let portUsed = 0
              let starboardUsed = 0
              const placed = room.fittings
                .filter((f) => f.kind !== 'passage' && f.footprint > 0)
                .map((f) => {
                  const port = portUsed <= starboardUsed
                  const used = port ? portUsed : starboardUsed
                  const remaining = Math.max(usable - used, 0.2)
                  /** @derived An outboard run is a third of the beam deep by default. */
                  let depth = Math.min(0.75, room.width / 3)
                  let runLength = Math.max(f.footprint / depth, 0.25)
                  if (runLength > remaining) {
                    runLength = remaining
                    depth = Math.min(f.footprint / runLength, room.width / 2 - inset)
                  }
                  const fx = x + inset + used
                  if (port) portUsed += runLength + 0.08
                  else starboardUsed += runLength + 0.08
                  return {
                    fitting: f,
                    x: fx,
                    y: port ? y + inset : y + room.width - depth - inset,
                    w: runLength,
                    h: depth,
                  }
                })

              return (
                <g key={room.id}>
                  <rect
                    x={x}
                    y={y}
                    width={room.length}
                    height={room.width}
                    fill="#161c23"
                    stroke={isSelected ? '#e6edf3' : '#3d4b5a'}
                    strokeWidth={isSelected ? 0.06 : 0.03}
                    className="cursor-pointer"
                    onClick={() => setSelected(isSelected ? null : room.id)}
                  />
                  {placed.map((p) => (
                    <rect
                      key={p.fitting.id}
                      x={p.x}
                      y={p.y}
                      width={p.w}
                      height={p.h}
                      fill={KIND_COLOR[p.fitting.kind] ?? '#5a6a7a'}
                      fillOpacity={0.75}
                      stroke="#0b0e12"
                      strokeWidth={0.02}
                    >
                      <title>{`${p.fitting.name} — ${p.fitting.mass} kg`}</title>
                    </rect>
                  ))}
                  <text
                    x={x + room.length / 2}
                    y={y + room.width / 2 + 0.1}
                    fill="#e6edf3"
                    fontSize="0.32"
                    textAnchor="middle"
                  >
                    {room.name.replace(' and helm', '').replace(' and washroom', '')}
                  </text>
                  <text
                    x={x + room.length / 2}
                    y={y + room.width + 0.5}
                    fill="#61707f"
                    fontSize="0.26"
                    textAnchor="middle"
                    fontFamily="ui-monospace, monospace"
                  >
                    {room.floorArea.toFixed(1)} m²
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
        <figcaption className="border-t border-[var(--color-rule)] p-3 text-xs leading-relaxed text-[var(--color-ink-dim)]">
          Looking down, forward to the left, at model scale. Furniture is packed along the outboard
          edges because that is where a boat&rsquo;s furniture goes and it is what leaves a passage
          down the middle. Click a room for its inventory.
        </figcaption>
      </figure>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {(
          [
            ['berth', 'Berth and seating'],
            ['worktop', 'Worktop'],
            ['appliance', 'Appliance'],
            ['stowage', 'Stowage'],
            ['sanitary', 'Sanitary'],
            ['instrument', 'Instrument and glazing'],
          ] as const
        ).map(([kind, label]) => (
          <span key={kind} className="flex items-center gap-1.5 text-xs">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-[1px]"
              style={{ background: KIND_COLOR[kind] }}
            />
            <span className="text-[var(--color-ink-dim)]">{label}</span>
          </span>
        ))}
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        {ordered.map((room) => (
          <button
            key={room.id}
            type="button"
            onClick={() => setSelected(selected === room.id ? null : room.id)}
            className={`border p-4 text-left transition-colors ${
              selected === room.id
                ? 'border-[var(--color-rule-bright)] bg-[var(--color-panel-raised)]'
                : 'border-[var(--color-rule)] bg-[var(--color-panel)] hover:border-[var(--color-rule-bright)]'
            }`}
          >
            <p className="flex items-baseline justify-between font-medium">
              <span>{room.name}</span>
              <span className="num text-xs text-[var(--color-ink-faint)]">
                {room.floorArea.toFixed(1)} m² · {(room.headroom * 1000).toFixed(0)} mm headroom
              </span>
            </p>
            <p className="num mt-1 text-xs text-[var(--color-ink-dim)]">
              {(room.freeFraction * 100).toFixed(0)}% of the sole free ·{' '}
              {room.stowage.toFixed(1)} m³ stowage · {room.fitoutMass} kg
              {room.sleeps > 0 ? ` · sleeps ${room.sleeps}` : ''}
            </p>

            {selected === room.id ? (
              <ul className="mt-3 space-y-1.5 border-t border-[var(--color-rule)] pt-3">
                {room.fittings.map((f) => (
                  <li key={f.id} className="text-xs">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="flex items-baseline gap-2">
                        <span
                          aria-hidden
                          className="inline-block h-2 w-2 shrink-0 rounded-[1px]"
                          style={{ background: KIND_COLOR[f.kind] ?? '#5a6a7a' }}
                        />
                        <span className="text-[var(--color-ink-dim)]">{f.name}</span>
                      </span>
                      <span className="num shrink-0 text-[var(--color-ink-faint)]">
                        {f.mass} kg
                      </span>
                    </span>
                    {f.note ? (
                      <span className="mt-1 block pl-4 leading-relaxed text-[var(--color-ink-faint)]">
                        {f.note}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  )
}
