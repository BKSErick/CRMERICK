import { NextRequest, NextResponse } from "next/server";
import { listCommercialAutomationRules } from "@/lib/commercialAutomationService.mjs";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { DEAL_HEALTH_RISK_MAX_SCORE } from "@/lib/dealHealth.mjs";
import { calculateForecastFromSupabase } from "@/lib/dealForecastService.mjs";
import { QUALIFICATION_REVIEW_STAGES, summarizeDealQualification } from "@/lib/dealQualification.mjs";
import { computeNorthStar, loadGoals } from "@/lib/metrics";
import { diagnoseLead } from "@/lib/leadScoring";
import {
  avaliarElegibilidadeProspeccao,
  compararPrioridadeProspeccao,
} from "@/lib/prospectingEligibility.mjs";
import {
  FUNDO_STAGES,
  TIER_INFO,
  classifyInboundResponse,
  followupMessage,
  fundoDeFunilReview,
  fundoOrdem,
  mensagemDecisorIndicado,
  tierForDays,
  type FundoMotivo,
} from "@/lib/followup";
import { getCompanySignals, signalAliases, signalWeight, type CompanySignal } from "@/lib/sinais";
import { loadDailyPriorityEvidence, loadLatestInboundReadings } from "@/lib/aiRetrievalBroker";
import { SALES_PLAYBOOK, renderEntryOfferMessage } from "@/lib/salesPlaybook.mjs";

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

const FUNDO_LABEL: Record<FundoMotivo, string> = {
  inbound_sem_resposta: "Respondeu e esta esperando",
  parado: "Fundo parado",
  sem_contato: "Fundo sem contato",
};

// A description da activity guarda o texto com o prefixo do sincronismo da Uazapi
// ("[UAZAPI-HISTORY <id>] WhatsApp recebido: ..."). Sem tirar isso, o texto na tela fica
// ilegivel e o classificador de bot le o prefixo junto.
function cleanInbound(value?: string | null): string {
  return String(value ?? "")
    .replace(/^\[UAZAPI-HISTORY[^\]]*\]\s*/, "")
    .replace(/^WhatsApp recebido:\s*/i, "")
    .trim();
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getCrmSupabaseAdmin();
    if (request.nextUrl.searchParams.get("view") === "automation_rules") {
      // A contagem de falhas veio junto quando o feed "Automacoes recentes" saiu da Sala
      // de Comando (27/08/2026): sem ela, uma automacao quebrada nao apareceria em lugar
      // nenhum do app. Aqui fica ao lado das regras, que e onde se age sobre isso.
      // Janela de 7 dias: falha de duas semanas atras nao e mais acionavel.
      const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count: automationFailures } = await supabase
        .from("activities")
        .select("id", { count: "exact", head: true })
        .eq("type", "automation_event_failed")
        .gte("created_at", seteDiasAtras);
      return NextResponse.json({
        ok: true,
        rules: await listCommercialAutomationRules(supabase),
        failures: { count: automationFailures ?? 0, windowDays: 7 },
      });
    }
    const goals = loadGoals();
    const now = new Date();
    const todayStart = startOfToday(now);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Disparos manuais e sincronizados: hoje, ultimos 7 dias e ultimo contato por deal
    // (o ultimo contato alimenta a fila de follow-up).
    // whatsapp_received entra junto desde 18/08/2026 para montar a fila "Bola com voce".
    // A verdade da conversa e derivada daqui, NAO de deals.last_inbound_at/last_outbound_at:
    // essas colunas so sao escritas pelo webhook da Uazapi, e o disparo automatico grava
    // activity direto no banco sem passar por la. Resultado medido em 18/08: 134 deals com
    // last_outbound_at para 351 abordados, ou seja o campo mente para 2 de cada 3.
    const { data: waRows, error: waErr } = await supabase
      .from("activities")
      .select("deal_id, created_at, type, description")
      .in("type", ["whatsapp_sent", "whatsapp_sent_sync", "whatsapp_received"]);
    if (waErr) throw waErr;

    let disparosToday = 0;
    let disparos7d = 0;
    // Saidas do NUMERO hoje: disparo + conversa do aparelho. E o numero que o WhatsApp
    // enxerga, e o que restringiu a conta por 24h em 18/08/2026 (52 saidas em 6h30
    // enquanto o placar de prospeccao marcava 35). Fica ao lado do placar de proposito:
    // o teto de prospeccao sozinho escondeu o risco ate a instancia cair.
    let saidasNumeroToday = 0;
    const waByDeal = new Map<number, { last: number; count: number }>();
    // Deals com pelo menos UMA resposta humana em qualquer momento. Nao basta olhar a
    // ULTIMA recebida: o autoresponder costuma fechar a conversa depois da pessoa falar
    // ("A Blukit agradece o seu contato, ate breve!!"), e nesse caso o lead respondeu de
    // verdade mesmo que a ultima linha seja bot.
    const respondeuHumano = new Set<number>();
    for (const r of waRows ?? []) {
      const ts = r.created_at ? new Date(r.created_at as string).getTime() : 0;
      const dealId = Number(r.deal_id);
      if (r.type === "whatsapp_received") {
        if (dealId > 0 && ts > 0) {
          const texto = cleanInbound(r.description as string);
          if (texto && classifyInboundResponse(texto) !== "bot") {
            respondeuHumano.add(dealId);
          }
        }
        continue;
      }
      // O placar conta so whatsapp_sent, mesmo criterio do teto em uazapi-send-batch.mjs:
      // whatsapp_sent_sync e conversa sincronizada do aparelho, nao disparo. O waByDeal
      // abaixo continua com os dois, porque resposta na mao TAMBEM e ultimo contato e
      // precisa segurar o follow-up automatico. Recebida NAO entra em nenhum dos dois:
      // no saidasNumero ela nao e saida, e no waByDeal ela adiaria o follow-up.
      const ehDisparo = r.type === "whatsapp_sent";
      if (ts >= todayStart.getTime()) saidasNumeroToday++;
      if (ehDisparo && ts >= todayStart.getTime()) disparosToday++;
      if (ehDisparo && ts >= sevenDaysAgo.getTime()) disparos7d++;
      if (dealId > 0 && ts > 0) {
        const entry = waByDeal.get(dealId) ?? { last: 0, count: 0 };
        entry.last = Math.max(entry.last, ts);
        entry.count++;
        waByDeal.set(dealId, entry);
      }
    }

    // CORRIGIDO em 18/08/2026. Antes: `respostas` contava deals em qualified+ e
    // `aguardando` contava abordado+followup. Isso media ESTAGIO, nao resposta, e nada
    // no CRM move o estagio quando o LEAD responde (o auto-move so reage a envio). Ou
    // seja: o lead respondia, continuava em `abordado`, e o placar mostrava ele como
    // "aguardando resposta dele" -- o contrario da verdade. Foi assim que 38 conversas
    // vivas ficaram invisiveis.
    //
    // Agora: Respostas = quem de fato respondeu como gente; No ar = quem foi abordado e
    // ainda nao respondeu. O numero de respostas SOBE (de 11 para ~68) porque passou a
    // medir a coisa certa; nao e bug.
    const respostas = respondeuHumano.size;
    const { count: abordadosCount } = await supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .in("stage", ["abordado", "followup"]);
    const aguardando = Math.max(0, (abordadosCount ?? 0) - respostas);

    // Fila do dia: deals ativos com telefone, priorizados pelo score (points) ja persistido.
    const { data: dealRows, error: dealErr } = await supabase
      .from("deals")
      .select("id, company, phone, whatsapp, points, stage, copy_text, name, site_url, contact_id, segment, segment_norm, is_icp, porte, capital_social, cnae_descricao, decisor_nome, decision_access")
      .in("stage", ["prospect", "qualified"])
      // Filtra no banco antes do limit; a avaliacao abaixo confirma novamente para
      // nenhum registro materializado antigo furar a regua por dado desatualizado.
      .eq("offer_track", "projeto")
      .order("points", { ascending: false })
      .limit(1000);
    if (dealErr) throw dealErr;

    // Piloto separado da fila principal. Esta consulta nunca alimenta os scripts de
    // disparo: apenas expoe ate 20 micros confirmados para abertura manual no cockpit.
    const { data: entryDealRows, error: entryDealErr } = await supabase
      .from("deals")
      .select("id, company, phone, whatsapp, points, stage, name, site_url, contact_id, segment, segment_norm, is_icp, porte, capital_social, cnae_descricao, decisor_nome, decision_access")
      .in("stage", ["prospect", "qualified"])
      .eq("offer_track", "entrada")
      .order("points", { ascending: false })
      .limit(100);
    if (entryDealErr) throw entryDealErr;

    // Telefones vivem em contacts (import Garimpo, story-007); deals nao tem telefone proprio.
    // Join por company/name (mesmo import, 1:1). O campo whatsapp do contact e um link wa.me completo.
    const { data: contactRows, error: contactErr } = await supabase
      .from("contacts")
      .select("id, name, company, phone, whatsapp");
    if (contactErr) throw contactErr;

    // Sinal de interesse das paginas (aba Sinais): quem abriu a auditoria hoje e o
    // lead mais quente que existe. Sem isso a fila prioriza so pelo points estatico do
    // Garimpo e trata quem abriu 4x igual a quem nunca abriu.
    const signalIndex = await getCompanySignals(supabase, now).catch(() => new Map<string, CompanySignal>());
    const signalFor = (...names: Array<string | null | undefined>): CompanySignal | null => {
      for (const n of names) {
        for (const alias of signalAliases(String(n ?? ""))) {
          const hit = signalIndex.get(alias);
          if (hit) return hit;
        }
      }
      return null;
    };

    const keyOf = (v?: string | null) => (v ?? "").trim().toLowerCase();
    const phoneByKey = new Map<string, string>();
    // Fio 3: resolve telefone por contact_id (FK real) primeiro; o mapa por nome
    // vira fallback para o punhado de deals sem contato casado.
    const phoneById = new Map<number, string>();
    for (const c of contactRows ?? []) {
      const fromWa =
        typeof c.whatsapp === "string" ? (c.whatsapp.match(/wa\.me\/(\d+)/) || [])[1] : undefined;
      let digits = fromWa || cleanPhone(c.phone as string);
      if (!digits) continue;
      if (!fromWa && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`;
      if (c.id != null) phoneById.set(Number(c.id), digits);
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
      .map((d) => ({ ...d, prospectingEligibility: avaliarElegibilidadeProspeccao(d) }))
      .filter((d) => d.prospectingEligibility.eligible)
      .map((d) => {
        const own = cleanPhone((d.phone as string) || (d.whatsapp as string));
        const phone =
          own ||
          (d.contact_id != null ? phoneById.get(Number(d.contact_id)) : undefined) ||
          phoneByKey.get(keyOf(d.company as string)) ||
          phoneByKey.get(keyOf(d.name as string)) ||
          "";
        // Story 017: mesma logica de scoring v2 do CLI - define abordagem/canal por lead.
        const diag = diagnoseLead({
          name: String(d.company ?? ""),
          website: (d.site_url as string) || "",
          phone,
        });
        const signal = signalFor(d.company as string, d.name as string);
        return {
          id: Number(d.id),
          company: String(d.company ?? "Sem empresa"),
          phone,
          points: Number(d.points ?? 0),
          stage: String(d.stage ?? "prospect"),
          recommended_approach: diag.recommended_approach,
          channel: diag.channel,
          opportunity: diag.opportunity,
          // Sinal viaja junto com o lead: a UI mostra o porque de ele estar no topo.
          signal: signal
            ? { views: signal.views, waClicks: signal.waClicks, linkClicks: signal.linkClicks, lastEvent: signal.lastEvent, hot: signal.hot, pageUrl: signal.pageUrl }
            : null,
          signalWeight: signalWeight(signal),
          capacity_tier: d.prospectingEligibility.capacity_tier,
          capacity_evidence: d.prospectingEligibility.capacity_evidence,
          decision_access: d.prospectingEligibility.decision_access,
          offer_track: d.prospectingEligibility.offer_track,
          eligibility_reason: d.prospectingEligibility.eligibility_reason,
          message:
            (d.copy_text as string) ||
            `Oi! Erick aqui. Em ${(d.name as string) || d.company}, o pedido de orçamento já chega com serviço, medida e prazo definidos ou ainda volta para buscar essas informações?`,
        };
      })
      .filter((d) => d.phone && isWhatsappMobile(d.phone))
      // Gate primeiro. Dentro dos elegiveis: sinal, capacidade e score.
      .sort(compararPrioridadeProspeccao)
      .slice(0, goals.dailyInputs.disparos);

    const entryQueue = (entryDealRows ?? [])
      .map((d) => ({ ...d, prospectingEligibility: avaliarElegibilidadeProspeccao(d) }))
      .filter((d) =>
        d.is_icp === true &&
        d.prospectingEligibility.capacity_tier === "micro" &&
        d.prospectingEligibility.offer_track === "entrada"
      )
      .map((d) => {
        const own = cleanPhone((d.phone as string) || (d.whatsapp as string));
        const phone =
          own ||
          (d.contact_id != null ? phoneById.get(Number(d.contact_id)) : undefined) ||
          phoneByKey.get(keyOf(d.company as string)) ||
          phoneByKey.get(keyOf(d.name as string)) ||
          "";
        const signal = signalFor(d.company as string, d.name as string);
        return {
          id: Number(d.id),
          company: String(d.company ?? d.name ?? "Sem empresa"),
          phone,
          points: Number(d.points ?? 0),
          stage: String(d.stage ?? "prospect"),
          signal: signal
            ? { views: signal.views, waClicks: signal.waClicks, linkClicks: signal.linkClicks, lastEvent: signal.lastEvent, hot: signal.hot, pageUrl: signal.pageUrl }
            : null,
          signalWeight: signalWeight(signal),
          capacity_evidence: d.prospectingEligibility.capacity_evidence,
          eligibility_reason: d.prospectingEligibility.eligibility_reason,
          message: renderEntryOfferMessage({ company: String(d.company ?? d.name ?? "empresa") }),
        };
      })
      .filter((d) => d.phone && isWhatsappMobile(d.phone))
      .sort((a, b) => b.signalWeight - a.signalWeight || b.points - a.points || a.id - b.id)
      .slice(0, SALES_PLAYBOOK.entryOffer.pilot.maxLeads);

    // Fila de follow-up: quem ja foi contatado (abordado/followup) e esta na janela
    // (M1 D+2, M2 D+5 com prova, M3 D+10 breakup). Mais atrasado primeiro.
    const followupSelect = "id, company, phone, whatsapp, name, stage, value, contact_id, last_inbound_at, last_outbound_at, deal_health_score, deal_health_classification, deal_health_confidence, deal_health_recommended_action, qualification";
    const [cadenceRows, healthRiskRows, qualificationRows, fundoRows] = await Promise.all([
      supabase
        .from("deals")
        .select(followupSelect)
        .in("stage", ["abordado", "followup"])
        .limit(1000),
      supabase
        .from("deals")
        .select(followupSelect)
        .in("stage", ["abordado", "followup", "qualified", "proposal", "negotiation"])
        .lte("deal_health_score", DEAL_HEALTH_RISK_MAX_SCORE)
        .order("deal_health_score", { ascending: true })
        .limit(1000),
      supabase
        .from("deals")
        .select(followupSelect)
        .in("stage", [...QUALIFICATION_REVIEW_STAGES])
        .limit(1000),
      // Fundo de funil inteiro, sem pre-filtro: quem decide se entra na fila e a regra
      // fundoDeFunilReview, nao a query. Antes desta linha o fundo simplesmente nao era
      // consultado e os deals apodreciam em silencio.
      supabase
        .from("deals")
        .select(followupSelect)
        .in("stage", [...FUNDO_STAGES])
        .limit(1000),
    ]);
    if (cadenceRows.error) throw cadenceRows.error;
    if (healthRiskRows.error) throw healthRiskRows.error;
    if (qualificationRows.error) throw qualificationRows.error;
    if (fundoRows.error) throw fundoRows.error;
    const fuRows = [
      ...(cadenceRows.data ?? []),
      ...(healthRiskRows.data ?? []),
      ...(qualificationRows.data ?? []),
      ...(fundoRows.data ?? []),
    ].filter((row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index);

    const followupQueue = (fuRows ?? [])
      .map((d) => {
        const own = cleanPhone((d.phone as string) || (d.whatsapp as string));
        const phone =
          own ||
          (d.contact_id != null ? phoneById.get(Number(d.contact_id)) : undefined) ||
          phoneByKey.get(keyOf(d.company as string)) ||
          phoneByKey.get(keyOf(d.name as string)) ||
          "";
        const wa = waByDeal.get(Number(d.id));
        const days = wa ? Math.floor((now.getTime() - wa.last) / 86400000) : null;
        const cadenceTier = tierForDays(days);
        const company = String(d.company ?? "Sem empresa");
        const signal = signalFor(company, d.name as string);
        const healthScore = d.deal_health_score == null ? null : Number(d.deal_health_score);
        const healthRisk = healthScore != null && healthScore <= DEAL_HEALTH_RISK_MAX_SCORE;
        const healthReview = healthRisk && cadenceTier === "aguardar";
        const qualificationSummary = summarizeDealQualification(d.qualification);
        const hasQualificationGaps = QUALIFICATION_REVIEW_STAGES.includes(String(d.stage)) && qualificationSummary.pendingFields.length > 0;
        const qualificationReview = hasQualificationGaps && cadenceTier === "aguardar" && !healthReview;
        // O fundo tem precedencia sobre saude e qualificacao: nao adianta apontar lacuna
        // de cadastro num deal cujo dono esta esperando resposta ha duas semanas.
        const fundo = fundoDeFunilReview(
          {
            stage: d.stage as string,
            lastInboundAt: d.last_inbound_at as string | null,
            lastOutboundAt: d.last_outbound_at as string | null,
          },
          now.toISOString(),
        );
        const tier = fundo ? "fundo" : healthReview ? "saude" : qualificationReview ? "qualificacao" : cadenceTier;
        return {
          id: Number(d.id),
          company,
          phone,
          stage: String(d.stage ?? "abordado"),
          value: Number(d.value ?? 0),
          fundo,
          days,
          msgCount: wa?.count ?? 0,
          // Abriu a pagina depois de ser abordado: e o follow-up mais quente da lista.
          signal: signal
            ? { views: signal.views, waClicks: signal.waClicks, lastEvent: signal.lastEvent, hot: signal.hot }
            : null,
          signalWeight: signalWeight(signal),
          tier,
          tierLabel: fundo
            ? FUNDO_LABEL[fundo.motivo]
            : healthReview ? "Revisar saude" : qualificationReview ? "Lacunas de qualificacao" : cadenceTier === "aguardar" ? "Aguardar D+2" : TIER_INFO[cadenceTier].label,
          window: fundo || healthReview || qualificationReview ? "Sem envio automatico" : cadenceTier === "aguardar" ? "" : TIER_INFO[cadenceTier].window,
          // Fundo nao recebe mensagem de template. Lead que ja disse "me interessa" e que
          // ja viu o case merece resposta escrita na mao, e M1/M2/M3 sao copy de lead frio.
          message: fundo || healthReview || qualificationReview ? "" : cadenceTier === "aguardar" ? "" : followupMessage(cadenceTier, company),
          fundoReview: Boolean(fundo),
          healthReview,
          qualificationReview,
          health: healthScore == null ? null : {
            score: healthScore,
            classification: String(d.deal_health_classification ?? "sem_calculo"),
            confidence: Number(d.deal_health_confidence ?? 0),
            recommendation: String(d.deal_health_recommended_action ?? "Revisar o negocio no Pipeline."),
          },
          qualification: hasQualificationGaps ? {
            completeness: qualificationSummary.completeness,
            confirmedCount: qualificationSummary.confirmedCount,
            totalFields: qualificationSummary.totalFields,
            pendingLabels: qualificationSummary.pendingFields.map((field) => field.label),
          } : null,
        };
      })
      // O fundo entra mesmo com telefone fixo: metade da industria pequena atende no fixo, e
      // aqui o proximo passo e humano (responder, ligar, mandar proposta), nao disparo em lote.
      .filter((d) => d.tier !== "aguardar" && (d.fundoReview || d.healthReview || d.qualificationReview || (d.phone && isWhatsappMobile(d.phone))))
      // Sinal primeiro, atraso depois: quem reabriu a pagina vale mais que quem so envelheceu.
      .sort((a, b) => {
        if (a.fundoReview !== b.fundoReview) return Number(b.fundoReview) - Number(a.fundoReview);
        if (a.fundo && b.fundo) {
          const ordem = fundoOrdem(a.fundo.motivo) - fundoOrdem(b.fundo.motivo);
          if (ordem !== 0) return ordem;
          // Dentro do mesmo motivo, valor maior primeiro; empate desempata pelo mais parado.
          return (b.value || 0) - (a.value || 0) || (b.fundo.dias ?? 0) - (a.fundo.dias ?? 0);
        }
        if (a.healthReview !== b.healthReview) return Number(b.healthReview) - Number(a.healthReview);
        if (a.healthReview && b.healthReview) return (a.health?.score ?? 101) - (b.health?.score ?? 101);
        if (a.qualificationReview !== b.qualificationReview) return Number(b.qualificationReview) - Number(a.qualificationReview);
        if (a.qualificationReview && b.qualificationReview) return (a.qualification?.completeness ?? 100) - (b.qualification?.completeness ?? 100);
        return b.signalWeight - a.signalWeight || (b.days ?? 0) - (a.days ?? 0);
      })
      .slice(0, 50);

    // Story 057: leitura tipada da ultima mensagem do lead (intencao + carta do playbook).
    // So aponta a carta; quem decide e envia e o Erick.
    const readings = await loadLatestInboundReadings(supabase, followupQueue.map((item) => item.id));
    const followupQueueWithReading = followupQueue.map((item) => ({ ...item, leitura: readings.get(item.id) ?? null }));

    // FILA DE ENCAMINHAMENTOS (10/08/2026). Encaminhamento e o melhor lead do
    // funil: o gatekeeper ja deu a permissao e o decisor chega com nome de quem
    // indicou. Ate aqui extract-referrals.mjs gravava deals.referred_* e NINGUEM
    // lia -- nenhuma fila, nenhum card, nenhum lembrete. Resultado medido em
    // 10/08: dos 4 encaminhamentos capturados, 2 nunca receberam contato, e um
    // deles (Vematech -> Tiele) foi pra "lost" sem ninguem falar com o decisor.
    // Aqui eles viram fila de trabalho com a mensagem pronta.
    const { data: referralRows } = await supabase
      .from("deals")
      .select("id, company, stage, referred_name, referred_phone, referred_by, referred_at")
      .not("referred_phone", "is", null);

    const referralIds = (referralRows ?? []).map((r) => Number(r.id));
    const { data: referralActs } = referralIds.length
      ? await supabase
          .from("activities")
          .select("deal_id, created_at")
          .in("deal_id", referralIds)
          .in("type", ["whatsapp_sent", "whatsapp_sent_sync"])
      : { data: [] as { deal_id: number; created_at: string }[] };

    // "Acionado" = houve disparo DEPOIS da indicacao chegar. Disparo anterior era
    // para o gatekeeper, nao para o decisor indicado.
    const enviosApos = new Map<number, number>();
    for (const a of referralActs ?? []) {
      const id = Number(a.deal_id);
      const linha = (referralRows ?? []).find((r) => Number(r.id) === id);
      if (!linha?.referred_at) continue;
      if (String(a.created_at) > String(linha.referred_at)) {
        enviosApos.set(id, (enviosApos.get(id) ?? 0) + 1);
      }
    }

    const referralQueue = (referralRows ?? [])
      .map((r) => {
        const id = Number(r.id);
        const phone = cleanPhone(String(r.referred_phone ?? ""));
        const dias = r.referred_at
          ? Math.floor((now.getTime() - new Date(String(r.referred_at)).getTime()) / 86400000)
          : null;
        return {
          dealId: id,
          company: String(r.company ?? ""),
          stage: String(r.stage ?? ""),
          decisor: String(r.referred_name ?? ""),
          phone,
          indicadoPor: r.referred_by ? String(r.referred_by) : null,
          dias,
          acionado: (enviosApos.get(id) ?? 0) > 0,
          message: mensagemDecisorIndicado({
            nomeDecisor: String(r.referred_name ?? ""),
            empresa: String(r.company ?? ""),
            quemIndicou: r.referred_by ? String(r.referred_by) : null,
          }),
        };
      })
      .filter((r) => r.phone)
      // Nao acionado primeiro, e dentro disso o mais antigo, que e o que mais esfria.
      .sort((a, b) => Number(a.acionado) - Number(b.acionado) || (b.dias ?? 0) - (a.dias ?? 0));

    // Alerta dia 20: usa a agregacao da meta (mesma da North Star).
    const northStar = await computeNorthStar(now);
    const forecastResult = await calculateForecastFromSupabase(supabase, { now: now.toISOString() });
    // A mesma fonte deterministica alimenta o chat e a Sala de Comando. O bloco e
    // adicional para manter o contrato historico de queue/followupQueue intacto.
    const smartPriorities = await loadDailyPriorityEvidence(supabase, 30, now)
      .then((result) => ({ items: result.facts, total: result.total, limitation: null }))
      .catch(() => ({ items: [], total: 0, limitation: "Prioridades inteligentes temporariamente indisponiveis." }));

    return NextResponse.json({
      ok: true,
      placar: {
        disparos: { done: disparosToday, target: goals.dailyInputs.disparos, splitLP: goals.dailyInputs.disparosLP, splitDFY: goals.dailyInputs.disparosDFY },
        respostas,
        aguardando,
        // Freio de mao do numero, nao meta: quanto mais perto de 40, maior o risco de
        // restricao. Mesmo teto que os scripts uazapi-*-batch.mjs usam para parar.
        saidasNumero: { done: saidasNumeroToday, limit: 40 },
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
      entryQueue,
      followupQueue: followupQueueWithReading,
      referralQueue,
      smartPriorities,
      forecast: {
        rubricVersion: forecastResult.rubricVersion,
        probabilitySource: forecastResult.probabilitySource,
        period: forecastResult.period,
        pipeline: forecastResult.pipeline,
        predicted: forecastResult.predicted,
        realized: forecastResult.realized,
        attention: forecastResult.attention,
        counts: forecastResult.counts,
        relevantDeals: forecastResult.relevantDeals,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro na agregacao do Comando" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    if (!id || typeof body?.enabled !== "boolean") {
      return NextResponse.json({ ok: false, error: "id e enabled sao obrigatorios." }, { status: 400 });
    }
    const supabase = getCrmSupabaseAdmin();
    const result = await supabase
      .from("commercial_automation_rules")
      .update({ enabled: body.enabled })
      .eq("id", id)
      .select("id, name, description, version, event_type, conditions, action_type, action_payload, enabled")
      .single();
    if (result.error) throw result.error;
    return NextResponse.json({ ok: true, rule: result.data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Falha ao atualizar regra." },
      { status: 500 },
    );
  }
}
