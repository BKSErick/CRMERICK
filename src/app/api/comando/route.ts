import { NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { computeNorthStar, loadGoals } from "@/lib/metrics";

// Cockpit de cobranca diaria (Comando / Story 016). Agrega, server-side, os inputs do dia
// (disparos/follow-ups/calls/deals movidos), a fila priorizada do dia e os alertas das regras
// (7 dias, dia 20). Dados reais de activities + deals; zero fabricado.

export const runtime = "nodejs";

function startOfToday(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(now: Date): Date {
  const d = new Date(now);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isStageInto(description: string | null, stage: string): boolean {
  if (!description) return false;
  const m = description.match(/Movido para\s+(\w+)/i);
  return m ? m[1].toLowerCase() === stage : false;
}

function cleanPhone(value?: string | null): string {
  return (value ?? "").replace(/\D/g, "");
}

export async function GET() {
  try {
    const supabase = getCrmSupabaseAdmin();
    const goals = loadGoals();
    const now = new Date();
    const todayStart = startOfToday(now);
    const weekStart = startOfWeek(now);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Disparos (whatsapp_sent) - todos, para detectar follow-up (deal ja contatado antes).
    const { data: waRows, error: waErr } = await supabase
      .from("activities")
      .select("deal_id, created_at")
      .eq("type", "whatsapp_sent");
    if (waErr) throw waErr;

    const earliestByDeal = new Map<number, number>();
    for (const r of waRows ?? []) {
      const dealId = Number(r.deal_id);
      const ts = r.created_at ? new Date(r.created_at as string).getTime() : 0;
      if (!earliestByDeal.has(dealId) || ts < (earliestByDeal.get(dealId) as number)) {
        earliestByDeal.set(dealId, ts);
      }
    }

    let disparosToday = 0;
    let followUpsToday = 0;
    let disparos7d = 0;
    for (const r of waRows ?? []) {
      const ts = r.created_at ? new Date(r.created_at as string).getTime() : 0;
      if (ts >= todayStart.getTime()) {
        disparosToday++;
        const dealId = Number(r.deal_id);
        const earliest = earliestByDeal.get(dealId) ?? ts;
        if (earliest < todayStart.getTime()) followUpsToday++;
      }
      if (ts >= sevenDaysAgo.getTime()) disparos7d++;
    }

    // Stage changes: deals movidos hoje, calls da semana (proxy = entrada em "qualified").
    const { data: scRows, error: scErr } = await supabase
      .from("activities")
      .select("description, created_at")
      .eq("type", "stage_change")
      .gte("created_at", sevenDaysAgo.toISOString());
    if (scErr) throw scErr;

    let dealsMovedToday = 0;
    let callsThisWeek = 0;
    let calls7d = 0;
    for (const r of scRows ?? []) {
      const ts = r.created_at ? new Date(r.created_at as string).getTime() : 0;
      const intoQualified = isStageInto(r.description as string | null, "qualified");
      if (ts >= todayStart.getTime()) dealsMovedToday++;
      if (intoQualified && ts >= weekStart.getTime()) callsThisWeek++;
      if (intoQualified && ts >= sevenDaysAgo.getTime()) calls7d++;
    }

    // Fila do dia: deals ativos com telefone, priorizados pelo score (points) ja persistido.
    const { data: dealRows, error: dealErr } = await supabase
      .from("deals")
      .select("id, company, phone, whatsapp, points, stage, copy_text, title")
      .in("stage", ["prospect", "qualified"])
      .order("points", { ascending: false })
      .limit(goals.dailyInputs.disparos * 3);
    if (dealErr) throw dealErr;

    const queue = (dealRows ?? [])
      .map((d) => {
        const phone = cleanPhone((d.phone as string) || (d.whatsapp as string));
        return {
          id: Number(d.id),
          company: String(d.company ?? "Sem empresa"),
          phone,
          points: Number(d.points ?? 0),
          stage: String(d.stage ?? "prospect"),
          message:
            (d.copy_text as string) ||
            `Oi! Falo sobre ${(d.title as string) || "a oportunidade"} da ${d.company}. Posso te mandar uma analise rapida?`,
        };
      })
      .filter((d) => d.phone)
      .slice(0, goals.dailyInputs.disparos);

    // Alerta dia 20: usa a agregacao da meta (mesma da North Star).
    const northStar = await computeNorthStar(now);

    return NextResponse.json({
      ok: true,
      placar: {
        disparos: { done: disparosToday, target: goals.dailyInputs.disparos, splitLP: goals.dailyInputs.disparosLP, splitDFY: goals.dailyInputs.disparosDFY },
        followUps: { done: followUpsToday, target: goals.dailyInputs.followUps },
        calls: { done: callsThisWeek, target: goals.dailyInputs.callsPerWeek },
        dealsMovedToday,
      },
      alerts: {
        sevenDayRule: {
          disparos7d,
          calls7d,
          threshold: goals.rules.sevenDayDisparos,
          triggered: disparos7d >= goals.rules.sevenDayDisparos && calls7d === 0,
        },
        day20Rule: {
          day: now.getDate(),
          pct: northStar.pct,
          threshold: goals.rules.day20Threshold,
          triggered: now.getDate() >= 20 && northStar.pct < goals.rules.day20Threshold,
        },
      },
      queue,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro na agregacao do Comando" },
      { status: 500 },
    );
  }
}
