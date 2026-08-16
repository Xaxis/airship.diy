/**
 * Where the vehicle can go on the water, drawn the way a sailor reads it.
 *
 * A POLAR IS THE RIGHT FORM AND ALMOST NOTHING ELSE IS. The data is speed as a
 * function of heading relative to the wind, which is an angular quantity with a
 * magnitude at every angle, and every other presentation of it loses the thing
 * that matters: whether the shape has a hole in it. A table of speeds by heading
 * is the same numbers and it takes a minute to see what a polar shows in a
 * second, which is that this vehicle can go upwind and downwind freely and that
 * the reachable set narrows across the wind.
 *
 * Wind blows from the top of the diagram. Dead upwind is up, dead downwind is
 * down, and the radius at each bearing is the speed made good along it. The
 * shaded wedge is where LEEWAY exceeds what counts as navigation: inside it the
 * vehicle points where the fins say and goes where the wind says.
 *
 * Mirrored about the vertical, because the physics is symmetric and a
 * half-polar reads as a bug.
 */

export interface PolarPoint {
  /** Radians off the wind. 0 is straight into it. */
  readonly heading: number
  readonly speed: number
  readonly leeway: number
  readonly holdable: boolean
}

export interface Polar {
  readonly wind: number
  readonly upwindSpeed: number
  readonly beamLeeway: number
  readonly usefulCone: number
  readonly points: readonly PolarPoint[]
}

/** @source Leeway above which a heading stops being useful navigation, radians. */
const USEFUL_LEEWAY = (20 * Math.PI) / 180

const WIND_COLOUR = ['#6ba8e5', '#4ec9a0', '#e0b64a', '#f2705a', '#9085e9']

export function NavigationPolar({
  polars,
  caption,
}: {
  polars: readonly Polar[]
  caption?: string
}) {
  const maxSpeed = Math.max(...polars.flatMap((p) => p.points.map((q) => q.speed)), 1)

  /** @derived Half-size of the square drawing area, in its own units. */
  const R = 100
  const pad = 26
  const size = (R + pad) * 2

  // Screen position for a bearing off the wind and a speed. Wind from the top,
  // so heading 0 (dead upwind) points UP the page, which is how a polar is read.
  const at = (heading: number, speed: number, mirror: boolean) => {
    const r = (speed / maxSpeed) * R
    const theta = mirror ? -heading : heading
    return {
      x: R + pad + r * Math.sin(theta),
      y: R + pad - r * Math.cos(theta),
    }
  }

  return (
    <figure className="border border-[var(--color-rule)] bg-[var(--color-panel)]">
      <div className="scroll-x p-4">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="mx-auto block w-full max-w-[560px] min-w-[320px]"
          role="img"
          aria-label="Polar diagram of speed made good against heading relative to the wind"
        >
          {/* Speed rings, labelled, recessive. */}
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <circle
                cx={R + pad}
                cy={R + pad}
                r={f * R}
                fill="none"
                stroke="#232b35"
                strokeWidth="1"
              />
              <text
                x={R + pad + 3}
                y={R + pad - f * R + 10}
                fill="#3d4b5a"
                fontSize="8"
                fontFamily="ui-monospace, monospace"
              >
                {(f * maxSpeed).toFixed(0)}
              </text>
            </g>
          ))}

          {/* Bearing spokes every 30 degrees. */}
          {[0, 30, 60, 90, 120, 150, 180].map((deg) => {
            const t = (deg * Math.PI) / 180
            return (
              <g key={deg}>
                <line
                  x1={R + pad}
                  y1={R + pad}
                  x2={R + pad + R * Math.sin(t)}
                  y2={R + pad - R * Math.cos(t)}
                  stroke="#232b35"
                  strokeWidth="1"
                />
                <line
                  x1={R + pad}
                  y1={R + pad}
                  x2={R + pad - R * Math.sin(t)}
                  y2={R + pad - R * Math.cos(t)}
                  stroke="#232b35"
                  strokeWidth="1"
                />
              </g>
            )
          })}

          {/* The wind, from the top. */}
          <g stroke="#61707f" strokeWidth="1.4" fill="none">
            <line x1={R + pad} y1={4} x2={R + pad} y2={pad - 8} />
            <path d={`M ${R + pad - 4},${pad - 13} L ${R + pad},${pad - 6} L ${R + pad + 4},${pad - 13}`} />
          </g>
          <text
            x={R + pad + 8}
            y={13}
            fill="#61707f"
            fontSize="9"
            fontFamily="ui-monospace, monospace"
          >
            wind
          </text>

          {/* One curve per wind speed, mirrored about the vertical. */}
          {polars.map((polar, i) => {
            const colour = WIND_COLOUR[i % WIND_COLOUR.length]
            /**
             * BREAK THE PATH WHERE THE VEHICLE CANNOT HOLD THE HEADING, rather
             * than running a line to the origin. An unholdable bearing has zero
             * speed, and joining it to its neighbours draws a spoke through the
             * centre that reads as a capability instead of as a gap. A polar
             * with a hole in it must LOOK like it has a hole in it.
             */
            const segments = (
              subset: readonly PolarPoint[],
              mirror: boolean,
            ): string => {
              let d = ''
              let open = false
              for (const q of subset) {
                if (!q.holdable || q.speed <= 0) {
                  open = false
                  continue
                }
                const p = at(q.heading, q.speed, mirror)
                d += `${open ? 'L' : 'M'} ${p.x.toFixed(2)},${p.y.toFixed(2)} `
                open = true
              }
              return d.trim()
            }

            const path = (mirror: boolean) => segments(polar.points, mirror)

            // The part of the curve where leeway has made the heading
            // meaningless, drawn as a thick pale overlay so it reads as a
            // caveat rather than a capability.
            const drifting = polar.points.filter((q) => q.leeway > USEFUL_LEEWAY)
            const driftPath = (mirror: boolean) => segments(drifting, mirror)

            return (
              <g key={polar.wind}>
                <path d={path(false)} fill="none" stroke={colour} strokeWidth="1.8" />
                <path d={path(true)} fill="none" stroke={colour} strokeWidth="1.8" />
                {drifting.length > 0 ? (
                  <>
                    <path
                      d={driftPath(false)}
                      fill="none"
                      stroke={colour}
                      strokeWidth="3.5"
                      strokeOpacity="0.25"
                    />
                    <path
                      d={driftPath(true)}
                      fill="none"
                      stroke={colour}
                      strokeWidth="3.5"
                      strokeOpacity="0.25"
                    />
                  </>
                ) : null}
              </g>
            )
          })}

          <text
            x={R + pad}
            y={size - 6}
            fill="#61707f"
            fontSize="9"
            textAnchor="middle"
            fontFamily="ui-monospace, monospace"
          >
            downwind
          </text>
        </svg>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-[var(--color-rule)] px-4 py-2.5">
        {polars.map((p, i) => (
          <span key={p.wind} className="flex items-center gap-1.5 text-xs">
            <span
              aria-hidden
              className="inline-block h-0.5 w-4"
              style={{ background: WIND_COLOUR[i % WIND_COLOUR.length] }}
            />
            <span className="num text-[var(--color-ink-dim)]">{p.wind} m/s</span>
          </span>
        ))}
        <span className="text-xs text-[var(--color-ink-faint)]">
          A thick pale line is where leeway exceeds 20 degrees: the vehicle points there and does
          not go there.
        </span>
      </div>

      {caption ? (
        <figcaption className="border-t border-[var(--color-rule)] p-3 text-xs leading-relaxed text-[var(--color-ink-dim)]">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  )
}
