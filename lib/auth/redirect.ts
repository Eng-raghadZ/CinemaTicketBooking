const INTERNAL_REDIRECT_BASE = "https://internal.invalid";

export function safeInternalRedirectPath(
  value: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return fallback;
  }

  try {
    const resolved = new URL(value, INTERNAL_REDIRECT_BASE);

    if (resolved.origin !== INTERNAL_REDIRECT_BASE) {
      return fallback;
    }

    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
