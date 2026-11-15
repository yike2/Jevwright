/** The product mark: a check inside a rounded square, in the primary color. */
export function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6 text-primary">
      <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="currentColor" />
      <path
        d="M7 12.5l3.2 3.2L17 9"
        fill="none"
        stroke="var(--primary-foreground)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
