import Link from "next/link";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" href="/" aria-label="Moviera home">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" role="img">
          <path d="M7 12.5A5.5 5.5 0 0 1 12.5 7h15A5.5 5.5 0 0 1 33 12.5v15a5.5 5.5 0 0 1-5.5 5.5h-15A5.5 5.5 0 0 1 7 27.5v-15Z" />
          <path className="brand-mark-cut" d="m17 14 9 6-9 6V14Z" />
        </svg>
      </span>
      {!compact && <span className="brand-word">Moviera</span>}
    </Link>
  );
}
