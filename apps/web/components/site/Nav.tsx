'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import { ROUTES } from '../../lib/routes'

/**
 * The navigation, on every page.
 *
 * It reads the route manifest, so a page cannot exist without appearing here and
 * the reading order in the footer cannot drift from the order in the bar.
 *
 * On a narrow viewport the links collapse behind a button rather than wrapping
 * onto four lines, because eight items plus a wordmark does not fit a phone and
 * a nav that pushes the content down by a third of the screen is worse than one
 * that is a tap away.
 */
export function Nav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-rule)] bg-[color-mix(in_srgb,var(--color-ground)_92%,transparent)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3 sm:px-8">
        <Link
          href="/"
          className="tap num shrink-0 text-xs tracking-[0.2em] text-[var(--color-accent)] transition-opacity hover:opacity-80"
        >
          AIRSHIP.DIY
        </Link>

        <nav className="ml-auto hidden lg:block" aria-label="Sections">
          <ul className="flex items-center gap-1">
            {ROUTES.map((route) => {
              const active = pathname === route.href
              return (
                <li key={route.href}>
                  <Link
                    href={route.href}
                    aria-current={active ? 'page' : undefined}
                    className={`block px-2.5 py-1.5 text-xs transition-colors ${
                      active
                        ? 'text-[var(--color-ink)]'
                        : 'text-[var(--color-ink-faint)] hover:text-[var(--color-ink-dim)]'
                    }`}
                  >
                    {route.label}
                    {active ? (
                      <span className="mt-1 block h-px bg-[var(--color-accent)]" aria-hidden />
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="site-menu"
          className="ml-auto border border-[var(--color-rule)] px-3 py-1.5 text-xs text-[var(--color-ink-dim)] lg:hidden"
        >
          {open ? 'Close' : 'Sections'}
        </button>
      </div>

      {open ? (
        <nav
          id="site-menu"
          aria-label="Sections"
          className="border-t border-[var(--color-rule)] lg:hidden"
        >
          <ul className="mx-auto max-w-6xl px-5 pb-3 sm:px-8">
            {ROUTES.map((route) => (
              <li key={route.href}>
                <Link
                  href={route.href}
                  onClick={() => setOpen(false)}
                  className={`block border-b border-[var(--color-rule)] py-2.5 text-sm last:border-0 ${
                    pathname === route.href
                      ? 'text-[var(--color-ink)]'
                      : 'text-[var(--color-ink-dim)]'
                  }`}
                >
                  {route.label}
                  <span className="mt-0.5 block text-xs text-[var(--color-ink-faint)]">
                    {route.question}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  )
}
