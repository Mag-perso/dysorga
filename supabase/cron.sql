-- Planificateur : lancé automatiquement par la mise en ligne (.github/workflows/deploy.yml).
-- __URL__ et __SECRET__ sont remplacés à ce moment-là ; le secret change à chaque mise en ligne.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare i uuid;
begin
  select id into i from vault.secrets where name = 'projet_url';
  if i is null then perform vault.create_secret('__URL__', 'projet_url');
  else perform vault.update_secret(i, '__URL__'); end if;
  select id into i from vault.secrets where name = 'cron_secret';
  if i is null then perform vault.create_secret('__SECRET__', 'cron_secret');
  else perform vault.update_secret(i, '__SECRET__'); end if;
end $$;

-- Rappels au parent : toutes les 5 minutes.
select cron.schedule('dysorga-rappels', '*/5 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'projet_url') || '/functions/v1/rappels',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb)
$$);

-- Synchro Pronote : toutes les heures de 7 h à 21 h (heure UTC, donc 8 h - 22 h l'hiver à Paris).
select cron.schedule('dysorga-pronote', '7 6-20 * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'projet_url') || '/functions/v1/pronote',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{"action":"synchro-toutes"}'::jsonb)
$$);
