// Brand title: the supplied "Give a Damm" SVGs, never live text (docs/style-guide.md, Logo and title usage).
// One-line title for headers; both variants are rendered and CSS (globals.css) shows the one for the active theme. `light` forces the paper-background variant (print poster).
export function Wordmark({ className = "", light = false }: { className?: string; light?: boolean }) {
  // Height comes from className (h-*); width follows the SVG's aspect ratio.
  const cls = `block h-6 w-auto ${className}`;
  return (
    <>
      <img src="/brand/title-oneline-light.svg" alt="Give a Damm" className={`${light ? "" : "wm-light "}${cls}`} />
      {!light && <img src="/brand/title-oneline-dark.svg" alt="Give a Damm" className={`wm-dark ${cls}`} />}
    </>
  );
}

/** Ear symbol (docs/brand/svg/symbol.svg) inline so the red dot can pulse. Ink stroke follows the text colour. */
export function EarSymbol({ size = 48, pulse = false, className = "" }: { size?: number; pulse?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className={className}>
      <path
        d="M17.1 7.7A6.6 6.6 0 1 0 12 18.6C14.4 18.6 15.4 17 14.8 15.3C14.4 14.2 14.6 13.3 14.6 12.2A2.6 2.6 0 0 0 9.4 12.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(0 -0.3)"
      />
      <circle cx="12" cy="12.5" r="1.09" fill="var(--red)" className={pulse ? "pulse-once" : undefined} style={{ transformBox: "fill-box" }} />
    </svg>
  );
}
