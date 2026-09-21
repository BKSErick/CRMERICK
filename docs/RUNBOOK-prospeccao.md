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

Opções: `--queries="usinagem,solda"` troca os nichos, `--paginas=3` vai mais fundo, `--limit=N` limita, `--sem-enrich` pula a visita aos sites, `--cnpj-serper` liga a busca de CNPJ no Google (1 crédito por lead; desligada por padrão, o `colher-emails` faz isso com orçamento). O CNPJ publicado no site é lido de graça.

**Crédito:** cada chamada ao Maps com 20 resultados custa **3 créditos**; 13 nichos × 1 página = 39, × 2 = 78.

⚠️ O pull encadeia `uazapi-check-numbers --go` + `descartar-sem-whatsapp --go`: lead sem WhatsApp entra como `stage=lost` + `blocker=sem_whatsapp` (fila do WhatsApp limpa). **Pra e-mail isso não é lost**: o `build-queue-institucional` e o `colher-emails` tratam esse caso como vivo (ver seção de e-mail).

Várias cidades de uma vez (lista padrão = polos industriais de MG, cidade grande com 2 páginas):

```bash
node scripts/pull-cidades.mjs                                   # dry-run
node scripts/pull-cidades.mjs --go --reserva=400                # para quando o saldo Serper bater em 400
node scripts/pull-cidades.mjs --cidades="Betim,Contagem" --go --colher   # e colhe e-mail dos novos no fim
```

Log em `logs/pull-cidades-<data>.log`; duas cidades seguidas com erro param o runner (em 18/09 um bug de env queimou 11 cidades de crédito contra o Supabase errado antes de alguém olhar o log).

Alternativa, quando o lead já está no Garimpo:

```bash
node scripts/import-garimpo-leads.mjs --cidade="Ipatinga" --go
```

Terceira fonte, lista de associação digitada à mão:

```bash
node scripts/import-acimon-leads.mjs        # dry-run
node scripts/import-acimon-leads.mjs --go
```

Lê `data/acimon-industrias.json` (quadro de associados da ACIMON, João Monlevade). Sem cid do Maps e sem nota, então o dedupe cai para nome, telefone e domínio, e o score sai baixo por falta dos campos do Maps: **não leia o score como qualidade aqui**. Entra com `source = "acimon_associados"` para medir separado, porque lead de associação tem ponte institucional que lead de Maps não tem.

Para outra associação, aponte o arquivo: `--arquivo=data/outra-lista.json`.

Quarta fonte, base curada de ICP (pesquisa de João Monlevade de 15/09/2026, 142 empresas em tiers):

```bash
node scripts/import-icp-monlevade.mjs                                                    # dry-run
node scripts/import-icp-monlevade.mjs --arquivo=data/icp-jotta-monlevade-2026-09-15.lote-amanha.csv   # só o lote de 40
node scripts/import-icp-monlevade.mjs --tier=A --go                                      # grava só concorrentes diretos
```

Lê `data/icp-jotta-monlevade-2026-09-15.csv` (`;`, BOM). Só entra `status_operacional=novo_canal_publico`; quem já está no CRM segue o histórico do card. Além do que o `leadIngest` grava, preenche `contacts.email` (fila do Brevo), `deals.setor` (`industria`/`construcao`, filtro do `build-queue-institucional`) e `deals.is_icp`/`icp_source`/`description` com o tier, para medir por tier. Entra com `source = "icp_jotta_monlevade"`. Tier A sem segmento detectável cai em `manutencao` (é o perfil da Jotta por definição). As 24 empresas `novo_pesquisar_contato` (sem telefone nem e-mail) ficam de fora até enriquecer pela Receita: `--status=novo_pesquisar_contato`.

⚠️ **Concorrente direto da Jotta não lê o nome da Jotta** (decisão do Erick, 15/09/2026: o Thales é a ponte pra ACIMON). O tier A entra com `deals.origin_detail = concorrente_jotta`, e isso troca o case: o M2 automático (`uazapi-followup-batch.mjs` → `renderFollowupMessage({ caseOnly: "metalthec" })`, templates `M2*SoMetalthec` no `sales-playbook.json`) e a carta pronta "Msg 2 (concorrente da Jotta)" do Comando citam só a Metalthec. A msg 1 atual não cita case nenhum. O card mostra o tier na descrição, então na conversa manual é só escolher a carta certa.

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
- **O número tem que ser da empresa do card.** Desde 14/09/2026 os dois scripts de disparo consultam a Uazapi (`/chat/check` + `/chat/details`) antes de reservar vaga no lote: número que não existe no WhatsApp fica de fora, e número cujo perfil tem nome de OUTRA empresa fica retido pra revisão (`Retidos pela conferencia do numero na Uazapi`). Origem: a Steel Usinagem (#795) tinha no `whatsapp_site` o WhatsApp da G6 Embalagens, sobra de template de agência no site antigo dela, e a copy inteira da Steel chegou na G6. O scraper de site grava o primeiro `wa.me/` que encontra, e o `/chat/check` só dizia "existe": era o número certo da empresa errada. Regra em `scripts/lib/canalWhatsapp.mjs`; auditoria da base em `node --env-file-if-exists=.env scripts/audit-canal-nome.mjs --so-problemas` (só leitura, rodar depois de cada `scrape-site-whatsapp.mjs`). Perfil sem nome não bloqueia: 7 em 25 leads não têm nome, e sem nome não dá pra afirmar nada.

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

## E-mail institucional pelo Brevo

O Brevo continua sendo o motor de envio. O ImprovMX Free recebe mensagens destinadas
a `contato@mydrion.com.br` e as encaminha para o Gmail operacional; ele nao e uma
caixa de e-mail e seu plano gratuito nao oferece SMTP. Nao migre a fila de
prospeccao para o ImprovMX.

Rodar de `D:\001Gravity\CRM ERICK\scripts\email`:

```bash
node build-queue-institucional.mjs --setor=industria,construcao --primeiro-toque
node checar-mx-fila.mjs --go            # domínio sem MX vira sem_mx na blocklist (bounce garantido)
node build-queue-institucional.mjs --setor=industria,construcao --primeiro-toque   # de novo, já sem os mortos
node brevo_send.mjs --check
node brevo_send.mjs --test=SEU_EMAIL_PESSOAL
node brevo_send.mjs --limit=10
```

Acima de 20/dia é `--limit=N --cap=N`, de propósito.

### Colher e-mail (quando a fila zera) — desde 18/09/2026

Rodar da **raiz** do CRM (os caches são relativos ao cwd):

```bash
node scripts/email/colher-emails.mjs                                  # dry-run: quem ganharia e-mail
node scripts/email/colher-emails.mjs --go                             # grava
node scripts/email/colher-emails.mjs --desde=2026-09-18 --go          # só leads criados a partir da data
node scripts/email/colher-emails.mjs --cidade="Betim" --go
node scripts/email/colher-emails.mjs --descobrir-cnpj --max-serper=300 --go   # Google pra quem não tem site nem CNPJ
node scripts/email/colher-emails.mjs --receitaws --go                 # fallback lento (21s/CNPJ) quando a OpenCNPJ não tem e-mail
```

Fontes, em ordem de custo: **site do lead** (home + páginas de contato: `mailto`, texto, JSON-LD, Cloudflare `cfemail`) → **CNPJ → OpenCNPJ** (e-mail da Receita, QSA, CNAE, porte, cidade, ~500ms, sem limite; substituiu a ReceitaWS de 21s como fonte padrão) → `--descobrir-cnpj` busca o CNPJ no Google pra quem não tem (1 crédito Serper por lead, ~1 em 3 acha). Rendimento medido: ~22% dos leads de uma cidade saem com e-mail aprovado só pelo site.

Cada candidato passa pelo **`validar-email.mjs`** antes de ser gravado: sintaxe, artefato do extrator (`x@y.com.brmailto`, `@www.dominio`), placeholder, e-mail de plataforma (`press@linktr.ee`), typo de domínio (`@gamil.com` → corrige e penaliza), caixa errada (`nfe@`, `rh@`, `noreply@`), blocklist, MX (cache 30 dias em `.cache/mx-dominios.json`), `qualificar-destinatario` (decisor/empresa/terceiro/incerto) e score 0-100. Só o aprovado vai pro CRM; e-mail antigo que reprova vai pras `notes` do contato. O mesmo validador roda dentro do `build-queue-institucional` (os dois endereços do deal concorrem, o primeiro aprovado vence, e a fila ordena por `decisor` → `scoreEmail` → pontos do lead), então o `checar-mx-fila.mjs` virou redundante.

Pra testar um endereço ou auditar a fila:

```bash
node scripts/email/validar-email.mjs contato@empresa.com.br --empresa="Empresa" --site=empresa.com.br
cd scripts/email && node validar-email.mjs --fila          # lista quem cairia do email_queue.json
```

Também preenche `deals.setor` (CNAE → `setorDeCnae`, senão segmento/palavra: usinagem/caldeiraria/manutenção/automação → industria, engenharia → construcao; **agro fica sem setor de propósito**), `decisor_nome`, `cnpj`, `porte` e `contacts.city/uf` quando vazios. Nunca sobrescreve `setor` já preenchido (o `enrich-decisores` fazia isso e apagava etiqueta manual). Os 9 deals deixados sem setor na triagem manual de 11 e 15/09 estão em `NUNCA_ETIQUETAR`.

**Lost só por falta de WhatsApp é público de e-mail.** `descartar-sem-whatsapp` marca `stage=lost` + `blocker=sem_whatsapp|sem_telefone` sem `loss_reason_code`; o build e o colhedor incluem esses deals (em 18/09 eram 1.009, 549 com site). Recusa explícita (`loss_reason_code`) continua lost. `--sem-lost-whatsapp` desliga.

Saída de cada colheita em `scripts/email/colheita/colheita-<data>.json` (gitignorado, tem PII): todos os candidatos, aprovados, rejeitados com motivo e os patches aplicados.

O caminho antigo (`enrich-decisores.mjs --com-email`) continua existindo e agora também usa a OpenCNPJ antes da ReceitaWS.

`--check` envia zero mensagens e precisa mostrar o remetente, o destino das respostas,
o limite do dia e pelo menos um MX para o dominio de resposta. Enquanto o MX ainda nao
existir, use `--reply-to=UMA_CAIXA_QUE_EXISTE` nos testes e lotes estritamente necessarios.

Se o Brevo aceitar um e-mail e o Supabase falhar depois, o motor grava primeiro no
`sent_log.json` o horario, o `messageId` e os IDs do CRM, mostra
`EMAIL ENVIADO, mas o CRM nao registrou`, interrompe o lote e retorna exit code 2.
Nao apague o destinatario do log e nao rode o envio novamente; reconcilie a atividade
no CRM pelo `messageId` antes de continuar.

### Recebimento gratuito com ImprovMX

1. Criar uma conta **Free** no ImprovMX e adicionar `mydrion.com.br`.
2. Criar o alias `contato` apontando para o Gmail operacional. O destino real fica
   privado e pode ser trocado depois sem mudar o endereco divulgado aos leads.
3. No painel da Vercel, abrir o dominio e usar `Add DNS Preset > ImprovMX [MX]`.
   O preset adiciona os MX e o SPF exigidos pelo encaminhamento sem trocar os
   nameservers nem a hospedagem do site.
4. Nao criar um segundo SPF no host raiz. Se ja existir um, consolidar os includes em
   um unico TXT e conferir no Brevo que a autenticacao do dominio segue valida.
5. No ImprovMX, executar `Check Again` ate aparecer `Email forwarding active`.
6. Enviar de uma conta externa para `contato@mydrion.com.br`, confirmar a chegada no
   Gmail e repetir `node brevo_send.mjs --check` ate os MX aparecerem.

O plano Free do ImprovMX encaminha ate 500 mensagens por dia em 1 dominio e permite
25 aliases, mas oferece zero envios por SMTP. Para responder manualmente mantendo
`contato@mydrion.com.br` no campo `From`, configurar uma identidade no Thunderbird
ligada ao Gmail de destino e usar o SMTP do Brevo (`smtp-relay.brevo.com`) com uma
chave SMTP propria. Nunca colocar a chave no repositorio. O envio automatizado do CRM
continua usando a API do Brevo e compartilha o limite diario da conta.

---

## Regras que não mudam

- **Nunca prospectar cliente ou case do Erick.** Lista em `data/nao-prospectar.json` (Jotta, Metalthec, OStrack e outros). A guarda existe porque na primeira puxada de Monlevade os dois únicos leads "novos" eram Jotta e Metalthec. **A comparação é substring do nome normalizado**, então grafia com espaço não casa termo sem espaço: `"arcelormittal"` deixava passar `"ARCELOR MITTAL MONLEVADE"`. Ao adicionar empresa, cadastre as variantes.
- **Fixo pode ser canal morto, não só canal frio.** A Usipool tinha autoresponder no fixo avisando que aquele número é exclusivo de vagas de emprego, com o comercial em outro número. A abordagem anterior morreu ali sem ninguém ler. Quando o lead nunca responde, cheque se o número é de RH antes de marcar como desinteresse.
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

Crie o usuário de `CRM_ADMIN_EMAIL` em `Supabase > Authentication > Users` e defina
uma senha forte. A tela `/login` envia a credencial somente ao servidor, que valida
com o Supabase Auth, confere novamente a allowlist e emite a sessão administrativa
em cookie HttpOnly. A senha nunca é gravada pelo CRM, enviada ao bundle ou registrada
em log.

O CRM falha fechado se e-mail ou segredo estiverem ausentes. Páginas redirecionam
para `/login`, APIs privadas retornam 401 e a sessão expira em sete dias. Trocar
`CRM_AUTH_SECRET` invalida todas as sessões atuais.
