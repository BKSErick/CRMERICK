"use client";

import { useEffect, useMemo, useState } from "react";
import { PainelTabela, type Coluna } from "@/components/PainelTabela";
import {
  BUTTON_SHORT_LABELS,
  recipientSearchText,
  type ButtonKind,
  type EmailFunnelReport,
} from "@/lib/emailFunnel";

// Aba de e-mail dos Funis: entrega, abertura, clique por botao e Pareto das perdas.
// Graficos em SVG inline de proposito — o projeto nao tem lib de chart e um Pareto
// nao justifica uma dependencia nova.

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; report: EmailFunnelReport; configured: boolean; message: string };

const inteiro = new Intl.NumberFormat("pt-BR");
const pct = (value: number, casas = 1) => `${value.toFixed(casas).replace(".", ",")}%`;
const diaCurto = (iso: string) => {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
};

export function EmailFunnelPanel() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/email-events?days=30");
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error ?? "Falha ao ler eventos de e-mail.");
        if (!cancelled) {
          setState({ status: "ready", report: body.report, configured: body.configured, message: body.message ?? "" });
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

  const funil = useMemo(() => {
    if (state.status !== "ready") return [];
    const { counts } = state.report;
    return [
      { label: "Enviados", value: counts.sent, helper: "Disparos registrados" },
      { label: "Entregues", value: counts.delivered, helper: "Chegaram na caixa" },
      { label: "Abertos", value: counts.opened, helper: "Pixel: piso, nao verdade" },
      { label: "Clicaram", value: counts.clicked, helper: "Tocaram em algum botao" },
      { label: "Responderam", value: counts.replied, helper: "Resposta na caixa de entrada" },
    ];
  }, [state]);

  if (state.status === "loading") {
    return (
      <div className="editorial-funnel-panel">
        <p className="muted-copy">Lendo eventos do Brevo...</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="editorial-funnel-panel">
        <div className="funnel-section-eyebrow">Funil de e-mail</div>
        <h2>Dados indisponiveis</h2>
        <p className="muted-copy">{state.message}</p>
      </div>
    );
  }

  const { report } = state;
  const { counts, rates, pareto, buttons, daily, recipients, health } = report;
  const maxFunil = Math.max(...funil.map((f) => f.value), 1);

  return (
    <div className="editorial-funnel-panel">
      <div className="editorial-funnel-panel-header">
        <div>
          <div className="funnel-section-eyebrow">Funil de aquisicao</div>
          <h2>E-mail frio</h2>
          <p>{state.message} Resposta e clique sao exatos; abertura e estimativa de pixel.</p>
        </div>
        <div className="funnel-meta-rate">
          <strong>{pct(rates.delivery)}</strong>
          <span>de entrega</span>
        </div>
      </div>

      <div className={`painel-alerta painel-alerta-${health.level}`} role="status">
        <strong>
          {health.level === "ok" ? "Entrega saudavel" : health.level === "atencao" ? "Atencao" : "Critico"}
        </strong>
        <span>{health.message}</span>
      </div>

      {/* Funil: cada passo com quanto sobreviveu do passo anterior. */}
      <div className="painel-passos">
        {funil.map((step, index) => {
          const anterior = index === 0 ? null : funil[index - 1];
          const taxa = anterior && anterior.value > 0 ? (step.value / anterior.value) * 100 : null;
          return (
            <article className="painel-passo" key={step.label}>
              <div className="painel-passo-topo">
                <span>{step.label}</span>
                <strong>{inteiro.format(step.value)}</strong>
              </div>
              <div className="painel-passo-barra">
                <div style={{ width: `${Math.max((step.value / maxFunil) * 100, 1.5)}%` }} />
              </div>
              <small>
                {taxa === null ? step.helper : `${pct(taxa)} do passo anterior · ${step.helper}`}
              </small>
            </article>
          );
        })}
      </div>

      {/* Numeros que decidem se escala. Bounce e spam sao exatos, nao estimativa. */}
      <div className="painel-stat-grid">
        {[
          { label: "Nao abriu", value: counts.notOpened, hint: "Entregue, sem abertura" },
          { label: "Hard bounce", value: counts.hardBounce, hint: "Endereco morto" },
          { label: "Soft bounce", value: counts.softBounce, hint: "Falha temporaria" },
          { label: "Spam", value: counts.spam, hint: "Reclamacao" },
          { label: "Descadastro", value: counts.unsubscribed, hint: "Pediu para sair" },
          { label: "Clique/abertura", value: null, texto: pct(rates.clickToOpen), hint: "Quem leu e agiu" },
        ].map((card) => (
          <article className={card.label === "Hard bounce" && counts.hardBounce > 0 ? "painel-stat alerta" : "painel-stat"} key={card.label}>
            <span>{card.label}</span>
            <strong>{card.texto ?? inteiro.format(card.value ?? 0)}</strong>
            <small>{card.hint}</small>
          </article>
        ))}
      </div>

      <Glossario />

      <div className="painel-charts">
        <ParetoChart slices={pareto} />
        <div className="painel-side-charts">
          <BotoesChart buttons={buttons} clicados={counts.clicked} />
          <RampaChart daily={daily} />
        </div>
      </div>

      <TabelaDestinatarios recipients={recipients} />
    </div>
  );
}

// ---------- Glossario ----------
// Hard e soft bounce parecem a mesma coisa e exigem acao oposta: um mata o
// endereco para sempre, o outro so pede que ele descanse. Sem a legenda na tela,
// a decisao de limpar a base vira chute.
const TERMOS: { termo: string; tipo: string; texto: string }[] = [
  {
    termo: "Hard bounce",
    tipo: "ruim",
    texto: "O endereco NAO existe. O servidor do outro lado respondeu que nao tem ninguem ali. E definitivo: sai da lista para sempre. Insistir e o jeito mais rapido de queimar a reputacao do dominio, porque provedor le isso como lista comprada.",
  },
  {
    termo: "Soft bounce",
    tipo: "morno",
    texto: "Falha TEMPORARIA: caixa cheia, servidor fora do ar ou greylisting. O endereco existe. Nao precisa morrer, so descansar — volta sozinho depois da quarentena de 7 dias.",
  },
  {
    termo: "Spam",
    tipo: "ruim",
    texto: "A pessoa marcou o e-mail como spam. E o pior sinal possivel: acima de 0,1% os provedores comecam a jogar tudo que sai do dominio direto na lixeira.",
  },
  {
    termo: "Entregue",
    tipo: "neutro",
    texto: "Chegou na caixa. Nao diz se foi para a principal ou para a aba de promocoes, e nao diz se foi lido.",
  },
  {
    termo: "Abriu",
    tipo: "bom",
    texto: "O pixel de imagem carregou. E PISO, nao verdade: quem bloqueia imagem nunca conta como aberto, e o proxy do Gmail as vezes conta abertura que nao houve.",
  },
  {
    termo: "Clicou",
    tipo: "bom",
    texto: "Tocou em algum botao. Esse numero e exato. Clique no WhatsApp e o sinal mais quente do funil: e pedido de contato.",
  },
  {
    termo: "Sem evento",
    tipo: "neutro",
    texto: "O Brevo nao devolveu nenhum evento para esse envio, em geral porque o log do plano free tem retencao limitada.",
  },
];

function Glossario() {
  const [aberto, setAberto] = useState(false);

  return (
    <section className="painel-glossario">
      <button aria-expanded={aberto} onClick={() => setAberto((v) => !v)} type="button">
        <span className="funnel-section-eyebrow">O que significa cada status</span>
        <i aria-hidden="true">{aberto ? "−" : "+"}</i>
      </button>
      {aberto ? (
        <dl>
          {TERMOS.map((item) => (
            <div className={`painel-termo tipo-${item.tipo}`} key={item.termo}>
              <dt>{item.termo}</dt>
              <dd>{item.texto}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="muted-copy">
          Hard bounce mata o endereco; soft bounce so pede descanso. Abertura e estimativa, clique e exato. Abrir para ver tudo.
        </p>
      )}
    </section>
  );
}

// ---------- Pareto ----------
// Barras ordenadas da maior perda para a menor, com linha de acumulado e corte em
// 80%. Serve para responder "o que eu conserto primeiro", nao "quanto abriu".
function ParetoChart({ slices }: { slices: EmailFunnelReport["pareto"] }) {
  if (slices.length === 0) {
    return (
      <section className="painel-bloco">
        <div className="funnel-section-eyebrow">Pareto das perdas</div>
        <p className="muted-copy">Sem perdas registradas na janela.</p>
      </section>
    );
  }

  const W = 720;
  const H = 300;
  const M = { top: 24, right: 46, bottom: 78, left: 46 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const maxValor = Math.max(...slices.map((s) => s.value), 1);
  const larguraFaixa = plotW / slices.length;
  const larguraBarra = Math.min(larguraFaixa * 0.56, 72);

  const xCentro = (i: number) => M.left + larguraFaixa * i + larguraFaixa / 2;
  const yBarra = (v: number) => M.top + plotH - (v / maxValor) * plotH;
  const yAcumulado = (p: number) => M.top + plotH - (p / 100) * plotH;

  const linha = slices.map((s, i) => `${xCentro(i)},${yAcumulado(s.cumulative)}`).join(" ");
  // O ponto de corte: primeira fatia que leva o acumulado a 80% ou mais. Tudo dali
  // para tras e o punhado de causas que responde pela maior parte do estrago.
  const corte = slices.findIndex((s) => s.cumulative >= 80);

  return (
    <section className="painel-bloco">
      <div className="funnel-section-eyebrow">Pareto das perdas</div>
      <h3>Onde o funil derrete</h3>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Grafico de Pareto das perdas do funil de e-mail">
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line className="painel-grid" x1={M.left} x2={W - M.right} y1={yAcumulado(tick)} y2={yAcumulado(tick)} />
            <text className="painel-axis" x={W - M.right + 6} y={yAcumulado(tick) + 3}>{tick}%</text>
          </g>
        ))}

        <line className="painel-corte" x1={M.left} x2={W - M.right} y1={yAcumulado(80)} y2={yAcumulado(80)} />
        <text className="painel-corte-label" x={M.left + 4} y={yAcumulado(80) - 6}>corte 80%</text>

        {slices.map((slice, i) => (
          <g key={slice.label}>
            <rect
              className={i <= corte || corte === -1 ? "painel-bar vital" : "painel-bar"}
              x={xCentro(i) - larguraBarra / 2}
              y={yBarra(slice.value)}
              width={larguraBarra}
              height={Math.max(M.top + plotH - yBarra(slice.value), 1)}
              rx={3}
            >
              <title>{`${slice.label}: ${slice.value} (${pct(slice.share)} das perdas)`}</title>
            </rect>
            <text className="painel-bar-value" x={xCentro(i)} y={yBarra(slice.value) - 7}>{slice.value}</text>
            {slice.label.split(" ").reduce<string[][]>((linhas, palavra) => {
              const ultima = linhas[linhas.length - 1];
              if (ultima && (ultima.join(" ") + " " + palavra).length <= 14) ultima.push(palavra);
              else linhas.push([palavra]);
              return linhas;
            }, []).map((linhaTexto, idx) => (
              <text className="painel-axis" key={idx} x={xCentro(i)} y={M.top + plotH + 18 + idx * 12} textAnchor="middle">
                {linhaTexto.join(" ")}
              </text>
            ))}
          </g>
        ))}

        <polyline className="painel-linha-acumulado" points={linha} />
        {slices.map((slice, i) => (
          <circle className="painel-ponto" cx={xCentro(i)} cy={yAcumulado(slice.cumulative)} key={slice.label} r={3.5}>
            <title>{`Acumulado ate aqui: ${pct(slice.cumulative)}`}</title>
          </circle>
        ))}
      </svg>
      <p className="muted-copy">
        {corte >= 0
          ? `${corte + 1} de ${slices.length} causas respondem por ${pct(slices[corte].cumulative)} das perdas: ${slices.slice(0, corte + 1).map((s) => s.label.toLowerCase()).join(", ")}.`
          : "Perdas espalhadas: nenhuma causa isolada domina."}
      </p>
      <ul className="painel-pareto-legenda">
        {slices.map((slice) => (
          <li key={slice.label}>
            <strong>{slice.label}</strong>
            <span>{slice.hint}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- Cliques por botao ----------
// Qual botao foi tocado muda a acao: WhatsApp e pedido de contato, site e curiosidade.
function BotoesChart({ buttons, clicados }: { buttons: EmailFunnelReport["buttons"]; clicados: number }) {
  const max = Math.max(...buttons.map((b) => b.clicks), 1);
  return (
    <section className="painel-bloco">
      <div className="funnel-section-eyebrow">Cliques por botao</div>
      <h3>Qual botao levantou a mao</h3>
      <div className="painel-bar-list">
        {buttons.map((button) => (
          <div className="painel-bar-row" key={button.kind}>
            <span>{button.label}</span>
            <div className="painel-bar-track">
              <div className={`painel-bar-fill kind-${button.kind}`} style={{ width: `${(button.clicks / max) * 100}%` }} />
            </div>
            <strong>{inteiro.format(button.clicks)}</strong>
          </div>
        ))}
      </div>
      <p className="muted-copy">
        {clicados === 0
          ? "Ninguem clicou ainda."
          : `${inteiro.format(clicados)} pessoa(s) clicaram. Clique no WhatsApp e o sinal mais quente do funil.`}
      </p>
    </section>
  );
}

// ---------- Rampa diaria ----------
// Dominio novo sobe volume aos poucos. So dia a dia da para ver se a entrega
// aguenta o proximo degrau.
function RampaChart({ daily }: { daily: EmailFunnelReport["daily"] }) {
  const max = Math.max(...daily.map((d) => d.sent), 1);
  return (
    <section className="painel-bloco">
      <div className="funnel-section-eyebrow">Rampa do dominio</div>
      <h3>Volume por dia</h3>
      <div className="painel-serie">
        {daily.map((dia) => (
          <div className="painel-serie-col" key={dia.day}>
            <div className="painel-serie-bars" title={`${dia.sent} enviados, ${dia.delivered} entregues, ${dia.opened} abertos`}>
              <div className="painel-serie-bar enviados" style={{ height: `${(dia.sent / max) * 100}%` }} />
              <div className="painel-serie-bar entregues" style={{ height: `${(dia.delivered / max) * 100}%` }} />
              <div className="painel-serie-bar abertos" style={{ height: `${(dia.opened / max) * 100}%` }} />
            </div>
            <span>{diaCurto(dia.day)}</span>
            <small>{dia.sent}</small>
          </div>
        ))}
      </div>
      <div className="painel-legenda-inline">
        <span><i className="enviados" />Enviados</span>
        <span><i className="entregues" />Entregues</span>
        <span><i className="abertos" />Abertos</span>
      </div>
    </section>
  );
}

// ---------- Tabela ----------
type Destinatario = EmailFunnelReport["recipients"][number];

const rotuloBotao = (b: ButtonKind) => BUTTON_SHORT_LABELS[b];

const COLUNAS: Coluna<Destinatario>[] = [
  { chave: "empresa", label: "Empresa", render: (r) => r.company || "-" },
  { chave: "email", label: "E-mail", render: (r) => r.email, mono: true },
  { chave: "enviado", label: "Enviado", render: (r) => diaCurto(r.sentAt.slice(0, 10)) },
  { chave: "status", label: "Status", render: (r) => r.status },
  { chave: "botao", label: "Botao", render: (r) => (r.buttons.length ? r.buttons.map(rotuloBotao).join(", ") : "-") },
];

function TabelaDestinatarios({ recipients }: { recipients: Destinatario[] }) {
  const [soProblema, setSoProblema] = useState(false);

  return (
    <PainelTabela
      acao={(reset) => (
        <button
          className={soProblema ? "active" : ""}
          onClick={() => {
            setSoProblema((v) => !v);
            reset();
          }}
          type="button"
        >
          {soProblema ? "Mostrar todos" : "So problemas e nao abertos"}
        </button>
      )}
      chave={(r) => `${r.email}-${r.sentAt}`}
      classeLinha={(r) => (r.problem ? "problema" : r.clicked ? "quente" : "")}
      colunas={COLUNAS}
      eyebrow="Destinatarios"
      filtroExtra={(r) => (soProblema ? Boolean(r.problem) || (!r.opened && !r.openedByProxy) : true)}
      linhas={recipients}
      placeholder="Buscar empresa, e-mail ou status..."
      textoBusca={recipientSearchText}
      titulo="Um por um"
      vazio="Nenhum destinatario neste filtro."
    />
  );
}
