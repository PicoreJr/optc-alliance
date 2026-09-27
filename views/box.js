// Édition du détail d'un perso dans la box d'un membre
import { t } from '../i18n.js';
import { SOCKETS, LB_LEVELS } from '../config.js';
import { DATA, loadDetails, getDetails } from '../data.js';
import { esc, $, $$, openModal, thumb, typeBadges, confirmBox } from '../ui.js';

// Niveau de Limit Break d'un perso de la box : 1 à 5, 'rainbow', ou 0 (non renseigné).
// Anciennes valeurs : 'llb' → 1, 'rainbow' → Rainbow, 'lb' / 'lbx' → non renseigné.
export function lbLevel(entry) {
  const v = entry && entry.lb;
  if (v === 'rainbow') return 'rainbow';
  if (v === 'llb') return 1;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 0;
}
export function lbLabel(entry) {
  const l = lbLevel(entry);
  return l === 'rainbow' ? t('b.lbRainbow') : l ? t('b.lbN', { n: l }) : '';
}
// Petit badge sur la vignette (« LB3 », « RB » avec bordure arc-en-ciel)
export function lbBadge(entry) {
  const l = lbLevel(entry);
  return l === 'rainbow' ? { text: 'RB', cls: 'rb' } : l ? { text: `LB${l}`, cls: 'lb' } : '';
}

// entry = { lv, lb, pot: [niveaux], sk: [{t, l}], sup, cc: {h, a, r} }
export function openBoxEntry(member, unitId, { onChange, onRemove }) {
  const u = DATA.byId.get(Number(unitId));
  if (!u) return;
  const m = openModal({
    title: `<span class="muted">#${u.id}</span> ${esc(u.name)}`,
    footer: `<button class="btn danger ghost" data-a="remove">${esc(t('b.remove'))}</button>
             <button class="btn primary" data-a="close">${esc(t('b.close'))}</button>`,
  });
  const entry = () => member.box[u.id] || (member.box[u.id] = {});

  const draw = () => {
    const e = entry();
    const d = getDetails(u.id);
    const pots = d && Array.isArray(d.potential) ? d.potential : null;
    const hasSupport = d ? Array.isArray(d.support) && d.support.length > 0 : true;
    const nSock = u.sockets || 0;
    const sk = e.sk || [];
    const cc = e.cc || {};
    const lb = lbLevel(e);
    const maxLv = lb ? 150 : (u.maxLevel || 99);
    const lvOpts = (cur, max, zeroLabel) => `<option value="">${esc(zeroLabel)}</option>` +
      Array.from({ length: max }, (_, i) => `<option value="${i + 1}" ${Number(cur) === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('');

    m.body.innerHTML = `
      <div class="entry-head">${thumb(u.id, 'big')}
        <div><div class="badges">${typeBadges(u)} <span class="badge">${esc(u.stars)}★</span></div>
        <p class="muted small">${esc(u.classes.join(' · '))}</p></div></div>
      <div class="lb-row">
        <p class="field-label">${esc(t('b.lb'))}</p>
        <div class="lb-pick" role="group" aria-label="${esc(t('b.lb'))}">
          <button type="button" data-lb="0" class="${!lb ? 'on' : ''}">${esc(t('b.lbNone'))}</button>
          ${LB_LEVELS.map((l) => `<button type="button" data-lb="${l}" class="${l === 'rainbow' ? 'rb' : ''} ${lb === l ? 'on' : ''}">${esc(l === 'rainbow' ? t('b.lbRainbow') : String(l))}</button>`).join('')}
        </div>
        <p class="muted small">${esc(t('b.lbHint'))}</p>
      </div>
      <div class="form-grid">
        <label>${esc(t('b.level'))}
          <input class="input" type="number" inputmode="numeric" min="1" max="${maxLv}" data-k="lv" value="${e.lv ?? ''}" placeholder="1 – ${maxLv}">
        </label>
        ${hasSupport ? `<label>${esc(t('b.support'))}
          <select class="input" data-k="sup">${lvOpts(e.sup, 5, t('b.notUnlocked'))}</select></label>` : ''}
      </div>

      <h3>${esc(t('b.potentials'))}</h3>
      ${!d ? `<p class="muted small">${esc(t('u.detailsLoading'))}</p>`
        : pots && pots.length ? `<div class="form-grid">${pots.map((p, i) => `<label>${esc(p.Name)}
            <select class="input" data-pot="${i}">${lvOpts((e.pot || [])[i], 5, t('b.notUnlocked'))}</select></label>`).join('')}</div>`
        : `<p class="muted small">${esc(t('b.potNone'))}</p>`}

      <h3>${esc(t('b.sockets'))} <span class="muted small">(${nSock})</span></h3>
      ${nSock ? `<div class="sockets">${Array.from({ length: nSock }, (_, i) => `
          <div class="socket">
            <select class="input" data-sk-t="${i}" aria-label="Socket ${i + 1}">
              <option value="">${esc(t('b.notUnlocked'))}</option>
              ${SOCKETS.map((s) => `<option value="${s}" ${(sk[i] || {}).t === s ? 'selected' : ''}>${esc(t('sk.' + s))}</option>`).join('')}
            </select>
            <select class="input lv" data-sk-l="${i}" aria-label="Niveau">
              ${lvOpts((sk[i] || {}).l, 5, '–')}
            </select>
          </div>`).join('')}</div>`
        : `<p class="muted small">${esc(t('b.socketsNone'))}</p>`}

      <h3>${esc(t('b.cc'))}</h3>
      <div class="form-grid three">
        ${[['h', 'HP'], ['a', 'ATK'], ['r', 'RCV']].map(([k, label]) => `<label>${label}
          <input class="input" type="number" inputmode="numeric" min="0" max="200" data-cc="${k}" value="${cc[k] ?? ''}" placeholder="0 – 200"></label>`).join('')}
      </div>`;

    const changed = () => { cleanup(entry()); onChange(); };
    $$('[data-k]', m.body).forEach((inp) => inp.addEventListener('change', () => {
      const k = inp.dataset.k;
      let v = inp.value;
      if (k === 'lv' || k === 'sup') v = v === '' ? undefined : clamp(parseInt(v, 10), 1, k === 'lv' ? 150 : 5);
      entry()[k] = v;
      if (k === 'lv' && v !== undefined) inp.value = v;
      changed();
    }));
    $$('[data-lb]', m.body).forEach((b) => b.onclick = () => {
      const v = b.dataset.lb;
      entry().lb = v === 'rainbow' ? 'rainbow' : Number(v) || undefined;
      changed();
      draw();
    });
    $$('[data-pot]', m.body).forEach((inp) => inp.addEventListener('change', () => {
      const e = entry();
      e.pot = e.pot || [];
      e.pot[Number(inp.dataset.pot)] = inp.value === '' ? 0 : Number(inp.value);
      changed();
    }));
    $$('[data-sk-t], [data-sk-l]', m.body).forEach((inp) => inp.addEventListener('change', () => {
      const e = entry();
      const i = Number(inp.dataset.skT ?? inp.dataset.skL);
      e.sk = e.sk || [];
      e.sk[i] = e.sk[i] || {};
      if (inp.dataset.skT !== undefined) e.sk[i].t = inp.value || undefined;
      else e.sk[i].l = inp.value === '' ? undefined : Number(inp.value);
      changed();
    }));
    $$('[data-cc]', m.body).forEach((inp) => inp.addEventListener('change', () => {
      const e = entry();
      e.cc = e.cc || {};
      const v = inp.value === '' ? undefined : clamp(parseInt(inp.value, 10), 0, 200);
      e.cc[inp.dataset.cc] = v;
      if (v !== undefined) inp.value = v;
      changed();
    }));
  };

  $('[data-a="close"]', m.el).onclick = () => m.close();
  $('[data-a="remove"]', m.el).onclick = async () => {
    if (await confirmBox(t('b.confirmRemove'), { danger: true })) {
      delete member.box[u.id];
      m.close();
      onRemove();
    }
  };
  draw();
  if (!DATA.details) loadDetails().then(() => { if (m.el.isConnected) draw(); }).catch(() => {});
}

function clamp(n, a, b) { return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : undefined; }

// Retire les champs vides pour garder la base légère
function cleanup(e) {
  if (Array.isArray(e.pot)) { e.pot = Array.from(e.pot, (x) => x || 0); while (e.pot.length && !e.pot[e.pot.length - 1]) e.pot.pop(); if (!e.pot.length) delete e.pot; }
  if (Array.isArray(e.sk)) {
    e.sk = Array.from(e.sk, (s) => (s && (s.t || s.l) ? s : {}));
    while (e.sk.length && !e.sk[e.sk.length - 1].t && !e.sk[e.sk.length - 1].l) e.sk.pop();
    if (!e.sk.length) delete e.sk;
  }
  if (e.cc) { for (const k of Object.keys(e.cc)) if (e.cc[k] == null) delete e.cc[k]; if (!Object.keys(e.cc).length) delete e.cc; }
  for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
}
