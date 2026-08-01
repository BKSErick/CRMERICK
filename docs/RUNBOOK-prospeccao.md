# Runbook: puxar leads e prospectar (CRM ERICK)

Pipeline completo, na ordem. Todo script é **dry-run por padrão**; só grava/dispara com `--go`.

Rodar sempre de `D:\001Gravity\CRM ERICK`.

---

## 1. Puxar leads de uma cidade

```bash
node scripts/pull-city-serper.mjs --cidade="Joao Monlevade" --uf=MG        # ver o que entraria
node scripts/pull-city-serper.mjs --cidade="Joao Monlevade" --uf=MG --go   # importar
```

Puxa do Google Maps via Serper. **As chaves ficam no `.env.local` do Garimpo** (`SERPER_API_KEYS`, em `D:\001Gravity\Garimpo SAAS NOVO`), não no `.env` do CRM. O script lê de lá sozinho.

O lead entra com cidade, UF, nota, avaliações, `maps_cid`, WhatsApp publicado no site, segmento canônico e score com lookalike.

Opções: `--queries="usinagem,solda"` troca os nichos, `--paginas=3` vai mais fundo, `--limit=N` limita, `--sem-enrich` pula a visita aos sites.

Alternativa, quando o lead já está no Garimpo:

```bash
node scripts/import-garimpo-leads.mjs --cidade="Ipatinga" --go
```

## 2. Confirmar quem atende no WhatsApp

```bash
node scripts/uazapi-check-numbers.mjs --go
```

Pergunta à Uazapi quais números existem no WhatsApp, testando com e sem o nono dígito. **Fixo não é descarte**: metade dos fixos de indústria pequena atende. Exige a instância conectada.

## 3. Gerar a copy

```bash
node scripts/generate-copies-db.mjs --cidade="Joao Monlevade"        # ver
node scripts/generate-copies-db.mjs --cidade="Joao Monlevade" --go   # gravar
```

Gera direto do banco, para lead sem página de auditoria. Não sobrescreve copy existente sem `--force`.

Lead de **João Monlevade** recebe a variante local automaticamente: abertura "de Monlevade mesmo" e CTA nomeando Jotta ou Metalthec, que são cases reais da cidade.

Para os leads antigos, que têm página em `huberick-temp`, o gerador é o `regenerate-copies.js` (escreve arquivos `_copy.txt`). A doutrina de texto é a mesma nos dois: eles compartilham o `gerarCopy`.

## 4. Disparar

```bash
node scripts/uazapi-send-batch.mjs            # ver o lote e a copy de cada um
node scripts/uazapi-send-batch.mjs --go       # disparar 10
```

Regras embutidas: 10 por leva em dois blocos de 5, intervalo sorteado de 90 a 240s, pausa de 7min entre blocos, só em dia útil das 9h às 11h30 e das 14h às 17h, e **para na hora se duas mensagens seguidas falharem** (primeiro sinal de bloqueio).

A instância grátis da Uazapi cai a cada poucas horas e gera token novo. **Confirmar que está conectada antes de cada lote** e atualizar `UAZAPI_INSTANCE_TOKEN` no `.env`.

Follow-up de quem não respondeu:

```bash
node scripts/uazapi-followup-batch.mjs --tier=M3 --go   # breakup (D+10 em diante)
node scripts/uazapi-followup-batch.mjs --go             # a fila toda
```

Quem respondeu como gente nunca entra no follow-up automático: esse merece resposta escrita à mão.

## 5. Medir e recalibrar

```bash
node scripts/lead-winning-profile.mjs        # ver o retrato
node scripts/lead-winning-profile.mjs --go   # gravar data/winning-profile.json
```

Mede quem responde de verdade por segmento, DDD, cidade, reputação e variante de copy. O resultado realimenta o score dos próximos leads (lookalike), com dois cuidados: célula com amostra baixa é ignorada e o ajuste é limitado a ±12 pontos.

**Rodar de novo a cada ~50 disparos novos**, senão o lookalike decide com dado velho.

---

## Regras que não mudam

- **Nunca prospectar cliente ou case do Erick.** Lista em `data/nao-prospectar.json` (Jotta, Metalthec, OStrack e outros). A guarda existe porque na primeira puxada de Monlevade os dois únicos leads "novos" eram Jotta e Metalthec.
- **Nunca apontar falha no site do lead.** Só enquadramento positivo. Isso pega o ego do dono na hora.
- **Nunca inventar número, selo ou certificação.** Só citar case que existe e cuja página vai ser realmente enviada.
- **Sem travessão** na copy.
- **`@devops` faz push.** Antes de qualquer push: `npm run lint` e `npm run typecheck`, conferindo o exit code de verdade (não `| tail`, que mascara a falha).

## Onde as coisas moram

| O quê | Onde |
|---|---|
| Chaves do Serper | `.env.local` do Garimpo (`SERPER_API_KEYS`) |
| Uazapi (token, webhook) | `.env` do CRM |
| Regra de entrada de lead | `scripts/lib/leadIngest.js` |
| Score e lookalike | `src/lib/leadScoring.js` |
| Doutrina da copy | `scripts/regenerate-copies.js` |
| Perfil de conversão | `data/winning-profile.json` |