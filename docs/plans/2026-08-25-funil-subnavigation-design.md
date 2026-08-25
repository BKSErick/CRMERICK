# Design - Modulos operacionais dentro de Funis

## Status

Aprovado pelo Erick em 2026-08-25.

## Problema

A pagina `/funil` mostra quatro abas decorativas sem comportamento, enquanto
`Analise`, `Sinais`, `Achados` e `Lab` ocupam entradas independentes na barra
lateral. Essa duplicidade fragmenta a leitura do ciclo comercial.

## Solucao aprovada

- Manter `Funis` na barra lateral e remover dela apenas `Analise`, `Sinais`,
  `Achados` e `Lab`.
- Substituir as quatro abas decorativas por cinco abas reais: `Visao geral`,
  `Analises`, `Sinais`, `Achados` e `Lab`.
- `Visao geral` preserva integralmente o painel atual de `/funil`, inclusive os
  filtros `Consolidado`, `Pipeline`, `Instagram`, `Facebook Pixel` e
  `Google Analytics`.
- Preservar as rotas existentes (`/analise`, `/sinais`, `/insights`, `/lab`) para
  nao quebrar favoritos, links internos ou acessos diretos.
- Exibir a mesma subnavegacao nas cinco rotas e manter `Funis` destacado na
  lateral quando qualquer rota filha estiver aberta.

## Arquitetura

Um componente `FunnelSubnav` concentra rotulos, destinos e estado ativo. A
configuracao principal continua em `src/lib/navigation.ts`: os quatro modulos
permanecem registrados para titulo e roteamento, mas recebem metadados de filho
de `funil` e ficam ocultos apenas na Sidebar.

## Fora de escopo

- Migrar URLs para `/funil/*`.
- Alterar dados, APIs ou conteudo interno dos cinco modulos.
- Alterar os filtros de fonte da Visao geral.
- Publicar ou fazer deploy.

## Validacao

- Teste de contrato para rotulos, destinos, ocultacao lateral e estado ativo.
- Lint, typecheck, suite completa, build e `git diff --check`.
