// Chargement des données de personnages depuis OPTC-DB (fork 2Shankz).
// Les fichiers sont gardés en cache sur l'appareil (IndexedDB) pour un
// affichage instantané, puis rafraîchis en arrière-plan à chaque visite.
import { CONFIG } from './config.js';

// ---------- petit cache IndexedDB ----------
const DB_NAME = 'optc-alliance-cache';
let dbPromise = null;
function idb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore('files');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }
  return dbPromise;
}
async function cacheGet(key) {
  const db = await idb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const r = db.transaction('files').objectStore('files').get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}
async function cachePut(key, value) {
  const db = await idb();
  if (!db) return;
  try { db.transaction('files', 'readwrite').objectStore('files').put(value, key); } catch (e) { /* plein ou indisponible */ }
}

// ---------- téléchargement ----------
async function fetchText(path) {
  let lastErr;
  for (const base of CONFIG.dataSources) {
    try {
      const res = await fetch(`${base}/${path}`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

// Les fichiers OPTC-DB sont du JS du type « window.units = {...} ».
function evaluate(text) {
  const target = {};
  // eslint-disable-next-line no-new-func
  new Function('window', text)(target);
  return target;
}

// Renvoie les données en cache tout de suite si possible, et met le cache
// à jour en arrière-plan (onFresh est appelé si une version plus récente arrive).
async function loadFile(path, onFresh) {
  const cached = await cacheGet(path);
  if (cached) {
    fetchText(path).then((text) => {
      if (text !== cached.text) {
        cachePut(path, { text, at: Date.now() });
        if (onFresh) onFresh(evaluate(text));
      }
    }).catch(() => {});
    return evaluate(cached.text);
  }
  const text = await fetchText(path);
  cachePut(path, { text, at: Date.now() });
  return evaluate(text);
}

// ---------- normalisation ----------
function flat(x, out = []) {
  if (Array.isArray(x)) x.forEach((y) => flat(y, out));
  else if (x) out.push(x);
  return out;
}

export const TYPES = ['STR', 'DEX', 'QCK', 'PSY', 'INT'];
export const CLASSES = ['Fighter', 'Slasher', 'Striker', 'Shooter', 'Free Spirit', 'Cerebral', 'Powerhouse', 'Driven', 'Evolver', 'Booster'];
export const RARITIES = ['6+', '6', '5+', '5', '4+', '4', '3', '2', '1'];

// Rubriques de la « Collection » du jeu (légendes Sugo-Rare), dans l'ordre du jeu.
// Déduites des drapeaux d'OPTC-DB : un nouveau perso se range tout seul.
export const SUGO_GROUPS = ['super', 'anni', 'pf', 'tm', 'kizuna', 'bazaar', 'sugo'];
function sugoGroup(f) {
  if (f.superlrr) return 'super';   // exclusif au Super Sugo-Fest
  if (f.annilrr) return 'anni';     // anniversaire
  if (f.pflrr) return 'pf';         // Sugo-Fest de la Fête des pirates
  if (f.tmlrr) return 'tm';         // Sugo-Fest des trésors
  if (f.kclrr) return 'kizuna';     // Sugo-Fest de l'Alliance pirate (Kizuna)
  if (f.shop) return 'bazaar';      // Bazar
  return 'sugo';
}

// Dates d'ajout { id: 'AAAA-MM-JJ' }
let ADDED = {};
async function loadDates() {
  for (const url of CONFIG.datesUrls || []) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (res.ok) { ADDED = await res.json(); return; }
    } catch (e) { /* source suivante */ }
  }
}

function buildUnits(w) {
  const units = [];
  const raw = w.units || {};
  const flags = w.flags || {};
  const cds = w.cooldowns || {};
  const evos = w.evolutions || {};
  const starsOf = (id) => { const x = raw[id] || raw[String(id)]; return x && x.stars != null ? String(x.stars) : ''; };
  const isRR = (f) => !!f && Object.keys(f).some((k) => /rr/.test(k));
  // 1re forme de chaque perso : les vieilles légendes ont leur forme 6+★ sous un numéro récent,
  // on les range donc d'après leur forme d'origine (comme en jeu : des plus anciennes aux plus récentes)
  const prev = {};
  for (const from in evos) {
    for (const to of [].concat(evos[from].evolution || [])) if (!prev[to]) prev[to] = Number(from);
  }
  const firstForm = (id) => {
    let r = id;
    for (let i = 0; prev[r] && i < 20; i++) r = prev[r];
    return r;
  };
  // Les persos Dual / VS ont des sous-fiches « 1983-1 », « 1983-2 » qui portent leurs types
  const subTypes = {};
  for (const key in raw) {
    const mm = /^(\d+)-\d+$/.exec(String((raw[key] && raw[key].id) ?? key));
    if (mm) (subTypes[mm[1]] = subTypes[mm[1]] || []).push(...flat(raw[key].type));
  }
  for (const key in raw) {
    const u = raw[key];
    if (!u || !u.name) continue;
    const rawId = String(u.id ?? key);
    if (!/^\d+$/.test(rawId)) continue;
    const id = Number(rawId);
    const isDual = !!subTypes[rawId];
    const types = [...new Set(isDual ? subTypes[rawId] : flat(u.type))];
    const classes = [...new Set(flat(u.class))];
    const f = flags[id] || {};
    const stars = u.stars == null ? '' : String(u.stars);
    // Légende = perso 6★/6+★ des sugos (rare recruit) ou du Bazar, sous sa forme finale
    // (un 6★ qui évolue en 6+★ n'est pas compté deux fois)
    const legend = stars.startsWith('6') && (isRR(f) || !!f.shop)
      && ![].concat((evos[id] || {}).evolution || []).some((to) => starsOf(to).startsWith('6'));
    units.push({
      id,
      name: u.name,
      nameLc: u.name.toLowerCase(),
      types,
      dual: isDual || types.length !== 1,
      classes,
      stars,
      starsNum: parseFloat(stars) || 0,
      legend,
      // rubrique de la Collection et rang d'arrivée (légendes seulement)
      sugo: legend ? sugoGroup(f) : null,
      sugoRank: legend ? firstForm(id) : 0,
      cost: u.cost,
      combo: u.combo,
      sockets: u.sockets || 0,
      maxLevel: u.maxLevel,
      minHP: u.minHP, minATK: u.minATK, minRCV: u.minRCV,
      hp: u.maxHP || 0, atk: u.maxATK || 0, rcv: u.maxRCV || 0,
      global: !!f.global,
      // pas encore daté = ajouté tout récemment
      added: ADDED[id] || null,
      addedSort: ADDED[id] || '9999-99-99',
      flags: f,
      cd: cds[id] || cds[String(id)] || null,
    });
  }
  units.sort((a, b) => a.id - b.id);
  return units;
}

// ---------- API publique ----------
export const DATA = {
  units: [],
  byId: new Map(),
  details: null,
  maxId: 0,
  listeners: new Set(),
};

function setUnits(w) {
  DATA.units = buildUnits(w);
  DATA.byId = new Map(DATA.units.map((u) => [u.id, u]));
  DATA.maxId = DATA.units.length ? DATA.units[DATA.units.length - 1].id : 0;
}

function emit(what) { DATA.listeners.forEach((fn) => fn(what)); }

export async function loadCore() {
  const parts = {};
  const refresh = () => (fresh) => {
    Object.assign(parts, fresh);
    setUnits(parts);
    emit('units');
  };
  const [, u, f, c, e] = await Promise.all([
    loadDates(),
    loadFile('common/data/units.js', refresh('units')),
    loadFile('common/data/flags.js', refresh('flags')).catch(() => ({})),
    loadFile('common/data/cooldowns.js', refresh('cooldowns')).catch(() => ({})),
    loadFile('common/data/evolutions.js', refresh('evolutions')).catch(() => ({})),
  ]);
  Object.assign(parts, u, f, c, e);
  setUnits(parts);
}

let detailsPromise = null;
export function loadDetails() {
  if (!detailsPromise) {
    detailsPromise = loadFile('common/data/details.js', (fresh) => {
      DATA.details = fresh.details || {};
      emit('details');
    }).then((w) => {
      DATA.details = w.details || {};
      emit('details');
      return DATA.details;
    }).catch((e) => {
      detailsPromise = null;
      throw e;
    });
  }
  return detailsPromise;
}

export function getDetails(id) {
  return DATA.details ? DATA.details[id] || null : null;
}

// Texte plat de toutes les capacités d'un perso (pour la recherche).
const abilityCache = new Map();
export function abilityText(id) {
  if (!DATA.details) return '';
  let s = abilityCache.get(id);
  if (s === undefined) {
    const d = DATA.details[id];
    s = d ? JSON.stringify(d).toLowerCase() : '';
    abilityCache.set(id, s);
  }
  return s;
}
DATA.listeners.add((what) => { if (what === 'details') abilityCache.clear(); });

// ---------- images ----------
function folder(id) {
  return `${Math.trunc(id / 1000)}/${Math.trunc((id % 1000) / 100)}00`;
}
// Ordre d'essai des vignettes : Global puis Japon, sur chaque source
export const THUMB_STAGES = CONFIG.imageBases.flatMap((b) => [[b, 'glo'], [b, 'jap']]);
export function thumbUrl(id, stage = 0) {
  const [base, region] = THUMB_STAGES[stage] || THUMB_STAGES[0];
  const pad = String(id).padStart(4, '0');
  return `${base}/api/images/thumbnail/${region}/${folder(id)}/${pad}.png`;
}
// Illustration complète (fond transparent) : CDN d'abord, puis GitHub
export const ART_STAGES = CONFIG.imageBases.map((b) => (id) =>
  `${b}/api/images/full/transparent/${folder(id)}/${String(id).padStart(4, '0')}.png`);
export function artUrl(id, stage = 0) {
  return (ART_STAGES[stage] || ART_STAGES[0])(id);
}
export function bigUrl(id) {
  const pad = String(id).padStart(4, '0');
  return `${CONFIG.imageBases[CONFIG.imageBases.length - 1]}/api/images/full/transparent/${folder(id)}/${pad}.png`;
}
export const NOIMAGE = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#8883"/><text x="5" y="6.6" font-size="5" text-anchor="middle" fill="#8889">?</text></svg>');

// ---------- bateaux ----------
// ships.json (voir scripts/update-ships.mjs) : { source, ships: [{ id, name, effect, special, cd, levels, mods… }] }
export const SHIPS = { list: [], byId: new Map() };

let shipsPromise = null;
export function loadShips() {
  if (!shipsPromise) {
    shipsPromise = (async () => {
      let lastErr;
      for (const url of CONFIG.shipsUrls || []) {
        try {
          const res = await fetch(url, { cache: 'no-cache' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const list = ((await res.json()) || {}).ships || [];
          if (!list.length) throw new Error('vide');
          SHIPS.list = list.map((s) => ({
            ...s,
            nameLc: s.name.toLowerCase(),
            // texte des effets (recherche et filtres type / classe)
            text: [s.effect, s.special, s.specialEffect1, s.specialEffect2].filter(Boolean).join(' '),
          }));
          SHIPS.byId = new Map(SHIPS.list.map((s) => [s.id, s]));
          emit('ships');
          return SHIPS.list;
        } catch (e) { lastErr = e; }
      }
      shipsPromise = null;
      throw lastErr || new Error('ships');
    })();
  }
  return shipsPromise;
}

// Bateau d'une équipe : par son ID, sinon par le nom tapé à la main (anciennes équipes)
export function shipOf(id, name) {
  if (id && SHIPS.byId.has(Number(id))) return SHIPS.byId.get(Number(id));
  const n = String(name || '').trim().toLowerCase();
  return n ? SHIPS.list.find((s) => s.nameLc === n) || null : null;
}

// Vignette (icône), puis grande image, sur chaque source
const pad4 = (id) => String(id).padStart(4, '0');
export const SHIP_STAGES = [
  ...CONFIG.shipImageBases.map((b) => (id) => `${b}/icon/ship_${pad4(id)}_thumbnail.png`),
  ...CONFIG.shipImageBases.map((b) => (id) => `${b}/full/ship_${pad4(id)}_full.png`),
];
export function shipThumbUrl(id, stage = 0) {
  return (SHIP_STAGES[stage] || SHIP_STAGES[0])(id);
}
// Grande image : image complète, puis l'icône si elle manque
export const SHIP_BIG_STAGES = [...SHIP_STAGES.slice(CONFIG.shipImageBases.length), ...SHIP_STAGES.slice(0, CONFIG.shipImageBases.length)];
export function shipBigUrl(id, stage = 0) {
  return (SHIP_BIG_STAGES[stage] || SHIP_BIG_STAGES[0])(id);
}
// Petites icônes utilisées dans les textes d'effets ([EOT_HEAL]…)
export function shipIconUrl(file) {
  return `${CONFIG.shipImageBases[0]}/${file}`;
}
