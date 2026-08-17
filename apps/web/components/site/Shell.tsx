import Link from 'next/link'
import type { ReactNode } from 'react'

import { neighbours, routeFor } from '../../lib/routes'

/**
 * The page wrapper: header, content, and where to go next.
 *
 * Every page states the QUESTION it answers before it says anything else. That
 * is the whole editorial rule of this site: a page that cannot name its question
 * is a page that should be part of another one.
 */
export function Shell({ href, children }: { href: string; children: ReactNode }) {
  const route = routeFor(href)
  const { previous, next } = neighbours(href)

  return (
    <main className="mx-auto max-w-6xl px-5 sm:px-8">
      <header className="pt-12 pb-8 sm:pt-16">
        <p className="num text-xs tracking-[0.18em] text-[var(--color-ink-faint)]">
          {route?.question}
        </p>
        <h1 className="mt-3 max-w-4xl text-3xl font-medium leading-[1.15] tracking-tight sm:text-4xl">
          {route?.title}
        </h1>
        {route?.summary ? (
          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-[var(--color-ink-dim)]">
            {route.summary}
          </p>
        ) : null}
      </header>

      <hr className="border-0 border-t border-[var(--color-rule)]" />

      {children}

      <nav
        aria-label="Continue reading"
        className="grid gap-3 border-t border-[var(--color-rule)] py-10 sm:grid-cols-2"
      >
        {previous ? (
          <Link
            href={previous.href}
            className="group border border-[var(--color-rule)] bg-[var(--color-panel)] p-4 transition-colors hover:border-[var(--color-rule-bright)]"
          >
            <span className="text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)]">
              Previous
            </span>
            <span className="mt-1.5 block font-medium">{previous.title}</span>
            <span className="mt-1 block text-xs text-[var(--color-ink-faint)]">
              {previous.question}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={next.href}
            className="group border border-[var(--color-rule)] bg-[var(--color-panel)] p-4 text-right transition-colors hover:border-[var(--color-rule-bright)]"
          >
            <span className="text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)]">
              Next
            </span>
            <span className="mt-1.5 block font-medium">{next.title}</span>
            <span className="mt-1 block text-xs text-[var(--color-ink-faint)]">
              {next.question}
            </span>
          </Link>
        ) : null}
      </nav>
    </main>
  )
}

/** The standing note about what this site is, in the footer of every page. */
export function Footer() {
  return (
    <footer className="border-t border-[var(--color-rule)]">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <p className="max-w-3xl text-sm leading-relaxed text-[var(--color-ink-faint)]">
          Every number on this site is computed at build time by the same functions the tests call
          and the report tool calls. There is no figure typed into a page. Where the model is
          guessing it says so, and where a gate fails it is left failing rather than tuned away.
        </p>
        <p className="mt-3 text-xs text-[var(--color-ink-faint)]">
          <a
            className="tap underline decoration-[var(--color-rule-bright)] underline-offset-4 hover:text-[var(--color-ink-dim)]"
            href="https://github.com/Xaxis/airship.diy"
          >
            Source
          </a>
        </p>
      </div>
    </footer>
  )
}
