-- À lancer une seule fois dans l'éditeur SQL de Supabase, après avoir déployé les fonctions.
-- Remplace les deux valeurs entre < > (voir README, étape « Planifier les rappels »).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('<URL DU PROJET, ex. https://abcd.supabase.co>', 'projet_url');
select vault.create_secret('<CLE SECRETE DES FONCTIONS : la valeur de CRON_SECRET>', 'cron_secret');

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
