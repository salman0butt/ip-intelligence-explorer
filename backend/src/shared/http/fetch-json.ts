import { ProviderError } from "../errors/provider-error.js";

export interface FetchJsonOptions {
  readonly url: string;
  readonly source: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

export async function fetchJson({ url, source, fetchImpl = fetch, timeoutMs = 5_000 }: FetchJsonOptions): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetchImpl(url, { headers: { accept: "application/json" }, signal: controller.signal });
    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after");
        throw new ProviderError(source, "rate_limited", "Provider rate limited the request.", {
          status: 429,
          ...(retryAfter ? { retryAfter } : {}),
        });
      }
      throw new ProviderError(source, "http", "Provider returned an unsuccessful status.", { status: response.status });
    }
    try {
      return await response.json();
    } catch (error: unknown) {
      if (error instanceof ProviderError || (error instanceof Error && error.name === "AbortError")) throw error;
      throw new ProviderError(source, "invalid_response", `${source} returned invalid JSON.`, {}, { cause: error });
    }
  } catch (error: unknown) {
    if (error instanceof ProviderError) throw error;
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new ProviderError(source, "timeout", "Provider request timed out.");
    }
    throw new ProviderError(source, "network", "Provider request failed.", {}, { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}
