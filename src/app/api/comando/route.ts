import { NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { computeNorthStar, loadGoals } from "@/lib/metrics";
import { diagnoseLead } from "@/lib/leadScoring";

// Cockpit de cobranca diaria (Comando / Story 016). Agrega, server-side, os inputs do dia
// (disparos/follow-ups/calls/deals movidos), a fila priorizada do dia e os alertas das regras
// (7 dias, dia 20). Dados reais de activities + deals; zero fabricado.

export const runtime = "nodejs";

function startOfToday(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
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
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Disparos (whatsapp_sent) reais: hoje e nos ultimos 7 dias.
    const { data: waRows, error: waErr } = await supabase
      .from("activities")
      .select("created_at")
      .eq("type", "whatsapp_sent");
    if (waErr) throw waErr;

    let disparosToday = 0;
    let disparos7d = 0;
    for (const r of waRows ?? []) {
      const ts = r.created_at ? new Date(r.created_at as string).getTime() : 0;
      if (ts >= todayStart.getTime()) disparosToday++;
      if (ts >= sevenDaysAgo.getTime()) disparos7d++;
    }

    // Placar lido do ESTADO REAL dos deals (nao do log de stage_change, que poluia com
    // arrastes de teste): Respostas = avancaram alem de Abordado; No ar = contatados
    // aguardando resposta (stage Abordado).
    const { count: respostasCount } = await supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .in("stage", ["qualified", "proposal", "negotiation", "won"]);
    const { count: aguardandoCount } = await supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("stage", "abordado");
    const respostas = respostasCount ?? 0;
    const aguardando = aguardandoCount ?? 0;

    // Fila do dia: deals ativos com telefone, priorizados pelo score (points) ja persistido.
    const { data: dealRows, error: dealErr } = await supabase
      .from("deals")
      .select("id, company, phone, whatsapp, points, stage, copy_text, name, site_url")
      .in("stage", ["prospect", "qualified"])
      .order("points", { ascending: false })
      .limit(1000);
    if (dealErr) throw dealErr;

    // Telefones vivem em contacts (import Garimpo, story-007); deals nao tem telefone proprio.
    // Join por company/name (mesmo import, 1:1). O campo whatsapp do contact e um link wa.me completo.
    const { data: contactRows, error: contactErr } = await supabase
      .from("contacts")
      .select("name, company, phone, whatsapp");
    if (contactErr) throw contactErr;

    const keyOf = (v?: string | null) => (v ?? "").trim().toLowerCase();
    const phoneByKey = new Map<string, string>();
    for (const c of contactRows ?? []) {
      const fromWa =
        typeof c.whatsapp === "string" ? (c.whatsapp.match(/wa\.me\/(\d+)/) || [])[1] : undefined;
      let digits = fromWa || cleanPhone(c.phone as string);
      if (!digits) continue;
      if (!fromWa && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`;
      for (const k of [keyOf(c.company as string), keyOf(c.name as string)]) {
        if (k && !phoneByKey.has(k)) phoneByKey.set(k, digits);
      }
    }

    // So celular entra na fila do WhatsApp: numero nacional de 11 digitos comecando
    // com 9 (DDD + 9XXXXXXXX). Fixo (539 no banco) nao tem WhatsApp e so queima clique.
    const isWhatsappMobile = (p: string) => {
      let d = (p || "").replace(/\D/g, "");
      if (d.startsWith("55") && d.length > 11) d = d.slice(2);
      return d.length === 11 && d[2] === "9";
    };

    const queue = (dealRows ?? [])
      .map((d) => {
        const own = cleanPhone((d.phone as string) || (d.whatsapp as string));
        const phone =
          own ||
          phoneByKey.get(keyOf(d.company as string)) ||
          phoneByKey.get(keyOf(d.name as string)) ||
          "";
        // Story 017: mesma logica de scoring v2 do CLI - define abordagem/canal por lead.
        const diag = diagnoseLead({
          name: String(d.company ?? ""),
          website: (d.site_url as string) || "",
          phone,
        });
        return {
          id: Number(d.id),
          company: String(d.company ?? "Sem empresa"),
          phone,
          points: Number(d.points ?? 0),
          stage: String(d.stage ?? "prospect"),
          recommended_approach: diag.recommended_approach,
          channel: diag.channel,
          opportunity: diag.opportunity,
          message:
            (d.copy_text as string) ||
            `Oi! Falo sobre ${(d.name as string) || "a oportunidade"} da ${d.company}. Posso te mandar uma analise rapida?`,
        };
      })
      .filter((d) => d.phone && isWhatsappMobile(d.phone))
      .slice(0, goals.dailyInputs.disparos);

    // Alerta dia 20: usa a agregacao da meta (mesma da North Star).
    const northStar = await computeNorthStar(now);

    return NextResponse.json({
      ok: true,
      placar: {
        disparos: { done: disparosToday, target: goals.dailyInputs.disparos, splitLP: goals.dailyInputs.disparosLP, splitDFY: goals.dailyInputs.disparosDFY },
        respostas,
        aguardando,
      },
      alerts: {
        sevenDayRule: {
          disparos7d,
          respostas,
          threshold: goals.rules.sevenDayDisparos,
          triggered: disparos7d >= goals.rules.sevenDayDisparos && respostas === 0,
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
