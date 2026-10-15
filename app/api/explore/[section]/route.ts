import { connection, type NextRequest } from "next/server";
import { getExploreSection, isSectionId } from "@/lib/recommendations/explore";
import { CACHE_HEADERS, errorResponse, handleRouteError } from "@/lib/api/responses";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/explore/[section]">) {
  await connection();
  const { section } = await ctx.params;
  if (!isSectionId(section)) return errorResponse("not_found", "Unknown section.", 404);
  try {
    const result = await getExploreSection(section);
    return Response.json(result, { headers: CACHE_HEADERS.long });
  } catch (err) {
    return handleRouteError(err);
  }
}
