import { NextResponse } from "next/server";
import { computeNorthStar, loadGoals } from "@/lib/metrics";

// Agregacao server-side da meta (North Star). Reusada por Lab (calculadora) e Comando (dia 20).
// Dados reais do Supabase via service-role; nada exposto ao cliente alem do resultado agregado.

export const runtime = "nodejs";

export async function GET() {
  try {
    const northStar = await computeNorthStar();
    const goals = loadGoals();
    return NextResponse.json({ ok: true, northStar, goals });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro na agregacao North Star" },
      { status: 500 },
    );
  }
}
