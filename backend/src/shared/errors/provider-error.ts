export type ProviderErrorKind = "rate_limited" | "timeout" | "http" | "network" | "invalid_response";

export class ProviderError extends Error {
  constructor(
    readonly source: string,
    readonly kind: ProviderErrorKind,
    message: string,
    readonly metadata: Readonly<{ status?: number; retryAfter?: string }> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ProviderError";
  }
}
