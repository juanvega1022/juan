/** A folded napkin with a pen scribble, used as the logo mark. */
export function NapkinMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <path d="M5 8 L33 5 L35 33 L7 35 Z" fill="var(--color-card)" stroke="var(--color-ink)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M33 5 L35 33 L22 22 Z" fill="var(--color-line)" stroke="var(--color-ink)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M10 15 q4 -3 8 0 t8 -1" fill="none" stroke="var(--color-accent)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M10 21 q3 -2 6 0" fill="none" stroke="var(--color-accent)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
