import "server-only";
import { LibraryUnavailableError } from "./bookSearch";
import { UpstreamError } from "./http";

export type ApiErrorCode = "unavailable" | "not_found" | "bad_request" | "internal";

export interface ApiError {
  error: { code: ApiErrorCode; message: string };
}

export function errorResponse(code: ApiErrorCode, message: string, status: number): Response {
  return Response.json({ error: { code, message } } satisfies ApiError, { status });
}

/** Map thrown errors to the small set of error codes the UI knows how to present. */
export function handleRouteError(err: unknown): Response {
  if (err instanceof LibraryUnavailableError || err instanceof UpstreamError) {
    return errorResponse("unavailable", "The library is being a little quiet right now.", 503);
  }
  console.error("[libria] unexpected error", err);
  return errorResponse("internal", "Something went wrong on our side.", 500);
}

export const CACHE_HEADERS = {
  short: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" },
  long: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  none: { "Cache-Control": "no-store" },
} as const;
