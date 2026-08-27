"use client";

// Graficos do Inicio. SVG e CSS na mao, sem biblioteca: o app inteiro roda com React +
// globals.css e nao vale carregar uma lib de chart pra desenhar barra.
//
// REGRA DE DADO (mesma do resto do CRM): nada de serie inventada. Sem dado no periodo, o
// componente escreve que nao ha dado -- nunca desenha zero como se fosse medicao.

export type ChartPoint = { label: string; value: number; hint?: string };

function EmptyChart({ message }: { message: string }) {
  return <p className="chart-empty">{message}</p>;
}

// Barras horizontais. Usa a maior barra como escala, entao serve tanto pra contagem
// (funil por etapa) quanto pra dinheiro (origem por receita).
export function BarList({
  data,
  emptyMessage,
  formatValue,
}: {
  data: readonly ChartPoint[];
  emptyMessage: string;
  formatValue?: (value: number) => string;
}) {
  const points = data.filter((point) => Number.isFinite(point.value));
  const max = Math.max(...points.map((point) => point.value), 0);
  if (points.length === 0 || max <= 0) return <EmptyChart message={emptyMessage} />;

  const format = formatValue ?? ((value: number) => value.toLocaleString("pt-BR"));

  return (
    <ul className="bar-list">
      {points.map((point) => (
        <li className="bar-list-row" key={point.label}>
          <span className="bar-list-label" title={point.label}>
            {point.label}
          </span>
          <span className="bar-list-track">
            <span className="bar-list-fill" style={{ width: `${Math.max((point.value / max) * 100, 1.5)}%` }} />
          </span>
          <span className="bar-list-value">
            {format(point.value)}
            {point.hint ? <em className="bar-list-hint">{point.hint}</em> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

// Colunas verticais pra serie temporal. viewBox fixo e escala uniforme (width:100% +
// height:auto no CSS): acompanha a largura do card sem recalcular nada em JS e sem
// distorcer os rotulos.
const CHART_WIDTH = 360;
const CHART_HEIGHT = 132;
const PLOT_TOP = 18;
const PLOT_BOTTOM = 104;

export function ColumnChart({
  data,
  emptyMessage,
  formatValue,
  title,
}: {
  data: readonly ChartPoint[];
  emptyMessage: string;
  formatValue?: (value: number) => string;
  title: string;
}) {
  const points = data.filter((point) => Number.isFinite(point.value));
  const max = Math.max(...points.map((point) => point.value), 0);
  if (points.length === 0 || max <= 0) return <EmptyChart message={emptyMessage} />;

  const format = formatValue ?? ((value: number) => value.toLocaleString("pt-BR"));
  const slot = CHART_WIDTH / points.length;
  const barWidth = Math.min(slot * 0.56, 38);
  const plotHeight = PLOT_BOTTOM - PLOT_TOP;

  return (
    <svg
      aria-label={`${title}: ${points.map((p) => `${p.label} ${format(p.value)}`).join(", ")}`}
      className="column-chart"
      role="img"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
    >
      <line className="column-chart-axis" x1={0} x2={CHART_WIDTH} y1={PLOT_BOTTOM} y2={PLOT_BOTTOM} />
      {points.map((point, index) => {
        const center = slot * index + slot / 2;
        // Altura minima de 2px pra um mes com valor baixo nao virar barra invisivel --
        // e diferente de "sem dado", que ja saiu no EmptyChart acima.
        const height = Math.max((point.value / max) * plotHeight, 2);
        return (
          <g key={point.label}>
            <rect
              className="column-chart-bar"
              height={height}
              rx={3}
              width={barWidth}
              x={center - barWidth / 2}
              y={PLOT_BOTTOM - height}
            />
            <text className="column-chart-value" textAnchor="middle" x={center} y={PLOT_BOTTOM - height - 5}>
              {format(point.value)}
            </text>
            <text className="column-chart-label" textAnchor="middle" x={center} y={CHART_HEIGHT - 8}>
              {point.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
