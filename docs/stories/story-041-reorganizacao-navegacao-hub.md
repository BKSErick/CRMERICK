# Story 041 — Reorganizacao da navegacao do Hub

**Status:** Ready for Review
**Data:** 2026-08-27
**Origem:** pedido direto do Erick olhando o hub em producao.

## Contexto

O menu acumulou aba que ninguem abre e o cockpit acumulou bloco que ninguem le. Quatro
cortes pedidos, mais uma troca: o Inicio, que ate aqui mostrava o "Mapa de migracao"
(andaime da conversao HTML->React, ja concluida), passa a ser a dashboard geral.

## Acceptance Criteria

- [x] Aba **Brain** removida do sidebar; rota `/brain`, `content/brain.json` e a geracao
      do brain no `sync-vault-content.mjs` apagados. Build nao lista mais `/brain`.
- [x] **Sala de Comando** sai do sidebar e vira subaba da **Lista** (`parentModule: "lista"`,
      `sidebar: false`). Navegar entre `/lista` e `/comando` mantem **Lista** ativa no menu.
- [x] Subnavegacao compartilhada: `Subnav` generico + `FunnelSubnav` (Funis) e
      `ListaSubnav` (Deals / Sala de Comando), reusando o CSS `.funnel-tabs` existente.
- [x] Bloco **"Automacoes recentes"** removido da Sala de Comando (tela + payload da
      rota `/api/comando`). `?view=automation_rules` intacto, que e o que Configuracoes usa.
- [x] Bloco **"Bola com voce"** removido nos dois lugares: card do Placar do dia e tabela.
      O calculo saiu de `/api/comando` junto (uma query de `deals` a menos por abertura).
- [x] **Inicio** com KPIs mais uteis: `Conversao geral` (0,2%, diluida pela base fria de
      ~1,4k leads) trocada por **Proposta -> ganho**; somados **Ganhos no mes** e
      **Ticket medio**.
- [x] **Inicio** com 4 graficos em SVG/CSS puro, sem dependencia nova: Funil por etapa,
      Origem dos leads, Fechamentos por mes e Leads entrando por mes.
- [x] Nenhum grafico desenha serie inventada: sem dado no periodo, sai texto de vazio.
- [x] **Configuracoes** mostra a contagem de automacoes que falharam nos ultimos 7 dias,
      substituindo a superficie que o feed removido tinha.

## Decisoes

- **Sem lib de chart.** O app roda com React + globals.css; `recharts` traria ~100kb e um
  tema fora do padrao pra desenhar barra e coluna. `src/components/Charts.tsx` faz isso
  em SVG e CSS.
- **`createdAt` passou a ser mapeado** em `mapDealFromRow`. A rota ja fazia `select("*")`,
  o dado so nao estava sendo lido — mudanca aditiva, nada mais no app depende dela.
- **Conversao de proposta em vez de conversao geral.** A geral divide os ganhos pela base
  inteira e nao se move quando a operacao melhora; a de proposta responde "de quem chegou
  a receber proposta, quanto fecha".
- **Falha de automacao continua visivel.** Com o card fora, um `automation_event_failed`
  ficaria sem superficie nenhuma no app. `?view=automation_rules` passou a devolver
  tambem a contagem de falhas dos ultimos 7 dias, e Configuracoes mostra o aviso ao lado
  das regras — que e onde se age sobre isso. Janela de 7 dias porque falha de duas
  semanas atras nao e mais acionavel.

## File List

**Navegacao**
- `src/lib/navigation.ts` (Brain removido; comando vira filho de lista)
- `src/components/Subnav.tsx` (novo)
- `src/components/ListaSubnav.tsx` (novo)
- `src/components/FunnelSubnav.tsx` (delega pro Subnav)
- `src/app/lista/page.tsx` (+ ListaSubnav)

**Sala de Comando**
- `src/app/comando/page.tsx` (+ ListaSubnav; -Automacoes recentes; -Bola com voce)
- `src/app/api/comando/route.ts` (-bolaComVoce, -automationAlerts, -inboundByDeal;
  +contagem de falhas no `?view=automation_rules`)
- `src/app/configuracoes/page.tsx` (+aviso de automacoes que falharam em 7 dias)

**Brain**
- `src/app/brain/page.tsx` (deletado)
- `content/brain.json` (deletado)
- `scripts/sync-vault-content.mjs` (geracao do brain removida)
- `src/app/carteira/page.tsx` (comentario que citava /brain)

**Inicio / graficos**
- `src/app/page.tsx` (KPIs + 4 graficos no lugar do Mapa de migracao)
- `src/components/Charts.tsx` (novo: BarList, ColumnChart)
- `src/app/globals.css` (estilos dos graficos)
- `src/lib/crmRecords.ts` (`createdAt` no Deal e no mapDealFromRow)

**Testes**
- `tests/commercial-automation.test.ts` (asserção do feed na Sala de Comando removida)
- `tests/funnel-navigation.test.ts` (asserções de render migradas pro Subnav.tsx)

## Validacao

- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm test`: PASS — 280 testes, 0 falhas
- `npm run build`: PASS — `/brain` fora da lista de rotas; `/comando` e `/lista` seguem
  prerenderizadas

Falta: conferencia visual no localhost pelo Erick antes de qualquer deploy.
