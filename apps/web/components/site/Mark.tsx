/**
 * The device, sitewide.
 *
 * THE SAME DRAWING AS THE FAVICON, because a mark that differs between the tab
 * and the page is two marks. It is inline SVG rather than an <img> for the
 * reason the icon is drawn at all: the CSP forbids off-origin fetches and the
 * site should not carve out an exception for its own logo.
 *
 * What it shows is the thesis rather than a generic airship. The hull rests ON
 * the waterline instead of sitting in it, because it does: the gondola floats
 * on about twenty-four millimetres of draught and the hull never touches water.
 */
export function Mark({ size = 22 }: { readonly size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden
      className="shrink-0"
      fill="none"
    >
      <ellipse cx="15.5" cy="12.6" rx="11" ry="4.4" fill="currentColor" />
      <path d="M26 12.6 L30 8.6 L30 16.6 Z" fill="currentColor" opacity="0.7" />
      <rect x="12" y="16.4" width="7" height="2.3" rx="1.15" fill="currentColor" />
      <line
        x1="3.5"
        y1="20.4"
        x2="28.5"
        y2="20.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        opacity="0.45"
      />
      <line
        x1="6.5"
        y1="24"
        x2="25.5"
        y2="24"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.25"
      />
    </svg>
  )
}
