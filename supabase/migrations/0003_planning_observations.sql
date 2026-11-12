-- Planning détaillé et observations (vie scolaire), lus dans Pronote. Sans effet si déjà fait.
create table if not exists cours (
  id uuid primary key default gen_random_uuid(),
  famille_id uuid not null references familles on delete cascade default ma_famille(),
  pronote_id text not null,
  jour date not null,
  debut text not null,
  fin text not null,
  matiere text not null default '',
  salle text not null default '',
  prof text not null default '',
  annule boolean not null default false,
  statut text not null default '',
  unique (famille_id, pronote_id)
);

create table if not exists observations (
  id uuid primary key default gen_random_uuid(),
  famille_id uuid not null references familles on delete cascade default ma_famille(),
  pronote_id text not null,
  date date not null,
  genre text not null,
  titre text not null default '',
  matiere text not null default '',
  detail text not null default '',
  unique (famille_id, pronote_id)
);

do $$
declare t text;
begin
  foreach t in array array['cours','observations'] loop
    execute format('alter table %I enable row level security', t);
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'famille_' || t) then
      execute format('create policy famille_%1$s on %1$I for all using (famille_id = ma_famille()) with check (famille_id = ma_famille())', t);
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
