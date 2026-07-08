alter table public.quiz_leads
  add column if not exists segment text,
  add column if not exists gargalo_primario text,
  add column if not exists intencao text,
  add column if not exists dor_score numeric,
  add column if not exists equipe_porte text,
  add column if not exists faturamento text;

create index if not exists quiz_leads_segment_idx on public.quiz_leads (segment) where segment is not null;
create index if not exists quiz_leads_gargalo_primario_idx on public.quiz_leads (gargalo_primario) where gargalo_primario is not null;
create index if not exists quiz_leads_intencao_idx on public.quiz_leads (intencao) where intencao is not null;
