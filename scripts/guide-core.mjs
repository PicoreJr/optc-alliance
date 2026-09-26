// Lecture de l'« OPTC Rumble Sheet » (Google Sheet de Nydato) -> données du guide PvP.
// Aucune dépendance : fonctionne dans Node (GitHub Actions) comme dans un navigateur.
//
// Chaque cellule devient un texte ; les images y sont remplacées par des jetons ⟦n⟧
// qui renvoient à IMG[n] = { t: 'u', id } (perso OPTC-DB) | { t: 'i', name } (icône)
// | { t: 'x', key } (image à intégrer telle quelle) | { t: '-' } (ignorée).

export const TABS = {
  meta: 475890873, // 2A. META TEAMS COMPS
  comps: 2096562606, // 2B. COMPS & SUBS
  tier: 1585785245, // 4A. PR CHARACTER TIER LIST
  gptier: 538256902, // 4B. GP LEADERS TIER LIST
  gprules: 1131153608, // 5A. GP RULES
  leaders: 1910664322, // 5B. GP LEADERS
};

const TIERS = /^(OP|SS|S|A|B|C|D)$/;
const TOK = /⟦(\d+)⟧/g;

function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|#39);/gi, (m, e) => {
    const k = e.toLowerCase();
    if (k === 'amp') return '&';
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'quot') return '"';
    if (k === 'apos' || k === '#39') return "'";
    if (k === 'nbsp') return '\u00a0';
    if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16));
    return String.fromCodePoint(parseInt(k.slice(1), 10));
  });
}

// Tableau HTML (htmlview) -> grille 2D de textes, cellules fusionnées dépliées
export function parseGrid(html, imgToken) {
  const t0 = html.search(/<table[^>]*class="[^"]*waffle/);
  const start = t0 >= 0 ? t0 : html.indexOf('<table');
  const end = html.indexOf('</table>', start);
  const table = html.slice(start, end);
  const body = table.slice(Math.max(0, table.indexOf('<tbody')));
  const rows = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/g;
  let m; let r = 0;
  while ((m = trRe.exec(body))) {
    rows[r] = rows[r] || [];
    let c = 0;
    const cellRe = /<(td|th)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g;
    let cm;
    while ((cm = cellRe.exec(m[1]))) {
      if (cm[1] === 'th') continue;
      while (rows[r][c] !== undefined) c++;
      const attrs = cm[2] || '';
      const inner = cm[3] || '';
      const toks = [];
      for (const im of inner.matchAll(/<img\b[^>]*?src="([^"]*)"/g)) {
        const tk = imgToken(decode(im[1]));
        if (tk) toks.push(tk);
      }
      const txt = decode(inner.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ''))
        .replace(/[ \t]+\n/g, '\n').trim();
      const val = [txt, ...toks].filter(Boolean).join(' ');
      const rs = Number((attrs.match(/rowspan="(\d+)"/) || [])[1]) || 1;
      const cs = Number((attrs.match(/colspan="(\d+)"/) || [])[1]) || 1;
      for (let a = 0; a < rs; a++) {
        for (let b = 0; b < cs; b++) {
          rows[r + a] = rows[r + a] || [];
          rows[r + a][c + b] = (a || b) ? '' : val;
        }
      }
      c += cs;
    }
    r++;
  }
  return rows.map((row) => Array.from(row || [], (x) => x ?? ''));
}

// ---------- extraction ----------
export function extractAll(G, IMG) {
  const cell = (row, c) => (row && row[c]) || '';
  const toks = (s) => [...String(s || '').matchAll(TOK)].map((x) => Number(x[1]));
  const isIcon = (n) => IMG[n] && IMG[n].t === 'i';
  const uref = (n) => {
    const x = IMG[n];
    if (!x) return null;
    if (x.t === 'u') return x.id;
    if (x.t === 'x') return x.key;
    return null;
  };
  const unitsIn = (row, from, to) => {
    const out = [];
    for (let c = from; c <= to; c++) {
      for (const n of toks(cell(row, c))) {
        const x = IMG[n];
        if (!x || x.t === 'i' || x.t === '-') continue;
        out.push([c, uref(n)]);
      }
    }
    return out;
  };
  const iconsIn = (row, from, to) => {
    const out = [];
    for (let c = from; c <= to; c++) for (const n of toks(cell(row, c))) if (isIcon(n)) out.push(IMG[n].name);
    return out;
  };
  const text = (s) => String(s || '').replace(TOK, '').trim();
  const flat = (g) => g.flat().join('\n');
  const out = {};

  // --- 2A : compos meta ---
  const A = G.meta;
  if (A) {
    const meta = [];
    for (let r = 0; r < A.length; r++) {
      const tier = text(cell(A[r], 1));
      if (!TIERS.test(tier)) continue;
      const ir = A[r + 1] || [];
      let label = '';
      for (let c = 5; c <= 12; c++) { if (text(ir[c])) { label = text(ir[c]); break; } }
      const icons = iconsIn(ir, 5, 12);
      let ur = r + 2;
      while (ur < A.length && !unitsIn(A[ur], 5, 23).length) ur++;
      const us = unitsIn(A[ur], 5, 23);
      meta.push({ tier, label, icons, main: us.filter((x) => x[0] < 13).map((x) => x[1]), sub: us.filter((x) => x[0] >= 13).map((x) => x[1]) });
    }
    out.metaComps = meta;
    const txt = flat(A);
    const patch = (A.find((row) => row.some((x) => /^Patch:/.test(text(x)))) || []).map(text).filter(Boolean)[1];
    const upd = txt.match(/Last Update:\s*(?:\n|\s)*?(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    let updated = '';
    const updRow = A.find((row) => row.some((x) => /^Last Update:/.test(text(x))));
    if (updRow) {
      const d = updRow.map(text).find((x) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(x));
      if (d) { const [dd, mm, yy] = d.split('/'); updated = `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`; }
    } else if (upd) updated = `${upd[3]}-${upd[2].padStart(2, '0')}-${upd[1].padStart(2, '0')}`;
    out.source = { author: 'Nydato', patch: patch || '', updated };
  }

  // --- 4A : tier list des persos ---
  const T = G.tier;
  if (T) {
    const legend = {};
    for (let r = 2; r < 11 && r < T.length; r++) { const ic = iconsIn(T[r], 14, 14)[0]; if (ic) legend[ic] = text(cell(T[r], 15)); }
    const tiers = []; let cur = null; let grp = null;
    for (let r = 12; r < T.length; r++) {
      const ic = iconsIn(T[r], 3, 3)[0];
      if (ic) { cur = { tier: ic, groups: [] }; tiers.push(cur); grp = null; }
      const cost = text(cell(T[r], 6)).match(/(\d+)\s*COST/);
      if (cost && cur) { grp = { cost: Number(cost[1]), ids: [] }; cur.groups.push(grp); }
      if (grp) grp.ids.push(...unitsIn(T[r], 8, 17).map((x) => x[1]));
    }
    out.tierList = { legend, tiers, updated: (flat(T).match(/Last Update:\s*(\d{4}-\d{2}-\d{2})/) || [])[1] };
  }

  // --- 4B : tier list des leaders GP ---
  const B = G.gptier;
  if (B) {
    const legend = {};
    for (let r = 2; r < 11 && r < B.length; r++) { const ic = iconsIn(B[r], 11, 11)[0]; if (ic) legend[ic] = text(cell(B[r], 12)); }
    const tiers = []; let cur = null;
    for (let r = 12; r < B.length; r++) {
      const ic = iconsIn(B[r], 3, 3)[0];
      if (ic) { cur = { tier: ic, groups: [{ ids: [] }] }; tiers.push(cur); }
      if (cur) cur.groups[0].ids.push(...unitsIn(B[r], 5, 14).map((x) => x[1]));
    }
    out.gpTier = { legend, tiers, updated: (flat(B).match(/Last Update:\s*(\d{4}-\d{2}-\d{2})/) || [])[1] };
  }

  // --- 2B : compos détaillées et remplaçants ---
  const C = G.comps;
  if (C) {
    const heads = [];
    C.forEach((row, i) => { if (text(cell(row, 4)) === 'MAIN COMP') heads.push(i); });
    out.comps = heads.map((h, bi) => {
      const end = bi + 1 < heads.length ? heads[bi + 1] : C.length;
      const roles = [];
      for (let c = 6; c < 33; c++) { const t = text(cell(C[h], c)); if (t) roles.push([c, t]); }
      const icon = iconsIn(C[h + 1], 1, 3);
      const rank = iconsIn(C[h + 2], 33, 35)[0] || '';
      const strong = iconsIn(C[h + 2], 36, 39);
      const weak = iconsIn(C[h + 2], 40, 45);
      let title = ''; let req = '';
      const lines = []; let opt = false;
      const uRows = [];
      for (let r = h + 1; r < end; r++) {
        if (text(cell(C[r], 4)) === 'OPTIONS AND REPLACEMENTS') uRows.push(['opt', r]);
        if (unitsIn(C[r], 6, 31).length) uRows.push(['u', r]);
        if (!title && /[A-Za-z]/.test(text(cell(C[r], 1)))) title = text(cell(C[r], 1));
        for (const c of [34, 35]) if (/•/.test(cell(C[r], c))) req = text(cell(C[r], c));
      }
      uRows.forEach(([k, r], i) => {
        if (k === 'opt') { opt = true; return; }
        const nextU = uRows.slice(i + 1).find((x) => x[0] === 'u');
        const stop = nextU ? nextU[1] : end;
        const s = unitsIn(C[r], 6, 31).map(([c, id]) => {
          const tx = [];
          for (let rr = r + 1; rr < stop; rr++) {
            const t = text(cell(C[rr], c));
            if (t && !/^(REQUERIMENTS|REQUIREMENTS|GENERAL INFO|OPTIONS AND REPLACEMENTS)$/.test(t)) tx.push(t);
          }
          let name = ''; let desc = '';
          if (tx.length >= 2) { desc = tx[0]; name = tx[tx.length - 1]; } else if (tx.length === 1) { if (/Stats|\n/.test(tx[0])) desc = tx[0]; else name = tx[0]; }
          return [c, id, name, desc];
        });
        lines.push({ o: opt, s });
      });
      return { title: title.replace(/\s*•.*$/, '').trim(), titleJp: (title.split('•')[1] || '').trim(), icon, rank, strong, weak, req, roles, lines };
    });
  }

  // --- 5B : leaders Grand Party ---
  const L = G.leaders;
  if (L) {
    const starts = [];
    L.forEach((row, i) => { if (/Boosted units/.test(cell(row, 23))) starts.push(i); });
    out.gpLeaders = starts.map((s, bi) => {
      const end = bi + 1 < starts.length ? starts[bi + 1] - 3 : L.length;
      let name = ''; let portrait = null;
      for (let r = s - 4; r < end; r++) {
        if (r < 0) continue;
        const t = text(cell(L[r], 1));
        if (t && /[A-Z]/.test(t) && r >= s - 1 && !name) name = t;
        const im = toks(cell(L[r], 1)).filter((n) => !isIcon(n) && IMG[n] && IMG[n].t !== '-');
        if (im.length && r < s && !portrait) portrait = uref(im[0]);
      }
      const boosted = iconsIn(L[s], 26, 30);
      let alt = false;
      const teams = []; const tRows = [];
      for (let r = s; r < end; r++) {
        if (/Other viable/.test(cell(L[r], 5))) tRows.push(['alt', r]);
        if (/Good against/.test(cell(L[r], 15))) tRows.push(['t', r]);
      }
      tRows.forEach(([k, r], i) => {
        if (k === 'alt') { alt = true; return; }
        const nx = tRows.slice(i + 1)[0];
        const stop = nx ? nx[1] : Math.min(end, r + 4);
        const us = unitsIn(L[r], 5, 13);
        const icons = []; const good = []; const bad = [];
        for (let rr = r; rr < stop; rr++) {
          icons.push(...iconsIn(L[rr], 3, 3)); good.push(...iconsIn(L[rr], 15, 18)); bad.push(...iconsIn(L[rr], 19, 22));
        }
        teams.push({ alt, icons, main: us.filter((x) => x[0] < 11).map((x) => x[1]), sub: us.filter((x) => x[0] >= 11).map((x) => x[1]), good, bad });
      });
      return { name, portrait, boosted, teams };
    });
  }

  // --- 5A : règles Grand Party (jours + saison) ---
  const R = G.gprules;
  if (R) {
    const HID = { none: '—', '3rd': '3', '2nd & 3rd': '2+3', all: 'all' };
    const num = (x) => (/^none$/i.test(x) ? '0' : x);
    const universal = []; let day = '';
    for (let r = 3; r < R.length; r++) {
      const battle = text(cell(R[r], 3));
      if (!/^\d+$/.test(battle)) continue;
      if (/^\d+$/.test(text(cell(R[r], 2)))) day = text(cell(R[r], 2));
      const h = text(cell(R[r], 6));
      universal.push({ day: Number(day), battle: Number(battle), refresh: num(text(cell(R[r], 4))), retries: num(text(cell(R[r], 5))), hidden: HID[h.toLowerCase()] ?? h });
    }
    const all = R.map((row) => row.map(text));
    let dates = ''; let condition = ''; let leaders = '';
    for (const row of all) {
      for (const x of row) {
        if (!dates && /^[A-Z]{3}\.? ?\d{1,2}\s*-\s*[A-Z]{3}\.? ?\d{1,2},? ?\d{4}$/i.test(x)) dates = x;
        if (!condition && /^If leader is/i.test(x)) condition = x.replace(/^If leader is\s*/i, '').replace(/:\s*$/, '').replace(/\]\[/g, '] [');
        if (!leaders && /^Leaders?:/i.test(x)) leaders = x.replace(/^Leaders?:\s*/i, '');
      }
    }
    // bonus : colonne 8 = à qui (texte ou icônes), colonnes 10+ = effets
    const bonuses = []; let who = null; const recommended = [];
    const condRow = R.findIndex((row) => row.some((x) => /^If leader is/i.test(text(x))));
    const teamRow = R.findIndex((row) => row.some((x) => /^Recommended Season Team/i.test(text(x))));
    for (let r = condRow + 1; r > 0 && r < (teamRow > 0 ? teamRow : R.length); r++) {
      const row = R[r] || [];
      recommended.push(...unitsIn(row, 16, 22).map((x) => x[1]));
      const wText = text(cell(row, 8)); const wIcons = iconsIn(row, 8, 9);
      if (/^All/i.test(wText)) who = ['ALL']; else if (wIcons.length) who = wIcons;
      const parts = []; let freeText = '';
      for (let c = 10; c <= 15; c++) {
        const ic = iconsIn(row, c, c); const tx = text(cell(row, c));
        if (ic.length) parts.push(ic[0]);
        else if (/^Lv\.?\s*\d+/i.test(tx) && parts.length) parts[parts.length - 1] += ' ' + tx.replace(/^Lv\.?\s*/i, 'Lv.');
        else if (tx && !/^Recommended/i.test(tx)) freeText = tx;
      }
      if (parts.length && who) {
        const prev = bonuses[bonuses.length - 1];
        if (prev && prev.who.join() === who.join()) prev.what += ' · ' + parts.join(' · ');
        else bonuses.push({ who: [...who], what: parts.join(' · ') });
      }
      if (freeText) bonuses.push({ who: ['ALL'], what: freeText });
    }
    const season = { dates, condition, bonuses, recommended: recommended.filter((x) => x !== null), leaders };
    out.gpRules = { universal, season };
  }
  return out;
}

// Contrôles de cohérence : une section qui échoue garde sa version précédente
export function checkSections(o) {
  const count = (tiers) => (tiers || []).reduce((n, t) => n + (t.groups || []).reduce((m, g) => m + g.ids.length, 0), 0);
  return {
    metaComps: Array.isArray(o.metaComps) && o.metaComps.length >= 5 && o.metaComps.every((c) => c.main.length >= 3),
    tierList: !!o.tierList && o.tierList.tiers.length >= 5 && count(o.tierList.tiers) >= 50,
    gpTier: !!o.gpTier && o.gpTier.tiers.length >= 5 && count(o.gpTier.tiers) >= 30,
    comps: Array.isArray(o.comps) && o.comps.length >= 5 && o.comps.every((c) => c.title && c.lines.length),
    gpLeaders: Array.isArray(o.gpLeaders) && o.gpLeaders.length >= 5 && o.gpLeaders.every((l) => l.name && l.teams.length),
    gpRules: !!o.gpRules && o.gpRules.universal.length >= 10 && !!o.gpRules.season.dates,
    source: !!o.source && !!o.source.updated,
  };
}
