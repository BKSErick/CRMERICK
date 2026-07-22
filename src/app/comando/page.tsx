"use client";

import { useEffect, useState } from "react";
import { logWhatsappSent } from "@/lib/activityClient";

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
};
type Alerts = {
  sevenDayRule: { disparos7d: number; respostas: number; threshold: number; triggered: boolean };
  day20Rule: { day: number; pct: number; threshold: number; triggered: boolean };
};
type Comando = { placar: Placar; alerts: Alerts; queue: QueueItem[]; followupQueue: FollowupItem[] };

function whatsappLink(phone: string, message: string) {
  const normalized = phone.startsWith("55") ? phone : `55${phone}`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

// Mensagens genericas (nao sao por lead): gatekeeper quando quem responde nao e o
// dono, e follow-ups de reaquecimento. Seguem o Framework_Mensagem_Abordagem_Hormozi
// (anti-ego, encaminhavel, pergunta de baixo custo).
const READY_MESSAGES: { title: string; text: string }[] = [
  {
    title: "🚪 Quem responde nao e o dono (atendente / central)",
    text: "Perfeito, obrigado! Consegue me direcionar pra quem cuida dessa parte, ou pro dono? E bem rapido: fiz uma analise do que aparece quando um cliente procura voces no Google, e tem um ponto que pode estar custando orcamento. Queria mostrar direto pra quem decide.",
  },
  {
    title: "🚪 Dar algo pronto pra pessoa encaminhar",
    text: "Tranquilo! Se for mais facil, pode repassar pra ele: montei uma analise rapida da presenca de voces no Google e do que faz um comprador desistir antes de pedir orcamento. E um link que ele ve em 2 minutos. Consigo mandar aqui ou prefere que eu chame ele direto?",
  },
  {
    title: "🚪 Abrir pedindo o responsavel (numero de central)",
    text: "Oi! Falo com o responsavel comercial, ou com o dono? Fiz uma analise da presenca de voces no Google e queria mostrar pra quem decide sobre isso. E rapido.",
  },
  {
    title: "📞 Respondeu → puxar pra reunião",
    text: "Boa, [NOME]. Em vez de eu te explicar tudo por texto, prefiro te mostrar na tela: 15 minutos, eu abro o diagnóstico da [EMPRESA] e te mostro exatamente o que eu ajustaria e por quê. Tem uma janela [DIA] ou [DIA]?",
  },
  {
    title: "✅ Reunião marcada: confirmação (imediata)",
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

  async function reload() {
    try {
      const response = await fetch("/api/comando");
      const body = await response.json();
      if (response.ok && body.ok) setData(body as Comando);
    } catch {
      // mantem o estado atual
    }
  }

  async function handleWhatsapp(item: QueueItem) {
    await logWhatsappSent(item.id);
    reload();
  }

  async function handleFollowup(item: FollowupItem) {
    await logWhatsappSent(item.id, `Follow-up ${item.tier} enviado`);
    reload();
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
              <div className="kpi-trend">Avancaram alem de Abordado</div>
            </article>
          </div>

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

          <div className="card-header" style={{ margin: "24px 0 12px" }}>
            <div className="card-title">Fila de follow-up</div>
            <span className="card-badge">na janela hoje</span>
          </div>
          {(data.followupQueue ?? []).length === 0 ? (
            <div className="connection-status fallback">
              Ninguem na janela de follow-up agora. Quem foi abordado entra aqui em D+2 (M1), D+5 (M2 com prova) e D+10 (M3 breakup).
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
                      </td>
                      <td>
                        {item.days === null ? "Sem registro" : item.days === 0 ? "Hoje" : `D+${item.days}`}
                        <div className="muted-copy" style={{ fontSize: "11px" }}>{item.msgCount} msg enviada(s)</div>
                      </td>
                      <td style={{ maxWidth: "420px" }}>
                        <strong style={{ fontSize: "12px" }}>{item.tierLabel}</strong>
                        <span className="muted-copy" style={{ marginLeft: "6px", fontSize: "11px" }}>{item.window}</span>
                        <div className="muted-copy" style={{ fontSize: "12px", marginTop: "4px" }}>{item.message}</div>
                      </td>
                      <td className="font-mono">+{item.phone}</td>
                      <td>
                        <a
                          className="topbar-btn primary"
                          href={whatsappLink(item.phone, item.message)}
                          rel="noreferrer"
                          target="_blank"
                          onClick={() => handleFollowup(item)}
                        >
                          Enviar {item.tier}
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
            <span className="card-badge">por score</span>
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
                    <th>Etapa</th>
                    <th>Score</th>
                    <th>Abordagem</th>
                    <th>Telefone</th>
                    <th>Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {data.queue.map((item) => (
                    <tr key={item.id}>
                      <td>{item.company}{signalBadge(item.signal)}</td>
                      <td><span className={`status-pill ${item.stage}`}>{item.stage}</span></td>
                      <td>{item.points}</td>
                      <td>
                        <span className="status-pill">{APPROACH_LABELS[item.recommended_approach] ?? item.recommended_approach}</span>
                        <span className="muted-copy" style={{ marginLeft: "6px", fontSize: "11px" }}>{item.channel}</span>
                      </td>
                      <td className="font-mono">+{item.phone}</td>
                      <td>
                        <a
                          className="topbar-btn primary"
                          href={whatsappLink(item.phone, item.message)}
                          rel="noreferrer"
                          target="_blank"
                          onClick={() => handleWhatsapp(item)}
                        >
                          WhatsApp
                        </a>
                      </td>
                    </tr>
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
