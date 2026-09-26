// Outils d'interface : échappement, modales, notifications, vignettes,
// et le navigateur de personnages réutilisé partout (table, box, équipes).
import { t, fmtDate } from './i18n.js';
import { DATA, TYPES, CLASSES, RARITIES, thumbUrl, THUMB_STAGES, NOIMAGE, loadDetails, abilityText } from './data.js';

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
  return `<img class="thumb t-${type} ${extraClass}" loading="lazy" decoding="async" data-id="${Number(id)}"
    src="${thumbUrl(Number(id))}" onerror="__thumbErr(this)" alt="${esc(name)}" title="${esc(name)}">`;
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
      wrap.remove(); stack.splice(stack.indexOf(m), 1);
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
   */
  constructor(opts = {}) {
    this.o = opts;
    this.s = Object.assign({
      q: '', types: [], classes: [], rarity: '', region: '', owner: '', notOwner: '',
      ability: '', sort: 'dateDesc', view: 'grid', more: false, own: '', since: '',
    }, opts.state || {});
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
              ${['dateDesc', 'dateAsc', 'idDesc', 'idAsc', 'atk', 'hp', 'rcv', 'name'].map((k) => opt(k, t('sort.' + k), s.sort)).join('')}
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
      Object.assign(this.s, { q: '', types: [], classes: [], rarity: '', region: '', owner: '', notOwner: '', ability: '', sort: 'dateDesc', own: '', since: '' });
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
    const badge = this.o.badge ? this.o.badge(u) : '';
    if (this.s.view === 'list' && this.o.allowList) {
      return `<tr data-uid="${u.id}" class="${sel ? 'sel' : ''}">
        <td>${thumb(u.id, 'sm')}</td><td class="muted">${u.id}</td>
        <td class="name">${esc(u.name)}${badge ? ` <span class="ubadge">${esc(badge)}</span>` : ''}</td>
        <td>${typeBadges(u)}</td><td class="hide-sm small">${esc(u.classes.join(', '))}</td>
        <td>${esc(u.stars)}</td><td class="num hide-sm">${u.cost ?? ''}</td>
        <td class="num">${u.hp}</td><td class="num">${u.atk}</td><td class="num">${u.rcv}</td>
        <td class="num hide-sm">${u.cd ? `${u.cd[0]}→${u.cd[1]}` : ''}</td>
        <td class="hide-sm small muted">${u.added ? esc(fmtDate(u.added)) : esc(t('u.new'))}</td></tr>`;
    }
    const dim = this.o.dimUnselected && !sel;
    return `<button class="uitem ${sel ? 'sel' : ''} ${dim ? 'dim' : ''}" data-uid="${u.id}" title="${esc(u.name)}">
      ${thumb(u.id)}<span class="uid">${u.id}</span>${badge ? `<span class="ubadge">${esc(badge)}</span>` : ''}
    </button>`;
  }

  renderMore() {
    const next = this.results.slice(this.shown, this.shown + PAGE);
    if (!next.length) return;
    const target = this.s.view === 'list' && this.o.allowList ? $('tbody', this.root) : $('.results', this.root);
    target.insertAdjacentHTML('beforeend', next.map((u) => this.itemHtml(u)).join(''));
    this.shown += next.length;
  }

  observe() {
    if (this.observer) this.observer.disconnect();
    const sentinel = $('.sentinel', this.root);
    this.observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && this.shown < this.results.length) {
        this.renderMore();
        // si l'écran est très grand, on continue
        requestAnimationFrame(() => {
          const r = sentinel.getBoundingClientRect();
          if (r.top < window.innerHeight + 400 && this.shown < this.results.length) this.renderMore();
        });
      }
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
