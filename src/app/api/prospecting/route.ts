import { NextResponse } from "next/server";
import { getProspectingQueue } from "@/lib/prospectingRepository";

export async function GET() {
  try {
    const items = await getProspectingQueue("instagram");
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Falha ao carregar a fila." },
      { status: 500 },
    );
  }
}
