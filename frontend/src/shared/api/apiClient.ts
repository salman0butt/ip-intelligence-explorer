import { apiBaseUrl } from "../config/environment";

interface ErrorEnvelope {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly requestId?: string;
  };
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }
  const error = value.error;
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    "message" in error &&
    typeof error.message === "string" &&
    (!("requestId" in error) || typeof error.requestId === "string");
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError";
}

export class ApiError extends Error {
  override readonly name = "ApiError";

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export async function requestJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(new URL(path, apiBaseUrl), {
      ...init,
      headers: {
        accept: "application/json",
        ...Object.fromEntries(new Headers(init.headers).entries()),
      },
    });
  } catch (error: unknown) {
    if (isAbortError(error)) throw error;
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Unable to reach the API.",
      undefined,
      { cause: error },
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error: unknown) {
    if (isAbortError(error)) throw error;
    if (!response.ok) {
      throw new ApiError(
        response.status,
        "HTTP_ERROR",
        "The API request failed.",
        undefined,
        { cause: error },
      );
    }
    throw new ApiError(
      response.status,
      "INVALID_RESPONSE",
      "The API returned an invalid response.",
      undefined,
      { cause: error },
    );
  }

  if (!response.ok) {
    if (isErrorEnvelope(body)) {
      throw new ApiError(
        response.status,
        body.error.code,
        body.error.message,
        body.error.requestId,
      );
    }
    throw new ApiError(
      response.status,
      "HTTP_ERROR",
      "The API request failed.",
    );
  }
  return body as T;
}
