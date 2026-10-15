import { recommend } from "@/lib/recommendations/recommendationEngine";
import { sanitizePreferences, sanitizeSession } from "@/lib/discovery/sanitize";
import { CACHE_HEADERS, errorResponse, handleRouteError } from "@/lib/api/responses";
import { memo } from "@/lib/api/http";

// Open Library round trips plus ranking can take ~10 s on a cold instance; stay within every Vercel plan.
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("bad_request", "Expected a JSON body.", 400);
  }
  const b = (body ?? {}) as { preferences?: unknown; session?: unknown; debug?: unknown };
  const prefs = sanitizePreferences(b.preferences);
  const session = sanitizeSession(b.session);
  // The technical view is for tuning only: never in production, never without asking.
  const debug = process.env.NODE_ENV === "development" && (b.debug === true || request.headers.get("x-libria-debug") === "1");
  try {
    // Identical preference sets within a short window reuse the same ranking.
    const ttl = process.env.NODE_ENV === "development" ? 1 : 30 * 60_000;
    const key = `rec:${JSON.stringify(prefs)}:${JSON.stringify(session)}:${debug ? "d" : ""}`;
    const result = await memo(key, ttl, () => recommend(prefs, { session, debug }));
    return Response.json(result, { headers: CACHE_HEADERS.none });
  } catch (err) {
    return handleRouteError(err);
  }
}
