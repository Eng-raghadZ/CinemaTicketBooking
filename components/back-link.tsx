import Link from "next/link";

type BackLinkProps = {
  href: string;
  label: string;
};

export function BackLink({ href, label }: BackLinkProps) {
  return (
    <Link className="back-link" href={href}>
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M16 10H4m5-5-5 5 5 5" />
      </svg>
      <span>Back to {label}</span>
    </Link>
  );
}
