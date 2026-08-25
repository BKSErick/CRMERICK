# Design - Lista operacional de deals

## Objetivo

Adicionar uma rota `/lista` para consultar os mesmos deals do Pipeline em uma
tabela densa, sem duplicar o detalhe do deal nem criar uma segunda fonte de dados.

## Decisoes aprovadas

- `/pipeline` continua sendo o Kanban e `/lista` vira uma entrada propria logo
  depois dele na navegacao.
- A Lista consome `/api/crm-data` e o mesmo `useCRMStore` do Pipeline; nao ha API,
  migration ou cache novo.
- Colunas: deal/empresa, etapa, responsavel, valor, saude, proxima acao e ultima
  atualizacao.
- Busca textual e filtros por etapa e responsavel podem ser combinados.
- A ordenacao e explicita por proxima acao, atualizacao, valor, saude ou empresa.
- A paginacao e client-side, com 50 linhas por pagina, para nao montar centenas de
  elementos no DOM.
- Clicar em uma linha abre `DealDetailOverlay`, extraido do Pipeline e compartilhado
  entre as duas rotas. `?dealId=` abre o mesmo detalhe por deep link.
- Toda mudanca de etapa usa `updateDealStage`; entrar em `lost` continua exigindo o
  dialogo de motivo da perda.
- Excluir e editar pelo overlay atualiza a mesma store e reflete na tabela.
- Estados de carregamento, vazio, erro e ausencia de proxima acao ficam visiveis.

## Estrutura

1. `src/lib/dealList.ts` concentra filtro, ordenacao e paginacao deterministas.
2. `src/app/lista/page.tsx` concentra carregamento, estado da tela e abertura do
   overlay compartilhado.
3. `src/components/DealDetailOverlay.tsx` e `src/lib/dealPresentation.ts` recebem a
   extracao ja iniciada, sem alteracao funcional do Pipeline.
4. `src/lib/navigation.ts`, `src/components/Sidebar.tsx` e `src/app/globals.css`
   recebem apenas navegacao e estilos da nova superficie.

## Verificacao

- RED/GREEN para filtro, ordenacao e paginacao.
- Teste de contrato da UI para rota, navegacao, overlay compartilhado e gate de
  perda.
- `npm run lint`, `npm run typecheck`, `npm test` e `npm run build`.
