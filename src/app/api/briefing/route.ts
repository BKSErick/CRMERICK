import { NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { getCompanySignals, signalAliases, signalWeight, type CompanySignal } from "@/lib/sinais";

export const runtime = "nodejs";

// #1 Briefing do dia: o CRM diz o que fazer HOJE. Funde tres sinais reais —
// quem esquentou (sinal de pagina), quem esfriou (parado no follow-up) e a agenda
// do dia (calendar_events). Deterministico: nao depende de IA para ser confiavel.

type BriefLead = {
  id: number;
  company: string;
  stage: string;
  phone: string;
  views: number;
  waClicks: number;
  linkClicks: number;
  lastEvent: string;
  daysSince?: number;
};

function cleanPhone(v?: string | null) {
  return (v ?? "").replace(/\D/g, "");
}
const isMobile = (p: string) => {
  let d = (p || "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  return d.length === 11 && d[2] === "9";
};

export async function GET() {
  try {
    const supabase = getCrmSupabaseAdmin();
    const now = new Date();

    const [signalIndex, dealsRes, contactsRes, waRes, eventsRes] = await Promise.all([
      getCompanySignals(supabase, now).catch(() => new Map<string, CompanySignal>()),
      supabase.from("deals").select("id, company, name, stage, points, phone, whatsapp, contact_id").in("stage", ["prospect", "abordado", "followup", "qualified"]).limit(2000),
      supabase.from("contacts").select("id, phone, whatsapp"),
      supabase.from("activities").select("deal_id, created_at").eq("type", "whatsapp_sent").order("created_at", { ascending: false }).limit(5000),
      supabase.from("calendar_events").select("id, title, kind, starts_at, location, deal_id, done").gte("starts_at", new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()).lte("starts_at", new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()).order("starts_at", { ascending: true }),
    ]);

    const phoneById = new Map<number, string>();
    for (const c of contactsRes.data ?? []) {
      const fromWa = typeof c.whatsapp === "string" ? (c.whatsapp.match(/wa\.me\/(\d+)/) || [])[1] : undefined;
      let digits = fromWa || cleanPhone(c.phone as string);
      if (!digits) continue;
      if (!fromWa && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`;
      if (c.id != null) phoneById.set(Number(c.id), digits);
    }

    const lastWaByDeal = new Map<number, number>();
    for (const r of waRes.data ?? []) {
      const id = Number(r.deal_id);
      const ts = r.created_at ? new Date(r.created_at as string).getTime() : 0;
      if (id > 0 && ts > 0 && !lastWaByDeal.has(id)) lastWaByDeal.set(id, ts);
    }

    const resolvePhone = (d: { phone?: unknown; whatsapp?: unknown; contact_id?: unknown }) =>
      cleanPhone((d.phone as string) || (d.whatsapp as string)) ||
      (d.contact_id != null ? phoneById.get(Number(d.contact_id)) ?? "" : "") ||
      "";

    const signalFor = (company: string, name?: string): CompanySignal | null => {
      for (const alias of [...signalAliases(company), ...signalAliases(name ?? "")]) {
        const hit = signalIndex.get(alias);
        if (hit) return hit;
      }
      return null;
    };

    const hot: BriefLead[] = [];
    const stale: BriefLead[] = [];

    for (const d of dealsRes.data ?? []) {
      const id = Number(d.id);
      const company = String(d.company ?? "Sem empresa");
      const phone = resolvePhone(d);
      const signal = signalFor(company, d.name as string);

      if (signal && signal.hot) {
        hot.push({ id, company, stage: String(d.stage ?? ""), phone, views: signal.views, waClicks: signal.waClicks, linkClicks: signal.linkClicks, lastEvent: signal.lastEvent });
      }

      if ((d.stage === "abordado" || d.stage === "followup") && phone && isMobile(phone)) {
        const last = lastWaByDeal.get(id);
        const days = last ? Math.floor((now.getTime() - last) / 86400000) : 99;
        if (days >= 3) {
          stale.push({ id, company, stage: String(d.stage ?? ""), phone, views: signal?.views ?? 0, waClicks: signal?.waClicks ?? 0, linkClicks: signal?.linkClicks ?? 0, lastEvent: signal?.lastEvent ?? "", daysSince: days });
        }
      }
    }

    hot.sort((a, b) => signalWeight(signalFor(b.company)) - signalWeight(signalFor(a.company)));
    stale.sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0));

    const today = (eventsRes.data ?? []).filter((e) => !e.done);

    return NextResponse.json({
      ok: true,
      generatedAt: now.toISOString(),
      counts: { hot: hot.length, stale: stale.length, today: today.length },
      hotLeads: hot.slice(0, 6),
      staleLeads: stale.slice(0, 6),
      today,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro ao montar o briefing." },
      { status: 500 },
    );
  }
}
