# Plano de implementacao - Subnavegacao de Funis

## Tarefa 1: Criar contrato RED da navegacao

**Arquivos:** `tests/funnel-navigation.test.ts`, `package.json`

**Objetivo:** Provar que as abas reais, a hierarquia lateral e a composicao das
cinco paginas ainda nao existem.

**Codigo:** Testes devem exigir exatamente `Visao geral`, `Analises`, `Sinais`,
`Achados` e `Lab`; verificar que os quatro filhos nao sao renderizados na
Sidebar; e confirmar `FunnelSubnav` nas cinco rotas.

**Verificacao:**
`node --test tests/funnel-navigation.test.ts` falha pelos motivos esperados.

## Tarefa 2: Modelar a hierarquia de navegacao

**Arquivo:** `src/lib/navigation.ts`

**Objetivo:** Preservar as rotas/titulos dos quatro modulos, marcando-os como
filhos ocultos de `Funis`, e expor uma funcao deterministica de estado ativo.

**Codigo:** Adicionar metadados opcionais `sidebar` e `parentModule`; marcar os
quatro filhos; criar helper que considera a rota atual e seus filhos.

**Verificacao:** Teste focado confirma que `Funis` fica ativo nas cinco rotas.

## Tarefa 3: Construir a subnavegacao compartilhada

**Arquivos:** `src/components/FunnelSubnav.tsx`, `src/app/globals.css`

**Objetivo:** Transformar os controles decorativos em links acessiveis e
responsivos, com estado ativo derivado da rota.

**Codigo:** Componente client com `Link`, `usePathname`, `aria-current="page"` e
as cinco rotas aprovadas; adaptar `.funnel-tabs` para estilizar links.

**Verificacao:** Teste focado encontra todos os destinos e semantica ativa.

## Tarefa 4: Integrar nas cinco superficies

**Arquivos:** `src/app/funil/page.tsx`, `src/app/analise/page.tsx`,
`src/app/sinais/page.tsx`, `src/app/insights/page.tsx`, `src/app/lab/page.tsx`

**Objetivo:** Exibir a navegacao compartilhada em todas as rotas e retirar os
quatro botoes sem comportamento da Visao geral.

**Codigo:** Importar/renderizar `FunnelSubnav`; na Visao geral, manter logo
abaixo dela o filtro de fontes existente.

**Verificacao:** Teste focado passa e busca nao encontra os rotulos decorativos.

## Tarefa 5: Ajustar Sidebar e fechar gates

**Arquivos:** `src/components/Sidebar.tsx`,
`docs/stories/story-039-modulos-dentro-de-funis.md`

**Objetivo:** Ocultar os filhos, manter `Funis` ativo e registrar a entrega.

**Codigo:** Filtrar itens com `sidebar !== false` e usar o helper central de
estado ativo.

**Verificacao:** `npm run lint`, `npm run typecheck`, `npm test`,
`npm run build` e `git diff --check` passam; checklist e File List atualizados.
