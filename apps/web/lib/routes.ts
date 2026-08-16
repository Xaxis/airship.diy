/**
 * The site's information architecture, in one place.
 *
 * The navigation, the previous/next links, the page titles and the landing
 * page's index all read this. A route that exists and is not here does not
 * appear anywhere, which is the failure mode a hand-maintained nav has.
 *
 * THE ORDER IS AN ARGUMENT. It runs from what the vehicle IS, through why it is
 * that and not something else, through the four questions that decide whether it
 * works at all, to what is still unknown. Read top to bottom it is the case for
 * the design; jumped into anywhere it is a reference.
 */

export interface Route {
  readonly href: string
  /** Short label, for the navigation bar. */
  readonly label: string
  /** Full page title. */
  readonly title: string
  /** The question this page answers, in one line. */
  readonly question: string
  /** A sentence for the landing page card. */
  readonly summary: string
}

export const ROUTES: readonly Route[] = [
  {
    href: '/ship',
    label: 'The ship',
    title: 'The ship',
    question: 'What is it, where is everything, and could you live in it?',
    summary:
      'The arrangement and the interior: a cutaway, an inboard profile, four sections and a plan of every room with what is in it. All drawn from the same stations, footprints and masses the budget integrated.',
  },
  {
    href: '/architecture',
    label: 'Architecture',
    title: 'Why this and not something else',
    question: 'Rigid, semi-rigid, non-rigid, hybrid-lift or variable-buoyancy?',
    summary:
      'All five on one basis, each calibrated on a vehicle that flew. Three are lighter than the one chosen, and each is lighter for a reason that costs something a liveaboard cannot pay.',
  },
  {
    href: '/refused',
    label: 'Refused',
    title: 'What was asked for and refused',
    question: 'Which requirements does the physics simply not allow?',
    summary:
      'Three things this project was asked to build, and the arithmetic that kills each. Every refusal is computed rather than written down, so a better material or a better tank reopens the question by itself instead of waiting for somebody to remember.',
  },
  {
    href: '/energy',
    label: 'Energy',
    title: 'Does the loop close?',
    question: 'Can sunlight alone keep it up for a year?',
    summary:
      'Solar collection integrated over the real hull surface, a fuel cell and electrolyzer round trip, and a day-by-day mission integration that reports the day it fails rather than an average that hides it.',
  },
  {
    href: '/structure',
    label: 'Structure',
    title: 'Will it hold together?',
    question: 'Does the square-cube law let a carbon frame carry this?',
    summary:
      'The mass fraction against every rigid airship with published figures, the buckling allowables that actually size the frame, and the gust case that turns out to govern rather than the static one.',
  },
  {
    href: '/water',
    label: 'Water',
    title: 'Land it on water',
    question: 'Can it float, and can it get anywhere afterwards?',
    summary:
      'Flotation is trivial and it is not the problem. A simulator that integrates the real seakeeping, and the finding that a sealed pneumatic float is stiffer than the water it replaces.',
  },
  {
    href: '/flight',
    label: 'Flight',
    title: 'Fly it',
    question: 'What does it feel like to handle?',
    summary:
      'The project’s own 6-DOF solver at 100 Hz, with the full added-mass tensor. Slow to respond, slow to stop, and overdamped at cruise where it wallows at rest.',
  },
  {
    href: '/failure',
    label: 'Failure',
    title: 'What breaks, and does it kill you?',
    question: 'Eight ways this vehicle fails, and what happens next in each of them.',
    summary:
      'An FMEA whose consequences are computed from the mass statement rather than asserted. Seven of eight are survivable. The eighth is a wiring diagram, not a physics problem, and it is the one worth fixing.',
  },
  {
    href: '/build',
    label: 'Build',
    title: 'Could you actually build it?',
    question: 'What does it cost, how long does it take, and where would you do it?',
    summary:
      'A bill of materials priced at what an individual is actually charged, a labour estimate cross-checked two ways, and the building. This is the page where the answer is no, and the reason is not the airship.',
  },
  {
    href: '/validation',
    label: 'Validation',
    title: 'Does it hold up?',
    question: 'Does the model reproduce ships that actually flew?',
    summary:
      'Every rigid airship with published figures, modelled from its own envelope and compared. Where the model misses, the discrepancy is recorded rather than tuned away.',
  },
  {
    href: '/open',
    label: 'Open questions',
    title: 'Where the model is guessing',
    question: 'What would change the answer if it were measured?',
    summary:
      'The uncertainty register, sorted by how much each unknown moves the endurance number. This is the research queue, and one gate on this site is failing on purpose.',
  },
]

export const routeFor = (href: string): Route | undefined => ROUTES.find((r) => r.href === href)

/** Previous and next in reading order, for the footer of every page. */
export const neighbours = (href: string): { previous?: Route; next?: Route } => {
  const i = ROUTES.findIndex((r) => r.href === href)
  if (i < 0) return {}
  const previous = i > 0 ? ROUTES[i - 1] : undefined
  const next = i < ROUTES.length - 1 ? ROUTES[i + 1] : undefined
  return {
    ...(previous ? { previous } : {}),
    ...(next ? { next } : {}),
  }
}
