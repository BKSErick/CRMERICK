"use client";

import { useEffect, useState } from "react";
import { logWhatsappSent } from "@/lib/activityClient";

// Sala de Comando = cockpit de cobranca diaria. Placar do dia (disparos/follow-ups/calls/deals
// movidos), fila priorizada e alertas das regras (7 dias, dia 20), tudo da rota server-side
// /api/comando (activities + deals reais). Zero fabricado: contadores em zero real + vazio.

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
};

const APPROACH_LABELS: Record<string, string> = {
  sem_site_ativo: "Sem site (ativo)",
  builder_fraco: "Builder fraco",
  site_concorrente: "Site de concorrente",
  site_auditar: "Auditar site",
  industrial_email: "Industrial (email)",
};
type Placar = {
  disparos: { done: number; target: number; splitLP: number; splitDFY: number };
  followUps: { done: number; target: number };
  calls: { done: number; target: number };
  dealsMovedToday: number;
};
type Alerts = {
  sevenDayRule: { disparos7d: number; calls7d: number; threshold: number; triggered: boolean };
  day20Rule: { day: number; pct: number; threshold: number; triggered: boolean };
};
type Comando = { placar: Placar; alerts: Alerts; queue: QueueItem[] };

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
    title: "⏱ Follow-up 1 (48h de silencio)",
    text: "Passando so pra deixar claro: nao e sobre ter pagina bonita. E sobre o comprador que pesquisa voces antes de pedir orcamento encontrar prova solida de operacao real. Sem isso, ele segue pra quem tem. Quer que eu te mande o exemplo?",
  },
  {
    title: "⏱ Follow-up 2 (dia 7, quebra de padrao)",
    text: "Me confirma uma coisa: hoje, quando alguem pergunta \"tem site ou alguma pagina pra eu ver os servicos de voces?\", qual link voces mandam?",
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
              <div className="kpi-label">Follow-ups hoje</div>
              <div className="kpi-value">{data.placar.followUps.done} / {data.placar.followUps.target}</div>
              <div className="kpi-trend">Reenvio a quem ja contatou</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Calls na semana</div>
              <div className="kpi-value">{data.placar.calls.done} / {data.placar.calls.target}</div>
              <div className="kpi-trend">Proxy: entrada em Qualified</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Deals movidos hoje</div>
              <div className="kpi-value">{data.placar.dealsMovedToday}</div>
              <div className="kpi-trend">No Kanban</div>
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
                {data.alerts.sevenDayRule.disparos7d} disparos nos ultimos 7 dias, {data.alerts.sevenDayRule.calls7d} calls (entrada em Qualified). Limite: {data.alerts.sevenDayRule.threshold} disparos sem call.
              </p>
              {data.alerts.sevenDayRule.triggered ? (
                <div className="portfolio-status warning" style={{ marginTop: "8px" }}>
                  Muitos disparos sem call agendada. Script pode estar morto: trocar a abordagem.
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
              Mensagens prontas — gatekeeper + follow-up
            </summary>
            <p className="muted-copy" style={{ margin: "10px 0" }}>
              Copie na hora certa: quando quem responde nao e o dono (o telefone do Maps costuma
              cair no atendente), ou pra reaquecer quem ficou em silencio. A mensagem por lead ja
              esta no botao WhatsApp da fila.
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
                      <td>{item.company}</td>
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
