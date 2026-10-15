import { connection, type NextRequest } from "next/server";
import { similarTo } from "@/lib/recommendations/recommendationEngine";
import { sanitizePreferences, sanitizeSession } from "@/lib/discovery/sanitize";
import { CACHE_HEADERS, errorResponse, handleRouteError } from "@/lib/api/responses";
import { memo } from "@/lib/api/http";

// Open Library round trips plus ranking can take ~10 s on a cold instance; stay within every Vercel plan.
export const maxDuration = 60;

const ID = /^(OL\d+W|gb-[\w-]{4,40})$/;

/** "If you liked X" with nothing else known about the reader. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/similar/[id]">) {
  await connection();
  const { id } = await ctx.params;
  if (!ID.test(id)) return errorResponse("bad_request", "That doesn't look like a book id.", 400);
  try {
    const result = await memo(`similar:${id}`, 6 * 3600_000, () => similarTo(id));
    return Response.json(
      { recommendations: [...result.recommendations, ...result.reserve].slice(0, 6), confidence: result.confidence, engineVersion: result.engineVersion },
      { headers: CACHE_HEADERS.long },
    );
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * "Find another like this" for a reader who already answered the questions:
 * 60% similarity to the chosen book, 40% their original profile, so the engine never forgets what they wanted.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/similar/[id]">) {
  const { id } = await ctx.params;
  if (!ID.test(id)) return errorResponse("bad_request", "That doesn't look like a book id.", 400);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("bad_request", "Expected a JSON body.", 400);
  }
  const b = (body ?? {}) as { preferences?: unknown; session?: unknown };
  const prefs = sanitizePreferences(b.preferences);
  const session = sanitizeSession(b.session);
  try {
    const ttl = process.env.NODE_ENV === "development" ? 1 : 30 * 60_000;
    const result = await memo(`similar:${id}:${JSON.stringify(prefs)}:${JSON.stringify(session)}`, ttl, () => similarTo(id, prefs, { session }));
    return Response.json(
      { recommendations: [...result.recommendations, ...result.reserve].slice(0, 6), confidence: result.confidence, engineVersion: result.engineVersion, profileSummary: result.profileSummary },
      { headers: CACHE_HEADERS.none },
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
