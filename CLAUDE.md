# CRM ERICK

Máquina de prospecção do Erick Sena. Next.js + Supabase, deploy por `git push` (Vercel), repo `BKSErick/CRMERICK`.

## Antes de puxar leads ou prospectar, leia o runbook

**`docs/RUNBOOK-prospeccao.md`** tem o pipeline inteiro na ordem, com os comandos prontos.

Não reinvente o caminho: ele foi montado e depurado rodando de verdade, e os bugs que ele já resolveu (dedupe falso por domínio nulo, filtro de cidade com acento, PostgREST cortando em 1000 linhas) voltam se alguém reescrever do zero.

Resumo da ordem:

```bash
node scripts/pull-city-serper.mjs --cidade="X" --uf=MG --go   # puxa a cidade do Maps
node scripts/uazapi-check-numbers.mjs --go                     # confirma quem tem WhatsApp
node scripts/generate-copies-db.mjs --cidade="X" --go          # gera a copy
node scripts/uazapi-send-batch.mjs --go                        # dispara 10
node scripts/lead-winning-profile.mjs --go                     # mede e realimenta o score
```

Todo script é **dry-run por padrão**. Só grava ou dispara com `--go`.

## Coisas que economizam busca

- **Chaves do Serper ficam no Garimpo** (`D:\001Gravity\Garimpo SAAS NOVO\.env.local`, `SERPER_API_KEYS`), não no `.env` daqui. Os scripts leem de lá sozinhos.
- **Uazapi**: instância grátis cai a cada poucas horas e gera token novo. Conferir a conexão antes de cada lote e atualizar `UAZAPI_INSTANCE_TOKEN` no `.env`.
- `contacts.id` e `deals.id` são o **mesmo número** para o mesmo lead, sem foreign key.
- Lead sem `deals.segment` canônico entra no CRM mas fica invisível para a fila de disparo.

## Regras que não mudam

- **Mostrar o lote e a copy para o Erick aprovar** antes de qualquer disparo real.
- **Nunca prospectar cliente ou case dele** (`data/nao-prospectar.json`).
- **Nunca apontar falha no site do lead.** Só enquadramento positivo.
- **Nunca inventar número, selo ou certificação.** Só citar case real cuja página será enviada.
- **Sem travessão** na copy.
- Antes de push: `npm run lint` e `npm run typecheck`, conferindo o exit code de verdade. Não usar `| tail`, que mascara a falha.