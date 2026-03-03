export function getApiKey(): string {
  const key = ((window as unknown) as Record<string, unknown>).__LUMINARR_KEY__ as string;
  // In production, Go replaces __LUMINARR_KEY__ with the real key at startup.
  // In Vite dev mode the HTML is served by Vite without substitution, so
  // fall back to the VITE_API_KEY env var (set in .env.development).
  if (!key || key === "__LUMINARR_KEY__") {
    return (import.meta.env.VITE_API_KEY as string) ?? "";
  }
  return key;
}
