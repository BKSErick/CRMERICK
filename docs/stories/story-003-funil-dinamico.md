# Story 003 - Funil dinamico em React

## Status
Ready for Dev

## Story
Como Erick, quero ver o funil de aquisicao calculado a partir dos deals reais e das metricas do Instagram, para eliminar os numeros estaticos da tela de Funis.

## Acceptance Criteria
- [x] A rota `/funil` deixa de ser placeholder.
- [x] O funil calcula leads, conversas, propostas e vendas a partir da store de deals.
- [x] O alcance tenta usar `/api/instagram` e cai para fallback visivel quando nao houver credenciais.
- [x] A tela exibe taxa de conversao e gargalos derivados dos dados atuais.
- [x] O HTML legado permanece intacto.
- [x] Quality gates aplicaveis passam.

## Tasks / Subtasks
- [x] Criar pagina React para `/funil`.
- [x] Reaproveitar store Zustand para contagens por etapa.
- [x] Expandir API Instagram com metrica de alcance 30d.
- [x] Atualizar navegacao para marcar Funis como migrado.
- [x] Executar lint e build.

## Dev Agent Record

### Agent Model Used
GPT-5 Codex

### Debug Log References
- `npm.cmd run lint`
- `npm.cmd run build`
- `Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/funil`
- `Invoke-RestMethod -Uri http://127.0.0.1:3000/api/facebook-pixel`
- `Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/huberick-temp/24-horas-inversores-manutencao-industrial.html`

### Completion Notes List
- Funil usa Supabase/store quando os deals reais forem conectados.
- Enquanto Instagram nao estiver configurado, a tela informa fallback em vez de falhar silenciosamente.
- Direcao visual do CRM: sidebar operacional escura e conteudo em formato editorial/relatorio, com leitura analitica e graficos simples em vez de dashboard generico de cards.
- Funis agora possui filtro de fonte: Consolidado, Pipeline, Instagram e Facebook Pixel.
- Facebook Pixel/CAPI aceita `META_API_TOKEN`, `META_DATASET_ID` ou `NEXT_PUBLIC_META_PIXEL_ID`; sem env, a API retorna fallback explicito.
- Build copia 943 paginas de diagnostico para `public/huberick-temp` e injeta `/diagnostico-pixel.js` para eventos de abertura e cliques.

### File List
- `docs/stories/story-003-funil-dinamico.md`
- `public/diagnostico-pixel.js`
- `scripts/build.js`
- `src/app/api/facebook-pixel/route.ts`
- `src/app/api/instagram/route.ts`
- `src/app/funil/page.tsx`
- `src/app/globals.css`
- `src/lib/navigation.ts`

### Change Log
- 2026-07-06: Migrada rota Funis para React com calculo dinamico por etapa.
- 2026-07-06: Recomposta tela Funis no modelo editorial/relatorio e adicionada base de tracking Facebook Pixel/CAPI para paginas de diagnostico.
