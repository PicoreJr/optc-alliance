// Outils d'interface : échappement, modales, notifications, vignettes,
// et le navigateur de personnages réutilisé partout (table, box, équipes).
import { t, fmtDate } from './i18n.js';
import { DATA, TYPES, CLASSES, RARITIES, SUGO_GROUPS, thumbUrl, THUMB_STAGES, NOIMAGE, loadDetails, abilityText,
  SHIPS, SHIP_STAGES, SHIP_BIG_STAGES, shipThumbUrl, shipBigUrl, shipIconUrl, ART_STAGES, artUrl } from './data.js';

// ---------- bases ----------
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }
export function el(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}
export function debounce(fn, ms) {
  let h;
  return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); };
}

// ---------- vignettes ----------
// Les images apparaissent en fondu une fois chargées (une seule fois par image :
// si elle a déjà été vue, elle s'affiche directement, sans clignoter)
const SEEN = new Set();
window.__imgOk = (img) => { img.classList.add('ok'); if (img.dataset.k) SEEN.add(img.dataset.k); };
export const fadeIn = (k) => `data-k="${k}" onload="__imgOk(this)"`;
export const seen = (k) => (SEEN.has(k) ? 'ok' : '');
// Essaie l'image Global puis Japon (CDN, puis GitHub), puis une image neutre.
window.__thumbErr = (img) => {
  const next = Number(img.dataset.stage || 0) + 1;
  img.dataset.stage = next;
  if (next < THUMB_STAGES.length) img.src = thumbUrl(Number(img.dataset.id), next);
  else { img.onerror = null; img.src = NOIMAGE; }
};
export function thumb(id, extraClass = '') {
  const u = DATA.byId.get(Number(id));
  const type = u && !u.dual ? u.types[0] : 'DUAL';
  const name = u ? u.name : `#${id}`;
  return `<img class="thumb t-${type} ${extraClass} ${seen('u' + id)}" ${fadeIn('u' + Number(id))} loading="lazy" decoding="async" data-id="${Number(id)}"
    src="${thumbUrl(Number(id))}" onerror="__thumbErr(this)" alt="${esc(name)}" title="${esc(name)}">`;
}
// Bateaux : icône, puis grande image (CDN, puis GitHub), puis une image neutre.
// Pour la grande image, c'est l'inverse (et l'icône s'affiche en petit).
window.__shipErr = (img) => {
  const big = img.dataset.big != null;
  const stages = big ? SHIP_BIG_STAGES : SHIP_STAGES;
  const next = Number(img.dataset.stage || 0) + 1;
  img.dataset.stage = next;
  if (next < stages.length) {
    img.src = stages[next](Number(img.dataset.ship));
    if (big && next >= stages.length / 2) img.classList.add('small');
  } else { img.onerror = null; img.src = NOIMAGE; }
};
export function shipArt(id, name = '') {
  return `<img class="ship-art ${seen('S' + id)}" ${fadeIn('S' + Number(id))} decoding="async" data-big data-ship="${Number(id)}" src="${shipBigUrl(Number(id))}"
    onerror="__shipErr(this)" alt="${esc(name)}">`;
}
export function shipThumb(id, extraClass = '', fallbackName = '') {
  const s = SHIPS.byId.get(Number(id));
  const name = s ? s.name : fallbackName || `#${id}`;
  return `<img class="thumb ship-thumb ${extraClass} ${seen('s' + id)}" ${fadeIn('s' + Number(id))} loading="lazy" decoding="async" data-ship="${Number(id)}"
    src="${shipThumbUrl(Number(id))}" onerror="__shipErr(this)" alt="${esc(name)}" title="${esc(name)}">`;
}
// Illustration de fond (carte de membre) : CDN puis GitHub ; sans image, la carte redevient normale
window.__artErr = (img) => {
  const next = Number(img.dataset.stage || 0) + 1;
  img.dataset.stage = next;
  if (next < ART_STAGES.length) img.src = artUrl(Number(img.dataset.art), next);
  else { const c = img.closest('.themed'); if (c) c.classList.remove('themed'); img.remove(); }
};
export function cardArt(id) {
  return `<img class="card-art ${seen('a' + id)}" ${fadeIn('a' + Number(id))} alt="" decoding="async" data-art="${Number(id)}" src="${artUrl(Number(id))}" onerror="__artErr(this)">`;
}
export function typeBadges(u) {
  const dual = u.dual ? `<span class="badge t-DUAL">${esc(t('dual'))}</span>` : '';
  return dual + u.types.map((ty) => `<span class="badge t-${ty}">${ty}</span>`).join('');
}

// Colore les [STR], [TND]… et met en valeur les [Tags].
export function richText(s) {
  return esc(s)
    .replace(/\[(STR|DEX|QCK|PSY|INT)\]/g, '<span class="orb t-$1">$1</span>')
    .replace(/\[([A-Z]{1,12})\]/g, '<span class="orb">$1</span>')
    .replace(/\[([^\]<>]{2,60})\]/g, '<span class="tag">$1</span>')
    .replace(/\n/g, '<br>');
}

// Effets des bateaux : comme richText, avec les icônes d'OPTC Ships ([EOT_HEAL]…)
const SHIP_ICONS = {
  EOT_HEAL: ['eot_heal.png', 'EoT heal'],
  EOT_HEAL_TO_DAMAGE: ['heal_slot_to_damage.png', 'EoT heal → damage'],
  HEAL_TO_DAMAGE: ['heal_to_damage.png', 'Heal → damage'],
  THRESHOLD_DAMAGE_CUT: ['threshold_damagecut.png', 'Threshold damage cut'],
  ATK_UP: ['atk_up.png', 'ATK up'],
};
export function shipText(s) {
  return richText(s).replace(/<span class="tag">([^<]+)<\/span>/g, (m, k) => (SHIP_ICONS[k]
    ? `<img class="fx-icon" src="${shipIconUrl(SHIP_ICONS[k][0])}" alt="${SHIP_ICONS[k][1]}" title="${SHIP_ICONS[k][1]}" onerror="this.replaceWith(this.alt)">`
    // étiquettes ([Cross Guild] [Four Emperors]…) bien séparées
    : `<span class="tag pill">${k}</span>`));
}

// ---------- notifications ----------
export function toast(msg, kind = 'ok') {
  let box = $('#toasts');
  if (!box) { box = el('<div id="toasts" aria-live="polite"></div>'); document.body.append(box); }
  const n = el(`<div class="toast ${kind}">${esc(msg)}</div>`);
  box.append(n);
  setTimeout(() => n.classList.add('out'), 2600);
  setTimeout(() => n.remove(), 3000);
}

// ---------- modales ----------
const stack = [];
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && stack.length) stack[stack.length - 1].close();
});
export function openModal({ title = '', body = '', size = '', footer = '', onClose } = {}) {
  const wrap = el(`<div class="modal-wrap" role="dialog" aria-modal="true">
    <div class="modal ${size}">
      <header class="modal-head"><h2>${title}</h2><button class="icon-btn close" aria-label="${esc(t('close'))}">✕</button></header>
      <div class="modal-body"></div>
      ${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}
    </div></div>`);
  const bodyEl = $('.modal-body', wrap);
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.append(body);
  let closed = false;
  const m = {
    el: wrap, body: bodyEl,
    close() {
      if (closed) return; closed = true;
      // petite animation de sortie, puis on retire la fenêtre
      wrap.classList.add('closing');
      setTimeout(() => wrap.remove(), 160);
      stack.splice(stack.indexOf(m), 1);
      if (!stack.length) document.body.classList.remove('no-scroll');
      if (onClose) onClose();
    },
  };
  $('.close', wrap).onclick = () => m.close();
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) m.close(); });
  document.body.append(wrap);
  document.body.classList.add('no-scroll');
  stack.push(m);
  return m;
}
export function confirmBox(message, { danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal({
      title: '', size: 'small',
      body: `<p class="confirm-msg">${esc(message)}</p>`,
      footer: `<button class="btn ghost" data-a="no">${esc(t('confirm.no'))}</button>
               <button class="btn ${danger ? 'danger' : 'primary'}" data-a="yes">${esc(t('confirm.yes'))}</button>`,
      onClose: () => { if (!answered) resolve(false); },
    });
    $$('[data-a]', m.el).forEach((b) => b.onclick = () => { answered = true; resolve(b.dataset.a === 'yes'); m.close(); });
    $('[data-a="yes"]', m.el).focus();
  });
}

// ---------- navigateur de personnages ----------
const PAGE = 120;
const BROWSER_DEFAULTS = {
  q: '', types: [], classes: [], rarity: '', region: '', owner: '', notOwner: '',
  ability: '', sort: 'dateDesc', view: 'grid', more: false, own: '', since: '', group: '',
};
const freshState = (o) => ({ ...o, types: [...o.types], classes: [...o.classes] });
// Rubrique de la Collection d'un perso (les non-légendes vont dans « autres »)
const groupOf = (u) => u.sugo || 'other';
const groupIndex = (u) => (u.sugo ? SUGO_GROUPS.indexOf(u.sugo) : SUGO_GROUPS.length);

export class UnitBrowser {
  /**
   * opts.onPick(unit)        clic sur un perso
   * opts.isSelected(unit)    surligne le perso (box, sélection)
   * opts.badge(unit)         petit texte sur la vignette (ex. LB)
   * opts.members()           liste des membres pour le filtre « box »
   * opts.allowList           autorise la vue liste
   * opts.baseFilter(unit)    filtre imposé (ex. seulement la box d'un membre)
   * opts.actions             HTML de boutons en plus dans la barre
   * opts.state               état de filtre initial / partagé
   * opts.defaults            valeurs par défaut (aussi pour « Réinitialiser »)
   * opts.collection          rubriques de la Collection du jeu (tri + filtre + en-têtes)
   */
  constructor(opts = {}) {
    this.o = opts;
    this.defaults = { ...BROWSER_DEFAULTS, ...(opts.defaults || {}) };
    this.s = Object.assign(freshState(this.defaults), opts.state || {});
    this.results = [];
    this.shown = 0;
    this.root = el('<div class="ubrowser"></div>');
    this.observer = null;
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
    const members = this.o.members ? this.o.members() : [];
    const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(label)}</option>`;
    this.root.innerHTML = `
      <div class="toolbar">
        <div class="row">
          <input type="search" class="input grow" data-f="q" placeholder="${esc(t('f.search'))}" value="${esc(s.q)}" autocomplete="off">
          ${this.o.ownBox ? `<select class="input" data-f="own" aria-label="${esc(t('f.own'))}">
            ${opt('', t('f.ownAll'), s.own)}${opt('owned', t('f.owned'), s.own)}${opt('missing', t('f.missing'), s.own)}
          </select>` : ''}
          ${this.o.collection ? `<select class="input" data-f="group" aria-label="${esc(t('f.group'))}">
            ${opt('', t('f.allGroups'), s.group)}${[...SUGO_GROUPS, 'other'].map((g) => opt(g, t('grp.' + g), s.group)).join('')}
          </select>` : ''}
          <button class="btn ghost small" data-act="more">${esc(s.more ? t('f.less') : t('f.more'))}</button>
          ${this.o.allowList ? `<div class="seg">
            <button class="${s.view === 'grid' ? 'on' : ''}" data-view="grid" title="${esc(t('view.grid'))}">▦</button>
            <button class="${s.view === 'list' ? 'on' : ''}" data-view="list" title="${esc(t('view.list'))}">☰</button></div>` : ''}
        </div>
        <div class="row chips">
          ${TYPES.map((ty) => `<button class="chip t-${ty} ${s.types.includes(ty) ? 'on' : ''}" data-type="${ty}">${ty}</button>`).join('')}
          <button class="chip t-DUAL ${s.types.includes('DUAL') ? 'on' : ''}" data-type="DUAL">${esc(t('dual'))}</button>
        </div>
        <div class="more ${s.more ? '' : 'hidden'}">
          <div class="row chips">
            ${CLASSES.map((c) => `<button class="chip ${s.classes.includes(c) ? 'on' : ''}" data-class="${esc(c)}">${esc(c)}</button>`).join('')}
          </div>
          <div class="row wrap">
            <select class="input" data-f="rarity" aria-label="${esc(t('f.rarity'))}">
              ${opt('', t('f.allRarity'), s.rarity)}${RARITIES.map((r) => opt(r, r + '★', s.rarity)).join('')}
            </select>
            <select class="input" data-f="region" aria-label="${esc(t('f.region'))}">
              ${opt('', t('f.allRegion'), s.region)}${opt('glo', t('f.glo'), s.region)}${opt('jap', t('f.jap'), s.region)}
            </select>
            ${members.length && !this.o.hideOwner ? `<select class="input" data-f="owner" aria-label="${esc(t('f.owner'))}">
              ${opt('', t('f.anyOwner'), s.owner)}${members.map((m) => opt(m.id, t('f.ownedBy', { name: m.pseudo }), s.owner)).join('')}
            </select>` : ''}
            <select class="input" data-f="since" aria-label="${esc(t('f.since'))}">
              ${['', '7', '30', '90', '180', '365'].map((k) => opt(k, t('since.' + (k || 'all')), s.since)).join('')}
            </select>
            <select class="input" data-f="sort" aria-label="${esc(t('f.sort'))}">
              ${[...(this.o.collection ? ['collection'] : []), 'dateDesc', 'dateAsc', 'idDesc', 'idAsc', 'atk', 'hp', 'rcv', 'name']
                .map((k) => opt(k, t('sort.' + k), s.sort)).join('')}
            </select>
          </div>
          <div class="row">
            <input type="search" class="input grow" data-f="ability" placeholder="${esc(t('f.ability'))}" value="${esc(s.ability)}" autocomplete="off">
            <button class="btn ghost small" data-act="reset">${esc(t('f.reset'))}</button>
          </div>
        </div>
        <div class="row between">
          <span class="muted small" data-count></span>
          <span class="actions">${this.o.actions || ''}</span>
        </div>
      </div>
      <div class="results"></div>
      <div class="sentinel"></div>`;

    const refresh = debounce(() => this.refresh(), 150);
    $$('[data-f]', this.root).forEach((inp) => {
      const ev = inp.tagName === 'SELECT' ? 'change' : 'input';
      inp.addEventListener(ev, () => {
        this.s[inp.dataset.f] = inp.value;
        if (inp.dataset.f === 'ability' && inp.value) {
          loadDetails().then(() => this.refresh()).catch(() => {});
        }
        refresh();
      });
    });
    $$('[data-type]', this.root).forEach((b) => b.onclick = () => {
      toggle(this.s.types, b.dataset.type); b.classList.toggle('on'); this.refresh();
    });
    $$('[data-class]', this.root).forEach((b) => b.onclick = () => {
      toggle(this.s.classes, b.dataset.class); b.classList.toggle('on'); this.refresh();
    });
    $$('[data-view]', this.root).forEach((b) => b.onclick = () => {
      this.s.view = b.dataset.view;
      $$('[data-view]', this.root).forEach((x) => x.classList.toggle('on', x === b));
      this.refresh();
    });
    $('[data-act="more"]', this.root).onclick = (e) => {
      this.s.more = !this.s.more;
      $('.more', this.root).classList.toggle('hidden', !this.s.more);
      e.target.textContent = this.s.more ? t('f.less') : t('f.more');
    };
    $('[data-act="reset"]', this.root).onclick = () => {
      Object.assign(this.s, freshState(this.defaults), { view: this.s.view, more: this.s.more });
      this.renderToolbar(); this.refresh();
    };
    if (this.o.onToolbar) this.o.onToolbar(this.root);

    this.root.querySelector('.results').addEventListener('click', (e) => {
      const item = e.target.closest('[data-uid]');
      if (item && this.o.onPick) this.o.onPick(DATA.byId.get(Number(item.dataset.uid)), item);
    });
  }

  filter() {
    const s = this.s;
    const q = s.q.trim().toLowerCase();
    const qTokens = q && !/^\d+$/.test(q) ? q.split(/\s+/) : null;
    const qId = /^\d+$/.test(q) ? Number(q) : null;
    const aTokens = s.ability.trim() ? s.ability.trim().toLowerCase().split(/\s+/) : null;
    const types = new Set(s.types);
    const members = this.o.members ? this.o.members() : [];
    const ownerBox = s.owner ? (members.find((m) => m.id === s.owner) || {}).box || {} : null;
    const notOwnerBox = s.notOwner ? (members.find((m) => m.id === s.notOwner) || {}).box || {} : null;
    const base = this.o.baseFilter;
    const ownBox = this.o.ownBox ? this.o.ownBox() : null;
    const sinceDate = s.since ? new Date(Date.now() - Number(s.since) * 864e5).toISOString().slice(0, 10) : null;

    let list = DATA.units.filter((u) => {
      if (base && !base(u)) return false;
      if (ownBox && s.own === 'owned' && !ownBox[u.id]) return false;
      if (ownBox && s.own === 'missing' && ownBox[u.id]) return false;
      if (s.group && groupOf(u) !== s.group) return false;
      if (qId !== null && u.id !== qId && !String(u.id).startsWith(q)) return false;
      if (qTokens && !qTokens.every((tk) => u.nameLc.includes(tk))) return false;
      if (types.size && !(u.types.some((ty) => types.has(ty)) || (types.has('DUAL') && u.dual))) return false;
      if (s.classes.length && !s.classes.every((c) => u.classes.includes(c))) return false;
      if (s.rarity && u.stars !== s.rarity) return false;
      if (sinceDate && u.addedSort < sinceDate) return false;
      if (s.region === 'glo' && !u.global) return false;
      if (s.region === 'jap' && u.global) return false;
      if (ownerBox && !ownerBox[u.id]) return false;
      if (notOwnerBox && notOwnerBox[u.id]) return false;
      if (aTokens) {
        const txt = abilityText(u.id);
        if (!txt || !aTokens.every((tk) => txt.includes(tk))) return false;
      }
      return true;
    });
    const byDate = (a, b) => (a.addedSort < b.addedSort ? 1 : a.addedSort > b.addedSort ? -1 : b.id - a.id);
    const by = {
      dateDesc: byDate,
      dateAsc: (a, b) => byDate(b, a),
      idDesc: (a, b) => b.id - a.id,
      idAsc: (a, b) => a.id - b.id,
      atk: (a, b) => b.atk - a.atk,
      hp: (a, b) => b.hp - a.hp,
      rcv: (a, b) => b.rcv - a.rcv,
      name: (a, b) => a.name.localeCompare(b.name),
      // comme la Collection du jeu : par rubrique, puis des plus anciens aux plus récents
      collection: (a, b) => groupIndex(a) - groupIndex(b) || (a.sugo ? a.sugoRank - b.sugoRank || a.id - b.id : byDate(a, b)),
    }[s.sort] || byDate;
    list.sort(by);
    // un ID tapé exactement passe en premier
    if (qId !== null) {
      const i = list.findIndex((u) => u.id === qId);
      if (i > 0) list.unshift(list.splice(i, 1)[0]);
    }
    return list;
  }

  refresh() {
    this.results = this.filter();
    this.shown = 0;
    this.grouped = !!this.o.collection && this.s.sort === 'collection';
    this.lastGroup = null;
    if (this.grouped) this.groupStats = this.collectionStats();
    const res = $('.results', this.root);
    res.className = 'results ' + (this.s.view === 'list' && this.o.allowList ? 'list' : 'grid');
    res.innerHTML = this.s.view === 'list' && this.o.allowList ? `<table class="utable"><thead><tr>
        <th></th><th>${esc(t('u.id'))}</th><th>${esc(t('u.name'))}</th><th>${esc(t('u.type'))}</th>
        <th class="hide-sm">${esc(t('u.class'))}</th><th>★</th><th class="num hide-sm">${esc(t('u.cost'))}</th>
        <th class="num">HP</th><th class="num">ATK</th><th class="num">RCV</th><th class="num hide-sm">CD</th><th class="hide-sm">${esc(t('u.added'))}</th>
      </tr></thead><tbody></tbody></table>` : '';
    const count = $('[data-count]', this.root);
    let txt = t('f.results', { n: this.results.length.toLocaleString() });
    if (this.s.ability && !DATA.details) txt += ' · ' + t('data.details');
    count.textContent = txt;
    this.renderMore();
    this.observe();
  }

  itemHtml(u) {
    const sel = this.o.isSelected && this.o.isSelected(u);
    // badge : texte, ou { text, cls } (ex. LB / Rainbow dans la box)
    const b = this.o.badge ? this.o.badge(u) : '';
    const badge = b && typeof b === 'object' ? b.text : b;
    const bcls = b && typeof b === 'object' ? b.cls || '' : '';
    if (this.s.view === 'list' && this.o.allowList) {
      return `<tr data-uid="${u.id}" class="${sel ? 'sel' : ''}">
        <td>${thumb(u.id, 'sm')}</td><td class="muted">${u.id}</td>
        <td class="name">${esc(u.name)}${badge ? ` <span class="ubadge ${bcls}">${esc(badge)}</span>` : ''}</td>
        <td>${typeBadges(u)}</td><td class="hide-sm small">${esc(u.classes.join(', '))}</td>
        <td>${esc(u.stars)}</td><td class="num hide-sm">${u.cost ?? ''}</td>
        <td class="num">${u.hp}</td><td class="num">${u.atk}</td><td class="num">${u.rcv}</td>
        <td class="num hide-sm">${u.cd ? `${u.cd[0]}→${u.cd[1]}` : ''}</td>
        <td class="hide-sm small muted">${u.added ? esc(fmtDate(u.added)) : esc(t('u.new'))}</td></tr>`;
    }
    // box : possédé = en couleur, sinon grisé (pas besoin de coche)
    const state = this.o.dimUnselected ? (sel ? 'own' : 'dim') : (sel ? 'sel' : '');
    return `<button class="uitem ${state} ${bcls === 'rb' ? 'rainbow' : ''}" data-uid="${u.id}" title="${esc(u.name)}">
      ${thumb(u.id)}<span class="uid">${u.id}</span>${badge ? `<span class="ubadge ${bcls}">${esc(badge)}</span>` : ''}
    </button>`;
  }

  renderMore() {
    const next = this.results.slice(this.shown, this.shown + PAGE);
    if (!next.length) return;
    const list = this.s.view === 'list' && this.o.allowList;
    const target = list ? $('tbody', this.root) : $('.results', this.root);
    target.insertAdjacentHTML('beforeend', next.map((u) => {
      if (!this.grouped || groupOf(u) === this.lastGroup) return this.itemHtml(u);
      this.lastGroup = groupOf(u);
      return this.groupHeader(this.lastGroup, list) + this.itemHtml(u);
    }).join(''));
    this.shown += next.length;
  }

  // Possédés / total de chaque rubrique (toutes les légendes, comme le compteur du jeu)
  collectionStats() {
    const own = this.o.ownBox ? this.o.ownBox() : {};
    const st = {};
    for (const u of DATA.units) {
      if (!u.legend && !own[u.id]) continue;
      const g = st[groupOf(u)] || (st[groupOf(u)] = { owned: 0, total: 0 });
      g.total++;
      if (own[u.id]) g.owned++;
    }
    return st;
  }

  groupHeader(g, list) {
    const st = this.groupStats[g] || { owned: 0, total: 0 };
    const inner = `<span>${esc(t('grp.' + g))}</span><span class="ugroup-n">${this.groupCount(g)}</span>`;
    return list ? `<tr class="ugroup" data-group="${g}"><td colspan="12"><div class="ugroup-in">${inner}</div></td></tr>`
      : `<div class="ugroup" data-group="${g}">${inner}</div>`;
  }
  groupCount(g) {
    const st = this.groupStats[g] || { owned: 0, total: 0 };
    return g === 'other' ? String(st.owned) : `${st.owned}/${st.total}`;
  }

  observe() {
    if (this.observer) this.observer.disconnect();
    const sentinel = $('.sentinel', this.root);
    // On continue tant que le bas de la liste reste visible : l'observateur ne se redéclenche
    // que si le bas sort puis revient à l'écran, ce qui n'arrive pas sur un grand écran
    const fill = () => {
      if (!sentinel.isConnected || this.shown >= this.results.length) return;
      if (sentinel.getBoundingClientRect().top < window.innerHeight + 600) {
        this.renderMore();
        requestAnimationFrame(fill);
      }
    };
    this.observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) fill();
    }, { rootMargin: '600px 0px' });
    this.observer.observe(sentinel);
  }

  // Met à jour l'état sélectionné / badge sans tout redessiner
  updateItem(id) {
    const node = $(`[data-uid="${id}"]`, this.root);
    const u = DATA.byId.get(Number(id));
    if (!node || !u) return;
    const fresh = el(this.s.view === 'list' && this.o.allowList ? `<table><tbody>${this.itemHtml(u)}</tbody></table>` : this.itemHtml(u));
    node.replaceWith(fresh.tagName === 'TABLE' ? fresh.querySelector('tr') : fresh);
    // compteur de la rubrique (ex. une légende ajoutée à la box)
    if (this.grouped) {
      this.groupStats = this.collectionStats();
      const n = $(`[data-group="${groupOf(u)}"] .ugroup-n`, this.root);
      if (n) n.textContent = this.groupCount(groupOf(u));
    }
  }

  destroy() { if (this.observer) this.observer.disconnect(); }
}

function toggle(arr, v) {
  const i = arr.indexOf(v);
  if (i >= 0) arr.splice(i, 1); else arr.push(v);
}

// Sélecteur d'un seul perso dans une modale
export function pickUnit({ title, members }) {
  return new Promise((resolve) => {
    let picked = null;
    const m = openModal({ title: esc(title || t('t.pick')), size: 'large', onClose: () => resolve(picked) });
    new UnitBrowser({
      members,
      onPick: (u) => { picked = u; m.close(); },
    }).mount(m.body);
    setTimeout(() => { const i = $('input[data-f="q"]', m.el); if (i) i.focus(); }, 50);
  });
}
