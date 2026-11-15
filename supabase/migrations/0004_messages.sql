-- Messages entre l'enfant et le parent. Sans effet si déjà fait.
-- L'appli lit et marque comme lus ; l'envoi passe par la fonction « message » (qui prévient l'autre téléphone).
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  famille_id uuid not null references familles on delete cascade,
  de text not null check (de in ('parent', 'enfant')),
  texte text not null check (char_length(texte) between 1 and 1000),
  cree timestamptz not null default now(),
  lu boolean not null default false
);
create index if not exists messages_famille on messages (famille_id, cree desc);

alter table messages enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'messages' and policyname = 'messages_lecture') then
    create policy messages_lecture on messages for select using (famille_id = ma_famille());
  end if;
  -- Seul celui qui reçoit le message peut le marquer comme lu.
  if not exists (select 1 from pg_policies where tablename = 'messages' and policyname = 'messages_lu') then
    create policy messages_lu on messages for update using (famille_id = ma_famille() and de <> mon_role())
      with check (famille_id = ma_famille() and de <> mon_role());
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages') then
    alter publication supabase_realtime add table messages;
  end if;
end $$;
