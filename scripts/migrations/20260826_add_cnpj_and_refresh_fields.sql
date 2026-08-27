-- Migration: 20260826_add_cnpj_and_refresh_fields.sql
-- Descrição: Adiciona suporte a CNPJ, Porte (MEI/ME/EPP/DEMAIS), Capital Social e Timestamp de Atualização.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS capital_social numeric,
  ADD COLUMN IF NOT EXISTS porte text,
  ADD COLUMN IF NOT EXISTS situacao_cadastral text,
  ADD COLUMN IF NOT EXISTS cnae_principal text,
  ADD COLUMN IF NOT EXISTS cnae_descricao text,
  ADD COLUMN IF NOT EXISTS receita_phones jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_scraped_at timestamptz DEFAULT now();

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS capital_social numeric,
  ADD COLUMN IF NOT EXISTS porte text,
  ADD COLUMN IF NOT EXISTS situacao_cadastral text,
  ADD COLUMN IF NOT EXISTS cnae_principal text,
  ADD COLUMN IF NOT EXISTS cnae_descricao text,
  ADD COLUMN IF NOT EXISTS last_scraped_at timestamptz DEFAULT now();

-- Índices para consultas rápidas por CNPJ e Filtro de Porte
CREATE INDEX IF NOT EXISTS idx_contacts_cnpj ON public.contacts(cnpj) WHERE cnpj IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_cnpj ON public.deals(cnpj) WHERE cnpj IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_porte ON public.deals(porte) WHERE porte IS NOT NULL;
