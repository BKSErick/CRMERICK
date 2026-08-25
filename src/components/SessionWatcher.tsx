"use client";

import { useEffect } from "react";

// O middleware (src/proxy.ts:23) devolve 401 em /api/* quando a sessao expira, e NENHUMA tela
// do CRM tratava isso. Cada componente engolia a falha do seu jeito: lista vazia aqui, erro
// generico ali, KPI zerado acolá. O CRM inteiro parecia quebrado quando o problema era so o
// cookie vencido. Esta e a explicacao mais provavel do "esta tudo bugado".
//
// Em vez de reescrever as dezenas de chamadas espalhadas, o tratamento fica num lugar so:
// a primeira resposta 401 de uma rota /api/ leva pro /login preservando a pagina atual.

const JA_INSTALADO = Symbol.for("crm.sessionWatcher");

function caminhoDaRequisicao(input: RequestInfo | URL): URL | null {
  try {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return new URL(href, window.location.origin);
  } catch {
    return null;
  }
}

export function SessionWatcher() {
  useEffect(() => {
    const janela = window as unknown as Record<symbol, boolean>;
    // StrictMode monta duas vezes em dev: sem a trava, o fetch seria embrulhado em cascata.
    if (janela[JA_INSTALADO]) return;
    janela[JA_INSTALADO] = true;

    const fetchOriginal = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await fetchOriginal(input, init);
      if (response.status !== 401) return response;

      const url = caminhoDaRequisicao(input);
      const ehApiDoCrm = url?.origin === window.location.origin && url.pathname.startsWith("/api/");
      // /api/auth/* responde 401 com senha errada: quem trata isso e o proprio formulario.
      const ehFluxoDeLogin = url?.pathname.startsWith("/api/auth/") || window.location.pathname === "/login";

      if (ehApiDoCrm && !ehFluxoDeLogin) {
        const destino = `${window.location.pathname}${window.location.search}`;
        window.location.href = `/login?next=${encodeURIComponent(destino)}`;
      }
      return response;
    };
  }, []);

  return null;
}
