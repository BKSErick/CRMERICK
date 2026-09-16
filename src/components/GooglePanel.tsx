"use client";

import { useEffect, useState } from "react";
import { PainelTabela, type Coluna } from "@/components/PainelTabela";
import type { GoogleInsightsReport, Opportunity, RankedRow } from "@/lib/googleInsights";

// Aba Google dos Funis: GA4 e Search Console lado a lado.
//
// As duas ficam SEPARADAS na tela de proposito. O GA4 conta o que aconteceu
// dentro do site; o Search Console conta o que aconteceu na busca, antes de a
// pessoa entrar. Empilhar os numeros num funil so faria parecer que impressao e
// sessao sao o mesmo passo, e nao sao.

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; report: GoogleInsightsReport; message: string; gscErro: string | null };

const inteiro = new Intl.NumberFormat("pt-BR");
const pct = (value: number, casas = 1) => `${value.toFixed(casas).replace(".", ",")}%`;
const diaCurto = (iso: string) => {
  const [, mes, dia] = iso.split("-");
  return mes && dia ? `${dia}/${mes}` : iso;
};

export function GooglePanel() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/google-panel?days=30");
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error ?? "Falha ao ler dados do Google.");
        if (!cancelled) {
          setState({ status: "ready", report: body.report, message: body.message ?? "", gscErro: body.gscErro ?? null });
        }
      } catch (error) {
        if (!cancelled) {
          setState({ status: "error", message: error instanceof Error ? error.message : "Erro desconhecido." });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="editorial-funnel-panel">
        <p className="muted-copy">Lendo GA4 e Search Console...</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="editorial-funnel-panel">
        <div className="funnel-section-eyebrow">Google</div>
        <h2>Dados indisponiveis</h2>
        <p className="muted-copy">{state.message}</p>
      </div>
    );
  }

  const { analytics, search, diagnosis } = state.report;
  const maxPasso = Math.max(...analytics.funnel.map((f) => f.value), 1);

  return (
    <div className="editorial-funnel-panel">
      <div className="editorial-funnel-panel-header">
        <div>
          <div className="funnel-section-eyebrow">Funil de aquisicao</div>
          <h2>Google</h2>
          <p>
            {state.message} Search Console mostra quem procurou; Analytics mostra quem entrou. Sao contagens
            diferentes e nao se somam.
          </p>
        </div>
        {/* Com o Search Console desligado, CTR seria 0,0% por falta de fonte, nao
            por desempenho. O placar cai para o numero que existe de verdade. */}
        <div className="funnel-meta-rate">
          <strong>{search.configured ? pct(search.totals.ctr) : inteiro.format(analytics.sessions)}</strong>
          <span>{search.configured ? "CTR na busca" : "sessoes em 30 dias"}</span>
        </div>
      </div>

      {diagnosis.map((item) => (
        <div className={`painel-alerta painel-alerta-${item.level}`} key={item.title} role="status">
          <strong>{item.title}</strong>
          <span>{item.message}</span>
        </div>
      ))}

      {/* GA4 vem primeiro por ter dado hoje. O Search Console entra depois porque
          depende de uma habilitacao externa; enquanto nao conecta, mostrar quatro
          cartoes zerados e dois graficos vazios so empurra o que funciona para
          baixo da dobra. */}
      <h3 className="painel-secao">Dentro do site · Analytics</h3>

      <div className="painel-stat-grid">
        {[
          { label: "Sessoes", valor: inteiro.format(analytics.sessions), hint: "Visitas no periodo" },
          { label: "Pessoas", valor: inteiro.format(analytics.users), hint: "Usuarios ativos" },
          { label: "Visualizacoes", valor: inteiro.format(analytics.views), hint: "Paginas vistas" },
          { label: "Cliques em CTA", valor: inteiro.format(analytics.ctaClicks), hint: "Botoes tocados" },
          { label: "Leads", valor: inteiro.format(analytics.leads), hint: "WhatsApp + formulario" },
          { label: "Visita que clica", valor: pct(analytics.engagementRate), hint: "CTA por visualizacao" },
        ].map((card) => (
          <article className="painel-stat" key={card.label}>
            <span>{card.label}</span>
            <strong>{card.valor}</strong>
            <small>{card.hint}</small>
          </article>
        ))}
      </div>

      <div className="painel-passos">
        {analytics.funnel.map((passo, index) => {
          const anterior = index === 0 ? null : analytics.funnel[index - 1];
          const taxa = anterior && anterior.value > 0 ? (passo.value / anterior.value) * 100 : null;
          return (
            <article className="painel-passo" key={passo.label}>
              <div className="painel-passo-topo">
                <span>{passo.label}</span>
                <strong>{inteiro.format(passo.value)}</strong>
              </div>
              <div className="painel-passo-barra">
                <div style={{ width: `${Math.max((passo.value / maxPasso) * 100, 1.5)}%` }} />
              </div>
              <small>{taxa === null ? passo.helper : `${pct(taxa)} do passo anterior · ${passo.helper}`}</small>
            </article>
          );
        })}
      </div>

      <div className="painel-charts">
        <SerieSite daily={analytics.daily} />
        <div className="painel-side-charts">
          <ListaRanqueada eyebrow="Origem" linhas={analytics.channels} titulo="De onde vem o acesso" vazio="Sem sessao no periodo." />
          <ListaRanqueada eyebrow="Dispositivo" linhas={analytics.devices} titulo="Celular ou desktop" vazio="Sem sessao no periodo." />
        </div>
      </div>

      <TabelaPaginas linhas={analytics.pages} />

      {/* ---------- Search Console: antes do clique ---------- */}
      <h3 className="painel-secao">Na busca do Google · Search Console</h3>

      {search.configured ? (
        <>
          <div className="painel-stat-grid">
            {[
              { label: "Impressoes", valor: inteiro.format(search.totals.impressions), hint: "Vezes que apareceu no resultado" },
              { label: "Cliques", valor: inteiro.format(search.totals.clicks), hint: "Quantos entraram no site" },
              { label: "CTR", valor: pct(search.totals.ctr), hint: "Cliques por impressao" },
              { label: "Posicao media", valor: search.totals.position.toFixed(1).replace(".", ","), hint: "1 a 10 = primeira pagina" },
            ].map((card) => (
              <article className="painel-stat" key={card.label}>
                <span>{card.label}</span>
                <strong>{card.valor}</strong>
                <small>{card.hint}</small>
              </article>
            ))}
          </div>

          <div className="painel-charts">
            <ParetoConsultas slices={search.pareto} />
            <div className="painel-side-charts">
              <SerieBusca daily={search.daily} />
              <ListaRanqueada
                eyebrow="Paginas na busca"
                linhas={search.pages}
                titulo="Que pagina aparece"
                vazio="Nenhuma pagina indexada com impressao no periodo."
              />
            </div>
          </div>

          <Oportunidades linhas={search.opportunities} />
          <TabelaConsultas linhas={search.queries} />
        </>
      ) : (
        <SearchConsoleDesligado erro={state.gscErro} />
      )}

      <GlossarioGoogle />
    </div>
  );
}

// ---------- Search Console ainda nao conectado ----------
// Em vez de quatro cartoes zerados e dois graficos vazios, o passo a passo do que
// falta. Zero de fonte desligada e indistinguivel de zero real, e isso engana.
function SearchConsoleDesligado({ erro }: { erro: string | null }) {
  const PASSOS = [
    {
      titulo: "Habilitar a Search Console API",
      texto: "No Google Cloud, no MESMO projeto do service account do GA4. E uma API separada da do Analytics e vem desligada por padrao.",
    },
    {
      titulo: "Dar acesso a propriedade",
      texto: "Search Console > Configuracoes > Usuarios e permissoes > Adicionar usuario. Use o e-mail do service account; permissao de leitor basta.",
    },
    {
      titulo: "Preencher GSC_SITE_URL",
      texto: 'No .env e na Vercel. Formato "sc-domain:mydrion.com.br" para propriedade de dominio, ou a URL exata com barra final. Precisa ser identico ao seletor do Search Console.',
    },
  ];

  return (
    <section className="painel-bloco painel-desligado">
      <div className="funnel-section-eyebrow">Ainda nao conectado</div>
      <h3>Falta ligar o Search Console</h3>
      <p className="muted-copy">
        Sem ele nao da para saber quem procurou e nao entrou — o Analytics so enxerga quem ja chegou no site. Tres
        passos, todos fora do codigo:
      </p>
      <ol className="painel-passo-a-passo">
        {PASSOS.map((passo, index) => (
          <li key={passo.titulo}>
            <span>{index + 1}</span>
            <div>
              <strong>{passo.titulo}</strong>
              <small>{passo.texto}</small>
            </div>
          </li>
        ))}
      </ol>
      {erro ? (
        <p className="painel-erro-cru">
          <strong>Resposta do Google agora:</strong> {erro}
        </p>
      ) : null}
    </section>
  );
}

// ---------- Pareto de consultas ----------
function ParetoConsultas({ slices }: { slices: GoogleInsightsReport["search"]["pareto"] }) {
  if (slices.length === 0) {
    return (
      <section className="painel-bloco">
        <div className="funnel-section-eyebrow">Pareto das consultas</div>
        <p className="muted-copy">Sem impressao registrada no periodo.</p>
      </section>
    );
  }

  // Embaixo de cada barra vai so o numero da consulta; o texto fica na legenda
  // abaixo do grafico. Rotulo girado a 9px num SVG escalado nao se le, e sete
  // consultas de vinte caracteres nao cabem em 640 de largura de nenhum jeito.
  const W = 640;
  const H = 250;
  const M = { top: 22, right: 44, bottom: 26, left: 12 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const maxValor = Math.max(...slices.map((s) => s.value), 1);
  const faixa = plotW / slices.length;
  const larguraBarra = Math.min(faixa * 0.56, 60);

  const xCentro = (i: number) => M.left + faixa * i + faixa / 2;
  const yBarra = (v: number) => M.top + plotH - (v / maxValor) * plotH;
  const yAcum = (p: number) => M.top + plotH - (p / 100) * plotH;
  const corte = slices.findIndex((s) => s.cumulative >= 80);
  const vital = (i: number) => i <= corte || corte === -1;

  return (
    <section className="painel-bloco">
      <div className="funnel-section-eyebrow">Pareto das consultas</div>
      <h3>Que busca concentra a demanda</h3>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Pareto das consultas por impressao">
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line className="painel-grid" x1={M.left} x2={W - M.right} y1={yAcum(tick)} y2={yAcum(tick)} />
            <text className="painel-axis" style={{ textAnchor: "start" }} x={W - M.right + 8} y={yAcum(tick) + 3}>{tick}%</text>
          </g>
        ))}
        <line className="painel-corte" x1={M.left} x2={W - M.right} y1={yAcum(80)} y2={yAcum(80)} />
        {/* Encostado na direita: a barra mais alta e sempre a primeira, e o
            rotulo em cima dela ficava ilegivel. */}
        <text className="painel-corte-label" textAnchor="end" x={W - M.right - 4} y={yAcum(80) - 5}>corte 80%</text>

        {slices.map((slice, i) => (
          <g key={slice.label}>
            <rect
              className={vital(i) ? "painel-bar vital" : "painel-bar"}
              height={Math.max(M.top + plotH - yBarra(slice.value), 1)}
              rx={3}
              width={larguraBarra}
              x={xCentro(i) - larguraBarra / 2}
              y={yBarra(slice.value)}
            >
              <title>{`${slice.label}: ${slice.value} impressoes (${pct(slice.share)})`}</title>
            </rect>
            <text className="painel-bar-value" x={xCentro(i)} y={yBarra(slice.value) - 7}>{slice.value}</text>
            <text className="painel-axis" x={xCentro(i)} y={M.top + plotH + 16}>{i + 1}</text>
          </g>
        ))}

        <polyline className="painel-linha-acumulado" points={slices.map((s, i) => `${xCentro(i)},${yAcum(s.cumulative)}`).join(" ")} />
        {slices.map((slice, i) => (
          <circle className="painel-ponto" cx={xCentro(i)} cy={yAcum(slice.cumulative)} key={slice.label} r={3.5}>
            <title>{`Acumulado ate aqui: ${pct(slice.cumulative)}`}</title>
          </circle>
        ))}
      </svg>
      <ol className="painel-pareto-legenda">
        {slices.map((slice, i) => (
          <li className={vital(i) ? "vital" : undefined} key={slice.label}>
            <strong>{i + 1} · {slice.label}</strong>
            <span>
              {inteiro.format(slice.value)} impressoes · {pct(slice.share)} · acumulado {pct(slice.cumulative)}
            </span>
          </li>
        ))}
      </ol>
      <p className="muted-copy">
        {corte >= 0
          ? `${corte + 1} de ${slices.length} consultas concentram ${pct(slices[corte].cumulative)} das impressoes. E nelas que vale posicionar a pagina.`
          : "Demanda espalhada: nenhuma consulta domina."}
      </p>
    </section>
  );
}

// ---------- Series ----------
type DiaSerie = { day: string; valores: [number, number]; titulo: string };

// Serie de ate 30 dias em coluna elastica. A base `.painel-serie` tem largura
// fixa por coluna (serve a rampa do e-mail, com 3 barras e poucos dias); aqui
// 21 dias estouravam a coluna estreita e os mais recentes, justamente os que
// interessam, ficavam atras de um scroll que ninguem ve. Data so a cada N
// colunas para nao virar borrao, e o ultimo dia sempre leva rotulo. Barra
// zerada nao desenha: os 2px de min-height pareciam dado onde nao tinha.
function SerieDensa({ dias, classes }: { dias: DiaSerie[]; classes: [string, string] }) {
  const max = Math.max(...dias.flatMap((d) => d.valores), 1);
  const passo = Math.ceil(dias.length / 7);
  return (
    <div className="painel-serie densa">
      {dias.map((dia, i) => (
        <div className="painel-serie-col" key={dia.day}>
          <div className="painel-serie-bars" title={`${diaCurto(dia.day)}: ${dia.titulo}`}>
            {dia.valores.map((valor, j) => (
              <div
                className={`painel-serie-bar ${classes[j]}${valor === 0 ? " zero" : ""}`}
                key={classes[j]}
                style={{ height: `${(valor / max) * 100}%` }}
              />
            ))}
          </div>
          <span>{(dias.length - 1 - i) % passo === 0 ? diaCurto(dia.day) : ""}</span>
        </div>
      ))}
    </div>
  );
}

function SerieBusca({ daily }: { daily: GoogleInsightsReport["search"]["daily"] }) {
  return (
    <section className="painel-bloco">
      <div className="funnel-section-eyebrow">Dia a dia na busca</div>
      <h3>Impressoes e cliques</h3>
      {daily.length === 0 ? (
        <p className="muted-copy">Sem dado no periodo.</p>
      ) : (
        <>
          <SerieDensa
            classes={["entregues", "abertos"]}
            dias={daily.map((d) => ({
              day: d.day,
              valores: [d.impressions, d.clicks],
              titulo: `${d.impressions} impressoes, ${d.clicks} cliques`,
            }))}
          />
          <div className="painel-legenda-inline">
            <span><i className="entregues" />Impressoes</span>
            <span><i className="abertos" />Cliques</span>
          </div>
        </>
      )}
    </section>
  );
}

function SerieSite({ daily }: { daily: GoogleInsightsReport["analytics"]["daily"] }) {
  return (
    <section className="painel-bloco">
      <div className="funnel-section-eyebrow">Dia a dia no site</div>
      <h3>Sessoes e pessoas</h3>
      {daily.length === 0 ? (
        <p className="muted-copy">Sem sessao no periodo.</p>
      ) : (
        <>
          <SerieDensa
            classes={["enviados", "abertos"]}
            dias={daily.map((d) => ({
              day: d.day,
              valores: [d.sessions, d.users],
              titulo: `${d.sessions} sessoes, ${d.users} pessoas`,
            }))}
          />
          <div className="painel-legenda-inline">
            <span><i className="enviados" />Sessoes</span>
            <span><i className="abertos" />Pessoas</span>
          </div>
        </>
      )}
    </section>
  );
}

// ---------- Lista ranqueada ----------
function ListaRanqueada({
  eyebrow,
  titulo,
  linhas,
  vazio,
}: {
  eyebrow: string;
  titulo: string;
  linhas: RankedRow[];
  vazio: string;
}) {
  const max = Math.max(...linhas.map((l) => l.value), 1);
  return (
    <section className="painel-bloco">
      <div className="funnel-section-eyebrow">{eyebrow}</div>
      <h3>{titulo}</h3>
      {linhas.length === 0 ? (
        <p className="muted-copy">{vazio}</p>
      ) : (
        <div className="painel-bar-list">
          {linhas.map((linha) => (
            <div className="painel-bar-row" key={linha.title ?? linha.label}>
              <span title={linha.title ?? linha.label}>{linha.label}</span>
              <div className="painel-bar-track">
                <div className="painel-bar-fill kind-site" style={{ width: `${(linha.value / max) * 100}%` }} />
              </div>
              <strong>{inteiro.format(linha.value)}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------- Oportunidades ----------
// A leitura mais acionavel da aba: consulta com impressao e zero clique e demanda
// que ja existe e o resultado nao esta capturando.
function Oportunidades({ linhas }: { linhas: Opportunity[] }) {
  if (linhas.length === 0) return null;

  return (
    <section className="painel-bloco painel-oportunidades">
      <div className="funnel-section-eyebrow">Demanda perdida</div>
      <h3>Apareceu e ninguem clicou</h3>
      <p className="muted-copy">
        Estas buscas ja trazem o site ao resultado do Google e nao rendem visita. E procura existente esperando ser
        capturada.
      </p>
      <ul className="painel-oportunidade-lista">
        {linhas.map((linha) => (
          <li key={linha.query}>
            <div>
              <strong>{linha.query}</strong>
              <span>{linha.motivo}</span>
            </div>
            <div className="painel-oportunidade-num">
              <strong>{inteiro.format(linha.impressions)}</strong>
              <span>impressoes · pos. {linha.position.toFixed(0)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- Tabelas ----------
const COLUNAS_CONSULTA: Coluna<RankedRow>[] = [
  { chave: "consulta", label: "Consulta", render: (r) => r.label },
  { chave: "impressoes", label: "Impressoes", render: (r) => inteiro.format(r.value) },
  { chave: "detalhe", label: "Cliques e posicao", render: (r) => r.extra ?? "-" },
  { chave: "share", label: "% da demanda", render: (r) => pct(r.share) },
];

function TabelaConsultas({ linhas }: { linhas: RankedRow[] }) {
  return (
    <PainelTabela
      chave={(r) => r.label}
      colunas={COLUNAS_CONSULTA}
      eyebrow="Consultas"
      linhas={linhas}
      placeholder="Buscar termo..."
      textoBusca={(r) => `${r.label} ${r.extra ?? ""}`}
      titulo="O que procuraram"
      vazio="Sem consulta registrada no periodo."
    />
  );
}

const COLUNAS_PAGINA: Coluna<RankedRow>[] = [
  { chave: "pagina", label: "Pagina", render: (r) => r.label, mono: true },
  { chave: "sessoes", label: "Sessoes", render: (r) => inteiro.format(r.value) },
  { chave: "pessoas", label: "Pessoas", render: (r) => r.extra ?? "-" },
  { chave: "share", label: "% do trafego", render: (r) => pct(r.share) },
];

function TabelaPaginas({ linhas }: { linhas: RankedRow[] }) {
  return (
    <PainelTabela
      chave={(r) => r.label}
      colunas={COLUNAS_PAGINA}
      eyebrow="Paginas"
      linhas={linhas}
      placeholder="Buscar caminho..."
      textoBusca={(r) => r.label}
      titulo="Onde as pessoas entram"
      vazio="Sem pagina com sessao no periodo."
    />
  );
}

// ---------- Glossario ----------
const TERMOS_GOOGLE = [
  {
    termo: "Impressao",
    tipo: "neutro",
    texto: "O site apareceu no resultado de busca de alguem. Nao quer dizer que a pessoa viu, so que estava la na pagina de resultados dela.",
  },
  {
    termo: "Clique",
    tipo: "bom",
    texto: "A pessoa viu o resultado e entrou. E o unico numero do Search Console que vira visita de verdade.",
  },
  {
    termo: "CTR",
    tipo: "neutro",
    texto: "Cliques divididos por impressoes. Diz se o titulo e a descricao convencem quem ja esta vendo. Abaixo de 1% em posicao boa e problema de texto, nao de ranqueamento.",
  },
  {
    termo: "Posicao media",
    tipo: "neutro",
    texto: "Em que lugar do resultado o site costuma aparecer. De 1 a 10 e a primeira pagina; acima de 20 praticamente ninguem chega.",
  },
  {
    termo: "Sessao",
    tipo: "neutro",
    texto: "Uma visita ao site. A mesma pessoa voltando amanha conta duas sessoes e uma pessoa so.",
  },
  {
    termo: "Search Console x Analytics",
    tipo: "morno",
    texto: "Nao batem e nao deveriam bater. O Search Console conta o que acontece NA BUSCA, antes do clique; o Analytics conta o que acontece DENTRO do site, depois dele. Impressao nunca vira sessao um para um.",
  },
];

function GlossarioGoogle() {
  const [aberto, setAberto] = useState(false);

  return (
    <section className="painel-glossario">
      <button aria-expanded={aberto} onClick={() => setAberto((v) => !v)} type="button">
        <span className="funnel-section-eyebrow">O que significa cada numero</span>
        <i aria-hidden="true">{aberto ? "−" : "+"}</i>
      </button>
      {aberto ? (
        <dl>
          {TERMOS_GOOGLE.map((item) => (
            <div className={`painel-termo tipo-${item.tipo}`} key={item.termo}>
              <dt>{item.termo}</dt>
              <dd>{item.texto}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="muted-copy">
          Impressao e aparecer na busca; clique e entrar. Search Console e Analytics contam coisas diferentes e nao
          batem. Abrir para ver tudo.
        </p>
      )}
    </section>
  );
}
