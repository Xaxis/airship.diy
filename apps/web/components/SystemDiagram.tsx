import { CATEGORY_SWATCH } from './ArrangementViewer'

/**
 * A loop drawn as a graph: sources on the left, stores and converters in the
 * middle, loads on the right, and the flows between them at proportional width.
 *
 * NOT A SANKEY, deliberately. A Sankey conserves flow across the diagram, and
 * these loops do not: the water loop has a 33 to 1 surplus on catchment and the
 * power loop's ratings are peak capacities that never all run at once. Drawing
 * them as a Sankey would either lie about the widths or collapse every
 * interesting flow to a hairline next to the rain. Ranked columns with
 * proportional strokes say the same thing without the false conservation.
 */

export interface DiagramNode {
  readonly id: string
  readonly name: string
  readonly kind: 'source' | 'store' | 'converter' | 'load' | 'loss'
  readonly rating: number
  readonly unit: string
  readonly critical: boolean
  readonly note: string
}

export interface DiagramFlow {
  readonly from: string
  readonly to: string
  readonly rate: number
}

const KIND_COLUMN: Record<DiagramNode['kind'], number> = {
  source: 0,
  store: 1,
  converter: 1,
  load: 2,
  loss: 2,
}

const KIND_COLOR: Record<DiagramNode['kind'], string> = {
  source: '#199e70',
  store: '#c98500',
  converter: '#3987e5',
  load: '#d95926',
  loss: '#61707f',
}

export function SystemDiagram({
  nodes,
  flows,
  unit,
  caption,
}: {
  nodes: readonly DiagramNode[]
  flows: readonly DiagramFlow[]
  unit: string
  caption?: string
}) {
  void CATEGORY_SWATCH

  const columns: DiagramNode[][] = [[], [], []]
  for (const n of nodes) {
    const column = columns[KIND_COLUMN[n.kind]]
    if (column) column.push(n)
  }

  const width = 900
  const columnWidth = 240
  const boxHeight = 52
  const gap = 16
  const tallest = Math.max(...columns.map((c) => c.length))
  const height = tallest * (boxHeight + gap) + gap

  const positionOf = (id: string): { x: number; y: number } | null => {
    for (let c = 0; c < columns.length; c += 1) {
      const column = columns[c]
      if (!column) continue
      const i = column.findIndex((n) => n.id === id)
      if (i < 0) continue
      // Centre each column vertically so a short column does not hug the top.
      const offset = (height - column.length * (boxHeight + gap)) / 2
      return {
        x: c * ((width - columnWidth) / 2),
        y: offset + gap / 2 + i * (boxHeight + gap),
      }
    }
    return null
  }

  const maxRate = Math.max(...flows.map((f) => f.rate), 1)

  return (
    <figure className="border border-[var(--color-rule)] bg-[var(--color-panel)]">
      <div className="scroll-x p-4">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block w-full min-w-[720px]"
          role="img"
          aria-label={`System flow diagram, rates in ${unit}`}
        >
          {flows.map((f, i) => {
            const a = positionOf(f.from)
            const b = positionOf(f.to)
            if (!a || !b) return null
            const x1 = a.x + columnWidth
            const y1 = a.y + boxHeight / 2
            const x2 = b.x
            const y2 = b.y + boxHeight / 2
            // A cubic with horizontal tangents, so flows leave and arrive
            // square to their boxes and cross legibly in the middle.
            const mid = (x1 + x2) / 2
            /** @derived Stroke width from 0.8 to 6 px, by square root so a 33 to
             * one ratio does not make everything else invisible. */
            const w = 0.8 + 5.2 * Math.sqrt(f.rate / maxRate)
            const backwards = x2 < x1
            return (
              <path
                key={`${f.from}-${f.to}-${i}`}
                d={
                  backwards
                    ? `M ${x1},${y1} C ${x1 + 40},${y1 - 30} ${x2 - 40},${y2 - 30} ${x2},${y2}`
                    : `M ${x1},${y1} C ${mid},${y1} ${mid},${y2} ${x2},${y2}`
                }
                fill="none"
                stroke={backwards ? '#61707f' : '#3d5a75'}
                strokeWidth={w}
                strokeOpacity={backwards ? 0.5 : 0.75}
                strokeDasharray={backwards ? '5 4' : undefined}
              />
            )
          })}

          {nodes.map((n) => {
            const p = positionOf(n.id)
            if (!p) return null
            return (
              <g key={n.id}>
                <rect
                  x={p.x}
                  y={p.y}
                  width={columnWidth}
                  height={boxHeight}
                  fill="#11151a"
                  stroke={KIND_COLOR[n.kind]}
                  strokeWidth={n.critical ? 1.6 : 0.8}
                  rx="2"
                />
                <text x={p.x + 12} y={p.y + 21} fill="#e6edf3" fontSize="13">
                  {n.name}
                </text>
                <text
                  x={p.x + 12}
                  y={p.y + 39}
                  fill="#9aa7b4"
                  fontSize="11"
                  fontFamily="ui-monospace, monospace"
                >
                  {n.rating > 0
                    ? `${n.rating.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${n.unit}`
                    : n.unit}
                  {n.critical ? '  · critical' : ''}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-[var(--color-rule)] px-4 py-2.5">
        {(
          [
            ['source', 'Source'],
            ['store', 'Store'],
            ['converter', 'Converter'],
            ['load', 'Load'],
          ] as const
        ).map(([kind, label]) => (
          <span key={kind} className="flex items-center gap-1.5 text-xs">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-[1px] border"
              style={{ borderColor: KIND_COLOR[kind] }}
            />
            <span className="text-[var(--color-ink-dim)]">{label}</span>
          </span>
        ))}
        <span className="text-xs text-[var(--color-ink-faint)]">
          A heavier border is a component whose loss takes out something the crew depends on. A
          dashed line runs backwards: a return leg rather than a supply.
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
