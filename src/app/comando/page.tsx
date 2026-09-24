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

// Cartas vivem em content/sales-playbook.json (postResponse.cartas, msg2Ponte,
// msg2Preco). Aqui so trocamos os placeholders do playbook pelos marcadores que
// o Erick preenche na mao ao copiar. Texto novo entra no JSON, nunca aqui.
const CARTAS = SALES_PLAYBOOK.postResponse.cartas;
function cartaComando(texto: string) {
  return texto
    .replaceAll("{{company}}", "[EMPRESA]")
    .replaceAll("{{setupPrice}}", offerPrice.format(SALES_PLAYBOOK.offer.setupPrice))
    .replaceAll("{{monthlyPrice}}", offerPrice.format(SALES_PLAYBOOK.offer.monthlyPrice))
    .replaceAll("{{proximaEntrada}}", "[DIA]")
    .replaceAll("{{caseIntro}}", "Na Jotta")
    .replaceAll("{{caseUrl}}", SALES_PLAYBOOK.cases.jottaUrl);
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
  // ancorada no case. No sim seguinte, msg2Preco. Regra do Erick (17/09/2026):
  // preco sem consciencia vira "nao" de qualquer jeito. Lead FRIO nunca vai pra
  // reuniao: o card antigo de "15 minutos na tela" foi removido deste fluxo.
  {
    title: "🌉 Sim FRACO (\"Diferente\", \"ok\", \"pode mandar\") → Msg 2 ponte, sem preço",
    text: cartaComando(SALES_PLAYBOOK.postResponse.msg2Ponte),
  },
  {
    title: "💰 Depois da ponte, no sim → preço + vaga",
    text: cartaComando(SALES_PLAYBOOK.postResponse.msg2Preco),
  },
  // Os cards de reuniao abaixo sao para lead QUENTE (inbound, indicado, ou
  // qualificado que pediu apresentacao, tipo JD Aco Forte). Nunca para lead frio.
  {
    title: "✅ Reunião marcada (só lead quente/inbound): confirmação",
    text: "Fechado, [NOME]: [DIA] às [HORA]. Vou te mostrar o diagnóstico da [EMPRESA] na tela, coisa de 15 minutos. Qualquer imprevisto me avisa por aqui que a gente remarca sem drama.",
  },
  {
    title: "⏰ Lembrete véspera da reunião",
    text: "[NOME], amanhã às [HORA] a gente se fala sobre a [EMPRESA]. Separei o diagnóstico e 2 exemplos de indústrias parecidas. Confirmado?",
  },
  {
    title: "🔗 1h antes, com o link (link vai na hora, nunca antes)",
    text: "[NOME], daqui a pouco às [HORA]. Esse é o link da call: [LINK]. Até já.",
  },
  {
    title: "🙈 No-show: reagendar (até 30 min depois, sem culpa)",
    text: "[NOME], a gente acabou não se falando hoje. Imagino que a operação puxou aí, acontece. Quer remarcar? Me fala o dia que fica melhor essa semana.",
  },
  {
    title: "📄 Proposta enviada, follow-up D+2",
    text: "[NOME], viu a proposta da [EMPRESA]? Queria saber se o escopo fez sentido ou se ficou alguma dúvida no valor. Me responde aqui que eu ajusto contigo, é rápido.",
  },
  {
    title: "📄 Proposta parada D+7",
    text: "[NOME], não quero te pressionar, só organizar minha produção: sigo com o projeto da [EMPRESA] ou guardo o escopo por enquanto? Se tiver algo travando, me fala que na maioria das vezes dá pra resolver ajustando o formato.",
  },
  {
    title: "💰 Objeção de preço: escopo menor (D+4 travado)",
    text: "[NOME], pensei no que você falou sobre o investimento. Dá pra começar menor: a página principal primeiro, que é o que o comprador vê quando valida vocês, e o resto a gente faz por etapa conforme trazer retorno. Quer que eu te mande esse escopo reduzido?",
  },
  // MSG 2 — a UNICA mensagem entre a resposta do lead e a decisao. Reescrita em
  // 02/09/2026: preco entra escrito (ticket de entrada nao paga entrevista, e em fria
  // o preco e filtro), o fecho oferece a vaga de producao em vez de pedir
  // aprovacao, e o mensal e descrito por ESTADO ("no ar e atualizada") porque
  // "manutencao" no ramo do lead significa OS e apontamento de hora.
  // Doutrina completa e lista do que e proibido: content/sales-playbook.json ->
  // postResponse. Versao dinamica (link por segmento): mensagemExemplo() em
  // src/lib/followup.ts.
  {
    title: "🎬 Sim FORTE (\"acontece sim\", \"sou eu que olho\", pediu preço) → Msg 2 inteira",
    text: `Isso mesmo. Na Jotta o cliente informa serviço, equipamento e urgência antes de chegar no dono, e o orçamento sai sem a ida e volta: ${SALES_PLAYBOOK.cases.jottaUrl}\n\nPra [EMPRESA] eu faço igual, com os serviços de vocês. ${offerPrice.format(SALES_PLAYBOOK.offer.setupPrice)} a página, mais ${offerPrice.format(SALES_PLAYBOOK.offer.monthlyPrice)}/mês pra manter ela no ar e atualizada.\n\nMinha próxima entrada de produção é [DIA]. Coloco a [EMPRESA] nela?`,
  },
  // Concorrente direto da Jotta (card com "ICP Jotta/Monlevade — tier A_concorrente_direto"
  // na descricao, origin_detail = concorrente_jotta) nunca recebe o nome nem o link da
  // Jotta: decisao do Erick em 15/09/2026, o Thales e a ponte pra ACIMON. Mesma msg 2,
  // com a Metalthec como case.
  {
    title: "🎬 Msg 2 (concorrente da Jotta): case Metalthec + preço + vaga",
    text: `Isso mesmo. Na Metalthec o cliente informa serviço, equipamento e urgência antes de chegar no dono, e o orçamento sai sem a ida e volta: ${SALES_PLAYBOOK.cases.metalthecUrl}\n\nPra [EMPRESA] eu faço igual, com os serviços de vocês. ${offerPrice.format(SALES_PLAYBOOK.offer.setupPrice)} a página, mais ${offerPrice.format(SALES_PLAYBOOK.offer.monthlyPrice)}/mês pra manter ela no ar e atualizada.\n\nMinha próxima entrada de produção é [DIA]. Coloco a [EMPRESA] nela?`,
  },
  // Objecoes que apareceram na conversa REAL e nao tinham resposta pronta.
  // A da HM Usinagem travou um deal em negotiation: "Vc cria um site para HAm?
  // Eu pago uma mensalidade?". Objecao previsivel sem resposta pronta e venda
  // perdida por falha operacional, nao por falta de interesse.
  // Preco definido pelo Erick em 02/08: R$1.000 a pagina + R$150/mes.
  // O mensal cobre HOSPEDAGEM e troca de texto/foto. Mudanca maior e cobrada a
  // parte. O texto diz exatamente isso: prometer "a Ficha de Escopo evoluindo"
  // por 150 criaria expectativa de trabalho ilimitado e viraria atrito na
  // primeira cobranca extra. Preco de entrada, para subir depois.
  {
    title: "💵 \"Eu pago uma mensalidade?\" (modelo de cobrança)",
    text: `Boa pergunta. A página é um valor único de ${offerPrice.format(SALES_PLAYBOOK.offer.setupPrice)}, e depois disso ela é sua. O mensal são ${offerPrice.format(SALES_PLAYBOOK.offer.monthlyPrice)} e mantêm ela no ar e atualizada: as trocas de texto e foto que você for pedindo no dia a dia. Mudança maior, tipo página nova ou função nova, a gente combina à parte antes de eu fazer.`,
  },
  // RESPOSTAS AO NAO (17/09/2026). O "nao" era o segundo maior grupo de resposta
  // e nao tinha degrau. Uma carta, uma vez, sem insistir; depois marca o motivo e
  // deixa o 45d trabalhar. Texto e regra de uso: content/sales-playbook.json ->
  // postResponse.cartas (revisadas por Hormozi e Willian Celso, decididas pelo Erick).
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
    title: "↩️ Sumiu depois de mensagem SEM preço → retomada com valor",
    text: cartaComando(CARTAS.retomadaSemPreco.texto),
  },
  // Objecao real da JOHN REFRIGERACAO (04/08). Dono de operacao de uma pessoa
  // so olha o case (que tem equipe atras) e entende que pagina e um projeto que
  // ELE teria que tocar e manter. Nao e objecao de preco, e de esforco e de
  // tamanho. A resposta destravou em um minuto: veio pedido de orcamento logo
  // depois.
  //
  // PRECO NAO ENTRA AQUI DE PROPOSITO. Decisao do Erick em 04/08: o valor varia
  // com o porte do cliente (Esmetal e Metaltech pagam 1,5k+), e fechar barato
  // com dono-sozinho agora cria objecao de preco futura, enquanto o nome dele
  // ainda esta se firmando. Se for quotar, e caso a caso, em mensagem separada.
  {
    title: "🔧 \"Minha estrutura é muito pequena / trabalho sozinho\"",
    text: "Entendi, e é justo. Mas a sua não precisa ser igual a do exemplo que te mandei. A página é do tamanho da operação: aquela tem mais coisa porque tem equipe atendendo mais frente. A sua seria simples, com os serviços que você atende e o WhatsApp direto.\n\nE o trabalho é meu, não seu. Você me passa o que atende e eu volto com ela pronta pra você olhar. Você não mexe em nada.\n\nQuem trabalha sozinho perde menos com falta de cliente e mais com tempo. Boa parte da conversa de WhatsApp é gente que só queria preço. A página faz essa triagem antes de chegar em você.",
  },
  {
    title: "🎯 Decisor indicado (te passaram o contato dele)",
    text: "Oi, [NOME]! Erick aqui. [QUEM_INDICOU] me passou seu contato. Eu faço o pedido do cliente chegar no WhatsApp de vocês já com serviço, medida e prazo definidos, sem a ida e volta pra descobrir o que ele precisa. Separei um exemplo de uma empresa do mesmo ramo. Quer ver?",
  },
  {
    title: "🔥 Re-engajamento 45d (lead frio / perdido)",
    text: "[NOME], faz um tempo que a gente conversou sobre a [EMPRESA]. Nesse meio tempo, todo orçamento que foi pro concorrente com site mais forte não aparece em relatório nenhum, e é aí que mora o custo de deixar pra depois. Refiz o diagnóstico de vocês atualizado. Quer dar uma olhada?",
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
