# Design — Chat de IA com busca inteligente e modelos gratuitos

**Data:** 2026-09-18
**Status:** Aprovado pelo operador
**Produto:** CRM Erick
**Superficie:** `/agentes`

## Problema

O chat atual escolhe fontes por um escopo amplo antes de interpretar a pergunta. No escopo `CRM inteiro`, carrega pipeline, forecast, perdas, integracoes, insights e conteudo, mesmo quando o operador pede apenas uma fila operacional. O prompt tambem inclui o playbook comercial inteiro em toda resposta. Isso aumenta latencia e consumo de contexto sem dar ao chat acesso especifico a e-mail, WhatsApp ou a fila diaria ja calculada pelo CRM.

O catalogo atual descobre modelos gratuitos, mas tenta somente os quatro primeiros conforme preferencias internas e nao permite que o operador veja ou selecione o modelo. Especialista e motor de inferencia ficam implicitamente acoplados na experiencia.

## Objetivo aprovado

Permitir perguntas em linguagem natural sobre todo o CRM, com consultas server-side especificas, somente leitura e auditaveis. A IA deve receber apenas o conjunto factual necessario para responder e nunca tabelas inteiras, SQL livre, credenciais ou autorizacao operacional.

O sistema deve operar exclusivamente com modelos gratuitos. Nenhuma rota, fallback ou selecao pode usar um modelo com preco de entrada ou saida maior que zero.

## Casos de uso iniciais

1. `Qual e minha prioridade hoje?`
2. `Quem respondeu e-mail e ainda precisa de resposta?`
3. `Quem respondeu no WhatsApp e esta esperando?`
4. `Encontre prospects ou deals com estes criterios.`

## Arquitetura

```text
Pergunta do operador
        |
        v
Roteador de intencao tipado
        |
        v
Registro fechado de consultas somente leitura
        |
        v
Servicos/RPCs do CRM e Supabase
        |
        v
Pacote compacto de evidencias, limites e links
        |
        v
Especialista escolhido + modelo gratuito escolhido
        |
        v
Resposta em PT-BR com citacoes acionaveis
```

### 1. Roteador de intencao

O roteador transforma a pergunta em um plano validado por schema. Ele pode selecionar apenas operacoes registradas pelo backend, por exemplo:

- `daily_priorities`
- `email_replies`
- `whatsapp_replies`
- `deal_search`
- `pipeline_summary`
- `deal_context`

O plano aceita filtros tipados como periodo, limite, etapa e ID. Texto do usuario nunca vira SQL, nome de tabela, endpoint ou ferramenta arbitraria.

### 2. Consultas deterministicas

- Prioridades reutilizam as regras existentes da Sala de Comando, extraidas para servico compartilhado.
- E-mail deriva `aguardando resposta` pela ultima direcao real da thread, e nao apenas por `unread_count`.
- WhatsApp deriva o estado por mensagens e atividades canonicas, preservando as correcoes ja existentes na Sala de Comando para campos historicamente incompletos em `deals`.
- Busca de deals usa filtros validados e consulta paginada/indexada no banco. A IA interpreta a intencao, mas nao filtra milhares de linhas em memoria.

Cada consulta devolve contagens, amostra limitada, horario de corte, limitacoes e links internos.

### 3. Contexto e prompts

- O playbook comercial entra apenas em perguntas de venda, copy, objecao ou follow-up.
- Perguntas operacionais recebem politica minima, DNA compacto do especialista, plano executado e evidencias.
- Historico longo e resumido; apenas as mensagens recentes necessarias entram na chamada.
- A resposta distingue fato, calculo, inferencia e recomendacao.

### 4. Especialista e modelo independentes

A interface possui dois seletores:

- **Especialista:** CRM Copilot, Webson, Copy Chief e demais clones/agentes aprovados.
- **Modelo:** `Automatico gratuito` ou um modelo gratuito especifico do catalogo vivo.

Trocar o modelo nao muda o DNA da conversa. Um atalho `@especialista` continua valendo apenas para a resposta atual.

### 5. Politica gratuita obrigatoria

- O catalogo aceita somente variante `:free` ou modelo cujo preco de prompt e completion seja zero.
- O servidor revalida o modelo escolhido; IDs enviados pelo browser nao sao confiaveis.
- O modelo automatico usa somente candidatos gratuitos compativeis com texto e com os parametros exigidos.
- Fallbacks usam apenas OpenRouter gratuito e provedores com plano gratuito ja configurados.
- Sem candidato gratuito disponivel ou com cota, a resposta falha de forma clara. Nao existe escalada paga silenciosa.
- O seletor mostra contexto efetivo do endpoint, capacidades e disponibilidade; volume historico de tokens processados nao e exibido como janela de contexto.

### 6. Observabilidade

Cada resposta registra, quando o provider informar:

- provider e modelo efetivos;
- tokens de entrada, saida e total;
- numero e classificacao das tentativas;
- latencia;
- plano/consultas executadas;
- fontes, cortes e truncamentos;
- erro sanitizado.

Prompts completos, mensagens sensiveis, tokens de API e credenciais nao entram em logs abertos.

## Seguranca

- Sessao administrativa obrigatoria.
- Operacoes de consulta em allowlist e somente leitura.
- Nenhum SQL, URL, tool call ou mutacao sugerida pelo modelo e executada.
- PII e redigida ou minimizada antes do provider sempre que nao for necessaria.
- Fontes do CRM sao tratadas como dados nao confiaveis contra prompt injection.
- O backend valida ownership da conversa e modelo gratuito antes de qualquer chamada.

## Busca semantica

Busca vetorial nao faz parte do primeiro incremento. Dados estruturados usam consultas deterministicas. Uma fase posterior pode adicionar busca hibrida para notas, documentos, insights e conteudo editorial, sem substituir as consultas operacionais.

## Alternativas rejeitadas

### Apenas aumentar a janela de contexto

Rejeitada porque nao conecta e-mail/WhatsApp, nao garante prioridade correta e aumenta latencia. Contexto grande nao substitui recuperacao precisa.

### Enviar o CRM inteiro ao modelo

Rejeitada por custo de contexto, privacidade, latencia, baixa rastreabilidade e risco de truncamento.

### SQL ou ferramentas arbitrarias geradas pela IA

Rejeitada por seguranca, autorizacao e imprevisibilidade. O modelo escolhe apenas operacoes fechadas e tipadas.

### Fallback pago

Rejeitado explicitamente pelo operador. Toda a camada de inferencia deve permanecer sem cobranca.

## Rollout e rollback

- Liberar a nova orquestracao por feature flag independente do catalogo de agentes.
- Preservar o broker anterior durante a validacao inicial como rollback local.
- Se o roteador ou uma fonte falhar, manter a conversa disponivel com limitacao explicita.
- A flag pode voltar ao fluxo anterior sem remover conversas ou snapshots de DNA.

## Criterios de sucesso

- As quatro perguntas iniciais retornam dados corretos, recentes, citados e com links.
- Perguntas operacionais nao carregam o playbook comercial nem fontes irrelevantes.
- Nenhuma chamada pode selecionar ou cair em modelo pago.
- O operador consegue escolher qualquer modelo gratuito elegivel do catalogo vivo.
- A interface mostra provider/modelo efetivo, uso de tokens, latencia e fontes.
- Falha de modelo ou fonte nao inventa resultado nem executa acao no CRM.
