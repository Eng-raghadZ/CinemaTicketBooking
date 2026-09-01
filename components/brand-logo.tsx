import Link from "next/link";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" href="/" aria-label="Moviera home">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 48 52" role="img">
          <path className="brand-mark-back" d="M2 1 46 26 2 51 13.5 27 2 1Z" />
          <path className="brand-mark-top" d="M2 1 46 26 17 19.5 2 1Z" />
          <path className="brand-mark-bottom" d="M46 26 2 51 17 31.5 46 26Z" />
          <path className="brand-mark-core" d="M13.5 27 17 19.5 38 26 17 31.5 13.5 27Z" />
        </svg>
      </span>
      {!compact && <span className="brand-word">Moviera</span>}
    </Link>
  );
}
