# Story 018 - CTA OStrack nas paginas de diagnostico

## Status
Ready for Review

## Story
Como Erick, quero um botao chamativo nas paginas de diagnostico geradas (huberick-temp) divulgando a pagina de vendas do OStrack, para transformar cada diagnostico enviado em canal organico de aquisicao de usuarios do SaaS.

## Contexto
Pedido do Erick (07/07/2026): "oportunidade de ja na pagina que geramos o diagnostico, divulgar com um botao chamativo a pagina de vendas do OStrack; conseguimos usuarios de forma organica e ja se inicia uma bela divulgacao".

- As ~943 paginas de diagnostico vivem em `huberick-temp/` e sao copiadas para `public/huberick-temp/` pelo `scripts/build.js`, que JA injeta snippet de tracking (pixel) em cada uma. O CTA deve ser injetado pelo MESMO mecanismo (nunca editar paginas uma a uma).
- Publico das paginas: empresas industriais (recuperadoras, usinagem, caldeiraria etc.) - exatamente o ICP do OStrack.
- Alerta do Finch (Parecer_Finch_Funil_SaaS): trilhos PME e industrial nao se cruzam. O CTA nao pode canibalizar a oferta primaria da pagina (o diagnostico/LP). Posicao: bloco secundario no fim do diagnostico, chamativo mas claramente separado ("Conhece o OStrack? O sistema que usamos para gestao de OS industrial").
- Rastreio: o `diagnostico-pixel.js` ja rastreia eventos das paginas (DiagnosticoView, DiagnosticoWhatsAppClick...). O clique no CTA deve virar evento proprio.

## Acceptance Criteria
- [x] `scripts/build.js` injeta em cada pagina de diagnostico um bloco CTA do OStrack: visual chamativo coerente com a pagina, texto curto de prova ("o sistema de OS que roda na industria" ou equivalente aprovado), botao para a pagina de vendas do OStrack.
- [x] URL do OStrack: default `https://o-strackpagina.vercel.app/` (informada pelo Erick em 08/07/2026; URL publica, nao e segredo - pode ser constante no codigo), com override opcional por env `OSTRACK_SALES_URL`. Link sai com UTM (`utm_source=diagnostico&utm_medium=cta&utm_campaign=crm-erick`).
- [x] Clique no CTA registra evento proprio no tracker existente (`DiagnosticoOStrackClick`) e aparece na agregacao do funil (pixel_events) sem quebrar o resumo atual.
- [x] Bloco posicionado apos o conteudo principal do diagnostico (nao compete com o CTA primario de WhatsApp). Mobile-friendly.
- [x] `npm run build` regenera as paginas com o CTA; amostra de 3 paginas verificada no Dev Agent Record. Lint + build passam.

## Tasks / Subtasks
- [x] Definir o HTML/CSS do bloco (inline, autossuficiente, sem dependencia externa).
- [x] Injecao no `build.js` junto do snippet de tracking existente.
- [x] Evento `DiagnosticoOStrackClick` no `public/diagnostico-pixel.js` + mapeamento no resumo do funil se aplicavel.
- [x] Env `OSTRACK_SALES_URL` (documentar no `.env.example`; valor real o Erick informa).
- [x] Build + verificacao de amostra.

## Dependencias
- Nenhuma story bloqueante. URL da pagina de vendas do OStrack: `https://o-strackpagina.vercel.app/` (confirmada pelo Erick em 08/07/2026).

## Riscos
- Canibalizacao do CTA primario: mitigado pela posicao secundaria e texto de prova (nao oferta agressiva).
- Paginas ja enviadas a leads so ganham o CTA no proximo build+deploy.

## Dev Agent Record

### Agent Model Used
GPT-5 Codex (Dex/dev)

### Debug Log References
- `npm.cmd run verify:ostrack-cta` - RED inicial falhou por ausencia de `OSTRACK_SALES_URL`; GREEN final passou validando 3 paginas.
- `node scripts\build.js` - regenerou 943 paginas em `public/huberick-temp`.
- `npm.cmd run lint` - passou.
- `npx.cmd tsc --noEmit` - passou.
- `npm.cmd run build` - passou; Next compilou 31 rotas.
- `npm.cmd test` - falhou porque nao existe script `test` no `package.json`.

### Completion Notes List
- CTA OStrack injetado de forma idempotente em todas as paginas geradas de diagnostico, antes do WhatsApp flutuante e apos o conteudo principal.
- URL default `https://o-strackpagina.vercel.app/` com override `OSTRACK_SALES_URL` e UTM `utm_source=diagnostico&utm_medium=cta&utm_campaign=crm-erick`.
- Pixel reconhece `data-diagnostico-event="DiagnosticoOStrackClick"` e o resumo do funil expõe `ostrackClicks`.
- Amostras verificadas: `24-horas-inversores-manutencao-industrial.html`, `24horas-eletricista-industrial-residencial.html`, `3n-eletrica-solucoes-em-eletrica-e-automacao.html`.

### File List
- `.env.example`
- `package.json`
- `public/diagnostico-pixel.js`
- `scripts/build.js`
- `scripts/migrations/001_pixel_events.sql`
- `scripts/verify-ostrack-cta.js`
- `src/app/api/facebook-pixel/route.ts`
- `src/app/funil/page.tsx`

## Change Log
- 2026-07-07: Story criada por Orion (aios-master) a partir do pedido do Erick (CTA OStrack no diagnostico como aquisicao organica do SaaS).
- 2026-07-08: Implementada por Dex/dev; CTA OStrack injetado no build, evento `DiagnosticoOStrackClick` agregado e gates principais executados. Status Ready for Review.

## QA Results

### Review Date: 2026-07-08
### Reviewed By: Quinn (QA)
### Gate Decision: PASS

#### Evidence
- `npm.cmd run verify:ostrack-cta` passou com 3 amostras geradas.
- `npm.cmd run lint` passou.
- `npx.cmd tsc --noEmit` passou.
- `npm.cmd run build` passou e regenerou 943 paginas.
- `npm.cmd test` nao executa por ausencia de script `test` no `package.json`.
- CodeRabbit nao executado: WSL nao esta configurado neste ambiente.

#### Notes
- Evento `DiagnosticoOStrackClick` usa atributo explicito e nao mistura clique OStrack com WhatsApp.
- `ostrackClicks` foi adicionado ao resumo sem remover metricas existentes.
