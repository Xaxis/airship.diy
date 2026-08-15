'use client'

import { useId, useState } from 'react'

/**
 * The diagnostic charts.
 *
 * Every series here is a SINGLE series, so none of them carries a legend: the
 * title already names what is plotted and a one-swatch legend box would just
 * restate it. Identity comes from the title and from sparing direct labels on
 * the points that carry the story, never from a number on every point.
 *
 * Shear and bending moment are two separate charts sharing an x-axis rather
 * than one chart with two y-scales. They are measured in newtons and newton
 * metres, and putting two different scales on one plot invites the reader to
 * compare heights that mean nothing. It is also how engineers have drawn these
 * diagrams for a century.
 *
 * The bending moment is the one chart whose colour does polarity work: hogging
 * above the line and sagging below, in a warm and a cool hue about a neutral
 * zero. Every other chart is a single accent hue.
 *
 * Palette steps were snapped into the dark-mode lightness band and validated:
 * the site's UI colours sit around L 0.70 to 0.79, which is right for text and
 * too light for a mark on this surface.
 */

/** Validated chart palette, dark surface. See the note above. */
const ACCENT = '#478acb'
const WARM = '#d75843'
const COOL = '#478acb'

const SURFACE = '#11151a'
const GRID = '#232b35'
const INK_FAINT = '#61707f'
const INK_DIM = '#9aa7b4'

interface Point {
  readonly x: number
  readonly y: number
}

interface ChartFrame {
  readonly width: number
  readonly height: number
  readonly padLeft: number
  readonly padRight: number
  readonly padTop: number
  readonly padBottom: number
}

const FRAME: ChartFrame = {
  width: 720,
  height: 240,
  padLeft: 64,
  padRight: 24,
  padTop: 16,
  padBottom: 36,
}

const plotWidth = (f: ChartFrame) => f.width - f.padLeft - f.padRight
const plotHeight = (f: ChartFrame) => f.height - f.padTop - f.padBottom

/** Round a range up to clean tick values. */
const ticksFor = (min: number, max: number, count = 4): number[] => {
  if (max === min) return [min]
  const raw = (max - min) / count
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10
  const first = Math.ceil(min / step) * step
  const out: number[] = []
  for (let t = first; t <= max + step * 0.001; t += step) out.push(t)
  return out
}

/**
 * Format a tick with precision decided ONCE for the whole axis.
 *
 * Deciding per value gives an axis reading 0.0, 5.0, 10, 15, 20, which looks
 * like a mistake because it is one: the reader cannot tell whether the
 * precision change means anything.
 */
const tickFormatter = (ticks: readonly number[]) => {
  const step = ticks.length > 1 ? Math.abs((ticks[1] ?? 0) - (ticks[0] ?? 0)) : Math.abs(ticks[0] ?? 1)
  const magnitude = Math.max(...ticks.map(Math.abs), Math.abs(step))

  if (magnitude >= 1e6) return (n: number) => `${(n / 1e6).toFixed(step >= 1e6 ? 0 : 1)}M`
  if (magnitude >= 1e3) return (n: number) => `${(n / 1e3).toFixed(step >= 1e3 ? 0 : 1)}k`

  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2
  return (n: number) => n.toFixed(decimals)
}

/**
 * A line chart with a crosshair and tooltip.
 *
 * The hover layer is present by default rather than as an enhancement: an SVG
 * chart in a browser IS interactive, and a reader who cannot interrogate a
 * point has to squint at gridlines instead.
 */
function LineChart({
  points,
  xLabel,
  yLabel,
  colour = ACCENT,
  fill = true,
  format,
  markers = [],
  zeroLine = false,
  divergingFill = false,
}: {
  points: readonly Point[]
  xLabel: string
  yLabel: string
  colour?: string
  fill?: boolean
  format: (p: Point) => string
  markers?: readonly { x: number; label: string }[]
  zeroLine?: boolean
  divergingFill?: boolean
}) {
  const id = useId()
  const [hover, setHover] = useState<Point | null>(null)

  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const yMin = zeroLine ? Math.min(0, ...ys) : 0
  const yMax = Math.max(...ys, 0)
  const ySpan = yMax - yMin || 1

  const px = (x: number) => FRAME.padLeft + ((x - xMin) / (xMax - xMin || 1)) * plotWidth(FRAME)
  const py = (y: number) => FRAME.padTop + (1 - (y - yMin) / ySpan) * plotHeight(FRAME)

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.x)},${py(p.y)}`).join(' ')
  const baseline = py(zeroLine ? 0 : yMin)
  const areaPath = `${path} L${px(xMax)},${baseline} L${px(xMin)},${baseline} Z`

  const xTicks = ticksFor(xMin, xMax)
  const yTicks = ticksFor(yMin, yMax)
  const formatX = tickFormatter(xTicks)
  const formatY = tickFormatter(yTicks)

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const localX = ((event.clientX - rect.left) / rect.width) * FRAME.width
    const dataX = xMin + ((localX - FRAME.padLeft) / plotWidth(FRAME)) * (xMax - xMin)
    let nearest = points[0]
    for (const p of points) {
      if (Math.abs(p.x - dataX) < Math.abs((nearest?.x ?? 0) - dataX)) nearest = p
    }
    setHover(nearest ?? null)
  }

  return (
    <svg
      viewBox={`0 0 ${FRAME.width} ${FRAME.height}`}
      className="w-full"
      role="img"
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      {divergingFill ? (
        <defs>
          <clipPath id={`${id}-above`}>
            <rect x={0} y={0} width={FRAME.width} height={py(0)} />
          </clipPath>
          <clipPath id={`${id}-below`}>
            <rect x={0} y={py(0)} width={FRAME.width} height={FRAME.height - py(0)} />
          </clipPath>
        </defs>
      ) : null}

      {/* recessive grid, hairline and solid */}
      {yTicks.map((t) => (
        <g key={`y${t}`}>
          <line
            x1={FRAME.padLeft}
            x2={FRAME.width - FRAME.padRight}
            y1={py(t)}
            y2={py(t)}
            stroke={GRID}
            strokeWidth={1}
          />
          <text
            x={FRAME.padLeft - 8}
            y={py(t) + 4}
            textAnchor="end"
            fontSize={11}
            fill={INK_FAINT}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatY(t)}
          </text>
        </g>
      ))}

      {xTicks.map((t) => (
        <text
          key={`x${t}`}
          x={px(t)}
          y={FRAME.height - 14}
          textAnchor="middle"
          fontSize={11}
          fill={INK_FAINT}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {formatX(t)}
        </text>
      ))}

      {/* the zero line reads as an axis, not as data */}
      {zeroLine ? (
        <line
          x1={FRAME.padLeft}
          x2={FRAME.width - FRAME.padRight}
          y1={py(0)}
          y2={py(0)}
          stroke={INK_FAINT}
          strokeWidth={1}
        />
      ) : null}

      {/* area wash at ~10 percent, never a saturated block */}
      {fill && divergingFill ? (
        <>
          <path d={areaPath} fill={WARM} opacity={0.12} clipPath={`url(#${id}-above)`} />
          <path d={areaPath} fill={COOL} opacity={0.12} clipPath={`url(#${id}-below)`} />
        </>
      ) : fill ? (
        <path d={areaPath} fill={colour} opacity={0.1} />
      ) : null}

      <path d={path} fill="none" stroke={colour} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

      {/* Sparing direct labels: only the points that carry the story.
          A label that will not fit is FLIPPED to the other side of its marker
          rather than clipped. Measuring first is cheap; a label with its last
          three characters cut off is worse than no label. */}
      {markers.map((mark) => {
        const point = points.reduce((best, p) =>
          Math.abs(p.x - mark.x) < Math.abs(best.x - mark.x) ? p : best,
        )
        // Approximate advance width at 11px. Generous, so the flip triggers
        // before the glyphs actually reach the edge.
        const labelWidth = mark.label.length * 5.9
        const rightEdge = FRAME.width - FRAME.padRight
        const flip = px(point.x) + 8 + labelWidth > rightEdge
        // Keep the label clear of the top of the plot too.
        const labelY = Math.max(py(point.y) - 8, FRAME.padTop + 10)

        return (
          <g key={mark.label}>
            <line
              x1={px(point.x)}
              x2={px(point.x)}
              y1={py(point.y)}
              y2={FRAME.height - FRAME.padBottom}
              stroke={INK_FAINT}
              strokeWidth={1}
              opacity={0.5}
            />
            <circle cx={px(point.x)} cy={py(point.y)} r={4} fill={colour} stroke={SURFACE} strokeWidth={2} />
            <text
              x={flip ? px(point.x) - 8 : px(point.x) + 8}
              y={labelY}
              textAnchor={flip ? 'end' : 'start'}
              fontSize={11}
              fill={INK_DIM}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {mark.label}
            </text>
          </g>
        )
      })}

      {/* crosshair and tooltip */}
      {hover ? (
        <g pointerEvents="none">
          <line
            x1={px(hover.x)}
            x2={px(hover.x)}
            y1={FRAME.padTop}
            y2={FRAME.height - FRAME.padBottom}
            stroke={INK_DIM}
            strokeWidth={1}
          />
          <circle cx={px(hover.x)} cy={py(hover.y)} r={4} fill={colour} stroke={SURFACE} strokeWidth={2} />
          <text
            x={Math.min(px(hover.x) + 10, FRAME.width - 150)}
            y={FRAME.padTop + 14}
            fontSize={12}
            fill={INK_DIM}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {format(hover)}
          </text>
        </g>
      ) : null}

      <text
        x={FRAME.padLeft}
        y={FRAME.height - 2}
        fontSize={10}
        fill={INK_FAINT}
        textAnchor="start"
      >
        {xLabel}
      </text>
      <text x={4} y={FRAME.padTop - 4} fontSize={10} fill={INK_FAINT}>
        {yLabel}
      </text>
    </svg>
  )
}

function Panel({
  title,
  lede,
  children,
}: {
  title: string
  lede: string
  children: React.ReactNode
}) {
  return (
    <div className="border border-[var(--color-rule)] bg-[var(--color-panel)] p-4">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--color-ink-faint)]">{lede}</p>
      <div className="scroll-x mt-3">{children}</div>
    </div>
  )
}

export interface DiagnosticsProps {
  readonly powerCurve: readonly { speed: number; power: number }[]
  readonly holdingCurve: readonly { wind: number; hours: number }[]
  readonly cutoffWind: number
  readonly designWind: number
  readonly hullLength: number
  readonly beam: {
    readonly stations: readonly { x: number; shear: number; moment: number }[]
    readonly maximumMoment: number
    readonly maximumMomentStation: number
    readonly maximumShear: number
    readonly maximumShearStation: number
    readonly hogging: boolean
  }
}

export function Diagnostics({
  powerCurve,
  holdingCurve,
  cutoffWind,
  designWind,
  beam,
}: DiagnosticsProps) {
  return (
    <div className="space-y-4">
      <Panel
        title="Power required against airspeed"
        lede="Drag goes as the square of speed, so power goes as the CUBE. Doubling cruise speed costs eight times the power, and on a vehicle whose energy comes from a fixed area of sunlight that single fact shapes the whole mission concept. This ship is slow because being fast is unaffordable, not because it cannot be made faster."
      >
        <LineChart
          points={powerCurve.map((p) => ({ x: p.speed, y: p.power / 1000 }))}
          xLabel="airspeed, m/s"
          yLabel="kW"
          format={(p) => `${p.x.toFixed(1)} m/s → ${p.y.toFixed(1)} kW`}
          markers={[
            { x: designWind, label: `${designWind} m/s design` },
            { x: designWind * 2, label: 'double the speed, eight times the power' },
          ]}
        />
      </Panel>

      <Panel
        title="Hours of station keeping per day, against wind"
        lede="How long the daily solar budget can hold position against a given wind. There is a speed above which the ship cannot hold station at all and must drift, and finding it is one of the most operationally important numbers the model produces."
      >
        <LineChart
          points={holdingCurve.map((p) => ({ x: p.wind, y: p.hours }))}
          xLabel="wind, m/s"
          yLabel="hours/day"
          colour={ACCENT}
          format={(p) => `${p.x.toFixed(1)} m/s → ${p.y.toFixed(1)} h/day`}
          markers={[{ x: cutoffWind, label: `${cutoffWind.toFixed(1)} m/s: below this it holds all day` }]}
        />
      </Panel>

      <Panel
        title="Shear force along the hull"
        lede="Buoyancy is distributed in proportion to cross-sectional area and weight is distributed wherever the heavy things are. Those two do not match, and the running difference is shear. The steps are the gondola, the engines and the fin roots."
      >
        <LineChart
          points={beam.stations.map((s) => ({ x: s.x, y: s.shear / 1000 }))}
          xLabel="station from nose, m"
          yLabel="kN"
          zeroLine
          fill={false}
          format={(p) => `${p.x.toFixed(0)} m → ${p.y.toFixed(1)} kN`}
          markers={[
            {
              x: beam.maximumShearStation,
              label: `peak ${(beam.maximumShear / 1000).toFixed(0)} kN`,
            },
          ]}
        />
      </Panel>

      <Panel
        title="Bending moment along the hull"
        lede="The primary structural output, and what every laminate schedule downstream gets sized against. Warm above the line is hogging, ends down and middle up; cool below is sagging. This ship does both: it hogs forward of the gondola and sags aft of it, and it does so in still air at exact global equilibrium, because buoyancy and weight are never distributed the same way."
      >
        <LineChart
          points={beam.stations.map((s) => ({ x: s.x, y: s.moment / 1e6 }))}
          xLabel="station from nose, m"
          yLabel="MN·m"
          zeroLine
          divergingFill
          // The FILL carries polarity here; the line stays one colour so the
          // curve reads as one continuous quantity crossing zero rather than as
          // two series.
          colour={ACCENT}
          format={(p) => `${p.x.toFixed(0)} m → ${p.y.toFixed(2)} MN·m`}
          markers={[
            {
              // The sign AT THE PEAK, not the sign amidships. beam.hogging
              // reports the state at midships, which on this ship is the
              // opposite of the peak: it hogs forward of the gondola and sags
              // aft of it. Labelling the peak with the midships flag said
              // "sagging" over an obviously positive hogging peak.
              x: beam.maximumMomentStation,
              label: `peak ${Math.abs(beam.maximumMoment / 1e6).toFixed(2)} MN·m ${
                beam.maximumMoment > 0 ? 'hogging' : 'sagging'
              }`,
            },
          ]}
        />
      </Panel>
    </div>
  )
}
