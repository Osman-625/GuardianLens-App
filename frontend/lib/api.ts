// The website's thin client for the GuardianLens API: the API origin and one fetch helper. It sends
// the session cookie with every request (credentials: "include") and turns the API's error
// envelope into a typed GuardianLensApiError, so pages can show the message next to a field.
import type { ApiError } from "@/lib/types";

/** The API's origin: NEXT_PUBLIC_API_BASE_URL when set, otherwise the local development server. */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

/** An error answer from the API: HTTP status, stable code, message, and the field it concerns. */
export class GuardianLensApiError extends Error {
  readonly code: string;
  readonly field: string | null;
  readonly status: number;

  constructor(status: number, payload: ApiError) {
    super(payload.error.message);
    this.name = "GuardianLensApiError";
    this.status = status;
    this.code = payload.error.code;
    this.field = payload.error.field;
  }
}

/**
 * Calls one API endpoint with the session cookie attached.
 * @param path The endpoint path, for example "/api/v1/session/history".
 * @param options Standard fetch options; a FormData body keeps its own multipart content type.
 * @returns The parsed JSON body, or undefined for a 204 answer.
 * @throws GuardianLensApiError for any non-success status.
 */
export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const payload = (await response.json()) as ApiError;
    throw new GuardianLensApiError(response.status, payload);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
