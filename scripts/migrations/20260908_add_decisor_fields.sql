-- Migration: 20260908_add_decisor_fields.sql
-- Descrição: Camada de DECISOR. O QSA (quadro de sócios) já vinha na resposta da
-- MinhaReceita e era descartado pelo cnpjEnrich.js. Agora o sócio com poder de decisão
-- (qualificação 49 Sócio-Administrador na frente de 22 Sócio) é eleito e persistido,
-- junto do e-mail cadastrado na Receita (que vem da ReceitaWS, não da MinhaReceita).
--
-- Complementa 20260826_add_cnpj_and_refresh_fields.sql, que já criou cnpj/porte/capital/cnae.
-- `deals.receita_phones` não existia (só em contacts) e entra aqui: é o telefone oficial
-- da Receita, candidato a WhatsApp do dono, e a fila de disparo lê de deals.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS decisor_nome text,
  ADD COLUMN IF NOT EXISTS decisor_qualificacao text,
  ADD COLUMN IF NOT EXISTS socios jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS email_receita text;

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS decisor_nome text,
  ADD COLUMN IF NOT EXISTS decisor_qualificacao text,
  ADD COLUMN IF NOT EXISTS socios jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS email_receita text,
  ADD COLUMN IF NOT EXISTS receita_phones jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS setor text;

-- Filas de prospecção consultam por "tem decisor?" e "tem e-mail?", por isso os índices
-- são parciais: só as linhas úteis entram.
CREATE INDEX IF NOT EXISTS idx_deals_decisor_nome ON public.deals(decisor_nome) WHERE decisor_nome IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_email_receita ON public.deals(email_receita) WHERE email_receita IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_setor ON public.deals(setor) WHERE setor IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_decisor_nome ON public.contacts(decisor_nome) WHERE decisor_nome IS NOT NULL;
