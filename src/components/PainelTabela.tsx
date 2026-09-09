"use client";

import { useMemo, useState, type ReactNode } from "react";
import { matchesSearch, paginate } from "@/lib/tablePaging";

// Tabela com busca e paginacao dos paineis dos Funis. Uma implementacao so para a
// aba de e-mail e a do Google: filtrar, resetar a pagina e formatar o rodape sao
// exatamente o mesmo problema nas duas.

export type Coluna<T> = {
  chave: string;
  label: string;
  render: (linha: T) => ReactNode;
  mono?: boolean;
};

type Props<T> = {
  eyebrow: string;
  titulo: string;
  linhas: T[];
  colunas: Coluna<T>[];
  /** Texto que a busca procura — em geral o que a linha mostra na tela. */
  textoBusca: (linha: T) => string;
  chave: (linha: T) => string;
  classeLinha?: (linha: T) => string;
  /**
   * Filtro extra do painel (ex.: "so problemas"), renderizado ao lado da busca.
   * Recebe `reset` porque ligar um filtro encurta a lista: sem voltar ao inicio,
   * quem estava na pagina 3 veria a ultima pagina do novo recorte, nao o comeco.
   */
  acao?: (reset: () => void) => ReactNode;
  /** Filtro extra ja aplicado antes da busca. */
  filtroExtra?: (linha: T) => boolean;
  porPagina?: number;
  placeholder?: string;
  vazio?: string;
  rodape?: ReactNode;
};

const inteiro = new Intl.NumberFormat("pt-BR");

export function PainelTabela<T>({
  eyebrow,
  titulo,
  linhas,
  colunas,
  textoBusca,
  chave,
  classeLinha,
  acao,
  filtroExtra,
  porPagina = 12,
  placeholder = "Buscar...",
  vazio = "Nada aqui neste filtro.",
  rodape,
}: Props<T>) {
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);

  const filtradas = useMemo(
    () => linhas.filter((linha) => (filtroExtra ? filtroExtra(linha) : true) && matchesSearch(textoBusca(linha), busca)),
    [linhas, busca, filtroExtra, textoBusca],
  );

  const { items, page, totalPages, from, to, total } = paginate(filtradas, pagina, porPagina);

  return (
    <section className="painel-bloco painel-tabela-bloco">
      <div className="painel-tabela-header">
        <div>
          <div className="funnel-section-eyebrow">{eyebrow}</div>
          <h3>{titulo}</h3>
        </div>
        <div className="painel-tabela-acoes">
          <input
            aria-label={`Buscar em ${titulo}`}
            className="painel-busca"
            onChange={(event) => {
              setBusca(event.target.value);
              setPagina(1);
            }}
            placeholder={placeholder}
            type="search"
            value={busca}
          />
          {acao?.(() => setPagina(1))}
        </div>
      </div>

      <table className="painel-tabela">
        <thead>
          <tr>
            {colunas.map((coluna) => (
              <th key={coluna.chave}>{coluna.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((linha) => (
            <tr className={classeLinha?.(linha) ?? ""} key={chave(linha)}>
              {colunas.map((coluna) => (
                <td className={coluna.mono ? "painel-mono" : undefined} key={coluna.chave}>
                  {coluna.render(linha)}
                </td>
              ))}
            </tr>
          ))}
          {items.length === 0 ? (
            <tr>
              <td colSpan={colunas.length}>{busca.trim() ? `Nada encontrado para "${busca.trim()}".` : vazio}</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <div className="painel-paginacao">
        <span>
          {total === 0 ? "0 linhas" : `${inteiro.format(from + 1)}-${inteiro.format(to)} de ${inteiro.format(total)}`}
          {total !== linhas.length ? ` (${inteiro.format(linhas.length)} no total)` : ""}
        </span>
        <div className="painel-paginacao-botoes">
          <button disabled={page <= 1} onClick={() => setPagina(page - 1)} type="button">
            Anterior
          </button>
          <strong>
            {page} / {totalPages}
          </strong>
          <button disabled={page >= totalPages} onClick={() => setPagina(page + 1)} type="button">
            Proxima
          </button>
        </div>
      </div>
      {rodape}
    </section>
  );
}
