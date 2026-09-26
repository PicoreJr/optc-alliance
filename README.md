# Site d'alliance OPTC — [CG]Shishisonson

Site privé (protégé par code) avec :
- **Personnages** : tous les persos d'OPTC, mis à jour automatiquement depuis OPTC-DB (fork 2Shankz)
- **Équipes** : équipes partagées par événement (Kizuna, TM, PKA, Blitz, Rumble, Grand Party…)
- **Alliance** : profils des membres et leur box détaillée

## Fichiers
| Fichier | Rôle |
|---|---|
| `config.js` | **Réglages** : nom de l'alliance, Supabase, formats d'équipe, événements |
| `i18n.js` | Textes FR / EN |
| `index.html`, `style.css`, `app.js` | Page, apparence, navigation |
| `api.js`, `data.js`, `ui.js`, `views/` | Base de données, données des persos, écrans |
| `supabase_update_v2.sql` | Script à exécuter **une fois** dans Supabase (ne pas mettre en ligne) |

## Modifier un format d'équipe
Dans `config.js`, section `FORMATS` : chaque format liste ses emplacements (`slots`),
s'il a des supports, un bateau, et combien d'équipes (`groups.min` / `groups.max`).

## Codes
- **Code d'alliance** : accès au site, modification des profils/box, ajout d'équipes.
- **Code admin** : tout ce qui précède + ajouter/supprimer des membres, supprimer des équipes,
  changer les codes (bouton ★ en haut à droite).
