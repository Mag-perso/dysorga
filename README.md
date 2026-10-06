# DysOrga

Appli de devoirs pour un élève dys (TDA, dyspraxie, dyscalculie, dysorthographie), installée sur Android depuis Chrome.

- **Devoirs** : les devoirs arrivent tout seuls depuis Pronote. Chaque consigne peut être lue à voix haute.
- **Cartes mentales** : on prend la leçon en photo avec l'appareil photo de l'appli, ou on part d'un cours qu'un prof a déposé sur Pronote.
- **Mini-tests** : ils portent sur ce qui est étudié en ce moment, et on peut aussi réviser les anciens chapitres.
- **Notes** : un bravo au-dessus de la moyenne, un encouragement en dessous.
- **Bureau et cahiers** : l'élève montre son bureau ou ses cahiers, et l'appli lui donne des consignes une étape à la fois.
- **Thème** : rose, jaune, bleu, ou son fond d'écran. Il peut le changer 2 minutes par jour.
- **Parent** : une alerte sur le téléphone 30 minutes après la fin des cours si les devoirs n'ont pas commencé, une deuxième 30 minutes plus tard, et un message quand tout est fini.

## Règles fixes (côté serveur, dans `supabase/functions/assistant`)

- L'assistant ne donne **jamais** la réponse. Il guide, et il refuse de faire le travail à la place de l'élève.
- L'élève n'a aucun accès à internet : pas de liens, pas de discussion libre. Seul le serveur va chercher les données.
- Pas d'accès à la galerie de photos : seul l'appareil photo de l'appli est utilisé. Si la photo ne montre pas le cours, il est gentiment invité à se recentrer.
- Pas de minuteur, et on ne lui demande jamais de ranger son téléphone.

## Mise en place (une seule fois)

1. **Supabase** (gratuit) : créer un projet sur supabase.com, région Europe.
   - *SQL Editor* : exécuter `supabase/migrations/0001_init.sql`.
   - *Authentication > Sign In / Providers > Email* : désactiver « Confirm email », ou bien confirmer l'e-mail du parent à la première connexion.
2. **Clés** :
   - Générer les clés d'alerte avec `npx web-push generate-vapid-keys`.
   - Créer une clé API sur console.anthropic.com **avec un plafond de dépense mensuel**.
3. **Fonctions du serveur**, avec la CLI Supabase :
   ```sh
   supabase link --project-ref <ref>
   supabase secrets set ANTHROPIC_API_KEY=... CRON_SECRET=<long texte au hasard> \
     VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_CONTACT=mailto:<e-mail> PLAFOND_ASSISTANT_JOUR=60
   supabase functions deploy assistant pronote rappels compte-enfant
   ```
4. **Planificateur** : dans `supabase/cron.sql`, remplacer l'adresse du projet et le `CRON_SECRET`, puis l'exécuter dans le *SQL Editor*. Il lance les rappels toutes les 5 minutes et la synchro Pronote toutes les heures, de 6h à 20h.
5. **GitHub Pages** :
   - *Settings > Pages > Source* : « GitHub Actions ».
   - *Settings > Secrets and variables > Actions > Variables* : ajouter `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` et `VITE_VAPID_PUBLIC_KEY`.
   - Chaque envoi sur `main` met l'appli en ligne à `https://<compte>.github.io/dysorga/`.
6. **Sur les téléphones** : ouvrir l'adresse dans Chrome, puis *menu ⋮ > Ajouter à l'écran d'accueil*.
   - Le parent crée son compte, relie Pronote, active les alertes et crée le compte de l'élève.
   - L'élève se connecte avec l'identifiant et le code à 6 chiffres affichés.

## Développement

```sh
npm install
cp .env.example .env.local   # remplir les valeurs
npm run dev
```

Pronote passe par la bibliothèque non officielle [pawnote](https://github.com/LiterateInk/Pawnote). Les jetons Pronote restent sur le serveur, dans une table que l'appli ne peut pas lire.
