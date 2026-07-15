export function resolveApiBaseUrl(
  value: string | undefined,
  isDevelopment: boolean,
): string {
  const candidate = value?.trim() ||
    (isDevelopment ? "http://localhost:3000" : "");
  if (!candidate) {
    throw new Error("VITE_API_BASE_URL is required for production.");
  }
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsafe protocol");
    }
    return url.href.replace(/\/$/, "");
  } catch {
    throw new Error("VITE_API_BASE_URL must be a valid HTTP(S) URL.");
  }
}

export const apiBaseUrl = resolveApiBaseUrl(
  import.meta.env.VITE_API_BASE_URL,
  import.meta.env.DEV,
);
