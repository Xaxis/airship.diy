/**
 * The ship inside the building it needs, to scale.
 *
 * Every other figure on this site is about the vehicle. This one is about the
 * thing around the vehicle, because that is what the build chapter concludes
 * is the actual obstacle, and a number in a table does not carry it. A 130 by
 * 46 by 39 m clear span with a person drawn at 1.75 m at the door is the whole
 * argument in one picture.
 *
 * Drawn from the same hull radii the 3D view uses and the same clear dimensions
 * the facility model computes, so the drawing cannot flatter the building or
 * the ship.
 */

export function ShedScale({
  length,
  radii,
  finStation,
  finSpan,
  clearLength,
  clearHeight,
  clearWidth,
  vehicleHeight,
}: {
  length: number
  radii: readonly number[]
  finStation: number
  finSpan: number
  clearLength: number
  clearHeight: number
  clearWidth: number
  vehicleHeight: number
}) {
  /** @derived Room around the drawing, in metres, so dimension lines have somewhere to go. */
  const PAD = 22
  const viewWidth = clearLength + PAD * 2
  const viewHeight = clearHeight + PAD * 2

  // Ground line at the bottom of the shed, ship centred in the span.
  const groundY = PAD + clearHeight
  const shedX = PAD
  const shipX = PAD + (clearLength - length) / 2

  const maxRadius = Math.max(...radii)
  // The ship sits on the floor on its gondola, so the hull axis is a hull
  // radius plus the gondola depth above the ground.
  /** @derived Gondola depth below the hull, m, from the arrangement. */
  const GONDOLA_DEPTH = 3.2
  const axisY = groundY - GONDOLA_DEPTH - maxRadius

  const upper = radii
    .map((r, i) => `${shipX + (i / (radii.length - 1)) * length},${axisY - r}`)
    .join(' ')
  const lower = radii
    .map((r, i) => `${shipX + (i / (radii.length - 1)) * length},${axisY + r}`)
    .reverse()
    .join(' ')

  const finRootRadius = radii[Math.round(finStation * (radii.length - 1))] ?? maxRadius
  const finX = shipX + finStation * length
  /** @derived Fin root chord, m, from the arrangement's 0.13 of length. */
  const finChord = length * 0.13

  return (
    <figure className="border border-[var(--color-rule)] bg-[var(--color-panel)]">
      <div className="scroll-x p-4">
        <svg
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          className="block w-full min-w-[760px]"
          role="img"
          aria-label={`The ${length} metre ship inside the ${clearLength.toFixed(0)} by ${clearHeight.toFixed(0)} metre shed it needs, drawn to scale`}
        >
          {/* The shed. Drawn as a section: floor, two walls, an arched roof. */}
          <path
            d={`M ${shedX},${groundY} L ${shedX},${groundY - clearHeight * 0.55}
                Q ${shedX},${groundY - clearHeight} ${shedX + clearLength / 2},${groundY - clearHeight}
                Q ${shedX + clearLength},${groundY - clearHeight} ${shedX + clearLength},${groundY - clearHeight * 0.55}
                L ${shedX + clearLength},${groundY}`}
            fill="#0d1117"
            stroke="#33404e"
            strokeWidth="0.7"
          />

          {/* Ground. */}
          <line
            x1={PAD * 0.4}
            y1={groundY}
            x2={viewWidth - PAD * 0.4}
            y2={groundY}
            stroke="#33404e"
            strokeWidth="0.5"
          />

          {/* Fins, drawn before the hull so the hull overlaps the root. */}
          <path
            d={`M ${finX - finChord / 2},${axisY - finRootRadius}
                L ${finX - finChord * 0.15},${axisY - finRootRadius - finSpan}
                L ${finX + finChord / 2},${axisY - finRootRadius - finSpan * 0.35}
                L ${finX + finChord / 2},${axisY - finRootRadius} Z`}
            fill="#3987e5"
            fillOpacity="0.35"
            stroke="#3987e5"
            strokeWidth="0.3"
          />
          <path
            d={`M ${finX - finChord / 2},${axisY + finRootRadius}
                L ${finX - finChord * 0.15},${axisY + finRootRadius + finSpan}
                L ${finX + finChord / 2},${axisY + finRootRadius + finSpan * 0.35}
                L ${finX + finChord / 2},${axisY + finRootRadius} Z`}
            fill="#3987e5"
            fillOpacity="0.35"
            stroke="#3987e5"
            strokeWidth="0.3"
          />

          {/* The hull. */}
          <polygon
            points={`${upper} ${lower}`}
            fill="#1c2530"
            stroke="#6ba8e5"
            strokeWidth="0.4"
          />

          {/* Gondola, so the ship is standing on something. */}
          <rect
            x={shipX + length * 0.24}
            y={axisY + maxRadius}
            width={length * 0.22}
            height={GONDOLA_DEPTH}
            fill="#232b35"
            stroke="#6ba8e5"
            strokeWidth="0.3"
          />

          {/* A person, at the door, at 1.75 m. This is the whole point. */}
          <g stroke="#f2705a" strokeWidth="0.45" fill="none" strokeLinecap="round">
            <circle cx={shedX + 5} cy={groundY - 1.55} r="0.28" fill="#f2705a" />
            <line x1={shedX + 5} y1={groundY - 1.3} x2={shedX + 5} y2={groundY - 0.6} />
            <line x1={shedX + 4.6} y1={groundY} x2={shedX + 5} y2={groundY - 0.6} />
            <line x1={shedX + 5.4} y1={groundY} x2={shedX + 5} y2={groundY - 0.6} />
            <line x1={shedX + 4.5} y1={groundY - 1.15} x2={shedX + 5.5} y2={groundY - 1.15} />
          </g>
          <text
            x={shedX + 7}
            y={groundY - 0.4}
            fill="#f2705a"
            fontSize="2.6"
            fontFamily="ui-monospace, monospace"
          >
            1.75 m
          </text>

          {/* Dimensions. */}
          <g stroke="#61707f" strokeWidth="0.25" fill="none">
            <line x1={shedX} y1={groundY + 6} x2={shedX + clearLength} y2={groundY + 6} />
            <line x1={shedX} y1={groundY + 4.5} x2={shedX} y2={groundY + 7.5} />
            <line
              x1={shedX + clearLength}
              y1={groundY + 4.5}
              x2={shedX + clearLength}
              y2={groundY + 7.5}
            />
            <line x1={shipX} y1={groundY + 13} x2={shipX + length} y2={groundY + 13} />
            <line x1={shipX} y1={groundY + 11.5} x2={shipX} y2={groundY + 14.5} />
            <line x1={shipX + length} y1={groundY + 11.5} x2={shipX + length} y2={groundY + 14.5} />
            <line
              x1={shedX - 6}
              y1={groundY}
              x2={shedX - 6}
              y2={groundY - clearHeight}
            />
            <line x1={shedX - 7.5} y1={groundY} x2={shedX - 4.5} y2={groundY} />
            <line
              x1={shedX - 7.5}
              y1={groundY - clearHeight}
              x2={shedX - 4.5}
              y2={groundY - clearHeight}
            />
          </g>
          <text
            x={shedX + clearLength / 2}
            y={groundY + 9.6}
            fill="#9aa7b4"
            fontSize="3"
            textAnchor="middle"
            fontFamily="ui-monospace, monospace"
          >
            {clearLength.toFixed(0)} m clear, {clearWidth.toFixed(0)} m span
          </text>
          <text
            x={shipX + length / 2}
            y={groundY + 16.6}
            fill="#6ba8e5"
            fontSize="3"
            textAnchor="middle"
            fontFamily="ui-monospace, monospace"
          >
            {length.toFixed(0)} m ship, {vehicleHeight.toFixed(0)} m over the fins
          </text>
          <text
            x={shedX - 8.5}
            y={groundY - clearHeight / 2}
            fill="#9aa7b4"
            fontSize="3"
            textAnchor="middle"
            fontFamily="ui-monospace, monospace"
            transform={`rotate(-90 ${shedX - 8.5} ${groundY - clearHeight / 2})`}
          >
            {clearHeight.toFixed(0)} m
          </text>
        </svg>
      </div>
      <figcaption className="border-t border-[var(--color-rule)] p-3 text-xs leading-relaxed text-[var(--color-ink-dim)]">
        Section through the shed, ship inside, drawn from the same hull radii as the 3D view and the
        same clear dimensions the facility model computes. The person at the door is 1.75 m. The
        clear height is set by the fin tip and not by the hull crown, which is a{' '}
        {(vehicleHeight - Math.max(...radii) * 2).toFixed(0)} m difference and the sort of thing
        discovered on the day the doors will not clear.
      </figcaption>
    </figure>
  )
}
