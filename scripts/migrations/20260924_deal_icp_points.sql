-- Parcela do ICP dentro de deals.points (Story 058).
--
-- Por que: o ICP passa a mexer na nota (+15 dentro, -25 fora), mas a nota base depende da
-- analise do site feita na entrada do lead, que nao fica no banco. Recalcular a nota inteira
-- apagaria esses sinais. Guardando so a parcela do ICP, o ajuste e idempotente:
-- base = points - icp_points, e rodar de novo com o mesmo is_icp nao muda nada.
--
-- Aditiva e repetivel. Nao altera nenhum points existente (default 0).

begin;

alter table public.deals
  add column if not exists icp_points smallint not null default 0;

comment on column public.deals.icp_points is
  'Parcela de points que vem do ICP (Story 058). points - icp_points = nota base da prospeccao.';
comment on column public.deals.icp_source is
  'Quem decidiu is_icp: regra (analise-comum.classificaIcp), ia (decisao tipada com o ICP do brandbook), manual ou a importacao de origem.';

commit;
