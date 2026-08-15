import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

// Bracket access because noPropertyAccessFromIndexSignature is on: process.env
// is an index signature and dotted access would silently accept a typo.
const siteUrl = process.env['NEXT_PUBLIC_SITE_URL'] ?? 'https://airship.diy'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'airship.diy',
    template: '%s | airship.diy',
  },
  description:
    'The design, engineering model and physics simulation of a hydrogen airship built to be lived aboard and never landed. An open engineering notebook: every number traces to an equation or a source.',
  openGraph: {
    title: 'airship.diy',
    description:
      'A hydrogen airship you can build in a shop and never have to land. Physics that survives comparison to every rigid airship ever flown.',
    url: siteUrl,
    siteName: 'airship.diy',
    type: 'website',
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
