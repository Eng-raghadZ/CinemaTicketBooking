import Link from "next/link";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" href="/" aria-label="Moviera home">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 48 52" role="img">
          <path d="M2 1 45 26 2 51 14 27 2 1Z" />
          <path className="brand-mark-cut" d="m9 9 29 17-20-3L9 9Z" />
          <path className="brand-mark-cut" d="m18 29 20-3L9 43l9-14Z" />
        </svg>
      </span>
      {!compact && <span className="brand-word">Moviera</span>}
    </Link>
  );
}
