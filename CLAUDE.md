# CLAUDE.md

Site privé de l'alliance OPTC **[CG]Shishisonson** : persos, bateaux, équipes partagées par mode de jeu,
guides PvP et box des membres. L'utilisateur écrit en français : réponses, commentaires de code et
messages de commit en français.

## Stack
- **Aucun build, aucune dépendance** : HTML + CSS + JavaScript vanilla en modules ES (`<script type="module">`),
  servis tels quels (site statique). Ne pas ajouter de framework, bundler ou `package.json`.
- **Supabase** pour les données partagées, uniquement via des fonctions RPC protégées par le code d'accès
  (`api.js`). Pas d'accès direct aux tables. Le SQL (`supabase_update_v2.sql`) n'est volontairement **pas**
  dans le dépôt : tout changement côté base doit être signalé à l'utilisateur, pas supposé.
- Données de jeu chargées à l'exécution depuis GitHub (voir « Sources de données »).

## Structure
| Fichier | Rôle |
|---|---|
| `index.html` | Coquille de la page, charge `app.js` |
| `app.js` | Connexion (code), barre d'onglets, routage par hash (`#/chars`, `#/ships`, `#/pvp/...`, `#/kizuna/<id>/<stage>`, `#/tm`, `#/member/<id>`…), état partagé `app` |
| `config.js` | **Seul fichier de réglages** : nom, Supabase, URLs des sources, formats d'équipe (`FORMATS`), modes (`EVENTS`) |
| `i18n.js` | Textes FR / EN (`t('clé', { var })`), `fmtDate`, `fmtNumber` |
| `api.js` | Appels RPC Supabase (`login`, `get_all`, `save_team`, `save_member`…) |
| `data.js` | Chargement persos OPTC-DB (cache IndexedDB), dates d'ajout, bateaux (`SHIPS`, `loadShips`, `shipOf`), URLs d'images |
| `ui.js` | `esc`, `$`/`$$`, modales, toasts, vignettes (`thumb`, `shipThumb`, `shipArt`), `richText`/`shipText`, `UnitBrowser` (navigateur de persos réutilisé partout), `pickUnit` |
| `views/chars.js` | Onglet Personnages + fiche perso (`openUnit`) |
| `views/ships.js` | Onglet Bateaux, fiche bateau (`openShip`), sélecteur (`pickShip`) |
| `views/teams.js` | Liste + éditeur d'équipes, réutilisés par tous les modes (`renderTeamList`, `openEditor`, `normalizeLineup`) |
| `views/pvp.js`, `kizuna.js`, `modes.js` | Onglets PvP (équipes + guides), Kizuna (événements → équipes Boss / Super Boss), TM / PKA / Coop / Blitz |
| `views/alliance.js`, `box.js` | Membres, profils et box détaillée |
| `style.css` | Styles de base puis thème « encre » (noir & blanc manga) qui surcharge en fin de fichier |

## Sources de données (mises à jour automatiques)
- **Persos** : fork OPTC-DB `2Shankz/optc-db.github.io` (`common/data/*.js`, du JS `window.x = …` évalué par `data.js`).
- **Dates d'ajout** : `dates.json`, par `scripts/update-dates.mjs` (workflow quotidien `update-dates.yml`).
- **Bateaux** : `ships.json`, converti depuis [blzn50/optc-ships](https://github.com/blzn50/optc-ships)
  (fichiers TypeScript `src/data/units.ts` + `details.ts`) par `scripts/update-ships.mjs` (Node ≥ 22.13 pour
  `stripTypeScriptTypes`, workflow quotidien `update-ships.yml`). IDs stables ; l'ID 31 n'existe pas.
  Images : `public/icon/ship_XXXX_thumbnail.png` et `public/full/ship_XXXX_full.png` de ce dépôt.
- **Guide PvP** : `pvp-guide.json`, par `scripts/update-guide.mjs` depuis la Google Sheet de Nydato
  (workflow `update-guide.yml`, dépend de `sharp`).
- Les JSON générés sont lus d'abord sur `raw.githubusercontent.com/PicoreJr/optc-alliance/main/…` puis en local :
  ne pas les éditer à la main, relancer le script (`node scripts/update-ships.mjs`, etc.).
- Images : jsDelivr d'abord, `raw.githubusercontent.com` en secours ; chaque `<img>` a une chaîne de repli
  (`__thumbErr`, `__shipErr`) jusqu'à une image neutre.

## Modèle d'une équipe (renvoyée par `get_all`, enregistrée par `save_team`)
`{ id, event_type, title, boss, author, notes, created_at, updated_at, units }` où `units` (jsonb libre) vaut
`{ groups: [{ slots: [{ u, s }] }], ship, shipId, leader, kz?, stage? }` :
- `u` / `s` : ID du perso et de son support ; `fmt.slots` donne le rôle de chaque emplacement.
- `shipId` (ID dans `ships.json`) + `ship` (nom). Les anciennes équipes n'ont que `ship` tapé à la main :
  `shipOf(shipId, ship)` retrouve le bateau par ID puis par nom exact.
- Kizuna : un événement est une « équipe » `event_type = 'kizuna_ev'` ; ses équipes ont `units.kz` + `units.stage`.
- Toujours passer par `normalizeLineup(team)` pour lire une composition (anciens formats compris).

## Conventions
- Rendu par gabarits HTML (`innerHTML`) : **toute valeur dynamique passe par `esc()`** (ou `richText`/`shipText`,
  qui échappent déjà).
- Tout texte visible passe par `t()` ; ajouter chaque clé **en FR et en EN** dans `i18n.js`.
  Noms et effets des persos / bateaux restent en anglais (sources).
- Style de code existant : fonctions courtes, commentaires brefs en français, pas de classes sauf les navigateurs
  (`UnitBrowser`, `ShipBrowser`), `try/catch` silencieux autour de `localStorage`.
- CSS : utiliser les variables (`--ink`, `--surface`, `--border`, `--radius`, `--shadow`…) pour rester compatible
  avec le thème encre et le mode sombre ; mise en page utilisable en 390 px de large, sans défilement horizontal.
- Nouvel onglet : lien dans `shell()` + branche dans `route()` (`app.js`) + clé `tab.<id>` dans `i18n.js`.
- Nouveau mode de jeu / format d'équipe : `EVENTS` / `FORMATS` dans `config.js` (+ clés `ev.<id>`).

## Tester en local
- `python3 -m http.server 8000` à la racine puis ouvrir `http://localhost:8000/` (les modules ES exigent HTTP).
- Pas de suite de tests. Vérifier au minimum `node --check <fichier>.js` sur chaque fichier modifié, puis dans
  un navigateur (Playwright/Chromium) : Supabase peut être simulé en interceptant `**/rest/v1/rpc/*`
  (`login` → `"admin"`, `get_all` → `{ members, teams }`) et en mettant
  `localStorage['optc.session'] = {"code":"x","role":"admin"}`.
