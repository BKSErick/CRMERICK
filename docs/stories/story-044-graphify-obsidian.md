# Story 044 — Mapa Graphify no Obsidian Mind

## Objetivo

Gerar um mapa arquitetural local e consultável do CRM ERICK com Graphify, preservando dados pessoais, credenciais, artefatos operacionais e trabalho preexistente, com visualização dedicada no Obsidian Mind.

## Acceptance Criteria

- [x] O corpus exclui credenciais, dados de leads, históricos de conversa, lotes, logs, caches e artefatos gerados.
- [x] O grafo é gerado somente de código e SQL, sem uso de LLM.
- [x] O `CLAUDE.md` e as regras operacionais do CRM permanecem inalterados.
- [x] `graph.json`, `graph.html` e `GRAPH_REPORT.md` são produzidos em `graphify-out/`.
- [x] Notas e Canvas são exportados para `Obsidian/obsidian-mind/Projetos/CRM ERICK`.
- [x] Consultas validam contratos, demandas, funil, Supabase e integrações comerciais.
- [x] O trabalho preexistente em `scratchpad/varredura-duplicados.mjs` permanece intocado.

## Rollback

Remover `.graphifyignore`, `graphify-out/`, esta story e a pasta `Projetos/CRM ERICK` no Obsidian Mind.

## File List

- `.graphifyignore`
- `docs/stories/story-044-graphify-obsidian.md`
- `graphify-out/`
- `D:/01 -Arquivos/Obsidian/obsidian-mind/Projetos/CRM ERICK/`

## Validation Evidence

- Graphify `0.9.53` com parser SQL, sem integração persistente com Codex ou Claude.
- Extração `--code-only`: 378 arquivos de código, 92 arquivos não-código ignorados e zero tokens de LLM.
- Grafo final: 3.152 nós, 6.012 relações e 247 comunidades.
- Exportação: 3.399 notas e `graph.canvas` no Obsidian Mind.
- Consultas localizaram relações entre `ClientWorkspace`, contratos, PDF, `getCrmSupabaseAdmin`, demandas, funil, deals, Resend, Uazapi e `supabaseRest`.
- Busca por caminhos sensíveis no grafo: zero ocorrências.
- `CLAUDE.md` e `scratchpad/varredura-duplicados.mjs` permaneceram inalterados.
