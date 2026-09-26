// Met à jour pvp-guide.json depuis l'« OPTC Rumble Sheet » de Nydato (Google Sheet public).
// Lancé chaque jour par GitHub Actions (.github/workflows/update-guide.yml).
//
// 1. télécharge les onglets de la fiche (vue HTML publique)
// 2. reconnaît chaque image : icône (type, classe, tier…), perso OPTC-DB, ou image à garder telle quelle
// 3. extrait les compos meta, tier lists, compos détaillées, leaders et règles GP
// 4. une section illisible garde sa version précédente (et le workflow signale l'erreur)
//
// Les parties écrites à la main (boss d'Assault Rumble, EXP) sont dans scripts/guide-static.json.
import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { TABS, parseGrid, extractAll, checkSections } from './guide-core.mjs';

const SHEET = process.env.GUIDE_SHEET || 'https://docs.google.com/spreadsheets/d/1IvYZjjs9SAMF9L_Wj9ql-5hqg5tgcOVNYvfFZSKWroI';
const OPTC = 'https://raw.githubusercontent.com/2Shankz/optc-db.github.io/master';
const OUT = 'pvp-guide.json';
const REFS = 'scripts/guide-refs.json';
const ICONS = 'scripts/guide-icons.json';
const STATIC = 'scripts/guide-static.json';

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, kind = 'text') {
  let err;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'optc-alliance-guide' } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      return kind === 'buf' ? Buffer.from(await r.arrayBuffer()) : await r.text();
    } catch (e) { err = e; await sleep(1000 * (i + 1)); }
  }
  throw err;
}
async function pool(items, n, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (next < items.length) { const i = next++; await fn(items[i], i); } }));
}

// Empreinte d'une image : 64x64 puis moyenne RGB de 8x8 blocs (192 valeurs)
async function fingerprint(buf) {
  const meta = await sharp(buf).metadata();
  const { data } = await sharp(buf).flatten({ background: '#000000' }).resize(64, 64, { fit: 'fill' })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const v = new Uint8Array(192); let k = 0;
  for (let by = 0; by < 8; by++) {
    for (let bx = 0; bx < 8; bx++) {
      let r = 0; let g = 0; let b = 0;
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const i = ((by * 8 + y) * 64 + bx * 8 + x) * 3;
          r += data[i]; g += data[i + 1]; b += data[i + 2];
        }
      }
      v[k++] = Math.round(r / 64); v[k++] = Math.round(g / 64); v[k++] = Math.round(b / 64);
    }
  }
  return { v, w: meta.width || 0, h: meta.height || 0 };
}
const dist = (a, b) => { let s = 0; for (let i = 0; i < 192; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s / 192); };
const b64 = (v) => Buffer.from(v).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

// ---------- empreintes des vignettes OPTC-DB (mises en cache dans le dépôt) ----------
function thumbPath(id, region) {
  return `${OPTC}/api/images/thumbnail/${region}/${Math.trunc(id / 1000)}/${Math.trunc((id % 1000) / 100)}00/${String(id).padStart(4, '0')}.png`;
}
async function loadRefs() {
  const refs = readJson(REFS, {});
  const w = {};
  new Function('window', await get(`${OPTC}/common/data/units.js`))(w);
  const u = w.units;
  const ids = [];
  if (Array.isArray(u)) u.forEach((x, i) => { if (x && x[0]) ids.push(i + 1); });
  else for (const k in u) { const id = String(u[k]?.id ?? k); if (/^\d+$/.test(id)) ids.push(Number(id)); }
  const maxId = Math.max(...ids);
  // à calculer : les persos jamais vus, et les récents encore sans vignette
  const todo = ids.filter((id) => !(id in refs) || (refs[id] === '' && id > maxId - 300));
  console.log(`vignettes OPTC-DB : ${Object.keys(refs).length} en cache, ${todo.length} à calculer`);
  await pool(todo, 16, async (id) => {
    let buf = await get(thumbPath(id, 'glo'), 'buf').catch(() => null);
    if (!buf) buf = await get(thumbPath(id, 'jap'), 'buf').catch(() => null);
    try { refs[id] = buf ? b64((await fingerprint(buf)).v) : ''; } catch (e) { refs[id] = ''; }
  });
  const sorted = Object.fromEntries(Object.entries(refs).sort((a, b) => a[0] - b[0]));
  fs.writeFileSync(REFS, JSON.stringify(sorted));
  return Object.entries(sorted).filter(([, v]) => v).map(([k, v]) => [Number(k), unb64(v)]);
}

// ---------- programme ----------
const prev = readJson(OUT, {});
const stat = readJson(STATIC, { images: {} });

const refs = await loadRefs();
if (process.env.REFS_ONLY) process.exit(0);
const icons = [];
for (const [file, data] of Object.entries(readJson(ICONS, {}))) {
  icons.push([file.replace(/\.png$/, '').replace(/-\d+$/, '').replace(/_/g, ' '), (await fingerprint(Buffer.from(data, 'base64'))).v]);
}

// 1. onglets de la fiche
const html = {};
for (const [k, gid] of Object.entries(TABS)) html[k] = await get(`${SHEET}/htmlview/sheet?headers=true&gid=${gid}`);

// 2. images
const urls = []; const idx = new Map();
const imgToken = (src) => {
  if (!/^https?:/.test(src)) return '';
  const key = src.replace(/=[^/=]*$/, '');
  if (!idx.has(key)) { idx.set(key, urls.length); urls.push(key); }
  return `⟦${idx.get(key)}⟧`;
};
const G = {};
for (const k in html) G[k] = parseGrid(html[k], imgToken);

const IMG = []; const newImages = {}; const stats = { icon: 0, unit: 0, image: 0, ignored: 0, error: 0 };
await pool(urls, 8, async (url, n) => {
  try {
    const buf = await get(url, 'buf');
    const f = await fingerprint(buf);
    let bi = null; let bd = 1e9;
    for (const [name, v] of icons) { const d = dist(f.v, v); if (d < bd) { bd = d; bi = name; } }
    if (bd < 10) { IMG[n] = { t: 'i', name: bi }; stats.icon++; return; }
    let b = 1e9; let bid = null; let b2 = 1e9;
    for (const [id, v] of refs) {
      const d = dist(f.v, v);
      if (d < b) { if (id !== bid) b2 = b; b = d; bid = id; } else if (d < b2 && id !== bid) b2 = d;
    }
    if (b < 25 && b / b2 < 0.8) { IMG[n] = { t: 'u', id: bid }; stats.unit++; return; }
    if (f.w >= 90 && f.h >= 90) {
      const key = 'x' + crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);
      const jpg = await sharp(buf).resize(80, 80, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' }).jpeg({ quality: 82 }).toBuffer();
      newImages[key] = 'data:image/jpeg;base64,' + jpg.toString('base64');
      IMG[n] = { t: 'x', key }; stats.image++; return;
    }
    IMG[n] = { t: '-' }; stats.ignored++;
  } catch (e) { IMG[n] = { t: '-' }; stats.error++; console.log('image illisible :', url.slice(0, 80), e.message); }
});
console.log(`images de la fiche : ${urls.length}`, stats);

// 3. extraction + contrôles
const data = extractAll(G, IMG);
const ok = checkSections(data);
const failed = Object.entries(ok).filter(([, v]) => !v).map(([k]) => k);
const pick = (k) => (ok[k] ? data[k] : prev[k]);
const guide = {
  source: pick('source') || { author: 'Nydato' },
  gpRules: pick('gpRules'),
  assault: stat.assault || prev.assault,
  exp: stat.exp || prev.exp,
  metaComps: pick('metaComps'),
  tierList: pick('tierList'),
  gpTier: pick('gpTier'),
  comps: pick('comps'),
  gpLeaders: pick('gpLeaders'),
  images: {},
};
// images réellement utilisées (nouvelles, statiques ou reprises de la version précédente)
const used = new Set();
JSON.stringify(guide, (k, v) => { if (typeof v === 'string' && /^x[0-9a-f]+$/.test(v)) used.add(v); return v; });
for (const key of [...used].sort()) {
  const src = newImages[key] || (stat.images || {})[key] || (prev.images || {})[key];
  if (src) guide.images[key] = src;
}

const text = JSON.stringify(guide);
const before = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
const strip = (s) => { try { const o = JSON.parse(s); return JSON.stringify({ ...o, images: Object.keys(o.images || {}).sort() }); } catch (e) { return ''; } };
if (strip(text) !== strip(before)) {
  fs.writeFileSync(OUT, text);
  console.log(`pvp-guide.json mis à jour (${(text.length / 1024).toFixed(0)} Ko) — fiche du ${guide.source.updated}, patch ${guide.source.patch}`);
} else console.log('pvp-guide.json : rien de nouveau');
console.log('compos meta :', (guide.metaComps || []).length, '| compos détaillées :', (guide.comps || []).length, '| leaders GP :', (guide.gpLeaders || []).length);

if (failed.length) {
  console.log(`::error::Sections illisibles (version précédente conservée) : ${failed.join(', ')}. La mise en page de la fiche a peut-être changé.`);
  process.exit(2);
}
