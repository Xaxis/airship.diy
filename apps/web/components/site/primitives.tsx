import type { ReactNode } from 'react'

/**
 * The pieces every page is made of.
 *
 * They exist so the site has ONE typographic scale, one table style and one way
 * of showing a number. The previous version reimplemented all of it inline in a
 * 1,187 line page, which is how a site ends up with four slightly different
 * tables and three heading sizes that were meant to be the same.
 *
 * The visual language is instrument panel: dark ground, monospace figures,
 * hairline rules, colour reserved for state. Nothing is decorative. If an
 * element does not carry a number or label one, it should not be here.
 */

export function Rule() {
  return <hr className="border-0 border-t border-[var(--color-rule)]" />
}

export function Section({
  title,
  lede,
  children,
  id,
}: {
  title: string
  lede?: string
  children: ReactNode
  id?: string
}) {
  return (
    <section className="py-12 sm:py-16" {...(id ? { id } : {})}>
      <h2 className="text-xl font-medium tracking-tight sm:text-2xl">{title}</h2>
      {lede ? (
        <p className="mt-3 max-w-3xl leading-relaxed text-[var(--color-ink-dim)]">{lede}</p>
      ) : null}
      <div className="mt-7">{children}</div>
    </section>
  )
}

export type Tone = 'ink' | 'pass' | 'fail' | 'unknown' | 'accent'

const TONE_TEXT: Record<Tone, string> = {
  ink: 'text-[var(--color-ink)]',
  pass: 'text-[var(--color-pass)]',
  fail: 'text-[var(--color-fail)]',
  unknown: 'text-[var(--color-unknown)]',
  accent: 'text-[var(--color-accent)]',
}

export function Stat({
  label,
  value,
  unit,
  note,
  tone = 'ink',
}: {
  label: string
  value: string
  unit?: string
  note?: string
  tone?: Tone
}) {
  return (
    <div className="border border-[var(--color-rule)] bg-[var(--color-panel)] p-4">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)]">
        {label}
      </div>
      <div className={`num mt-2 text-2xl ${TONE_TEXT[tone]}`}>
        {value}
        {unit ? <span className="ml-1 text-sm text-[var(--color-ink-dim)]">{unit}</span> : null}
      </div>
      {note ? <div className="mt-1.5 text-xs text-[var(--color-ink-faint)]">{note}</div> : null}
    </div>
  )
}

export function StatGrid({ children, columns = 4 }: { children: ReactNode; columns?: number }) {
  // Explicit class strings rather than a template: Tailwind scans source text,
  // so a computed class name is a class name that does not exist at build time.
  const cols =
    columns === 3
      ? 'sm:grid-cols-3'
      : columns === 5
        ? 'sm:grid-cols-3 lg:grid-cols-5'
        : columns === 6
          ? 'sm:grid-cols-3 lg:grid-cols-6'
          : 'sm:grid-cols-2 lg:grid-cols-4'
  return <div className={`grid grid-cols-2 gap-3 ${cols}`}>{children}</div>
}

/**
 * A pulled-out claim with a coloured rule down its left edge.
 *
 * `tone` is meaning, not decoration: accent for an argument, unknown for a
 * caveat, fail for something that does not work.
 */
export function Callout({
  title,
  tone = 'accent',
  children,
}: {
  title?: string
  tone?: Tone
  children: ReactNode
}) {
  const border = {
    ink: 'border-[var(--color-rule-bright)]',
    pass: 'border-[var(--color-pass)]',
    fail: 'border-[var(--color-fail)]',
    unknown: 'border-[var(--color-unknown)]',
    accent: 'border-[var(--color-accent)]',
  }[tone]

  return (
    <div className={`border-l-2 ${border} bg-[var(--color-panel)] p-5`}>
      {title ? <h3 className="font-medium">{title}</h3> : null}
      <div className="mt-2 max-w-3xl space-y-3 text-sm leading-relaxed text-[var(--color-ink-dim)]">
        {children}
      </div>
    </div>
  )
}

/**
 * A table that scrolls inside its own box.
 *
 * Wide content must never make the page body scroll sideways, which is the
 * layout failure that survives every other check because it only shows up on a
 * narrow viewport.
 */
export function DataTable({
  head,
  children,
  caption,
  minWidth = 0,
}: {
  head: ReactNode
  children: ReactNode
  caption?: string
  minWidth?: number
}) {
  return (
    <figure>
      <div className="scroll-x border border-[var(--color-rule)]">
        <table
          className="num w-full text-sm"
          style={minWidth ? { minWidth: `${minWidth}px` } : undefined}
        >
          <thead>
            <tr className="border-b border-[var(--color-rule)] text-left text-xs text-[var(--color-ink-faint)]">
              {head}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {caption ? (
        <figcaption className="mt-2 max-w-3xl text-xs leading-relaxed text-[var(--color-ink-faint)]">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  )
}

export function Th({
  children,
  align = 'left',
}: {
  children?: ReactNode
  align?: 'left' | 'right'
}) {
  return (
    <th className={`p-2.5 font-normal ${align === 'right' ? 'text-right' : ''}`}>{children}</th>
  )
}

export function Td({
  children,
  align = 'left',
  tone = 'ink',
  sans = false,
}: {
  children?: ReactNode
  align?: 'left' | 'right'
  tone?: Tone
  sans?: boolean
}) {
  return (
    <td
      className={`p-2.5 ${align === 'right' ? 'text-right' : ''} ${sans ? 'sans' : ''} ${
        tone === 'ink' ? '' : TONE_TEXT[tone]
      }`}
    >
      {children}
    </td>
  )
}

export function Tr({ children }: { children: ReactNode }) {
  return <tr className="border-b border-[var(--color-rule)] last:border-0">{children}</tr>
}

/** A framed figure with a caption underneath. For the 3D views and the drawings. */
export function Figure({ caption, children }: { caption?: string; children: ReactNode }) {
  return (
    <figure className="border border-[var(--color-rule)] bg-[var(--color-panel)]">
      {children}
      {caption ? (
        <figcaption className="border-t border-[var(--color-rule)] p-3 text-xs leading-relaxed text-[var(--color-ink-dim)]">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  )
}

/**
 * A pass, warn or fail with its reasoning.
 *
 * The site shows failures rather than hiding them, so this has to read as
 * information and not as an error state.
 */
export function Verdict({
  severity,
  rule,
  detail,
}: {
  severity: 'pass' | 'warn' | 'fail'
  rule: string
  detail: string
}) {
  const tone: Tone = severity === 'pass' ? 'pass' : severity === 'warn' ? 'unknown' : 'fail'
  const label = severity === 'pass' ? 'PASS' : severity === 'warn' ? 'WARN' : 'FAIL'
  return (
    <li className="border border-[var(--color-rule)] bg-[var(--color-panel)] p-3">
      <p className="flex items-baseline gap-2 text-sm">
        <span className={`num shrink-0 text-xs ${TONE_TEXT[tone]}`}>{label}</span>
        <span>{rule}</span>
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-ink-dim)]">{detail}</p>
    </li>
  )
}

/** Body prose. One place so the measure and the leading are the same everywhere. */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-3xl space-y-4 leading-relaxed text-[var(--color-ink-dim)]">
      {children}
    </div>
  )
}

export const fmt = (n: number, digits = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })

export const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`

export const kWh = (joules: number) => joules / 3.6e6
