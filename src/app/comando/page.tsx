"use client";

import { Fragment, useEffect, useState } from "react";
import { CopilotAnswerBody, CopilotPanel, fetchCopilotAnswer, type CopilotAnswer } from "@/components/CopilotPanel";
import { ListaSubnav } from "@/components/ListaSubnav";
import { logWhatsappOpened } from "@/lib/activityClient";
import salesPlaybookModule from "@/lib/salesPlaybook.mjs";

// Sala de Comando = cockpit de cobranca diaria. Placar do dia (disparos/follow-ups/calls/deals
// movidos), fila priorizada e alertas das regras (7 dias, dia 20), tudo da rota server-side
// /api/comando (activities + deals reais). Zero fabricado: contadores em zero real + vazio.

// Sinal das paginas (aba Sinais) viaja junto com o lead: e o porque de ele furar a fila.
type LeadSignal = {
  views: number;
  waClicks: number;
  linkClicks?: number;
  lastEvent: string;
  hot: boolean;
  pageUrl?: string | null;
};

type QueueItem = {
  id: number;
  company: string;
  phone: string;
  points: number;
  stage: string;
  message: string;
  recommended_approach: string;
  channel: string;
  opportunity: string;
  signal: LeadSignal | null;
  capacity_tier: string;
  capacity_evidence: string[];
  decision_access: string;
  offer_track: string;
  eligibility_reason: string;
};

type EntryQueueItem = {
  id: number;
  company: string;
  phone: string;
  points: number;
  stage: string;
  message: string;
  signal: LeadSignal | null;
  capacity_evidence: string[];
  eligibility_reason: string;
};

const APPROACH_LABELS: Record<string, string> = {
  sem_site_ativo: "Sem site (ativo)",
  builder_fraco: "Builder fraco",
  site_concorrente: "Site de concorrente",
  site_auditar: "Auditar site",
  industrial_email: "Industrial (email)",
};
type FollowupItem = {
  id: number;
  company: string;
  phone: string;
  stage: string;
  days: number | null;
  msgCount: number;
  tier: string;
  tierLabel: string;
  window: string;
  message: string;
  signal: LeadSignal | null;
  value: number;
  fundoReview: boolean;
  fundo: { motivo: string; dias: number | null; nota: string } | null;
  healthReview: boolean;
  health: { score: number; classification: string; confidence: number; recommendation: string } | null;
  qualificationReview: boolean;
  qualification: { completeness: number; confirmedCount: number; totalFields: number; pendingLabels: string[] } | null;
  // Story 057: leitura tipada da ultima mensagem do lead. Opcional contra deploy antigo da API.
  leitura?: { intent: string; intentLabel: string; objection: string | null; card: string | null; cardLabel: string } | null;
};

// Selo compacto do sinal: "abriu a pagina 4x, clicou no WhatsApp, ha 2h".
function signalBadge(signal: LeadSignal | null) {
  if (!signal || (signal.views === 0 && signal.waClicks === 0 && !signal.linkClicks)) return null;
  const parts: string[] = [];
  if (signal.views > 0) parts.push(`${signal.views} abertura${signal.views > 1 ? "s" : ""}`);
  if (signal.linkClicks) parts.push(`${signal.linkClicks} clique${signal.linkClicks > 1 ? "s" : ""}`);
  if (signal.waClicks > 0) parts.push(`WhatsApp`);
  return (
    <span
      className="status-pill"
      title={`Ultimo sinal: ${signal.lastEvent ? new Date(signal.lastEvent).toLocaleString("pt-BR") : "--"}`}
      style={{ marginLeft: "6px", background: signal.hot ? "#d32f2f" : "#455a64", color: "#fff" }}
    >
      {signal.hot ? "QUENTE · " : "Sinal · "}
      {parts.join(", ")}
    </span>
  );
}

type Placar = {
  disparos: { done: number; target: number; splitLP: number; splitDFY: number };
  respostas: number;
  aguardando: number;
  // Freio de mao do numero (nao e meta). Opcional para a tela nao quebrar contra um
  // deploy antigo da API.
  saidasNumero?: { done: number; limit: number };
};
type Alerts = {
  sevenDayRule: { disparos7d: number; respostas: number; threshold: number; triggered: boolean };
  day20Rule: { day: number; pct: number; threshold: number; triggered: boolean };
};
// Encaminhamento: o gatekeeper mandou o vCard do decisor. Melhor lead do funil,
// porque chega com permissao dada e nome de quem indicou.
type ReferralItem = {
  dealId: number;
  company: string;
  stage: string;
  decisor: string;
  phone: string;
  indicadoPor: string | null;
  dias: number | null;
  acionado: boolean;
  message: string;
};
type CommandForecast = {
  rubricVersion: number;
  probabilitySource: string;
  period: { from: string; to: string };
  predicted: { total: number; mrr: number; oneOff: number };
  realized: { total: number };
  attention: { revenueAtRisk: number; revenueWithoutNextAction: number };
  relevantDeals: Array<{
    dealId: number;
    company: string;
    stage: string;
    closeDate: string | null;
    recurring: boolean;
    calculatedProbability: number;
    confidence: number;
    predictedValue: number;
    isAtRisk: boolean;
    withoutNextAction: boolean;
  }>;
};
type Comando = {
  placar: Placar;
  alerts: Alerts;
  queue: QueueItem[];
  entryQueue: EntryQueueItem[];
  followupQueue: FollowupItem[];
  referralQueue: ReferralItem[];
  forecast?: CommandForecast;
};

function whatsappLink(phone: string, message: string) {
  const normalized = phone.startsWith("55") ? phone : `55${phone}`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

// Mensagens genericas (nao sao por lead): gatekeeper quando quem responde nao e o
// dono, e follow-ups de reaquecimento. Seguem o Framework_Mensagem_Abordagem_Hormozi
// (anti-ego, encaminhavel, pergunta de baixo custo).
const { SALES_PLAYBOOK } = salesPlaybookModule;
const offerPrice = new Intl.NumberFormat("pt-BR", { style: "currency", currency: SALES_PLAYBOOK.offer.currency });
const entryOfferPrice = new Intl.NumberFormat("pt-BR", { style: "currency", currency: SALES_PLAYBOOK.entryOffer.currency });

// Cartas vivem em content/sales-playbook.json (postResponse.cartas, msg2Ponte,
// msg2Preco, tierA, comando). Aqui so trocamos os placeholders do playbook pelos
// marcadores que o Erick preenche na mao ao copiar. Texto novo entra no JSON, nunca
// aqui: o gate de texto (src/lib/copyGate.mjs) roda sobre o playbook inteiro nos testes.
const CARTAS = SALES_PLAYBOOK.postResponse.cartas;
const TIER_A = SALES_PLAYBOOK.postResponse.tierA;
const COMANDO = SALES_PLAYBOOK.comando;
const projectPrice = new Intl.NumberFormat("pt-BR", { style: "currency", currency: SALES_PLAYBOOK.projectOffer.currency, maximumFractionDigits: 0 });
type CasoComando = "jotta" | "metalthec";
function cartaComando(texto: string, opcoes: { oferta?: "offer" | "projectOffer"; caso?: CasoComando } = {}) {
  const tierA = opcoes.oferta === "projectOffer";
  const setupPrice = tierA ? projectPrice.format(SALES_PLAYBOOK.projectOffer.fromSetupPrice) : offerPrice.format(SALES_PLAYBOOK.offer.setupPrice);
  const monthlyPrice = tierA ? projectPrice.format(SALES_PLAYBOOK.projectOffer.fromMonthlyPrice) : offerPrice.format(SALES_PLAYBOOK.offer.monthlyPrice);
  const metalthec = opcoes.caso === "metalthec";
  return texto
    .replaceAll("{{company}}", "[EMPRESA]")
    .replaceAll("{{setupPrice}}", setupPrice)
    .replaceAll("{{monthlyPrice}}", monthlyPrice)
    .replaceAll("{{proximaEntrada}}", "[DIA]")
    .replaceAll("{{nomeDecisor}}", "[NOME]")
    .replaceAll("{{ponte}}", COMANDO.decisorIndicadoPonte)
    .replaceAll("{{quemDecide}}", TIER_A.quemDecideSemNome)
    .replaceAll("{{caseIntro}}", metalthec ? "Na Metalthec" : "Na Jotta")
    .replaceAll("{{caseUrl}}", metalthec ? SALES_PLAYBOOK.cases.metalthecUrl : SALES_PLAYBOOK.cases.jottaUrl);
}
function cartasDoBloco(lista: { titulo: string; texto: string }[]) {
  return lista.map((carta) => ({ title: carta.titulo, text: cartaComando(carta.texto) }));
}
const forecastCurrency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const READY_MESSAGES: { title: string; text: string }[] = [
  {
    title: "🚪 Quem responde nao e o dono (atendente / central)",
    text: cartaComando(SALES_PLAYBOOK.routing.humanGatekeeper),
  },
  {
    title: "🚪 Dar algo pronto pra pessoa encaminhar",
    text: cartaComando(SALES_PLAYBOOK.routing.forwardable),
  },
  {
    title: "🚪 Abrir pedindo o responsavel (numero de central)",
    text: cartaComando(SALES_PLAYBOOK.routing.centralOpening),
  },
  // BOT/IA e caso diferente do atendente humano acima: nao le nuance, nao
  // encaminha e nao tem constrangimento social pra ignorar. Insistir no mesmo
  // canal queima o numero sem chance de conversao -- `gatekeeper_bot` foi o que
  // matou Manuttech e Fase a Fase. Regra: no maximo 2 mensagens, pede so o NOME
  // (pergunta que bot as vezes responde) e troca de canal. Fixo NAO e descarte:
  // metade dos fixos de industria pequena atende.
  {
    title: "🤖 Bot/IA respondendo: sair em 2 mensagens",
    text: cartaComando(SALES_PLAYBOOK.routing.botName),
  },
  {
    title: "🤖 Bot ignorou 2x: encerrar o canal (nao insistir)",
    text: cartaComando(SALES_PLAYBOOK.routing.botClose),
  },
  // SIM FRACO ("Diferente", "sim" seco, "ok", "pode mandar"): o lead deu espaco
  // pro case, nao pro preco. Ponte = bloco 1 da msg 2 terminando em pergunta
  // ancorada no case. No sim seguinte, msg2Preco (Tier B) ou tierA.proposta (Tier A).
  // Regra do Erick (17/09/2026): preco sem consciencia vira "nao" de qualquer jeito.
  {
    title: "🌉 Sim FRACO (\"Diferente\", \"ok\", \"pode mandar\") → Msg 2 ponte, sem preço",
    text: cartaComando(SALES_PLAYBOOK.postResponse.msg2Ponte),
  },
  {
    title: "💰 Tier B: depois da ponte, no sim → preço + vaga",
    text: cartaComando(SALES_PLAYBOOK.postResponse.msg2Preco),
  },
  // MSG 2 do Tier B (estruturado): a UNICA mensagem entre a resposta do lead e a
  // decisao, com preco escrito e fecho pela vaga de producao. Versao dinamica
  // (link por segmento): mensagemExemplo() em src/lib/followup.ts.
  {
    title: "🎬 Tier B, sim FORTE (\"acontece sim\", pediu preço) → Msg 2 inteira",
    text: cartaComando(SALES_PLAYBOOK.postResponse.msg2),
  },
  // Concorrente direto da Jotta (origin_detail = concorrente_jotta) nunca recebe o
  // nome nem o link da Jotta: decisao do Erick em 15/09/2026. Mesma msg 2, case Metalthec.
  {
    title: "🎬 Tier B, Msg 2 (concorrente da Jotta): case Metalthec + preço + vaga",
    text: cartaComando(SALES_PLAYBOOK.postResponse.msg2, { caso: "metalthec" }),
  },
  // TIER A (governante, P3 de 24/09/2026): projeto sob medida, preco so na proposta, a
  // partir da faixa do site. Nunca R$1.000 no WhatsApp para Tier A.
  {
    title: "🏛️ Tier A, sim FORTE → oferta sem preço, proposta para quem decide",
    text: cartaComando(TIER_A.oferta, { oferta: "projectOffer" }),
  },
  {
    title: "🏛️ Tier A, sim à oferta → proposta a partir da faixa do site + vaga",
    text: cartaComando(TIER_A.proposta, { oferta: "projectOffer" }),
  },
  {
    title: "↩️ Tier A sumiu depois de mensagem sem próximo passo → retomada",
    text: cartaComando(CARTAS.retomadaSemPrecoTierA.texto, { oferta: "projectOffer" }),
  },
  ...cartasDoBloco(COMANDO.quente),
  // RESPOSTAS AO NAO (17/09/2026). Uma carta, uma vez, sem insistir; depois marca o
  // motivo e deixa o 45d trabalhar. Texto e regra de uso: postResponse.cartas.
  {
    title: "🤝 \"Já tenho quem faça / já tenho página\"",
    text: cartaComando(CARTAS.naoJaTem.texto),
  },
  {
    title: "🚫 \"Não, cliente procura pessoalmente\" / \"consegue confirmar sim\" (não ao reconhecimento)",
    text: cartaComando(CARTAS.naoReconhecimento.texto),
  },
  {
    title: "🚫 \"Não temos interesse\" / \"no momento não\"",
    text: cartaComando(CARTAS.naoSemInteresse.texto),
  },
  {
    title: "🚫 Fora do ICP / número errado (\"não faço industrial\", \"aqui é expedição\")",
    text: cartaComando(CARTAS.naoForaIcp.texto),
  },
  {
    title: "❓ \"Não entendi\" / \"explica melhor como funciona\"",
    text: cartaComando(CARTAS.naoEntendi.texto),
  },
  {
    title: "📞 Pediu ligação (\"me liga\", \"prefiro por telefone\")",
    text: cartaComando(CARTAS.pedidoLigacao.texto),
  },
  {
    title: "↩️ Tier B sumiu depois de mensagem SEM preço → retomada com valor",
    text: cartaComando(CARTAS.retomadaSemPreco.texto),
  },
  ...cartasDoBloco(COMANDO.objecoes),
  {
    title: "🎯 Decisor indicado (te passaram o contato dele)",
    text: cartaComando(SALES_PLAYBOOK.routing.referredDecisionMaker),
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="topbar-btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          // clipboard bloqueado: ignora
        }
      }}
    >
      {copied ? "Copiado!" : "Copiar"}
    </button>
  );
}

export default function ComandoPage() {
  const [data, setData] = useState<Comando | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  // #3: sugestao de proxima acao da IA por lead (sob demanda, nao no carregamento).
  // Story 032: a mesma next-action agora responde pelo copiloto — a resposta chega com
  // evidencia e cada frase rotulada, no lugar do paragrafo solto de antes.
  const [actions, setActions] = useState<Record<number, { loading: boolean; answer?: CopilotAnswer; error?: string }>>({});

  async function suggestAction(dealId: number) {
    setActions((a) => ({ ...a, [dealId]: { loading: true } }));
    const result = await fetchCopilotAnswer({ action: "copilot-ask", question: "recommended_action", dealId });
    setActions((a) => ({
      ...a,
      [dealId]: { loading: false, answer: result.answer ?? undefined, error: result.error ?? undefined },
    }));
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/comando");
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error ?? "Falha ao carregar o comando");
        if (!cancelled) {
          setData(body as Comando);
          setStatus("ready");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleWhatsapp(item: QueueItem) {
    void logWhatsappOpened(item.id);
  }

  function handleFollowup(item: FollowupItem) {
    void logWhatsappOpened(item.id, `WhatsApp aberto para follow-up ${item.tier}`);
  }

  function handleEntryOffer(item: EntryQueueItem) {
    void logWhatsappOpened(item.id, "WhatsApp aberto para oferta Base Industrial");
  }

  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Sala de Comando</h1>
          <div className="subtitle">
            Cockpit de cobranca diaria: os inputs do dia, quanto falta e a fila de quem abordar agora. O sistema que nao te deixa fugir da meta.
          </div>
        </div>
        <div className="page-header-right">
          <div className="label">Fila do dia</div>
          <div className="value">{data ? data.queue.length : "-"}</div>
        </div>
      </div>

      <ListaSubnav />

      {status === "loading" ? (
        <div className="connection-status fallback">Carregando o placar do dia...</div>
      ) : status === "error" || !data ? (
        <div className="portfolio-status warning">Nao foi possivel carregar o cockpit do Comando.</div>
      ) : (
        <>
          <div className="card-header" style={{ marginBottom: "12px" }}>
            <div className="card-title">Placar do dia</div>
          </div>
          <div className="kpi-row">
            <article className="kpi-card">
              <div className="kpi-label">Disparos hoje</div>
              <div className="kpi-value">{data.placar.disparos.done} / {data.placar.disparos.target}</div>
              <div className={`kpi-trend ${data.placar.disparos.done >= data.placar.disparos.target ? "up" : ""}`}>
                {data.placar.disparos.splitLP} LP + {data.placar.disparos.splitDFY} DFY
              </div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">No ar (aguardando)</div>
              <div className="kpi-value">{data.placar.aguardando}</div>
              <div className="kpi-trend">Em Abordado/Follow-up, sem resposta</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Respostas</div>
              <div className="kpi-value">{data.placar.respostas}</div>
              <div className="kpi-trend">Responderam como gente (bot nao conta)</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Saidas do numero hoje</div>
              <div className="kpi-value">
                {data.placar.saidasNumero?.done ?? 0} / {data.placar.saidasNumero?.limit ?? 40}
              </div>
              <div className="kpi-trend">Disparo + conversa do aparelho</div>
            </article>
          </div>

          {data.forecast ? (
            <>
              <div className="card-header" style={{ margin: "24px 0 12px" }}>
                <div>
                  <div className="card-title">Previsao comercial do periodo</div>
                  <div className="muted-copy" style={{ fontSize: "11px" }}>
                    {data.forecast.period.from} a {data.forecast.period.to} · fonte {data.forecast.probabilitySource} · rubrica v{data.forecast.rubricVersion}
                  </div>
                </div>
              </div>
              <div className="kpi-row">
                <article className="kpi-card">
                  <div className="kpi-label">Receita provavel</div>
                  <div className="kpi-value">{forecastCurrency.format(data.forecast.predicted.total)}</div>
                  <div className="kpi-trend">MRR {forecastCurrency.format(data.forecast.predicted.mrr)} · one-off {forecastCurrency.format(data.forecast.predicted.oneOff)}</div>
                </article>
                <article className="kpi-card">
                  <div className="kpi-label">Receita em risco</div>
                  <div className="kpi-value">{forecastCurrency.format(data.forecast.attention.revenueAtRisk)}</div>
                  <div className="kpi-trend">Somente previsto; realizado: {forecastCurrency.format(data.forecast.realized.total)}</div>
                </article>
                <article className="kpi-card">
                  <div className="kpi-label">Receita sem proxima acao</div>
                  <div className="kpi-value">{forecastCurrency.format(data.forecast.attention.revenueWithoutNextAction)}</div>
                  <div className="kpi-trend">Deals do periodo sem agenda definida</div>
                </article>
              </div>
              <div className="card-header" style={{ margin: "18px 0 10px" }}>
                <div className="card-title">Negocios relevantes no periodo</div>
              </div>
              {data.forecast.relevantDeals.length === 0 ? (
                <div className="connection-status fallback">Nenhum deal com valor e fechamento dentro do periodo.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Empresa</th><th>Etapa</th><th>Previsao</th><th>Probabilidade</th><th>Confianca</th><th>Acao</th></tr></thead>
                    <tbody>
                      {data.forecast.relevantDeals.slice(0, 10).map((item) => (
                        <tr key={item.dealId}>
                          <td>{item.company}{item.isAtRisk ? <span className="status-pill" style={{ marginLeft: "6px" }}>Risco</span> : null}</td>
                          <td><span className={`status-pill ${item.stage}`}>{item.stage}</span></td>
                          <td>{forecastCurrency.format(item.predictedValue)}{item.recurring ? " MRR" : " one-off"}</td>
                          <td>{item.calculatedProbability}% calculada</td>
                          <td>{item.confidence}%</td>
                          <td><a className="topbar-btn" href={`/pipeline?dealId=${item.dealId}`}>{item.withoutNextAction ? "Definir acao" : "Revisar deal"}</a></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}

          <div className="card-header" style={{ margin: "24px 0 12px" }}>
            <div className="card-title">Alertas de regra</div>
          </div>
          <div className="grid-2col">
            <article className="card">
              <div className="card-header">
                <div className="card-title">Regra dos 7 dias</div>
                <span className="card-badge">
                  {data.alerts.sevenDayRule.triggered ? "atencao" : "ok"}
                </span>
              </div>
              <p className="muted-copy">
                {data.alerts.sevenDayRule.disparos7d} disparos nos ultimos 7 dias, {data.alerts.sevenDayRule.respostas} respostas (avancaram alem de Abordado). Limite: {data.alerts.sevenDayRule.threshold} disparos sem resposta.
              </p>
              {data.alerts.sevenDayRule.triggered ? (
                <div className="portfolio-status warning" style={{ marginTop: "8px" }}>
                  Muitos disparos sem nenhuma resposta. Script pode estar morto: trocar a abordagem.
                </div>
              ) : (
                <div className="portfolio-status success" style={{ marginTop: "8px" }}>No ritmo.</div>
              )}
            </article>
            <article className="card">
              <div className="card-header">
                <div className="card-title">Regra do dia 20</div>
                <span className="card-badge">{data.alerts.day20Rule.triggered ? "atencao" : "ok"}</span>
              </div>
              <p className="muted-copy">
                Dia {data.alerts.day20Rule.day}. Meta do mes em {(data.alerts.day20Rule.pct * 100).toFixed(0)}% (gatilho abaixo de {(data.alerts.day20Rule.threshold * 100).toFixed(0)}%).
              </p>
              {data.alerts.day20Rule.triggered ? (
                <div className="portfolio-status warning" style={{ marginTop: "8px" }}>
                  Abaixo de {(data.alerts.day20Rule.threshold * 100).toFixed(0)}% no dia {data.alerts.day20Rule.day}: dobrar volume, nao esticar o prazo.
                </div>
              ) : data.alerts.day20Rule.day < 20 ? (
                <div className="portfolio-status success" style={{ marginTop: "8px" }}>Ainda antes do dia 20.</div>
              ) : (
                <div className="portfolio-status success" style={{ marginTop: "8px" }}>Dentro da meta.</div>
              )}
            </article>
          </div>

          <details className="card" style={{ margin: "24px 0 0" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>
              Mensagens prontas — gatekeeper + funil completo
            </summary>
            <p className="muted-copy" style={{ margin: "10px 0" }}>
              Copie na hora certa: gatekeeper (quando quem responde nao e o dono), resposta que vira
              reuniao, confirmacao e lembretes, no-show, proposta, objecao e re-engajamento. Os
              follow-ups M1/M2/M3 de silencio NAO estao aqui: saem prontos na fila de follow-up acima.
            </p>
            {READY_MESSAGES.map((m) => (
              <div
                key={m.title}
                style={{ marginBottom: "12px", paddingBottom: "12px", borderBottom: "1px solid rgba(127,127,127,.2)" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <strong style={{ fontSize: "13px" }}>{m.title}</strong>
                  <CopyButton text={m.text} />
                </div>
                <p className="muted-copy" style={{ fontSize: "12px", whiteSpace: "pre-wrap", margin: 0 }}>{m.text}</p>
              </div>
            ))}
          </details>

          {/* Encaminhamentos vem ANTES do follow-up de proposito: e o lead mais
              quente do funil e o que mais esfria parado. Ate 10/08/2026 os campos
              referred_* eram gravados e nunca lidos, e 2 dos 4 capturados nunca
              receberam contato -- um deles foi pra "lost" sem ninguem falar com
              o decisor indicado. */}
          <div className="card-header" style={{ margin: "24px 0 12px" }}>
            <div className="card-title">Encaminhamentos</div>
            <span className="card-badge">
              {(data.referralQueue ?? []).filter((r) => !r.acionado).length} sem contato
            </span>
          </div>
          {(data.referralQueue ?? []).length === 0 ? (
            <div className="connection-status fallback">
              Nenhum decisor indicado ainda. Quando o gatekeeper mandar o contato (vCard), rode
              <code> node scripts/extract-referrals.mjs --go </code> que ele aparece aqui.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Decisor</th>
                    <th>Indicacao</th>
                    <th>Mensagem pronta</th>
                    <th>Telefone</th>
                    <th>Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.referralQueue ?? []).map((item) => (
                    <tr key={`ref-${item.dealId}`}>
                      <td>
                        <div>
                          <strong>{item.decisor}</strong>
                          {!item.acionado && (
                            <span className="card-badge" style={{ marginLeft: "6px" }}>sem contato</span>
                          )}
                        </div>
                        <div className="muted-copy" style={{ fontSize: "11px" }}>{item.company}</div>
                        <span className={`status-pill ${item.stage}`}>{item.stage}</span>
                      </td>
                      <td>
                        {item.dias === null ? "Sem data" : item.dias === 0 ? "Hoje" : `Ha ${item.dias}d`}
                        {item.indicadoPor && (
                          <div className="muted-copy" style={{ fontSize: "11px" }}>por {item.indicadoPor}</div>
                        )}
                      </td>
                      <td style={{ maxWidth: "420px" }}>
                        <div className="muted-copy" style={{ fontSize: "12px" }}>{item.message}</div>
                      </td>
                      <td className="font-mono">+{item.phone}</td>
                      <td>
                        <a
                          className="topbar-btn primary"
                          href={whatsappLink(item.phone, item.message)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Abrir
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card-header" style={{ margin: "24px 0 12px" }}>
            <div className="card-title">Fila de follow-up</div>
            <span className="card-badge">fundo, janelas, saude e qualificacao</span>
          </div>
          {(data.followupQueue ?? []).length === 0 ? (
            <div className="connection-status fallback">
              Ninguem na janela de follow-up agora. Quem foi abordado entra aqui em D+2 (M1), D+5 (M2 com prova) e D+10 (M3 breakup), e quem ja esta em qualified/proposta/negociacao entra assim que ficar 5 dias sem contato ou responder sem retorno.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>Ultimo contato</th>
                    <th>Mensagem da janela</th>
                    <th>Telefone</th>
                    <th>Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.followupQueue ?? []).map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div>{item.company}{signalBadge(item.signal)}</div>
                        <span className={`status-pill ${item.stage}`}>{item.stage}</span>
                        {item.fundoReview && item.value > 0 ? (
                          <span className="status-pill" style={{ marginLeft: "6px" }}>
                            R${item.value.toLocaleString("pt-BR")}
                          </span>
                        ) : null}
                        {item.health ? (
                          <span className="status-pill" style={{ marginLeft: "6px" }}>
                            Saude {item.health.score}/100
                          </span>
                        ) : null}
                        {item.qualification ? (
                          <span className="status-pill" style={{ marginLeft: "6px" }}>
                            Qualificacao {item.qualification.completeness}%
                          </span>
                        ) : null}
                      </td>
                      <td>
                        {item.days === null ? "Sem registro" : item.days === 0 ? "Hoje" : `D+${item.days}`}
                        <div className="muted-copy" style={{ fontSize: "11px" }}>{item.msgCount} msg enviada(s)</div>
                      </td>
                      <td style={{ maxWidth: "420px" }}>
                        <strong style={{ fontSize: "12px" }}>{item.tierLabel}</strong>
                        <span className="muted-copy" style={{ marginLeft: "6px", fontSize: "11px" }}>{item.window}</span>
                        <div className="muted-copy" style={{ fontSize: "12px", marginTop: "4px" }}>
                          {item.fundoReview
                            ? item.fundo?.nota
                            : item.healthReview
                              ? item.health?.recommendation
                              : item.qualificationReview
                                ? `Lacunas de qualificacao: ${item.qualification?.pendingLabels.join(", ")}.`
                                : item.message}
                        </div>
                        {item.leitura ? (
                          <div className="muted-copy" style={{ fontSize: "11px", marginTop: "4px" }}>
                            Leitura: {item.leitura.intentLabel}
                            {item.leitura.objection && item.leitura.objection !== "nenhuma" ? ` · objeção: ${item.leitura.objection.replaceAll("_", " ")}` : ""}
                            {item.leitura.card && item.leitura.card !== "nenhuma" ? (
                              <> · carta: <strong>{item.leitura.cardLabel}</strong></>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                      <td className="font-mono">{item.phone ? `+${item.phone}` : "--"}</td>
                      <td>
                        {item.fundoReview ? (
                          <a className="topbar-btn primary" href={`/pipeline?dealId=${item.id}`}>Abrir deal</a>
                        ) : item.healthReview || item.qualificationReview ? (
                          <a className="topbar-btn" href={`/pipeline?dealId=${item.id}`}>Revisar deal</a>
                        ) : (
                          <a
                            className="topbar-btn primary"
                            href={whatsappLink(item.phone, item.message)}
                            rel="noreferrer"
                            target="_blank"
                            onClick={() => handleFollowup(item)}
                          >
                            Abrir {item.tier}
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Story 032: prioridades gerais na mesma superficie da fila, sob demanda.
              Sem dashboard novo e sem bloquear o carregamento do cockpit. */}
          <CopilotPanel
            title="Prioridades de hoje (copiloto)"
            question="attention_today"
            allowSave
            buttonLabel="Ver prioridades"
            hint="Quem exige atencao agora, com o fator que disparou cada alerta."
          />

          <div className="card-header" style={{ margin: "24px 0 12px" }}>
            <div>
              <div className="card-title">Base Industrial — piloto manual</div>
              <div className="muted-copy" style={{ fontSize: "12px", marginTop: "4px" }}>
                {entryOfferPrice.format(SALES_PLAYBOOK.entryOffer.setupPrice)} de implantação + {entryOfferPrice.format(SALES_PLAYBOOK.entryOffer.monthlyPrice)}/mês · até {SALES_PLAYBOOK.entryOffer.scope.maxServices} serviços · entrega em {SALES_PLAYBOOK.entryOffer.deliveryBusinessDays} dias úteis. Não entra no disparo automático.
              </div>
            </div>
            <span className="card-badge">{(data.entryQueue ?? []).length} / {SALES_PLAYBOOK.entryOffer.pilot.maxLeads} leads</span>
          </div>
          {(data.entryQueue ?? []).length === 0 ? (
            <div className="connection-status fallback">
              Nenhum micro ICP com celular disponível para o piloto de entrada.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>Por que entrou</th>
                    <th>Score</th>
                    <th>Telefone</th>
                    <th>Ação manual</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.entryQueue ?? []).map((item) => (
                    <tr key={item.id}>
                      <td>{item.company}{signalBadge(item.signal)}</td>
                      <td>
                        <div className="muted-copy" style={{ fontSize: "12px" }}>{item.eligibility_reason}</div>
                        {item.capacity_evidence.length > 0 ? (
                          <div className="muted-copy" style={{ fontSize: "10px", marginTop: "2px" }}>
                            {item.capacity_evidence.join(" · ")}
                          </div>
                        ) : null}
                      </td>
                      <td>{item.points}</td>
                      <td className="font-mono">+{item.phone}</td>
                      <td>
                        <a
                          className="topbar-btn primary"
                          href={whatsappLink(item.phone, item.message)}
                          rel="noreferrer"
                          target="_blank"
                          onClick={() => handleEntryOffer(item)}
                        >
                          Abrir oferta
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card-header" style={{ margin: "24px 0 12px" }}>
            <div className="card-title">Fila do dia</div>
            <span className="card-badge">gate → sinal → capacidade → score</span>
          </div>
          {data.queue.length === 0 ? (
            <div className="connection-status fallback">
              Nenhum lead com telefone na fila. Cadastre telefone nos deals ativos para o Comando priorizar a abordagem.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>Perfil</th>
                    <th>Score</th>
                    <th>Abordagem</th>
                    <th>Telefone</th>
                    <th>Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {data.queue.map((item) => (
                    <Fragment key={item.id}>
                      <tr>
                        <td>
                          {item.company}{signalBadge(item.signal)}
                          <div className="muted-copy" style={{ fontSize: "11px", marginTop: "4px" }}>
                            {item.eligibility_reason}
                          </div>
                        </td>
                        <td>
                          <span className={`status-pill ${item.stage}`}>{item.capacity_tier}</span>
                          <div className="muted-copy" style={{ fontSize: "11px", marginTop: "4px" }}>
                            {item.offer_track} · acesso {item.decision_access}
                          </div>
                          {item.capacity_evidence.length > 0 ? (
                            <div className="muted-copy" style={{ fontSize: "10px", marginTop: "2px" }}>
                              {item.capacity_evidence.join(" · ")}
                            </div>
                          ) : null}
                        </td>
                        <td>{item.points}</td>
                        <td>
                          <span className="status-pill">{APPROACH_LABELS[item.recommended_approach] ?? item.recommended_approach}</span>
                          <span className="muted-copy" style={{ marginLeft: "6px", fontSize: "11px" }}>{item.channel}</span>
                        </td>
                        <td className="font-mono">+{item.phone}</td>
                        <td style={{ display: "flex", gap: "6px" }}>
                          <a
                            className="topbar-btn primary"
                            href={whatsappLink(item.phone, item.message)}
                            rel="noreferrer"
                            target="_blank"
                            onClick={() => handleWhatsapp(item)}
                          >
                            Abrir WhatsApp
                          </a>
                          <button
                            className="topbar-btn"
                            type="button"
                            title="Sugestão da IA: por que agir agora e o que dizer"
                            disabled={actions[item.id]?.loading}
                            onClick={() => suggestAction(item.id)}
                          >
                            {actions[item.id]?.loading ? "..." : "Próxima ação IA"}
                          </button>
                        </td>
                      </tr>
                      {actions[item.id]?.answer || actions[item.id]?.error ? (
                        <tr>
                          <td colSpan={6} style={{ background: "var(--panel-2, #f3efe7)", fontSize: "13px" }}>
                            {actions[item.id]?.answer ? (
                              <CopilotAnswerBody answer={actions[item.id]!.answer!} allowSave />
                            ) : (
                              <span className="muted-copy">
                                {actions[item.id]?.error} A fila e o placar acima continuam validos.
                              </span>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
