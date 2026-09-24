begin;

-- Devolve a nota base antes de remover a parcela do ICP.
update public.deals set points = points - icp_points where icp_points <> 0;

alter table public.deals drop column if exists icp_points;

commit;
