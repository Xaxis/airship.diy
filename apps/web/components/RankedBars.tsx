/**
 * Ranked magnitude with an uncertainty range on every bar.
 *
 * The form follows the data's job. The bill of materials and the labour
 * estimate are both "which of these is the big one", which is a ranked bar, and
 * both carry a low and a high that are wider than the differences between
 * adjacent lines. A bar without its range would say the ordering is known when
 * it is not: the gas cell line spans a factor of six and could plausibly sit
 * anywhere in the top four.
 *
 * The range is drawn as a track BEHIND the bar rather than as a whisker on the
 * end, because several ranges start below the bar's own value and a whisker
 * that runs backwards reads as an error rather than as a bound.
 *
 * Disclosure is `details` and `summary` rather than React state, so this stays
 * a server component and the page needs no JavaScript to be read. It also means
 * the caller passes formatted strings rather than a formatter, which a client
 * boundary would refuse anyway.
 */

export interface RankedItem {
  readonly id: string
  readonly label: string
  readonly value: number
  readonly low: number
  readonly high: number
  /** The value, already formatted. */
  readonly display: string
  /** Low and high, already formatted. */
  readonly rangeDisplay: string
  /** Shown when the row is opened. */
  readonly note: string
  /** Small monospace annotation beside the value, e.g. the quantity. */
  readonly annotation?: string
}

export function RankedBars({
  items,
  caption,
  tone = 'accent',
}: {
  items: readonly RankedItem[]
  caption?: string
  tone?: 'accent' | 'unknown'
}) {
  const max = Math.max(...items.map((i) => i.high))
  const barColor = tone === 'unknown' ? 'var(--color-unknown)' : 'var(--color-accent)'

  return (
    <figure>
      <ul className="border border-[var(--color-rule)]">
        {items.map((item) => (
          <li key={item.id} className="border-b border-[var(--color-rule)] last:border-0">
            <details className="group">
              <summary className="cursor-pointer list-none p-3 transition-colors hover:bg-[var(--color-panel)] group-open:bg-[var(--color-panel-raised)] [&::-webkit-details-marker]:hidden">
                <span className="flex items-baseline justify-between gap-4">
                  <span className="text-sm">{item.label}</span>
                  <span className="num shrink-0 text-sm">
                    {item.display}
                    {item.annotation ? (
                      <span className="ml-3 text-xs text-[var(--color-ink-faint)]">
                        {item.annotation}
                      </span>
                    ) : null}
                  </span>
                </span>

                <span className="mt-2 block">
                  <svg
                    viewBox="0 0 100 3"
                    preserveAspectRatio="none"
                    className="block h-2.5 w-full"
                    role="img"
                    aria-label={`${item.label}: ${item.display}, ${item.rangeDisplay}`}
                  >
                    <rect
                      x={(item.low / max) * 100}
                      y="0.4"
                      width={Math.max(((item.high - item.low) / max) * 100, 0.3)}
                      height="2.2"
                      fill={barColor}
                      fillOpacity="0.18"
                      rx="0.4"
                    />
                    <rect
                      x="0"
                      y="0.9"
                      width={Math.max((item.value / max) * 100, 0.4)}
                      height="1.2"
                      fill={barColor}
                      rx="0.4"
                    />
                  </svg>
                </span>
              </summary>

              <div className="max-w-3xl px-3 pb-4 text-xs leading-relaxed text-[var(--color-ink-dim)]">
                {item.note}
                <span className="num mt-2 block text-[var(--color-ink-faint)]">
                  {item.rangeDisplay}
                </span>
              </div>
            </details>
          </li>
        ))}
      </ul>
      <figcaption className="mt-2 max-w-3xl text-xs leading-relaxed text-[var(--color-ink-faint)]">
        The solid bar is the nominal, the faint band behind it is the low to high range. Open a row
        for what it is and where the number comes from.
        {caption ? ` ${caption}` : ''}
      </figcaption>
    </figure>
  )
}
