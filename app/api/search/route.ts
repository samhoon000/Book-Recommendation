import type { NextRequest } from "next/server";
import { searchBooks } from "@/lib/api/bookSearch";
import { CACHE_HEADERS, errorResponse, handleRouteError } from "@/lib/api/responses";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(12, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 8));
  if (q.length < 2) return errorResponse("bad_request", "Type at least two characters.", 400);
  try {
    const results = await searchBooks(q, limit);
    return Response.json({ results }, { headers: CACHE_HEADERS.short });
  } catch (err) {
    return handleRouteError(err);
  }
}
