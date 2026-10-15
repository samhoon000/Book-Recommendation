import { connection, type NextRequest } from "next/server";
import { getBook } from "@/lib/api/bookSearch";
import { CACHE_HEADERS, errorResponse, handleRouteError } from "@/lib/api/responses";

// Open Library round trips plus ranking can take ~10 s on a cold instance; stay within every Vercel plan.
export const maxDuration = 60;

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/book/[id]">) {
  await connection();
  const { id } = await ctx.params;
  if (!/^(OL\d+W|gb-[\w-]{4,40})$/.test(id)) return errorResponse("bad_request", "That doesn't look like a book id.", 400);
  try {
    const book = await getBook(id);
    if (!book) return errorResponse("not_found", "We couldn't find that book.", 404);
    return Response.json({ book }, { headers: CACHE_HEADERS.long });
  } catch (err) {
    return handleRouteError(err);
  }
}
