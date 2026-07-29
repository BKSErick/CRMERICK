# Design - Ingestao de WhatsApp no CRM Erick via Uazapi

## Objetivo

Usar uma instancia temporaria gratuita da Uazapi para receber, sem responder automaticamente, mensagens individuais enviadas e recebidas no WhatsApp e transforma-las em contexto persistente no CRM Erick.

## Escopo aprovado

- Receber o evento `messages` por webhook.
- Registrar mensagens enviadas e recebidas em conversas individuais.
- Ignorar grupos, status, canais e mensagens originadas pela propria API.
- Deduplicar mensagens pelo identificador original da Uazapi.
- Resolver o contato pelo telefone e criar contato/deal `prospect` quando ainda nao existirem.
- Persistir apenas os campos necessarios para CRM; nao persistir o payload bruto.
- Registrar a mensagem e o insight de IA na timeline do deal.
- Nunca responder, disparar mensagens ou alterar automaticamente o estagio comercial.

## Fluxo

1. A Uazapi envia `POST /api/webhooks/uazapi?secret=...`.
2. A rota valida o segredo compartilhado server-side.
3. O payload e normalizado conforme o schema `Message` da Uazapi.
4. Eventos de grupo, API ou sem mensagem valida retornam `200` como ignorados.
5. O CRM localiza contato e deal pelo telefone normalizado.
6. Quando necessario, cria contato e deal em `prospect`.
7. Insere a mensagem com indice unico de provedor + ID da mensagem.
8. Para texto novo, a IA existente gera um insight curto e nao operacional.
9. A timeline recebe a mensagem e, quando disponivel, o insight.

## Seguranca e privacidade

- `UAZAPI_INSTANCE_TOKEN` fica somente no ambiente local usado para configurar a instancia.
- O token da instancia nao autentica o webhook; um segredo aleatorio independente e usado na URL.
- Sem `UAZAPI_WEBHOOK_SECRET` explicito, o configurador gera um segredo criptograficamente aleatorio e salva apenas seu hash SHA-256 na tabela protegida `integration_settings`.
- O endpoint nunca devolve tokens ou payloads sensiveis.
- O banco guarda texto, direcao, telefone, nome, tipo, timestamp e IDs tecnicos minimos.
- A integracao nao possui endpoint de envio.

## Fora do escopo

- Respostas automaticas.
- Campanhas ou disparos.
- Grupos, status, canais e historico retroativo.
- Download ou transcricao de midia.
- Mudanca automatica de etapa do funil.
- Operacao permanente do servidor gratuito.

## Criterio de sucesso do teste

Durante a janela gratuita, uma mensagem individual real aparece uma unica vez em `messages`, ligada ao contato e deal corretos, e fica visivel na timeline do CRM sem qualquer resposta automatica.
