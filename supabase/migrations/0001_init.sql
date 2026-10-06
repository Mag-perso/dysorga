-- DysOrga : schéma de départ.
-- Une famille = un parent + un enfant. Chaque ligne porte famille_id, et la
-- sécurité (RLS) ne laisse voir que les lignes de sa propre famille.

create extension if not exists pgcrypto;

create table familles (
  id uuid primary key default gen_random_uuid(),
  cree timestamptz not null default now()
);

create table membres (
  user_id uuid primary key references auth.users on delete cascade,
  famille_id uuid not null references familles on delete cascade,
  role text not null check (role in ('parent', 'enfant')),
  prenom text not null default '',
  cree timestamptz not null default now()
);
create index on membres (famille_id);

create or replace function ma_famille() returns uuid
language sql stable security definer set search_path = public as $$
  select famille_id from membres where user_id = auth.uid()
$$;

create or replace function mon_role() returns text
language sql stable security definer set search_path = public as $$
  select role from membres where user_id = auth.uid()
$$;

-- Crée la famille du parent à sa première connexion.
create or replace function creer_ma_famille(p_prenom text) returns uuid
language plpgsql security definer set search_path = public as $$
declare f uuid;
begin
  select famille_id into f from membres where user_id = auth.uid();
  if f is not null then return f; end if;
  insert into familles default values returning id into f;
  insert into membres (user_id, famille_id, role, prenom) values (auth.uid(), f, 'parent', coalesce(p_prenom, ''));
  insert into reglages (famille_id) values (f);
  insert into suivi (famille_id) values (f);
  return f;
end $$;

create table devoirs (
  id uuid primary key default gen_random_uuid(),
  famille_id uuid not null references familles on delete cascade default ma_famille(),
  matiere text not null default 'Autre',
  texte text not null,
  pour date not null,
  fait boolean not null default false,
  fait_le timestamptz,
  source text not null default 'manuel' check (source in ('manuel', 'pronote')),
  pronote_id text,
  document_id uuid,
  cree timestamptz not null default now(),
  unique (famille_id, pronote_id)
);

create table cartes (
  id uuid primary key default gen_random_uuid(),
  famille_id uuid not null references familles on delete cascade default ma_famille(),
  matiere text not null default '',
  sujet text not null default '',
  titre text not null default '',
  branches jsonb not null default '[]',
  astuce text not null default '',
  cree timestamptz not null default now()
);

create table tests (
  id uuid primary key default gen_random_uuid(),
  famille_id uuid not null references familles on delete cascade default ma_famille(),
  sujet text not null,
  score int not null,
  total int not null,
  cree timestamptz not null default now()
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  famille_id uuid not null references familles on delete cascade default ma_famille(),
  matiere text not null,
  note numeric not null,
  sur numeric not null default 20,
  chapitre text not null default '',
  source text not null default 'manuel' check (source in ('manuel', 'pronote')),
  pronote_id text,
  cree timestamptz not null default now(),
  unique (famille_id, pronote_id)
);

-- Cours et documents partagés par les profs sur Pronote (pour les cartes mentales).
create table documents (
  id uuid primary key default gen_random_uuid(),
  famille_id uuid not null references familles on delete cascade,
  matiere text not null default '',
  titre text not null default '',
  contenu text not null default '',
  fichiers jsonb not null default '[]',
  date date not null,
  pronote_id text,
  unique (famille_id, pronote_id)
);

create table suivi (
  famille_id uuid primary key references familles on delete cascade,
  derniere_connexion timestamptz,
  derniere_activite timestamptz,
  debut_devoirs timestamptz,
  devoirs_finis_le timestamptz
);

create table reglages (
  famille_id uuid primary key references familles on delete cascade,
  prenom text not null default 'Ethan',
  classe text not null default '4e',
  couleur text not null default 'bleu' check (couleur in ('bleu', 'rose', 'jaune')),
  avec_fond boolean not null default false,
  fond text,
  theme_jour date,
  theme_debut timestamptz,
  -- {"1":"15:30", ...} : fin des cours par jour (1 = lundi). Sert si Pronote ne donne pas l'emploi du temps.
  planning jsonb not null default '{}'
);

-- Fin des cours de chaque jour, lue dans l'emploi du temps Pronote.
create table emploi_du_temps (
  famille_id uuid not null references familles on delete cascade,
  jour date not null,
  fin time not null,
  primary key (famille_id, jour)
);

create table push_abonnements (
  id uuid primary key default gen_random_uuid(),
  famille_id uuid not null references familles on delete cascade default ma_famille(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  cree timestamptz not null default now()
);

-- Jeton Pronote : jamais lisible depuis l'appli, seulement par les fonctions serveur.
create table pronote_comptes (
  famille_id uuid primary key references familles on delete cascade,
  url text not null,
  username text not null,
  token text not null,
  kind int not null,
  device_uuid text not null,
  navigator_identifier text,
  derniere_synchro timestamptz,
  erreur text
);

create table rappels_envoyes (
  famille_id uuid not null references familles on delete cascade,
  jour date not null,
  numero int not null, -- 0 = « a fini », 1 = premier rappel, 2 = deuxième rappel
  envoye timestamptz not null default now(),
  primary key (famille_id, jour, numero)
);

-- Plafond d'appels à l'assistant par jour, pour éviter les surprises sur la facture.
create table usage_assistant (
  famille_id uuid not null references familles on delete cascade,
  jour date not null,
  n int not null default 0,
  primary key (famille_id, jour)
);

-- Sécurité : chaque famille ne voit que ses lignes.
do $$
declare t text;
begin
  foreach t in array array['devoirs','cartes','tests','notes','documents','suivi','reglages','emploi_du_temps','push_abonnements'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy famille_%1$s on %1$I for all using (famille_id = ma_famille()) with check (famille_id = ma_famille())', t);
  end loop;
end $$;

alter table familles enable row level security;
create policy ma_famille_lecture on familles for select using (id = ma_famille());

alter table membres enable row level security;
create policy membres_lecture on membres for select using (famille_id = ma_famille());

-- Aucune politique : illisibles depuis l'appli.
alter table pronote_comptes enable row level security;
alter table rappels_envoyes enable row level security;
alter table usage_assistant enable row level security;

-- Le parent voit l'état de la liaison Pronote, sans le jeton.
create or replace function pronote_statut() returns table (lie boolean, derniere_synchro timestamptz, erreur text)
language sql stable security definer set search_path = public as $$
  select true, derniere_synchro, erreur from pronote_comptes where famille_id = ma_famille()
$$;

-- Temps réel pour que le téléphone du parent se mette à jour tout seul.
alter publication supabase_realtime add table devoirs, cartes, tests, notes, suivi, reglages, documents;
