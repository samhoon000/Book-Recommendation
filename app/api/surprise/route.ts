import type { NextRequest } from "next/server";
import { surprise, type SurpriseKind } from "@/lib/recommendations/surprise";
import { CACHE_HEADERS, errorResponse, handleRouteError } from "@/lib/api/responses";

// Open Library round trips plus ranking can take ~10 s on a cold instance; stay within every Vercel plan.
export const maxDuration = 60;

const KINDS: SurpriseKind[] = ["fiction", "nonfiction", "any"];

export async function GET(request: NextRequest) {
  const kindParam = request.nextUrl.searchParams.get("kind") ?? "any";
  const kind = (KINDS as string[]).includes(kindParam) ? (kindParam as SurpriseKind) : "any";
  const seedParam = Number(request.nextUrl.searchParams.get("seed"));
  const seed = Number.isFinite(seedParam) && seedParam > 0 ? Math.floor(seedParam) : Math.floor(Math.random() * 1e6);
  try {
    const result = await surprise(kind, seed);
    if (!result) return errorResponse("not_found", "The shelves came up empty. Try again.", 404);
    return Response.json(result, { headers: CACHE_HEADERS.none });
  } catch (err) {
    return handleRouteError(err);
  }
}
