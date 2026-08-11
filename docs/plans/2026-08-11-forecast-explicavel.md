# Plano de implementacao - Forecast comercial explicavel

1. Criar testes RED para rubrica, calculo individual, agregacao e CLI.
2. Implementar `dealForecast.mjs` e declaracoes TypeScript com formula pura,
   versao, confianca, explicacoes e separacao previsto/realizado.
3. Implementar servico server-side paginado e CLI read-only com filtros.
4. Estender `/api/funnel` com resumo e detalhe por deal.
5. Estender `/api/comando` com risco, falta de proxima acao e deals do periodo.
6. Mostrar os dados em Funis, Comando e no overlay do Pipeline sem nova aba.
7. Rodar testes focados, regressao, CodeRabbit, lint, typecheck e build.
