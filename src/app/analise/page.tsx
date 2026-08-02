"use client";

import { useEffect, useState } from "react";

// Analise de conversas POR TIPO DE EMPRESA.
//
// O Pipeline mostra lead a lead. Esta tela mostra o PADRAO: em que nivel de
// consciencia cada segmento esta, quanta promessa aquele mercado ja ouviu, se a
// oferta ficou clara pra ele, ate onde a conversa chegou, o que ele demandou e o
// que travou. E a leitura que decide onde investir a proxima leva.
//
// A classificacao roda fora daqui (scripts/classify-conversations.mjs, IA + freios).
// Doutrina e rubrica completa em docs/ANALISE-conversas.md.

type Amostra = {
  company: string;
  stage: string;
  awareness: number | null;
  sophistication: number | null;
  depth: number | null;
  clarity: string | null;
  demanded: string | null;
  blocker: string | null;
  evidence: string | null;
};

type Segmento = {
  segmento: string;
  leads: number;
  abordados: number;
  responderam: number;
  taxaResposta: number;
  taxaRespostaCrua: number;
  amostraBaixa: boolean;
  comFollowup: number;
  taxaFollowup: number;
  resgatadosSoPeloFollowup: number;
  classificados: number;
  consciencia: number | null;
  sofisticacao: number | null;
  profundidade: number | null;
  clareza: Array<{ valor: string; n: number }>;
  demanda: Array<{ valor: string; n: number }>;
  travas: Array<{ valor: string; n: number }>;
  amostras: Amostra[];
};

type Payload = {
  ok: boolean;
  totals?: {
    leads: number; abordados: number; responderam: number; taxaResposta: number;
    comFollowup: number; resgatadosPeloFollowup: number; classificados: number;
    naoProspect: number; amostraMinima: number;
  };
  segmentos?: Segmento[];
  pendentes?: string[];
  error?: string;
};

const CONSCIENCIA: Record<number, string> = {
  1: "inconsciente", 2: "consciente do problema", 3: "consciente da solucao",
  4: "consciente do produto", 5: "totalmente consciente",
};
const SOFISTICACAO: Record<number, string> = {
  1: "virgem", 2: "promessa ampliada", 3: "exige mecanismo",
  4: "ceticismo alto", 5: "saturado",
};
const BLOCKER: Record<string, string> = {
  sem_resposta: "nunca respondeu", gatekeeper_bot: "bot/secretaria barrou",
  preco: "travou no preco", sem_urgencia: "sem urgencia",
  ja_tem_fornecedor: "ja tem fornecedor", decisor_ausente: "decisor ausente",
  canal_errado: "canal errado", audio_nao_transcrito: "respondeu so por audio",
  outro: "outro",
};
const DEMANDA: Record<string, string> = {
  pagina_nova: "pagina nova", redesign: "redesign", seo_geo: "SEO/GEO",
  formulario_orcamento: "formulario de orcamento",
  integracao_whatsapp: "integracao WhatsApp", preco_apenas: "so preco", outro: "outro",
};

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const nota = (x: number | null) => (x === null ? "--" : x.toFixed(1));

/** Escala de 1 a 5 desenhada como trilha. Mostra a nota SEM esconder que e media. */
function Escala({ valor, rotulo }: { valor: number | null; rotulo: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.75 }}>
        <span>{rotulo}</span>
        <span>{nota(valor)}/5</span>
      </div>
      <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <div
            key={n}
            style={{
              flex: 1, height: 6, borderRadius: 3,
              background: valor !== null && valor >= n - 0.5 ? "var(--accent, #7c5cff)" : "rgba(127,127,127,.22)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function AnalisePage() {
  const [data, setData] = useState<Payload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/analise");
        const body = await res.json();
        if (!res.ok || !body.ok) throw new Error(body.error ?? "Analise indisponivel.");
        if (!cancelled) { setData(body); setStatus("ready"); }
      } catch (e) {
        if (!cancelled) {
          setData({ ok: false, error: e instanceof Error ? e.message : "indisponivel" });
          setStatus("error");
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const totals = data?.totals;
  const segmentos = data?.segmentos ?? [];
  const pendentes = data?.pendentes ?? [];

  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Analise de conversas</h1>
          <div className="subtitle">
            O padrao por tipo de empresa: nivel de consciencia, sofisticacao do mercado, clareza da
            oferta, o que o follow-up resgatou e o que travou. Taxa vem sempre com o n do lado.
          </div>
        </div>
        <div className="page-header-right">
          <div className="label">Taxa de resposta</div>
          <div className="value">{totals ? pct(totals.taxaResposta) : "--"}</div>
        </div>
      </div>

      {status === "loading" ? (
        <div className="connection-status fallback">Agregando conversas...</div>
      ) : status === "error" ? (
        <div className="portfolio-status warning">Nao foi possivel carregar: {data?.error}</div>
      ) : (
        <>
          <div className="kpi-row">
            <article className="kpi-card">
              <div className="kpi-label">Leads na base</div>
              <div className="kpi-value">{totals?.leads ?? 0}</div>
              <div className="kpi-trend">{totals?.naoProspect ?? 0} fora (cliente/pessoal)</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Abordados</div>
              <div className="kpi-value">{totals?.abordados ?? 0}</div>
              <div className="kpi-trend">{totals?.responderam ?? 0} responderam</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Com follow-up</div>
              <div className="kpi-value">{totals?.comFollowup ?? 0}</div>
              <div className="kpi-trend">
                {totals?.resgatadosPeloFollowup ?? 0} resgatados so por ele
              </div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Conversas classificadas</div>
              <div className="kpi-value">{totals?.classificados ?? 0}</div>
              <div className="kpi-trend">de {totals?.responderam ?? 0} que responderam</div>
            </article>
          </div>

          {pendentes.length > 0 && (
            <div className="portfolio-status warning" style={{ marginTop: 16 }}>
              <strong>{pendentes.length} conversa(s) respondida(s) sem classificacao:</strong>{" "}
              {pendentes.slice(0, 4).join(", ")}
              {pendentes.length > 4 ? "..." : ""}. A IA reprova o que nao consegue sustentar com
              fala do proprio lead — esses casos sao pra classificar na mao.
            </div>
          )}

          <h2 style={{ marginTop: 24 }}>Por tipo de empresa</h2>
          <div className="subtitle" style={{ marginBottom: 12 }}>
            Celula com menos de {totals?.amostraMinima ?? 8} abordados aparece marcada como
            indicativa: a taxa e puxada para a media geral, senao 1 resposta em 2 leads vira
            &quot;50% de conversao&quot; e o scoring passa a priorizar ruido.
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            {segmentos.map((s) => (
              <article
                key={s.segmento}
                className="kpi-card"
                style={{ padding: 18, display: "block" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <h3 style={{ margin: 0, textTransform: "capitalize" }}>{s.segmento}</h3>
                    <div className="subtitle" style={{ marginTop: 2 }}>
                      {s.leads} leads | {s.abordados} abordados | {s.responderam} responderam
                      {s.amostraBaixa && s.abordados > 0 ? " | amostra baixa" : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 600 }}>
                      {s.amostraBaixa ? "~" : ""}{pct(s.taxaResposta)}
                    </div>
                    <div className="subtitle">cru {s.responderam}/{s.abordados}</div>
                  </div>
                </div>

                {s.classificados === 0 ? (
                  <div className="subtitle" style={{ marginTop: 12 }}>
                    {s.abordados === 0
                      ? "Nunca abordado. Nada a concluir."
                      : "Sem conversa classificada ainda — ninguem respondeu, ou a classificacao nao rodou."}
                  </div>
                ) : (
                  <div
                    style={{
                      marginTop: 14,
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                      gap: 18,
                    }}
                  >
                    <div>
                      <Escala valor={s.consciencia} rotulo="Consciencia" />
                      <div className="subtitle" style={{ fontSize: 11, marginTop: -4 }}>
                        {s.consciencia ? CONSCIENCIA[Math.round(s.consciencia)] : "--"}
                      </div>
                      <div style={{ height: 10 }} />
                      <Escala valor={s.sofisticacao} rotulo="Sofisticacao do mercado" />
                      <div className="subtitle" style={{ fontSize: 11, marginTop: -4 }}>
                        {s.sofisticacao ? SOFISTICACAO[Math.round(s.sofisticacao)] : "--"}
                      </div>
                      <div style={{ height: 10 }} />
                      <Escala valor={s.profundidade} rotulo="Profundidade da conversa" />
                    </div>

                    <div style={{ fontSize: 13 }}>
                      <div style={{ marginBottom: 10 }}>
                        <div className="subtitle" style={{ fontSize: 11 }}>OFERTA FICOU CLARA?</div>
                        {s.clareza.length
                          ? s.clareza.map((c) => `${c.valor} (${c.n})`).join(" · ")
                          : "--"}
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        <div className="subtitle" style={{ fontSize: 11 }}>DEMANDA DE OFERTA</div>
                        {s.demanda.length
                          ? s.demanda.map((d) => `${DEMANDA[d.valor] ?? d.valor} (${d.n})`).join(" · ")
                          : "nenhuma declarada"}
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        <div className="subtitle" style={{ fontSize: 11 }}>TRAVAS</div>
                        {s.travas.length
                          ? s.travas.map((t) => `${BLOCKER[t.valor] ?? t.valor} (${t.n})`).join(" · ")
                          : "nenhuma registrada"}
                      </div>
                      <div>
                        <div className="subtitle" style={{ fontSize: 11 }}>FOLLOW-UP</div>
                        {s.comFollowup === 0
                          ? "nenhum enviado"
                          : `${s.amostraBaixa ? "~" : ""}${pct(s.taxaFollowup)} — resgatou ${s.resgatadosSoPeloFollowup} de ${s.comFollowup}`}
                      </div>
                    </div>

                    <div>
                      <div className="subtitle" style={{ fontSize: 11, marginBottom: 6 }}>
                        AMOSTRA DE CLIENTES
                      </div>
                      {s.amostras.map((a) => (
                        <div key={a.company} style={{ marginBottom: 8, fontSize: 12 }}>
                          <div style={{ fontWeight: 600 }}>
                            {a.company.slice(0, 38)}{" "}
                            <span style={{ opacity: 0.6, fontWeight: 400 }}>
                              c{a.awareness} s{a.sophistication} p{a.depth} · {a.stage}
                            </span>
                          </div>
                          {a.evidence && (
                            <div style={{ opacity: 0.7, fontStyle: "italic" }}>
                              &quot;{a.evidence.slice(0, 90)}&quot;
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}