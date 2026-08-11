# Plano de implementacao - Razoes de perda

1. Escrever testes RED para catalogo, validacao, agregacao, transicao e CLI.
2. Implementar dominio puro e tipos de razao/historico.
3. Criar migration aditiva com tabela, indices, RLS e funcoes transacionais.
4. Integrar o servico a `/api/deals` e remover auditoria client-side duplicada.
5. Mapear snapshot no `crmRecords` e capturar/corrigir no Pipeline.
6. Agregar perdas em `/api/funnel`, Funis e no resumo deterministico de Achados.
7. Expor o motivo no forecast e criar CLI read-only com filtros de periodo.
8. Rodar testes focados, regressao, CodeRabbit, lint, typecheck e build.
