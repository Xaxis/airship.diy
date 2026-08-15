'use client'

import { useId, useState } from 'react'

import { CATEGORY_SWATCH } from './ArrangementViewer'
import type { ArrangementData } from './ArrangementViewer'

/**
 * The inboard profile: the drawing an airship is actually designed on.
 *
 * A side elevation with every compartment on it, at scale, plus cross-sections
 * at the stations where the arrangement changes character. This is the more
 * useful of the two drawings on this page — the 3D view shows what it looks
 * like, and this shows where everything is — and it is drawn from exactly the
 * same numbers.
 *
 * Everything here is SVG at model scale, so it can be zoomed, printed, and read
 * off with a ruler.
 */

const COLOR: Record<string, string> = Object.fromEntries(
  CATEGORY_SWATCH.map((s) => [s.key, s.hex]),
)

const INK = '#e6edf3'
const INK_DIM = '#9aa7b4'
const INK_FAINT = '#61707f'
const RULE = '#232b34'
const ACCENT = '#6ba8e5'
const WARM = '#d75843'

export function InboardProfile({ data }: { data: ArrangementData }) {
  const uid = useId()
  const [selected, setSelected] = useState<string | null>(null)

  const { length, maxRadius, radii } = data

  const radiusAt = (station: number): number => {
    const t = Math.min(Math.max(station, 0), 1) * (radii.length - 1)
    const i = Math.min(Math.floor(t), radii.length - 2)
    const f = t - i
    return (radii[i] ?? 0) * (1 - f) + (radii[i + 1] ?? 0) * f
  }

  // Model metres map straight to SVG units, with the nose at x = 0 and the hull
  // axis at y = 0. Positive y is DOWN in SVG, which is convenient here: the
  // keel is below the axis and so is larger y.
  const pad = { left: 6, right: 6, top: 10, bottom: 30 }
  const gondolaDepth = maxRadius * 1.55
  const viewBox = [
    -pad.left,
    -maxRadius - pad.top,
    length + pad.left + pad.right,
    maxRadius + gondolaDepth + pad.top + pad.bottom,
  ].join(' ')

  const hullTop = radii.map((r, i) => `${(i / (radii.length - 1)) * length},${-r}`).join(' ')
  const hullBottom = radii
    .map((r, i) => `${(i / (radii.length - 1)) * length},${r}`)
    .reverse()
    .join(' ')

  const bulkheads = Array.from({ length: data.cellCount + 1 }, (_, c) =>
    data.cellBlockForward + (c / data.cellCount) * (data.cellBlockAft - data.cellBlockForward),
  )

  const drawn = data.compartments.filter((c) => !c.shell && c.id !== 'systems')
  const keel = data.compartments.find((c) => c.id === 'keel-structure')
  const gondolaShell = data.compartments.find((c) => c.id === 'gondola-structure')
  // Top of the keel corridor, in SVG coordinates. The gas cells stop here: the
  // corridor is volume they do not get, and the lift figure already paid for
  // that, so the drawing has to show it in the same place.
  const keelTop = keel ? -keel.z - keel.height / 2 : maxRadius * 0.5

  const sectionStations = [0.3, 0.46, 0.62, 0.86]

  return (
    <div>
      <figure className="border border-[var(--color-rule)] bg-[var(--color-panel)]">
        <div className="overflow-x-auto">
          <svg
            viewBox={viewBox}
            className="block w-full min-w-[720px]"
            role="img"
            aria-label="Inboard profile: side elevation of the airship with every compartment at scale"
          >
            <defs>
              <pattern
                id={`${uid}-cell`}
                width="3"
                height="3"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <line x1="0" y1="0" x2="0" y2="3" stroke={COLOR['gas']} strokeWidth="0.6" opacity="0.5" />
              </pattern>
              <clipPath id={`${uid}-hull`}>
                <polygon points={`${hullTop} ${hullBottom}`} />
              </clipPath>
            </defs>

            {/* the hull outline */}
            <polygon
              points={`${hullTop} ${hullBottom}`}
              fill="#161c23"
              stroke={INK_DIM}
              strokeWidth="0.35"
            />

            {/* gas cells, hatched, clipped to the hull, stopping at the keel */}
            <g clipPath={`url(#${uid}-hull)`}>
              {bulkheads.slice(0, -1).map((s0, i) => {
                const s1 = bulkheads[i + 1] ?? 1
                return (
                  <rect
                    key={s0}
                    x={s0 * length}
                    y={-maxRadius}
                    width={(s1 - s0) * length}
                    height={maxRadius + keelTop}
                    fill={`url(#${uid}-cell)`}
                    stroke={COLOR['gas']}
                    strokeWidth="0.3"
                    opacity="0.65"
                  />
                )
              })}
            </g>

            {/* transverse rings */}
            {bulkheads.map((s) => (
              <line
                key={`ring-${s}`}
                x1={s * length}
                y1={-radiusAt(s)}
                x2={s * length}
                y2={radiusAt(s)}
                stroke={ACCENT}
                strokeWidth="0.28"
                opacity="0.55"
              />
            ))}

            {/* the photovoltaic band, on the actual stations */}
            <line
              x1={data.arrayForwardStation * length}
              y1={-radiusAt(data.arrayForwardStation) - 0.5}
              x2={data.arrayAftStation * length}
              y2={-radiusAt(data.arrayAftStation) - 0.5}
              stroke="#2a6bb0"
              strokeWidth="1.1"
              strokeLinecap="round"
            />

            {/* the keel corridor, from the compartment the gas volume was
                actually charged for */}
            {keel ? (
              <rect
                x={keel.station * length - keel.extent / 2}
                y={-keel.z - keel.height / 2}
                width={keel.extent}
                height={keel.height}
                fill="#1b232c"
                stroke={INK_FAINT}
                strokeWidth="0.3"
              />
            ) : null}

            {/* fins, in profile: the vertical pair shows as span, the horizontal as chord */}
            {(() => {
              const { rootChord, tipChord, span, station } = data.fins
              const cx = station * length
              const r = radiusAt(station)
              const sweep = rootChord * 0.32
              const upper = `${cx - rootChord / 2},${-r * 0.72} ${cx + rootChord / 2},${-r * 0.72} ${cx + sweep + tipChord / 2},${-r * 0.72 - span} ${cx + sweep - tipChord / 2},${-r * 0.72 - span}`
              const lower = `${cx - rootChord / 2},${r * 0.72} ${cx + rootChord / 2},${r * 0.72} ${cx + sweep + tipChord / 2},${r * 0.72 + span} ${cx + sweep - tipChord / 2},${r * 0.72 + span}`
              return (
                <g>
                  <polygon points={upper} fill="#39434f" stroke={INK_DIM} strokeWidth="0.3" />
                  <polygon points={lower} fill="#39434f" stroke={INK_DIM} strokeWidth="0.3" />
                  <text
                    x={cx + sweep}
                    y={-r * 0.72 - span - 1.2}
                    fill={INK_DIM}
                    fontSize="2.4"
                    textAnchor="middle"
                  >
                    {data.fins.area.toFixed(0)} m² fin
                  </text>
                </g>
              )
            })()}

            {/* the gondola shell */}
            {(() => {
              const outer = data.compartments.find((c) => c.id === 'gondola-structure')
              if (!outer) return null
              const first = outer.station * length - outer.extent / 2
              const last = outer.station * length + outer.extent / 2
              const top = -outer.z - outer.height / 2
              const bottom = -outer.z + outer.height / 2
              return (
                <path
                  d={`M ${first},${top} L ${last},${top} L ${last - 1.5},${bottom} L ${first + 2.5},${bottom} Z`}
                  fill="#1b232c"
                  stroke={INK_DIM}
                  strokeWidth="0.35"
                />
              )
            })()}

            {/* every compartment, at scale */}
            {drawn.map((c) => {
              const w = c.extent
              const h = c.height
              const x = c.station * length - w / 2
              // SVG y is down; z is negative below the hull axis.
              const y = -c.z - h / 2
              const isSelected = selected === c.id
              return (
                <g key={c.id}>
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill={COLOR[c.category] ?? '#5a6a7a'}
                    fillOpacity={isSelected ? 0.95 : 0.72}
                    stroke={isSelected ? INK : '#0b0e12'}
                    strokeWidth={isSelected ? 0.5 : 0.25}
                    className="cursor-pointer"
                    onClick={() => setSelected(isSelected ? null : c.id)}
                  >
                    <title>{`${c.name} — ${c.mass.toFixed(0)} kg${c.volume > 0.5 ? `, ${c.volume.toFixed(0)} m³` : ''}`}</title>
                  </rect>
                </g>
              )
            })}

            {/* the five rooms, named. Everything else is in the table below,
                but a drawing of a home that does not say which room is which
                is not answering the question anyone actually has. */}
            {gondolaShell
              ? drawn
                  .filter((c) => c.deck === 'gondola' && c.netHabitable)
                  .map((c, i) => {
                    const cx = c.station * length
                    const base = -gondolaShell.z + gondolaShell.height / 2
                    // Alternate the leader length so adjacent labels cannot
                    // collide on a drawing this tightly packed.
                    const drop = 3.5 + (i % 2) * 3.4
                    return (
                      <g key={`label-${c.id}`}>
                        <line
                          x1={cx}
                          y1={-c.z + c.height / 2}
                          x2={cx}
                          y2={base + drop - 1}
                          stroke={INK_FAINT}
                          strokeWidth="0.22"
                        />
                        <text
                          x={cx}
                          y={base + drop + 1.4}
                          fill={INK_DIM}
                          fontSize="2.3"
                          textAnchor="middle"
                        >
                          {c.name.replace(' and helm', '').replace(' and washroom', '')}
                        </text>
                      </g>
                    )
                  })
              : null}

            {/* propulsors */}
            {data.propulsors.map((p) => {
              const r = radiusAt(p.station)
              const cx = p.station * length
              const cy = -p.heightFraction * r
              const propR = p.diameter / 2
              return (
                <g key={p.id}>
                  <line
                    x1={cx}
                    y1={r * 0.72}
                    x2={cx}
                    y2={cy}
                    stroke={INK_FAINT}
                    strokeWidth="0.4"
                  />
                  <circle cx={cx} cy={cy} r={0.75} fill={COLOR['machinery']} />
                  <line
                    x1={cx - 1.2}
                    y1={cy - propR}
                    x2={cx - 1.2}
                    y2={cy + propR}
                    stroke={ACCENT}
                    strokeWidth="0.35"
                    opacity="0.75"
                  />
                </g>
              )
            })}

            {/* exhaust */}
            {(() => {
              const r = radiusAt(data.exhaustStation)
              const cx = data.exhaustStation * length
              return (
                <g>
                  <line
                    x1={cx}
                    y1={r * 0.8}
                    x2={cx}
                    y2={-data.exhaustHeightFraction * r * 0.7}
                    stroke={WARM}
                    strokeWidth="0.6"
                  />
                  <text
                    x={cx - 1}
                    y={-data.exhaustHeightFraction * r * 0.7 + 2.6}
                    fill={WARM}
                    fontSize="2.2"
                    textAnchor="end"
                  >
                    exhaust
                  </text>
                </g>
              )
            })()}

            {/* centre of gravity and centre of buoyancy */}
            <g>
              <line
                x1={data.mass.centreOfBuoyancy.x}
                y1={-data.mass.centreOfBuoyancy.z}
                x2={data.mass.centreOfGravity.x}
                y2={-data.mass.centreOfGravity.z}
                stroke={WARM}
                strokeWidth="0.3"
                strokeDasharray="1 0.8"
              />
              <circle
                cx={data.mass.centreOfBuoyancy.x}
                cy={-data.mass.centreOfBuoyancy.z}
                r="0.9"
                fill="none"
                stroke={ACCENT}
                strokeWidth="0.4"
              />
              <text
                x={data.mass.centreOfBuoyancy.x}
                y={-data.mass.centreOfBuoyancy.z - 1.8}
                fill={ACCENT}
                fontSize="2.4"
                textAnchor="middle"
              >
                CB
              </text>
              <circle
                cx={data.mass.centreOfGravity.x}
                cy={-data.mass.centreOfGravity.z}
                r="0.9"
                fill={WARM}
              />
              <text
                x={data.mass.centreOfGravity.x}
                y={-data.mass.centreOfGravity.z + 3}
                fill={WARM}
                fontSize="2.4"
                textAnchor="middle"
              >
                CG
              </text>
            </g>

            {/* station scale */}
            <g>
              <line
                x1={0}
                y1={maxRadius + gondolaDepth * 0.62}
                x2={length}
                y2={maxRadius + gondolaDepth * 0.62}
                stroke={RULE}
                strokeWidth="0.3"
              />
              {Array.from({ length: Math.floor(length / 10) + 1 }, (_, i) => i * 10).map((x) => (
                <g key={`tick-${x}`}>
                  <line
                    x1={x}
                    y1={maxRadius + gondolaDepth * 0.62}
                    x2={x}
                    y2={maxRadius + gondolaDepth * 0.62 + 1.2}
                    stroke={INK_FAINT}
                    strokeWidth="0.3"
                  />
                  <text
                    x={x}
                    y={maxRadius + gondolaDepth * 0.62 + 4.2}
                    fill={INK_FAINT}
                    fontSize="2.4"
                    textAnchor="middle"
                    className="num"
                  >
                    {x}
                  </text>
                </g>
              ))}
              <text
                x={length}
                y={maxRadius + gondolaDepth * 0.62 + 8}
                fill={INK_FAINT}
                fontSize="2.4"
                textAnchor="end"
              >
                metres from the nose
              </text>
            </g>
          </svg>
        </div>

        <figcaption className="border-t border-[var(--color-rule)] p-3 text-xs leading-relaxed text-[var(--color-ink-dim)]">
          Side elevation at model scale. Hatched lobes are the twelve gas cells between their
          bulkhead rings; the dark band along the bottom is the keel corridor. Click a compartment
          for its numbers.
        </figcaption>
      </figure>

      {/* the compartment table, which is also the selection detail */}
      <div className="mt-4 overflow-x-auto border border-[var(--color-rule)]">
        <table className="num w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-rule)] text-left text-xs text-[var(--color-ink-faint)]">
              <th className="p-2.5 font-normal">Compartment</th>
              <th className="p-2.5 font-normal">Deck</th>
              <th className="p-2.5 text-right font-normal">Station</th>
              <th className="p-2.5 text-right font-normal">Volume</th>
              <th className="p-2.5 text-right font-normal">Mass</th>
            </tr>
          </thead>
          <tbody>
            {drawn.map((c) => (
              <tr
                key={c.id}
                onClick={() => setSelected(selected === c.id ? null : c.id)}
                className={`cursor-pointer border-b border-[var(--color-rule)] last:border-0 ${
                  selected === c.id ? 'bg-[var(--color-panel-raised)]' : ''
                }`}
              >
                <td className="p-2.5">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-[1px]"
                      style={{ background: COLOR[c.category] ?? '#5a6a7a' }}
                    />
                    <span className="sans">{c.name}</span>
                  </span>
                </td>
                <td className="sans p-2.5 text-[var(--color-ink-dim)]">{c.deck}</td>
                <td className="p-2.5 text-right text-[var(--color-ink-dim)]">
                  {c.station.toFixed(2)}
                </td>
                <td className="p-2.5 text-right">
                  {c.volume > 0.5 ? `${c.volume.toFixed(0)} m³` : '—'}
                </td>
                <td className="p-2.5 text-right">{c.mass.toLocaleString('en-US')} kg</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="mt-3 border-l-2 border-[var(--color-accent)] bg-[var(--color-panel)] p-4">
          {(() => {
            const c = drawn.find((x) => x.id === selected)
            if (!c) return null
            return (
              <>
                <p className="font-medium">{c.name}</p>
                <p className="num mt-1 text-xs text-[var(--color-ink-dim)]">
                  {c.deck} deck · station {c.station.toFixed(3)} · {(c.extent * length).toFixed(1)} m
                  long
                  {c.volume > 0.5 ? ` · ${c.volume.toFixed(0)} m³` : ''} · {c.mass.toLocaleString('en-US')} kg
                  {c.habitable ? ' · a person can be in it' : ''}
                  {c.enclosed ? ' · sealed' : ' · continuously ventilated'}
                </p>
                {c.note ? (
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
                    {c.note}
                  </p>
                ) : null}
              </>
            )
          })()}
        </div>
      ) : null}

      {/* cross-sections */}
      <div className="mt-6">
        <h3 className="text-sm font-medium">Sections</h3>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
          Looking forward, at the four stations where the arrangement changes character. The gas
          cell fills the section above the keel; nothing a person occupies is inside it.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {sectionStations.map((s) => (
            <Section key={s} data={data} station={s} radiusAt={radiusAt} />
          ))}
        </div>
      </div>
    </div>
  )
}

function Section({
  data,
  station,
  radiusAt,
}: {
  data: ArrangementData
  station: number
  radiusAt: (s: number) => number
}) {
  const r = radiusAt(station)
  const { maxRadius, length } = data
  const extent = maxRadius * 1.7
  const here = data.compartments.filter(
    (c) =>
      !c.shell &&
      c.id !== 'systems' &&
      station >= c.station - c.extent / 2 / length &&
      station <= c.station + c.extent / 2 / length,
  )
  const gondolaHere = here.filter((c) => c.deck === 'gondola')

  return (
    <figure className="border border-[var(--color-rule)] bg-[var(--color-panel)] p-2">
      <svg
        viewBox={`${-extent} ${-maxRadius - 1} ${extent * 2} ${maxRadius + extent + 2}`}
        className="block w-full"
        role="img"
        aria-label={`Cross-section at station ${station}`}
      >
        {/* hull */}
        <circle cx="0" cy="0" r={r} fill="#161c23" stroke={INK_DIM} strokeWidth="0.3" />
        {/* gas cell above the keel corridor, and the corridor itself, both
            bounded by the compartment the lift figure was charged for */}
        {(() => {
          const keel = data.compartments.find((c) => c.id === 'keel-structure')
          const top = keel ? Math.min(-keel.z - keel.height / 2, r * 0.9) : r * 0.5
          const halfW = Math.min((keel?.width ?? r * 0.6) / 2, r * 0.9)
          return (
            <>
              <path
                d={`M ${-r},0 A ${r} ${r} 0 1 1 ${r},0 L ${halfW},${top} L ${-halfW},${top} Z`}
                fill={COLOR['gas']}
                opacity="0.14"
              />
              {keel ? (
                <rect
                  x={-halfW}
                  y={top}
                  width={halfW * 2}
                  height={keel.height}
                  fill="#1b232c"
                  stroke={INK_FAINT}
                  strokeWidth="0.25"
                />
              ) : null}
            </>
          )
        })()}
        {/* the compartments cut by this station */}
        {here.map((c) => {
          const w = c.width
          const h = c.height
          return (
            <rect
              key={c.id}
              x={-w / 2}
              y={-c.z - h / 2}
              width={w}
              height={h}
              fill={COLOR[c.category] ?? '#5a6a7a'}
              fillOpacity="0.85"
              stroke="#0b0e12"
              strokeWidth="0.2"
            >
              <title>{c.name}</title>
            </rect>
          )
        })}
        {/* gondola shell, when there is one here */}
        {gondolaHere.length > 0
          ? (() => {
              const outer = data.compartments.find((c) => c.id === 'gondola-structure')
              if (!outer) return null
              const halfW = outer.width / 2
              const top = -outer.z - outer.height / 2
              const bottom = -outer.z + outer.height / 2
              return (
                <path
                  d={`M ${-halfW},${top} L ${halfW},${top} L ${halfW},${bottom - 0.7} L 0,${bottom} L ${-halfW},${bottom - 0.7} Z`}
                  fill="none"
                  stroke={INK_DIM}
                  strokeWidth="0.3"
                />
              )
            })()
          : null}
        {/* propulsors at this station */}
        {data.propulsors
          .filter((p) => Math.abs(p.station - station) < 0.03)
          .map((p) => (
            <g key={p.id}>
              {[-1, 1].map((side) => (
                <g key={side}>
                  <line
                    x1={side * r * 0.72}
                    y1={-p.heightFraction * r * 0.6}
                    x2={side * Math.abs(p.lateralOffset) * maxRadius}
                    y2={-p.heightFraction * r}
                    stroke={INK_FAINT}
                    strokeWidth="0.3"
                  />
                  <circle
                    cx={side * Math.abs(p.lateralOffset) * maxRadius}
                    cy={-p.heightFraction * r}
                    r={p.diameter / 2}
                    fill="none"
                    stroke={ACCENT}
                    strokeWidth="0.28"
                    opacity="0.7"
                  />
                </g>
              ))}
            </g>
          ))}
      </svg>
      <figcaption className="num mt-1 text-center text-xs text-[var(--color-ink-faint)]">
        {(station * length).toFixed(0)} m · station {station.toFixed(2)}
      </figcaption>
    </figure>
  )
}
