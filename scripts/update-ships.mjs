// Tient à jour ships.json : tous les bateaux du jeu.
// Source : https://github.com/blzn50/optc-ships (base de données des bateaux, licence MIT),
// dont les données sont écrites en TypeScript (src/data/units.ts et src/data/details.ts).
// Lancé automatiquement chaque jour par GitHub Actions (.github/workflows/update-ships.yml).
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const REPO = 'blzn50/optc-ships';
const RAW = `https://raw.githubusercontent.com/${REPO}/master/src/data`;
const OUT = 'ships.json';

async function get(file) {
  const res = await fetch(`${RAW}/${file}`);
  if (!res.ok) throw new Error(`${file} : HTTP ${res.status}`);
  return res.text();
}

// Mêmes fonctions que src/lib/utils.ts : certains Thousand Sunny changent d'effet selon la date (heure PST)
function convertToPSTTimestamp() {
  const d = new Date();
  d.setHours(d.getUTCHours() - 8);
  return d.getTime();
}
function getPSTTimestamp(s) {
  return new Date(s + 'Z').getTime() - 8 * 3600e3;
}

// Transforme un module TS « export const nom = … » en valeur JS
function evalModule(ts, name, args = {}) {
  const js = stripTypeScriptTypes(ts)
    .replace(/^\s*import[\s\S]*?from\s*['"][^'"]+['"];?/gm, '')
    .replace(/^export\s+const\s+/gm, 'const ');
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(args), `${js}\nreturn ${name};`)(...Object.values(args));
}

const str = (x) => (x == null || x === '' || x === '-' ? null : String(x));
const num = (x) => (x == null || x === '' || x === '-' ? null : Number(x));
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length)));

const details = evalModule(await get('details.ts'), 'details');
const units = evalModule(await get('units.ts'), 'units', { details, convertToPSTTimestamp, getPSTTimestamp });

const ships = units.map((u) => {
  const d = details[u.id] || {};
  const eff = d.effect || [];
  const mod = d.modification;
  return clean({
    id: u.id,
    name: u.name,
    // effet au niveau max (ou effet actuel pour les bateaux d'anniversaire)
    effect: str(u.effect),
    special: u.hasSpecial !== 'no' ? str(u.special) : null,
    // spécial disponible seulement après le rang de modification 5
    specialAfterMod: u.hasSpecial === 'afterMRank5' || null,
    cd: num((mod && mod.cd && mod.cd[mod.cd.length - 1]) ?? (d.cd && d.cd[d.cd.length - 1])),
    cola: num(u.colaCount) || null,
    superCola: num(u.superColaCount) || null,
    obtain: str(d.obtain),
    note: str(d.note),
    specialEffect1: str(d.specialEffect1),
    specialEffect2: str(d.specialEffect2),
    // un niveau par ligne (ou une période pour les Thousand Sunny d'anniversaire)
    levels: eff.map((e, i) => clean({
      effect: str(e),
      period: str(d.period && d.period[i]),
      cola: num(d.cola && d.cola[i]),
      superCola: num(d.superCola && d.superCola[i]),
      special: str(d.special && d.special[i]),
      cd: num(d.cd && d.cd[i]),
    })),
    mods: mod ? (mod.phase || []).map((p, i) => clean({
      phase: num(p),
      effect: str(mod.effect && mod.effect[i]),
      special: str(mod.special && mod.special[i]),
      cd: num(mod.cd && mod.cd[i]),
    })) : null,
  });
}).sort((a, b) => a.id - b.id);

// Garde-fou : on ne remplace pas le fichier par des données cassées
const bad = ships.filter((s) => !Number.isInteger(s.id) || !s.name || !s.effect);
if (ships.length < 60 || bad.length) {
  console.error(`Données inattendues : ${ships.length} bateaux, ${bad.length} incomplet(s)`, bad.map((s) => s.id));
  process.exit(1);
}

const out = JSON.stringify({ source: REPO, ships });
const before = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
if (out !== before) fs.writeFileSync(OUT, out);
console.log(`${ships.length} bateaux (dernier : #${ships[ships.length - 1].id} ${ships[ships.length - 1].name})${out === before ? ', aucun changement' : ''}`);
