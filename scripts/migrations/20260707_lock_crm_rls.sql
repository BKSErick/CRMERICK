-- Story 006: remove public Allow all policies from CRM tables.
-- Keep pixel_events untouched; it already has the expected insert-only/RPC model.

alter table public.deals enable row level security;
alter table public.contacts enable row level security;
alter table public.messages enable row level security;
alter table public.activities enable row level security;

alter table public.deals add column if not exists phone text;
alter table public.deals add column if not exists whatsapp text;

drop policy if exists "Allow all" on public.deals;
drop policy if exists "Allow all" on public.contacts;
drop policy if exists "Allow all" on public.messages;
drop policy if exists "Allow all" on public.activities;

-- No replacement policy is created for anon/public.
-- Server-side Next.js routes must use SUPABASE_SERVICE_ROLE_KEY.
