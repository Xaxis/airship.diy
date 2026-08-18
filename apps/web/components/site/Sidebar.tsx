'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { ROUTES, SECTIONS, routesIn } from '../../lib/routes'

/**
 * The chapter index, beside the page rather than across the top of it.
 *
 * TEN LINKS IN A TOP BAR IS A WALL, not navigation. It gave every chapter the
 * same weight, showed no structure, and on anything narrower than a laptop it
 * collapsed behind a button so the reader could not see where they were at all.
 *
 * Here the argument's shape is visible: what the vehicle is, whether it works,
 * whether it can be built, and whether any of it is true. The reader can always
 * see which of those four they are in and what else is in it.
 *
 * It is a client component only because it needs the current path to mark it.
 */
export function Sidebar() {
  const pathname = usePathname()

  return (
    <nav aria-label="Chapters" className="text-sm">
      <ol className="space-y-7">
        {SECTIONS.map((section, index) => (
          <li key={section}>
            <h2 className="num text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">
              <span className="mr-2 opacity-60">{String(index + 1).padStart(2, '0')}</span>
              {section}
            </h2>
            <ol className="mt-2.5 space-y-px">
              {routesIn(section).map((route) => {
                const active = pathname === route.href
                return (
                  <li key={route.href}>
                    <Link
                      href={route.href}
                      aria-current={active ? 'page' : undefined}
                      className={`block border-l py-1.5 pl-3 transition-colors ${
                        active
                          ? 'border-[var(--color-accent)] text-[var(--color-ink)]'
                          : 'border-[var(--color-rule)] text-[var(--color-ink-faint)] hover:border-[var(--color-rule-bright)] hover:text-[var(--color-ink-dim)]'
                      }`}
                    >
                      {route.label}
                    </Link>
                  </li>
                )
              })}
            </ol>
          </li>
        ))}
      </ol>

      <p className="mt-8 border-t border-[var(--color-rule)] pt-4 text-xs leading-relaxed text-[var(--color-ink-faint)]">
        {ROUTES.length} chapters. Read top to bottom it is the argument for the
        design; jumped into anywhere it is a reference.
      </p>
    </nav>
  )
}
