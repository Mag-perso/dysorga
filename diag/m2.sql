-- Pronote change les identifiants à chaque connexion : chaque synchro recréait les mêmes devoirs,
-- notes et cours. On garde un exemplaire de chaque (le devoir coché « fait » en priorité) et on
-- repère désormais chaque élément par son contenu, avec le même calcul que la fonction pronote.
-- Sans effet si c'est déjà fait : relancé à chaque mise en ligne.

delete from devoirs d using (
  select id, row_number() over (partition by famille_id, matiere, texte, pour order by fait desc, fait_le nulls last, cree) as rang
  from devoirs where source = 'pronote'
) x where d.id = x.id and x.rang > 1;

update devoirs set pronote_id = md5(matiere || '|' || pour::text || '|' || texte)
where source = 'pronote' and pronote_id is distinct from md5(matiere || '|' || pour::text || '|' || texte);

delete from notes n using (
  select id, row_number() over (partition by famille_id, matiere, note, sur, chapitre, (cree at time zone 'UTC')::date order by cree) as rang
  from notes where source = 'pronote'
) x where n.id = x.id and x.rang > 1;

update notes set pronote_id = md5(matiere || '|' || to_char(cree at time zone 'UTC', 'YYYY-MM-DD') || '|' || note::text || '|' || sur::text || '|' || chapitre)
where source = 'pronote'
  and pronote_id is distinct from md5(matiere || '|' || to_char(cree at time zone 'UTC', 'YYYY-MM-DD') || '|' || note::text || '|' || sur::text || '|' || chapitre);

delete from documents d using (
  select id, row_number() over (partition by famille_id, matiere, titre, date, contenu order by id) as rang
  from documents
) x where d.id = x.id and x.rang > 1;

update documents set pronote_id = md5(matiere || '|' || date::text || '|' || titre || '|' || contenu)
where pronote_id is distinct from md5(matiere || '|' || date::text || '|' || titre || '|' || contenu);
