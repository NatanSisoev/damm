// Wordmark: plain text, Hanken Grotesk 800. No symbol, no Damm branding (docs/visual-identity.md).
export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`font-extrabold tracking-[-0.01em] ${className}`}>Escolta activa</span>;
}
