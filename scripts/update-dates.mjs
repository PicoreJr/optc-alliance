// Tient à jour dates.json : la date d'ajout de chaque perso dans OPTC-DB.
// Lancé automatiquement chaque jour par GitHub Actions (.github/workflows/update-dates.yml).
// - Premier lancement (pas de dates.json) : reconstruit tout depuis l'historique git d'OPTC-DB.
// - Ensuite : ajoute seulement les nouveaux persos, datés du dernier ajout dans OPTC-DB.
import fs from 'node:fs';
import { execFileSync, execFile } from 'node:child_process';

const REPO = '2Shankz/optc-db.github.io';
const FILE = 'common/data/units.js';
const OUT = 'dates.json';

function unitsOf(text) {
  const w = {};
  try { new Function('window', text)(w); } catch (e) { return null; }
  const u = w.units;
  const list = [];
  if (Array.isArray(u)) u.forEach((x, i) => { if (x && x[0]) list.push([i + 1, String(x[0])]); });
  else if (u) {
    for (const k in u) {
      const x = u[k];
      const id = String(x?.id ?? k);
      if (x?.name && /^\d+$/.test(id)) list.push([Number(id), String(x.name)]);
    }
  }
  return list;
}

// Nom du perso sans le titre (« Luffy - Gear 5 » -> « luffy »)
const norm = (s) => String(s).toLowerCase().replace(/^\s*(\[[^\]]*\]\s*)+/, '').replace(/^[^a-z0-9]+/, '')
  .split(/\s+-\s+|,\s|:\s/)[0].replace(/[^a-z0-9]/g, '');
const same = (a, b) => !!a && !!b && (a.startsWith(b) || b.startsWith(a) || a.slice(0, 5) === b.slice(0, 5));

async function backfill() {
  const dir = process.env.OPTC_CLONE || 'optc-history';
  if (!fs.existsSync(dir)) {
    execFileSync('git', ['clone', '-q', '--filter=blob:none', '--no-checkout', `https://github.com/${REPO}.git`, dir]);
  }
  const commits = execFileSync('git', ['-C', dir, 'log', '--format=%H %ad', '--date=short', '--', FILE], { maxBuffer: 1e8 })
    .toString().trim().split('\n').map((l) => l.split(' '));
  const hist = {};
  let next = 0;
  const show = (h) => new Promise((res) => execFile('git', ['-C', dir, 'show', `${h}:${FILE}`], { maxBuffer: 1e8 }, (e, out) => res(e ? null : out)));
  const worker = async () => {
    while (next < commits.length) {
      const [h, d] = commits[next++];
      const list = unitsOf(await show(h) || '');
      if (list) for (const [id, name] of list) (hist[id] = hist[id] || []).push([d, name]);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));

  const current = unitsOf(execFileSync('git', ['-C', dir, 'show', `HEAD:${FILE}`], { maxBuffer: 1e8 }).toString());
  const dates = {};
  for (const [id, name] of current) {
    const h = (hist[id] || []).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    if (!h.length) continue;
    let d = h[0][0];
    // les ID 5000+ ont été réutilisés : on prend le début du perso actuel
    if (id >= 5000) {
      const cur = norm(name);
      let x = null;
      for (let i = h.length - 1; i >= 0; i--) { if (same(norm(h[i][1]), cur)) x = h[i][0]; else break; }
      d = x || h[h.length - 1][0];
    }
    dates[id] = d;
  }
  return dates;
}

async function incremental(dates) {
  const text = await (await fetch(`https://raw.githubusercontent.com/${REPO}/master/${FILE}`)).text();
  const headers = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
  let day = new Date().toISOString().slice(0, 10);
  try {
    const commits = await (await fetch(`https://api.github.com/repos/${REPO}/commits?path=${FILE}&per_page=1`, { headers })).json();
    day = (commits[0]?.commit?.committer?.date || day).slice(0, 10);
  } catch (e) { /* on garde la date du jour */ }
  let added = 0;
  for (const [id] of unitsOf(text) || []) {
    if (dates[id]) continue;
    dates[id] = day;
    added++;
  }
  console.log(`${added} nouveau(x) perso(s) daté(s) au ${day}`);
  return dates;
}

let dates;
if (fs.existsSync(OUT)) dates = await incremental(JSON.parse(fs.readFileSync(OUT, 'utf8')));
else { dates = await backfill(); console.log(`${Object.keys(dates).length} persos datés depuis l'historique`); }

const sorted = Object.fromEntries(Object.entries(dates).sort((a, b) => a[0] - b[0]));
fs.writeFileSync(OUT, JSON.stringify(sorted));
