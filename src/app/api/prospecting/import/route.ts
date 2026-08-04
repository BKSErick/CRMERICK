import { NextResponse } from "next/server";
import { parseImportRequest } from "@/lib/prospectingApi";
import { importInstagramProspect } from "@/lib/prospectingRepository";

export async function POST(request: Request) {
  try {
    const input = parseImportRequest(await request.json());
    const result = await importInstagramProspect(input.candidate, input.vertical);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Falha ao importar o lead." },
      { status: 400 },
    );
  }
}
