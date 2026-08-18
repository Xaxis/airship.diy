'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import { SECTIONS, routesIn } from '../../lib/routes'
import { Mark } from './Mark'

/**
 * The bar: the device, and the way out.
 *
 * IT USED TO CARRY ALL TEN CHAPTERS. That is a wall rather than navigation. It
 * gave every chapter the same weight, showed none of the structure of the
 * argument, and still collapsed behind a button on anything narrower than a
 * laptop, so the reader could not see where they were either way.
 *
 * The chapters live in the sidebar now, where they are grouped and where the
 * current one is always visible. What is left here is what a bar is for: the
 * mark, a way back to the top, and the source. Below `xl` the sidebar is not
 * rendered, so the button opens the same grouped index rather than a flat list.
 */
export function Nav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-rule)] bg-[color-mix(in_srgb,var(--color-ground)_92%,transparent)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3 sm:px-8">
        <Link
          href="/"
          className="tap num flex shrink-0 items-center gap-2 text-xs tracking-[0.2em] text-[var(--color-accent)] transition-opacity hover:opacity-80"
        >
          <Mark />
          AIRSHIP.DIY
        </Link>

        <a
          href="https://github.com/Xaxis/airship.diy"
          target="_blank"
          rel="noopener noreferrer"
          className="tap ml-auto shrink-0 text-xs text-[var(--color-ink-faint)] transition-colors hover:text-[var(--color-ink-dim)]"
        >
          Source
        </a>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="site-menu"
          className="border border-[var(--color-rule)] px-3 py-1.5 text-xs text-[var(--color-ink-dim)] xl:hidden"
        >
          {open ? 'Close' : 'Chapters'}
        </button>
      </div>

      {open ? (
        <nav
          id="site-menu"
          aria-label="Sections"
          className="border-t border-[var(--color-rule)] xl:hidden"
        >
          <div className="mx-auto max-w-6xl px-5 pb-5 pt-1 sm:px-8">
            {SECTIONS.map((section, index) => (
              <div key={section} className="mt-4 first:mt-1">
                <h2 className="num text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">
                  <span className="mr-2 opacity-60">{String(index + 1).padStart(2, '0')}</span>
                  {section}
                </h2>
                <ul className="mt-1.5">
                  {routesIn(section).map((route) => (
                    <li key={route.href}>
                      <Link
                        href={route.href}
                        onClick={() => setOpen(false)}
                        className={`block border-l py-2 pl-3 text-sm ${
                          pathname === route.href
                            ? 'border-[var(--color-accent)] text-[var(--color-ink)]'
                            : 'border-[var(--color-rule)] text-[var(--color-ink-dim)]'
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
              </div>
            ))}
          </div>
        </nav>
      ) : null}
    </header>
  )
}
