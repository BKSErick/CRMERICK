import fs from "node:fs";
import path from "node:path";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";

// Agregacoes server-only da meta (North Star / Lab / Comando). Le deals + activities reais do
// Supabase via service-role e a curva de metas de content/goals.json. NENHUM numero fabricado:
// mes sem dado retorna zeros reais + listas vazias. Importar SO em rotas server-side.

export type Goals = {
  defaultTarget: number;
  growthAfter: number;
  monthlyTargets: Record<string, number>;
  mrrFloor: { month: string; value: number };
  dailyInputs: {
    disparos: number;
    disparosLP: number;
    disparosDFY: number;
    followUps: number;
    callsPerWeek: number;
    postsPerWeek: number;
  };
  assumptions: {
    responseRate: number;
    callToClose: number;
    ticketLP: number;
    ticketDFY: number;
    retainerMin: number;
    retainerMax: number;
  };
  rules: { sevenDayDisparos: number; day20Threshold: number };
};

const DEFAULT_GOALS: Goals = {
  defaultTarget: 15000,
  growthAfter: 0.1,
  monthlyTargets: {},
  mrrFloor: { month: "", value: 0 },
  dailyInputs: { disparos: 30, disparosLP: 20, disparosDFY: 10, followUps: 10, callsPerWeek: 4, postsPerWeek: 3 },
  assumptions: { responseRate: 0.15, callToClose: 0.2, ticketLP: 3000, ticketDFY: 10000, retainerMin: 500, retainerMax: 800 },
  rules: { sevenDayDisparos: 210, day20Threshold: 0.4 },
};

export function loadGoals(): Goals {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "content", "goals.json"), "utf8");
    return { ...DEFAULT_GOALS, ...(JSON.parse(raw) as Partial<Goals>) };
  } catch {
    return DEFAULT_GOALS;
  }
}

export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function keyToIndex(key: string): number {
  const [y, m] = key.split("-").map(Number);
  return y * 12 + (m - 1);
}

export function targetForMonth(goals: Goals, key: string): number {
  const defined = Object.keys(goals.monthlyTargets).sort();
  if (goals.monthlyTargets[key] !== undefined) return goals.monthlyTargets[key];
  if (defined.length === 0) return goals.defaultTarget;
  const firstKey = defined[0];
  const lastKey = defined[defined.length - 1];
  const idx = keyToIndex(key);
  if (idx < keyToIndex(firstKey)) return goals.defaultTarget;
  const stepsAfter = idx - keyToIndex(lastKey);
  return Math.round(goals.monthlyTargets[lastKey] * Math.pow(1 + goals.growthAfter, stepsAfter));
}

// Dias uteis (seg-sex) do mes: total, decorridos (ate hoje inclusive) e restantes.
export function businessDays(now = new Date()): { total: number; elapsed: number; remaining: number } {
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let total = 0;
  let elapsed = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(year, month, day).getDay();
    if (dow === 0 || dow === 6) continue;
    total++;
    if (day <= now.getDate()) elapsed++;
  }
  return { total, elapsed, remaining: Math.max(0, total - elapsed) };
}

export type WonDeal = { id: number; company: string; value: number; recurring: boolean; closedAt: string | null };

export type NorthStar = {
  month: string;
  target: number;
  weekTarget: number;
  realized: number;
  gap: number;
  pct: number;
  closedCount: number;
  avgTicket: number;
  businessDays: { total: number; elapsed: number; remaining: number };
  dailyPaceNeeded: number;
  projection: number;
  mrrActive: number;
  mrrFloor: { month: string; value: number };
  funnel: Record<string, number>;
  wonDeals: WonDeal[];
  wonNoValueCount: number;
  wonNoDateCount: number;
  yearView: Array<{ month: string; target: number; realized: number }>;
};

export async function computeNorthStar(now = new Date()): Promise<NorthStar> {
  const supabase = getCrmSupabaseAdmin();
  const goals = loadGoals();
  const key = monthKey(now);

  const { data: wonRows, error: wonErr } = await supabase
    .from("deals")
    .select("id, company, value, recurring, closed_at")
    .eq("stage", "won");
  if (wonErr) throw wonErr;

  const won = (wonRows ?? []).map((r) => ({
    id: Number(r.id),
    company: String(r.company ?? "Sem empresa"),
    value: Number(r.value ?? 0),
    recurring: Boolean(r.recurring),
    closedAt: (r.closed_at as string | null) ?? null,
  }));

  const wonThisMonth = won.filter((d) => d.closedAt && monthKey(new Date(d.closedAt)) === key);
  const realized = wonThisMonth.reduce((sum, d) => sum + (d.value > 0 ? d.value : 0), 0);
  const wonNoValueCount = wonThisMonth.filter((d) => !(d.value > 0)).length;
  const wonNoDateCount = won.filter((d) => !d.closedAt).length;
  const closedCount = wonThisMonth.length;
  const avgTicket = closedCount > 0 ? Math.round(realized / Math.max(1, wonThisMonth.filter((d) => d.value > 0).length)) : 0;
  const mrrActive = won.filter((d) => d.recurring).reduce((sum, d) => sum + (d.value > 0 ? d.value : 0), 0);

  const target = targetForMonth(goals, key);
  const gap = Math.max(0, target - realized);
  const pct = target > 0 ? realized / target : 0;
  const bd = businessDays(now);
  const dailyPaceNeeded = bd.remaining > 0 ? Math.round(gap / bd.remaining) : gap;
  const projection = bd.elapsed > 0 ? Math.round((realized / bd.elapsed) * bd.total) : 0;

  // Funil = distribuicao REAL dos deals por etapa (estado atual). Antes lia o log de
  // stage_change, que poluia com arrastes de teste (mostrava 25 qualified / 4 won com
  // 0 e 1 reais). Nao apaga eventos, so para de depender deles.
  const { data: dealStageRows, error: dealStageErr } = await supabase
    .from("deals")
    .select("stage")
    .limit(5000);
  if (dealStageErr) throw dealStageErr;

  const funnel: Record<string, number> = { prospect: 0, abordado: 0, followup: 0, qualified: 0, proposal: 0, negotiation: 0, won: 0, lost: 0 };
  for (const d of dealStageRows ?? []) {
    const s = (d.stage as string) ?? "";
    if (funnel[s] !== undefined) funnel[s]++;
  }

  // Visao do ano: meses definidos + de agosto/26 ate o mes corrente.
  const definedKeys = Object.keys(goals.monthlyTargets);
  const yearKeys = new Set<string>(definedKeys);
  if (definedKeys.length > 0) {
    let idx = keyToIndex(definedKeys.sort()[0]);
    const end = Math.max(keyToIndex(key), keyToIndex(definedKeys[definedKeys.length - 1]));
    while (idx <= end) {
      const y = Math.floor(idx / 12);
      const m = (idx % 12) + 1;
      yearKeys.add(`${y}-${String(m).padStart(2, "0")}`);
      idx++;
    }
  }
  const realizedByMonth = new Map<string, number>();
  for (const d of won) {
    if (!d.closedAt || d.value <= 0) continue;
    const k = monthKey(new Date(d.closedAt));
    realizedByMonth.set(k, (realizedByMonth.get(k) ?? 0) + d.value);
  }
  const yearView = Array.from(yearKeys)
    .sort()
    .map((k) => ({ month: k, target: targetForMonth(goals, k), realized: realizedByMonth.get(k) ?? 0 }));

  return {
    month: key,
    target,
    weekTarget: Math.round(target / 4),
    realized,
    gap,
    pct,
    closedCount,
    avgTicket,
    businessDays: bd,
    dailyPaceNeeded,
    projection,
    mrrActive,
    mrrFloor: goals.mrrFloor,
    funnel,
    wonDeals: wonThisMonth,
    wonNoValueCount,
    wonNoDateCount,
    yearView,
  };
}
