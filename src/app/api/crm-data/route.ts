import { NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { mapContactFromRow, mapDealFromRow } from "@/lib/crmRecords";

export const runtime = "nodejs";

const stages = [
  { id: "prospect", label: "Prospect" },
  { id: "abordado", label: "Abordado" },
  { id: "followup", label: "Follow-up" },
  { id: "qualified", label: "Qualified" },
  { id: "proposal", label: "Proposal" },
  { id: "negotiation", label: "Negotiation" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];

// O PostgREST devolve no maximo 1000 linhas por resposta, e o supabase-js nao avisa: o
// select volta "ok" com 1000 e o resto some em silencio. Com 1365 deals na base, 365
// ficavam invisiveis no pipeline e na busca -- a Enjatec (#242) sumiu assim, e como a
// ordem e created_at desc, quem sumia era sempre o lead MAIS ANTIGO, justamente o que
// esta em follow-up ha mais tempo. Mesma armadilha ja documentada em
// scripts/lib/leadIngest.js (buscarTudo). Aqui pagina de verdade.
const PASSO = 1000;

async function buscarTudo<T>(
  consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const todos: T[] = [];
  for (let de = 0; ; de += PASSO) {
    const { data, error } = await consulta(de, de + PASSO - 1);
    if (error) throw error;
    const lote = data ?? [];
    todos.push(...lote);
    if (lote.length < PASSO) break;
  }
  return todos;
}

export async function GET() {
  try {
    const supabase = getCrmSupabaseAdmin();
    const [deals, contacts] = await Promise.all([
      buscarTudo((de, ate) =>
        supabase.from("deals").select("*").order("created_at", { ascending: false }).range(de, ate),
      ),
      buscarTudo((de, ate) =>
        supabase.from("contacts").select("*").order("name", { ascending: true }).range(de, ate),
      ),
    ]);

    return NextResponse.json({
      ok: true,
      deals: deals.map(mapDealFromRow),
      contacts: contacts.map(mapContactFromRow),
      stages,
      ownerMeta: {},
      source: "supabase",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Falha ao carregar dados do Supabase",
      },
      { status: 500 },
    );
  }
}
