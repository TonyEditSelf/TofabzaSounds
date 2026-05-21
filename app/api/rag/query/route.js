/**
 * app/api/rag/query/route.js
 *
 * POST /api/rag/query
 *
 * Internal-only route — called by Railway telephony server for voice agents.
 * Validated by x-internal-secret header, NOT requireOperator().
 *
 * Body: { query, owner_id, owner_type }
 * Returns: { context }
 */

import { ragQuery } from "@/lib/rag/query";

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

export async function POST(req) {
  // Validate internal secret
  const secret = req.headers.get("x-internal-secret");
  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    return Response.json(
      { error: { code: "UNAUTHORISED", message: "Invalid internal secret." } },
      { status: 401 },
    );
  }

  const { query, owner_id, owner_type } = await req.json();

  if (!query || !owner_id || !owner_type) {
    return Response.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "query, owner_id, owner_type are required.",
        },
      },
      { status: 400 },
    );
  }

  const context = await ragQuery({ query, owner_id, owner_type });
  return Response.json({ context });
}
