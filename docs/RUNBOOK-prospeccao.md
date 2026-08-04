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
node scripts/uazapi-send-batch.mjs                  # ver o lote e a copy de cada um
node scripts/uazapi-send-batch.mjs --go             # disparar 10 (modo lote)
node scripts/uazapi-send-batch.mjs --go --dia-inteiro   # espalhar pelo dia (instância paga)
```

**Modo lote:** 10 por leva em dois blocos de 5, intervalo sorteado de 90 a 240s, pausa de 7min entre blocos.

**Modo dia inteiro:** processo fica de pé, manda 1 mensagem a cada 4 a 15min sorteados, respeita teto de 7 por hora e dorme sozinho fora da janela, retomando à tarde. Só faz sentido com instância paga, que não cai.

Nos dois: só dia útil das 9h às 11h30 e das 14h às 17h, **teto de 40 por dia** somando disparo e follow-up (contado no banco, então reiniciar o script não zera), e **parada imediata se duas mensagens seguidas falharem**.

Ajustes: `--teto-dia=N`, `--teto-hora=N`, `--dia-min=240 --dia-max=900` (segundos entre mensagens).

### O que protege o número de verdade

Volume não é o principal fator de bloqueio: **denúncia de usuário é**. Por isso:

- **Quem pede pra parar sai da fila para sempre.** O script detecta opt-out ("não quero", "pare", "remove", "spam", "denunciar") nas respostas e nunca mais escreve para esse lead. Insistir com quem recusou é o caminho mais rápido pro botão de denúncia.
- **Número confirmado tem prioridade na fila.** Disparar para número que não existe no WhatsApp é sinal forte de spam, porque pessoa real não escreve para número inexistente. Rodar o `uazapi-check-numbers.mjs` antes é proteção, não só higiene.
- **Responder rápido quem responde.** Conversa de mão dupla é o sinal mais forte de que o número é legítimo. A taxa de resposta atual (12,4%) protege o número.
- **Perfil completo** (foto, nome comercial, descrição). Número sem identidade é o perfil clássico de spam.
- **Nunca link na primeira mensagem.** O link vai só depois do "quer ver?".

Desde 04/08/2026 o disparo roda no **servidor pago dedicado** (`https://mydrion.uazapi.com`, instância `rae3132aeb9759a`, número 553191072407). O token da instância é fixo e não expira a cada poucas horas como no `free.uazapi.com`, então o modo dia inteiro passa a fazer sentido. A instância paga **não protege contra bloqueio**: o risco é do número, não do plano. Se precisar recriar a instância, quem cria/lista no servidor é o `UAZAPI_ADMIN_TOKEN` do `.env`, e depois de recriar é obrigatório rodar `npm run whatsapp:webhook:configure` de novo, senão as respostas param de entrar no CRM.

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

## Operar prospecção pelo Instagram

Acesse `Instagram > Prospecção`. Escolha apenas `Clínicas odontológicas` ou
`Clínicas de estética`, informe cidade/UF e revise os perfis encontrados. A busca
usa Maps, busca pública e o site oficial quando disponível.

Configuração server-side obrigatória:

```env
SERPER_API_KEYS=chave_1,chave_2
```

O navegador nunca recebe essas chaves. Resultado com confiança média ou baixa deve
ser revisado antes da importação. Se a empresa já existe, o Instagram é anexado ao
mesmo deal. Clientes/cases de `data/nao-prospectar.json` permanecem bloqueados.

Na aba `Leads e follow-ups`:

1. Abra o perfil e revise a empresa.
2. Copie e envie a mensagem manualmente no Instagram.
3. Clique em `Confirmar como enviada` apenas depois do envio real.
4. Registre respostas, classificação, agendamento, pausa ou opt-out na mesma ficha.

Abrir perfil ou copiar texto nunca conta como envio. A confirmação manual cria o
histórico e agenda a cadência do Instagram em D+2, D+5 e D+10. Essa cadência não
altera o relógio do WhatsApp e não inclui os leads industriais existentes.

Migration aplicada em 04/08/2026:
`scripts/migrations/20260804_prospecting_channels.sql`.

## Ativar o acesso administrativo

Configure somente no servidor local/Vercel:

```env
CRM_ADMIN_EMAIL=seu-email-administrativo
CRM_AUTH_SECRET=segredo-aleatorio-com-pelo-menos-32-caracteres
```

O login usa o template nativo **Magic Link** do Supabase, com
`{{ .ConfirmationURL }}`. Em `Supabase > Authentication > URL Configuration`,
autorize `http://localhost:3000/auth/callback` para desenvolvimento e a mesma rota
no domínio de produção. O primeiro pedido válido cria, se necessário, somente o
usuário definido em `CRM_ADMIN_EMAIL` e solicita o link pelo Supabase Auth.

Ao abrir o link, o cliente remove imediatamente o token da barra de endereço. O
servidor valida a identidade no Supabase, confere a allowlist e só então emite a
sessão administrativa em cookie HttpOnly. O token nunca é registrado em log.

O CRM falha fechado se e-mail ou segredo estiverem ausentes. Páginas redirecionam
para `/login`, APIs privadas retornam 401 e a sessão expira em sete dias. Trocar
`CRM_AUTH_SECRET` invalida todas as sessões atuais.
