// ============================================================
//  Configuration du site — c'est le seul fichier à modifier
//  pour changer le nom, la base Supabase ou la source des données.
// ============================================================

export const CONFIG = {
  allianceName: '[CG]Shishisonson',

  // Supabase (clé publique « publishable » : elle peut être visible)
  supabaseUrl: 'https://ewtecoqdeppprchfqdce.supabase.co',
  supabaseKey: 'sb_publishable_UHixiOYqTD0C9Jg_Y9BfMw_NZj2NSY-',

  // Source des personnages (fork maintenu d'OPTC-DB)
  dataSources: [
    'https://raw.githubusercontent.com/2Shankz/optc-db.github.io/master',
    'https://cdn.jsdelivr.net/gh/2Shankz/optc-db.github.io@master',
  ],
  // Les images viennent du même dépôt (CDN d'abord, puis GitHub en secours)
  imageBases: [
    'https://cdn.jsdelivr.net/gh/2Shankz/optc-db.github.io@master',
    'https://raw.githubusercontent.com/2Shankz/optc-db.github.io/master',
  ],
  // Dates d'ajout des persos (mises à jour chaque jour par GitHub Actions)
  datesUrls: [
    'https://raw.githubusercontent.com/PicoreJr/optc-alliance/main/dates.json',
    'dates.json',
  ],
  // Page de détail d'un perso sur OPTC-DB (lien externe)
  optcDbUnitUrl: 'https://2shankz.github.io/optc-db.github.io/characters/#/view/',
};

// ------------------------------------------------------------
//  Formats d'équipe (premier jet, facile à ajuster)
//  slots : rôle de chaque emplacement ; 'friend' = ami capitaine
//  groups.min / groups.max : nombre d'équipes dans une composition
// ------------------------------------------------------------
export const FORMATS = {
  standard: {
    groups: { min: 1, max: 1 },
    slots: ['captain', 'friend', 'crew', 'crew', 'crew', 'crew'],
    supports: true,
    ship: true,
  },
  rumble: {
    groups: { min: 1, max: 1 },
    slots: ['pos1', 'pos2', 'pos3', 'pos4', 'pos5'],
    supports: false,
    ship: false,
  },
  grandparty: {
    groups: { min: 1, max: 8 },
    slots: ['leader', 'member', 'member'],
    supports: false,
    ship: false,
  },
};

// Événements proposés dans l'onglet Équipes
export const EVENTS = [
  { id: 'kizuna',   format: 'standard',   color: '#e0533d' },
  { id: 'tm',       format: 'standard',   color: '#d69a1f' },
  { id: 'pka',      format: 'standard',   color: '#8a5cd6' },
  { id: 'blitz',    format: 'standard',   color: '#2f9e6e' },
  { id: 'prumble',  format: 'rumble',     color: '#2b7fd4' },
  { id: 'arumble',  format: 'rumble',     color: '#1f9bb0' },
  { id: 'gp',       format: 'grandparty', color: '#c9468f' },
  { id: 'other',    format: 'standard',   color: '#6b7280' },
];

// Types de sockets (skill books)
export const SOCKETS = [
  'dmg', 'cd', 'bind', 'despair', 'heal', 'map', 'slot', 'poison', 'resil',
];

// Niveaux de Limit Break
export const LB_LEVELS = ['none', 'lb', 'lbx', 'llb', 'rainbow'];
