// Onglet Bateaux + fiche d'un bateau + sélecteur de bateau pour les équipes.
// Données : base OPTC Ships (blzn50/optc-ships), convertie en ships.json.
import { t, fmtNumber } from '../i18n.js';
import { CONFIG, EVENTS } from '../config.js';
import { SHIPS, TYPES, CLASSES, loadShips, shipOf } from '../data.js';
import { esc, $, $$, el, debounce, openModal, shipThumb, shipArt, shipText } from '../ui.js';

// ---------- équipes qui utilisent un bateau ----------
export function teamShip(tm) {
  const u = tm && tm.units && typeof tm.units === 'object' ? tm.units : {};
  return u.ship || u.shipId ? shipOf(u.shipId, u.ship) : null;
}
function usage(app) {
  const n = new Map();
  for (const tm of app.teams) {
    const s = teamShip(tm);
    if (s) n.set(s.id, (n.get(s.id) || 0) + 1);
  }
  return n;
}
// Onglet où se trouve une équipe
function teamHref(tm) {
  const u = tm.units || {};
  if (tm.event_type === 'kizuna') return u.kz ? `#/kizuna/${encodeURIComponent(u.kz)}/${u.stage || 'boss'}` : '#/kizuna';
  if (['tm', 'pka', 'coop', 'blitz'].includes(tm.event_type)) return `#/${tm.event_type}`;
  if (tm.event_type === 'other') return '#/blitz';
  return '#/pvp';
}

// Un type ou une classe cité dans les effets du bateau (« boosts Slasher characters' ATK »…)
const wordRe = new Map();
const mentions = (s, w) => {
  if (!wordRe.has(w)) wordRe.set(w, new RegExp(`\\b${w}\\b`));
  return wordRe.get(w).test(s.text);
};

// ---------- navigateur de bateaux ----------
class ShipBrowser {
  /**
   * opts.app               état partagé (équipes, pour le nombre d'utilisations)
   * opts.onPick(ship)      clic sur un bateau
   * opts.isSelected(ship)  surligne le bateau
   * opts.state             état de filtre initial
   */
  constructor(opts = {}) {
    this.o = opts;
    this.s = Object.assign({ q: '', types: [], classes: [], special: '', sort: 'idDesc', view: 'grid' }, opts.state || {});
    this.root = el('<div class="sbrowser"></div>');
  }

  mount(container) {
    container.innerHTML = '';
    container.append(this.root);
    this.renderToolbar();
    this.refresh();
    return this;
  }

  renderToolbar() {
    const s = this.s;
    const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(label)}</option>`;
    // seulement les classes citées par au moins un bateau
    const classes = CLASSES.filter((c) => SHIPS.list.some((x) => mentions(x, c)));
    this.root.innerHTML = `
      <div class="toolbar">
        <div class="row">
          <input type="search" class="input grow" data-f="q" placeholder="${esc(t('sh.search'))}" value="${esc(s.q)}" autocomplete="off">
          <select class="input" data-f="special" aria-label="${esc(t('sh.special'))}">
            ${opt('', t('sh.anySpecial'), s.special)}${opt('yes', t('sh.withSpecial'), s.special)}${opt('no', t('sh.noSpecial'), s.special)}
          </select>
          <select class="input" data-f="sort" aria-label="${esc(t('f.sort'))}">
            ${['idDesc', 'idAsc', 'name', 'used'].map((k) => opt(k, t('sh.sort.' + k), s.sort)).join('')}
          </select>
          <div class="seg">
            <button class="${s.view === 'grid' ? 'on' : ''}" data-view="grid" title="${esc(t('view.grid'))}">▦</button>
            <button class="${s.view === 'list' ? 'on' : ''}" data-view="list" title="${esc(t('view.list'))}">☰</button></div>
        </div>
        <div class="row chips" title="${esc(t('sh.boostHint'))}">
          <span class="muted small">${esc(t('sh.boost'))}</span>
          ${TYPES.map((ty) => `<button class="chip t-${ty} ${s.types.includes(ty) ? 'on' : ''}" data-type="${ty}">${ty}</button>`).join('')}
          ${classes.map((c) => `<button class="chip ${s.classes.includes(c) ? 'on' : ''}" data-class="${esc(c)}">${esc(c)}</button>`).join('')}
        </div>
        <div class="row between">
          <span class="muted small" data-count></span>
          <button class="btn ghost small" data-act="reset">${esc(t('f.reset'))}</button>
        </div>
      </div>
      <div class="ship-results"></div>`;

    const refresh = debounce(() => this.refresh(), 120);
    $$('[data-f]', this.root).forEach((inp) => {
      inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => { this.s[inp.dataset.f] = inp.value; refresh(); });
    });
    const toggleIn = (arr, v) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); };
    $$('[data-type]', this.root).forEach((b) => b.onclick = () => { toggleIn(this.s.types, b.dataset.type); b.classList.toggle('on'); this.refresh(); });
    $$('[data-class]', this.root).forEach((b) => b.onclick = () => { toggleIn(this.s.classes, b.dataset.class); b.classList.toggle('on'); this.refresh(); });
    $$('[data-view]', this.root).forEach((b) => b.onclick = () => {
      this.s.view = b.dataset.view;
      $$('[data-view]', this.root).forEach((x) => x.classList.toggle('on', x === b));
      this.refresh();
    });
    $('[data-act="reset"]', this.root).onclick = () => {
      Object.assign(this.s, { q: '', types: [], classes: [], special: '', sort: 'idDesc' });
      this.renderToolbar(); this.refresh();
    };
    const res = $('.ship-results', this.root);
    const pick = (e) => {
      const item = e.target.closest('[data-sid]');
      if (item && this.o.onPick) this.o.onPick(SHIPS.byId.get(Number(item.dataset.sid)));
    };
    res.addEventListener('click', pick);
    res.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-sid]')) pick(e); });
  }

  filter() {
    const s = this.s;
    const q = s.q.trim().toLowerCase();
    const qId = /^\d+$/.test(q) ? Number(q) : null;
    const tokens = q && qId === null ? q.split(/\s+/) : null;
    this.used = this.o.app ? usage(this.o.app) : new Map();
    const list = SHIPS.list.filter((x) => {
      if (qId !== null && x.id !== qId) return false;
      if (tokens) {
        const hay = (x.nameLc + ' ' + x.text + ' ' + (x.obtain || '')).toLowerCase();
        if (!tokens.every((tk) => hay.includes(tk))) return false;
      }
      if (s.special === 'yes' && !x.special) return false;
      if (s.special === 'no' && x.special) return false;
      if (s.types.length && !s.types.some((ty) => mentions(x, ty))) return false;
      if (s.classes.length && !s.classes.some((c) => mentions(x, c))) return false;
      return true;
    });
    const used = (x) => this.used.get(x.id) || 0;
    const by = {
      idDesc: (a, b) => b.id - a.id,
      idAsc: (a, b) => a.id - b.id,
      name: (a, b) => a.name.localeCompare(b.name),
      used: (a, b) => used(b) - used(a) || b.id - a.id,
    }[s.sort] || ((a, b) => b.id - a.id);
    return list.sort(by);
  }

  refresh() {
    const list = this.filter();
    $('[data-count]', this.root).textContent = t('f.results', { n: list.length });
    const res = $('.ship-results', this.root);
    res.className = 'ship-results ' + (this.s.view === 'list' ? 'ship-list' : 'ship-grid');
    res.innerHTML = list.length ? list.map((x) => this.itemHtml(x)).join('') : `<p class="empty">${esc(t('sh.noResult'))}</p>`;
  }

  itemHtml(x) {
    const sel = this.o.isSelected && this.o.isSelected(x);
    const n = this.used.get(x.id) || 0;
    const usedBadge = n ? `<span class="ubadge" title="${esc(t('sh.usedCount', { n }))}">${n}</span>` : '';
    if (this.s.view === 'list') {
      return `<div class="ship-row ${sel ? 'sel' : ''}" data-sid="${x.id}" role="button" tabindex="0">
        <span class="ship-row-img">${shipThumb(x.id)}${usedBadge}</span>
        <div class="ship-row-body">
          <p class="ship-row-name"><strong>${esc(x.name)}</strong> <span class="muted">#${x.id}</span></p>
          <p>${shipText(x.effect)}</p>
          ${x.special ? `<p class="muted"><strong>${esc(t('sh.special'))}${x.cd ? ` (${esc(t('sh.turns', { n: x.cd }))})` : ''} :</strong> ${shipText(x.special)}</p>` : ''}
        </div>
      </div>`;
    }
    return `<button class="ship-tile ${sel ? 'sel' : ''}" data-sid="${x.id}" title="${esc(x.name)}">
      ${shipThumb(x.id)}<span class="ship-name">${esc(x.name)}</span><span class="sid">${x.id}</span>${usedBadge}
    </button>`;
  }
}

// Affiche un sablier, charge les bateaux puis appelle draw()
function whenShips(box, draw) {
  if (SHIPS.list.length) { draw(); return; }
  box.innerHTML = `<div class="loading small"><div class="spinner"></div><p>${esc(t('sh.loading'))}</p></div>`;
  loadShips().then(() => { if (box.isConnected) draw(); })
    .catch(() => { if (box.isConnected) box.innerHTML = `<p class="empty error">${esc(t('sh.error'))}</p>`; });
}

// ---------- onglet ----------
let browser = null;
export function renderShips(main, app) {
  main.innerHTML = `<section class="page"><p class="muted small source" data-src></p><div data-browser></div></section>`;
  const box = $('[data-browser]', main);
  whenShips(box, () => {
    const last = SHIPS.list[SHIPS.list.length - 1];
    $('[data-src]', main).innerHTML = `${esc(t('sh.count', { n: SHIPS.list.length }))} ·
      ${esc(t('sh.source', { id: last ? last.id : '' }))} (<a href="https://github.com/blzn50/optc-ships" target="_blank" rel="noopener">OPTC Ships</a>)`;
    if (!browser) browser = new ShipBrowser({ app, onPick: (x) => openShip(x.id, app) });
    browser.mount(box);
  });
}

// ---------- sélecteur pour l'éditeur d'équipe ----------
let pickerState = null;
export function pickShip({ app, current } = {}) {
  return new Promise((resolve) => {
    let picked = null;
    let b = null;
    const m = openModal({
      title: esc(t('sh.pick')), size: 'large',
      onClose: () => { if (b) pickerState = b.s; resolve(picked); },
    });
    whenShips(m.body, () => {
      b = new ShipBrowser({
        app, state: pickerState,
        isSelected: (x) => x.id === Number(current),
        onPick: (x) => { picked = x; m.close(); },
      }).mount(m.body);
      const i = $('input[data-f="q"]', m.el);
      if (i && window.matchMedia('(pointer: fine)').matches) i.focus();
    });
  });
}

// ---------- fiche bateau ----------
export function openShip(id, app) {
  const m = openModal({ title: esc(t('tab.ships')), size: 'large' });
  whenShips(m.body, () => {
    const x = SHIPS.byId.get(Number(id));
    if (!x) { m.body.innerHTML = `<p class="empty">${esc(t('sh.notFound'))}</p>`; return; }
    $('.modal-head h2', m.el).innerHTML = `<span class="muted">#${x.id}</span> ${esc(x.name)}`;
    const teams = app.teams.filter((tm) => teamShip(tm) === x);
    const periods = (x.levels || []).some((l) => l.period);
    m.body.innerHTML = `
      <div class="ship-head">
        ${shipArt(x.id, x.name)}
        <div class="ship-info">
          <dl class="kv">
            ${x.cola ? `<div><dt>${esc(t('sh.cola'))}</dt><dd>${fmtNumber(x.cola)}</dd></div>` : ''}
            ${x.superCola ? `<div><dt>${esc(t('sh.superCola'))}</dt><dd>${fmtNumber(x.superCola)}</dd></div>` : ''}
            ${x.cd ? `<div><dt>${esc(t('sh.cd'))}</dt><dd>${esc(t('sh.turns', { n: x.cd }))}</dd></div>` : ''}
            <div><dt>${esc(t('sh.usedIn'))}</dt><dd>${teams.length}</dd></div>
          </dl>
          ${x.obtain ? `<p class="small"><strong>${esc(t('sh.obtain'))} :</strong> ${esc(x.obtain)}</p>` : ''}
          ${x.note ? `<p class="small muted"><strong>${esc(t('sh.note'))} :</strong> ${esc(x.note)}</p>` : ''}
          <a class="small" href="${CONFIG.shipDbUrl}${x.id}" target="_blank" rel="noopener">${esc(t('sh.openDb'))} ↗</a>
        </div>
      </div>
      <section class="details">
        <details class="ability" open><summary>${esc(t(periods ? 'sh.currentEffect' : 'sh.maxEffect'))}</summary>
          <div class="ability-body"><p>${shipText(x.effect)}</p></div></details>
        ${x.special ? `<details class="ability" open><summary>${esc(t('sh.special'))}${x.cd ? ` — <span class="muted">${esc(t('sh.turns', { n: x.cd }))}</span>` : ''}</summary>
          <div class="ability-body"><p>${shipText(x.special)}</p>
          ${x.specialAfterMod ? `<p class="notes">${esc(t('sh.specialAfterMod'))}</p>` : ''}</div></details>` : ''}
        ${x.specialEffect1 || x.specialEffect2 ? `<details class="ability" open><summary>${esc(t('sh.specialEffects'))}</summary>
          <div class="ability-body"><dl class="subkv">
            ${x.specialEffect1 ? `<div><dt>${esc(t('sh.special1'))}</dt><dd><p>${shipText(x.specialEffect1)}</p></dd></div>` : ''}
            ${x.specialEffect2 ? `<div><dt>${esc(t('sh.special2'))}</dt><dd><p>${shipText(x.specialEffect2)}</p></dd></div>` : ''}
          </dl><p class="notes">${esc(t('sh.modHint'))}</p></div></details>` : ''}
        ${(x.levels || []).length > 1 ? levelsTable(x, periods) : ''}
        ${(x.mods || []).length ? modsTable(x) : ''}
      </section>
      <section class="owners">
        <h3>${esc(t('sh.usedIn'))} <span class="muted">(${teams.length})</span></h3>
        ${teams.length ? `<div class="owner-list">${teams.map((tm) => {
          const ev = EVENTS.find((e) => e.id === tm.event_type);
          return `<a class="owner" href="${teamHref(tm)}" style="--ev:${ev ? ev.color : '#6b7280'}">
            <span class="ev-badge">${esc(t('ev.' + tm.event_type))}</span> ${esc(tm.title || tm.boss || '—')}</a>`;
        }).join('')}</div>` : `<p class="muted">${esc(t('sh.unused'))}</p>`}
      </section>`;
    $$('a.owner', m.body).forEach((a) => a.addEventListener('click', () => m.close()));
  });
}

function levelsTable(x, periods) {
  const hasSpecial = x.levels.some((l) => l.special);
  const cola = !periods && x.levels.some((l) => l.cola || l.superCola);
  return `<details class="ability" ${periods ? 'open' : ''}><summary>${esc(t(periods ? 'sh.periods' : 'sh.levels'))}</summary>
    <div class="ability-body table-scroll"><table class="stable">
      <thead><tr>
        <th>${esc(t(periods ? 'sh.period' : 'sh.level'))}</th>
        ${cola ? `<th class="num">${esc(t('sh.colaLv'))}</th><th class="num">${esc(t('sh.superColaLv'))}</th>` : ''}
        <th>${esc(t('sh.effect'))}</th>${hasSpecial ? `<th>${esc(t('sh.special'))}</th>` : ''}
      </tr></thead>
      <tbody>${x.levels.map((l, i) => `<tr>
        <td class="${periods ? '' : 'num'}">${esc(periods ? l.period || '' : i + 1)}</td>
        ${cola ? `<td class="num">${l.cola ? fmtNumber(l.cola) : '—'}</td><td class="num">${l.superCola ? fmtNumber(l.superCola) : '—'}</td>` : ''}
        <td>${shipText(l.effect || '')}</td>
        ${hasSpecial ? `<td>${l.special ? `${l.cd ? `<strong>${esc(t('sh.turns', { n: l.cd }))}</strong> · ` : ''}${shipText(l.special)}` : '—'}</td>` : ''}
      </tr>`).join('')}</tbody>
    </table></div></details>`;
}

function modsTable(x) {
  return `<details class="ability"><summary>${esc(t('sh.mods'))}</summary>
    <div class="ability-body table-scroll"><table class="stable">
      <thead><tr><th class="num">${esc(t('sh.phase'))}</th><th>${esc(t('sh.effect'))}</th><th>${esc(t('sh.special'))}</th></tr></thead>
      <tbody>${x.mods.map((p) => `<tr>
        <td class="num">${esc(p.phase ?? '')}</td>
        <td>${shipText(p.effect || '')}</td>
        <td>${p.special ? `${p.cd ? `<strong>${esc(t('sh.turns', { n: p.cd }))}</strong> · ` : ''}${shipText(p.special)}` : '—'}</td>
      </tr>`).join('')}</tbody>
    </table></div></details>`;
}
