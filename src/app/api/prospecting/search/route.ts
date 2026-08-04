import { NextResponse } from "next/server";
import { parseSearchRequest } from "@/lib/prospectingApi";
import { loadSuppressionList } from "@/lib/prospectingRepository";
import { searchInstagramProspects } from "@/lib/prospectingSearchServer";

export async function POST(request: Request) {
  try {
    const input = parseSearchRequest(await request.json());
    const result = await searchInstagramProspects(input, loadSuppressionList());
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Falha na busca de leads." },
      { status: 400 },
    );
  }
}
