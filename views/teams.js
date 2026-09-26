// Équipes partagées : liste + éditeur, réutilisés par chaque mode de jeu
// (PvP, Kizuna, Treasure Map, PKA, Coop, Blitz).
import { t, fmtDate } from '../i18n.js';
import { EVENTS, FORMATS } from '../config.js';
import { DATA } from '../data.js';
import { esc, $, $$, openModal, confirmBox, toast, thumb, pickUnit, debounce } from '../ui.js';
import { openUnit } from './chars.js';

export const eventById = (id) => EVENTS.find((e) => e.id === id) || EVENTS[EVENTS.length - 1];
export const formatOf = (eventId) => FORMATS[eventById(eventId).format] || FORMATS.standard;
const hasSupport = (fmt, i) => (Array.isArray(fmt.supports) ? !!fmt.supports[i] : !!fmt.supports);
const newGroup = (fmt) => ({ slots: fmt.slots.map(() => ({ u: null, s: null })) });

function emptyLineup(fmt) {
  return { groups: Array.from({ length: fmt.groups.min }, () => newGroup(fmt)), ship: '', leader: null };
}

// Remet une composition au format de son mode (anciens formats compris)
export function normalizeLineup(team) {
  const fmt = formatOf(team.event_type);
  const lu = team.units && typeof team.units === 'object' && !Array.isArray(team.units) ? team.units : {};
  let groups = Array.isArray(lu.groups) && lu.groups.length ? lu.groups : emptyLineup(fmt).groups;
  groups = groups.slice(0, fmt.groups.max);
  while (groups.length < fmt.groups.min) groups.push(newGroup(fmt));
  return {
    ...lu,
    groups: groups.map((g) => ({
      slots: fmt.slots.map((_, i) => ({
        u: (g.slots || [])[i]?.u ?? null,
        s: hasSupport(fmt, i) ? (g.slots || [])[i]?.s ?? null : null,
      })),
    })),
    ship: fmt.ship ? lu.ship || '' : '',
    leader: fmt.leader ? lu.leader || null : null,
  };
}

// Persos à posséder (hors ami capitaine, capitaine coop et supports)
function requiredUnits(team) {
  const fmt = formatOf(team.event_type);
  const lu = normalizeLineup(team);
  const ids = new Set();
  lu.groups.forEach((g) => g.slots.forEach((sl, i) => { if (sl.u && !(fmt.noBox || []).includes(fmt.slots[i])) ids.add(sl.u); }));
  return [...ids];
}
function allUnits(team) {
  const lu = normalizeLineup(team);
  const ids = [];
  lu.groups.forEach((g) => g.slots.forEach((sl) => { if (sl.u) ids.push(sl.u); if (sl.s) ids.push(sl.s); }));
  return ids;
}
function feasibleMembers(team, members) {
  const req = requiredUnits(team);
  if (!req.length) return [];
  return members.filter((m) => m.box && req.every((id) => m.box[id]));
}

/**
 * Affiche une liste d'équipes dans `root`.
 * opts.events    modes proposés (le 1er est celui par défaut)
 * opts.filter    (team) => boolean
 * opts.defaults  champs ajoutés aux nouvelles équipes ({ units: { kz, stage } }…)
 * opts.emptyText texte si aucune équipe
 */
const states = new Map();
export function renderTeamList(root, app, opts) {
  const key = opts.key || opts.events.join(',');
  const state = states.get(key) || { q: '', feasibleFor: '', event: '' };
  states.set(key, state);
  const multi = opts.events.length > 1;
  root.innerHTML = `
    <div class="toolbar">
      <div class="row wrap">
        <input type="search" class="input grow" data-q placeholder="${esc(t('t.search'))}" value="${esc(state.q)}">
        <select class="input" data-feasible aria-label="${esc(t('t.feasibleFor'))}">
          <option value="">${esc(t('t.feasibleFor'))} : ${esc(t('t.anyMember'))}</option>
          ${app.members.map((m) => `<option value="${esc(m.id)}" ${state.feasibleFor === m.id ? 'selected' : ''}>${esc(t('t.feasibleFor'))} : ${esc(m.pseudo)}</option>`).join('')}
        </select>
        <button class="btn primary" data-new>+ ${esc(t('t.new'))}</button>
      </div>
      ${multi ? `<div class="row chips">
        <button class="chip ${!state.event ? 'on' : ''}" data-ev="">${esc(t('ev.all'))}</button>
        ${opts.events.map((id) => `<button class="chip ev ${state.event === id ? 'on' : ''}" style="--ev:${eventById(id).color}" data-ev="${id}">${esc(t('ev.' + id))}</button>`).join('')}
      </div>` : ''}
    </div>
    <div class="team-list" data-list></div>`;

  const redraw = () => (opts.onChange ? opts.onChange() : renderTeamList(root, app, opts));
  const drawList = () => {
    const q = state.q.trim().toLowerCase();
    const fm = state.feasibleFor ? app.members.find((m) => m.id === state.feasibleFor) : null;
    const list = app.teams.filter((tm) => {
      if (!opts.events.includes(tm.event_type)) return false;
      if (opts.filter && !opts.filter(tm)) return false;
      if (state.event && tm.event_type !== state.event) return false;
      if (fm && !feasibleMembers(tm, [fm]).length) return false;
      if (q) {
        const hay = [tm.title, tm.boss, tm.notes, tm.author, ...allUnits(tm).map((id) => DATA.byId.get(id)?.name)].join(' ').toLowerCase();
        if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    const box = $('[data-list]', root);
    box.innerHTML = list.length ? list.map((tm) => teamCard(tm, app, multi)).join('')
      : `<p class="empty">${esc(opts.emptyText || t('t.none'))}</p>`;
    $$('[data-team]', box).forEach((card) => {
      const tm = app.teams.find((x) => x.id === card.dataset.team);
      $$('[data-uid]', card).forEach((n) => n.onclick = () => openUnit(Number(n.dataset.uid), app));
      const on = (sel, fn) => { const b = $(sel, card); if (b) b.onclick = fn; };
      on('[data-edit]', () => openEditor(app, tm, opts, redraw));
      on('[data-dup]', () => openEditor(app, { ...tm, id: null, title: tm.title ? tm.title + ' (2)' : '' }, opts, redraw));
      on('[data-del]', async () => {
        if (!await confirmBox(t('t.confirmDelete'), { danger: true })) return;
        try {
          await app.api('deleteTeam', tm.id);
          app.teams = app.teams.filter((x) => x !== tm);
          toast(t('t.deleted'));
          if (opts.onChange) opts.onChange(); else drawList();
        } catch (e) { app.fail(e); }
      });
    });
  };

  $$('[data-ev]', root).forEach((b) => b.onclick = () => {
    state.event = b.dataset.ev;
    $$('[data-ev]', root).forEach((x) => x.classList.toggle('on', x === b));
    drawList();
  });
  $('[data-q]', root).addEventListener('input', debounce((e) => { state.q = e.target.value; drawList(); }, 150));
  $('[data-feasible]', root).onchange = (e) => { state.feasibleFor = e.target.value; drawList(); };
  $('[data-new]', root).onclick = () => openEditor(app, {
    event_type: state.event || opts.events[0],
    ...(opts.defaults || {}),
  }, opts, redraw);
  drawList();
}

function slotTile(id, label, cls = '', crown = false) {
  const u = id ? DATA.byId.get(id) : null;
  return `<div class="slot ${cls}">
    ${id ? `<button class="slot-img" data-uid="${id}" title="${esc(u ? u.name : '#' + id)}">${thumb(id)}</button>`
      : '<div class="slot-img empty"></div>'}
    ${crown ? `<span class="crown" title="${esc(t('slot.gpLeader'))}">♛</span>` : ''}
    <span class="slot-label">${esc(label)}</span></div>`;
}

function groupTitle(fmt, gi, count) {
  if (fmt.leader) return t('t.gpTeam' + (gi + 1));
  return count > 1 ? t('t.group', { n: gi + 1 }) : '';
}

// Emplacements groupés : principaux / secondaires pour le PvP
function slotsHtml(fmt, g, gi, lu, render) {
  const idx = fmt.slots.map((_, i) => i);
  // l'ami capitaine (ou le capitaine coop) s'affiche à droite, comme en jeu
  const last = (i) => (['friend', 'coop'].includes(fmt.slots[i]) ? 1 : 0);
  const main = idx.filter((i) => fmt.slots[i] !== 'sub').sort((a, b) => last(a) - last(b) || a - b);
  const sub = idx.filter((i) => fmt.slots[i] === 'sub');
  const cols = (list) => list.map((i) => render(g.slots[i], i, `${gi}.${i}`)).join('');
  if (!sub.length) return `<div class="lineup n${main.length}">${cols(main)}</div>`;
  return `<div class="lineup8">
    <div><p class="slot-group">${esc(t('slot.mains'))}</p><div class="lineup n5">${cols(main)}</div></div>
    <div><p class="slot-group">${esc(t('slot.subs'))}</p><div class="lineup n3">${cols(sub)}</div></div>
  </div>`;
}

function teamCard(tm, app, showEvent) {
  const ev = eventById(tm.event_type);
  const fmt = formatOf(tm.event_type);
  const lu = normalizeLineup(tm);
  const feas = feasibleMembers(tm, app.members);
  const hasReq = requiredUnits(tm).length > 0;
  return `<article class="team-card ${fmt.slots.length > 6 ? 'wide' : ''}" data-team="${esc(tm.id)}" style="--ev:${ev.color}">
    <header>
      ${showEvent ? `<span class="ev-badge">${esc(t('ev.' + ev.id))}</span>` : ''}
      <h3>${esc(tm.title || tm.boss || t('ev.' + ev.id))}</h3>
      ${tm.title && tm.boss ? `<p class="muted">${esc(tm.boss)}</p>` : ''}
    </header>
    ${lu.groups.map((g, gi) => `
      ${groupTitle(fmt, gi, lu.groups.length) ? `<p class="group-title">${esc(groupTitle(fmt, gi, lu.groups.length))}</p>` : ''}
      ${slotsHtml(fmt, g, gi, lu, (sl, i, k) => `<div class="slot-col">
        ${slotTile(sl.u, t('slot.' + fmt.slots[i]), '', lu.leader === k && !!sl.u)}
        ${hasSupport(fmt, i) && sl.s ? slotTile(sl.s, t('slot.support'), 'support') : ''}
      </div>`)}`).join('')}
    ${lu.ship ? `<p class="small"><strong>${esc(t('t.ship'))} :</strong> ${esc(lu.ship)}</p>` : ''}
    ${leaderLine(lu)}
    ${tm.notes ? `<div class="notes">${esc(tm.notes)}</div>` : ''}
    ${hasReq ? `<p class="small feasible" title="${esc(t('t.feasibleHint'))}"><strong>${esc(t('t.feasible'))} :</strong>
      ${feas.length ? feas.map((m) => `<a href="#/member/${esc(m.id)}">${esc(m.pseudo)}</a>`).join(', ') : `<span class="muted">${esc(t('t.feasibleNone'))}</span>`}</p>` : ''}
    <footer>
      <span class="muted small">${tm.author ? esc(t('t.by', { name: tm.author })) + ' · ' : ''}${esc(fmtDate(tm.updated_at || tm.created_at))}</span>
      <span class="row">
        <button class="btn ghost small" data-dup>${esc(t('t.duplicate'))}</button>
        <button class="btn ghost small" data-edit>${esc(t('t.editBtn'))}</button>
        <button class="btn ghost danger small" data-del>${esc(t('t.delete'))}</button>
      </span>
    </footer>
  </article>`;
}

function leaderLine(lu) {
  if (!lu.leader) return '';
  const [gi, i] = lu.leader.split('.');
  const id = lu.groups[gi]?.slots[i]?.u;
  if (!id) return '';
  return `<p class="small"><strong>♛ ${esc(t('slot.gpLeader'))} :</strong> ${esc(DATA.byId.get(id)?.name || '#' + id)}</p>`;
}

// ---------- éditeur ----------
export function openEditor(app, team, opts, onSaved) {
  const draft = {
    id: team.id || null,
    event_type: team.event_type || opts.events[0],
    title: team.title || '',
    boss: team.boss || '',
    author: team.author || lastAuthor(),
    notes: team.notes || '',
  };
  draft.units = normalizeLineup({ ...team, event_type: draft.event_type });

  const m = openModal({
    title: esc(draft.id ? t('t.edit') : t('t.new')), size: 'large',
    footer: `<button class="btn ghost" data-a="cancel">${esc(t('t.cancel'))}</button>
             <button class="btn primary" data-a="save">${esc(t('t.save'))}</button>`,
  });

  const draw = () => {
    const fmt = formatOf(draft.event_type);
    const lu = draft.units;
    m.body.innerHTML = `
      <div class="form-grid">
        ${opts.events.length > 1 ? `<label>${esc(t('t.event'))}<select class="input" data-f="event_type">
          ${opts.events.map((id) => `<option value="${id}" ${draft.event_type === id ? 'selected' : ''}>${esc(t('ev.' + id))}</option>`).join('')}
        </select></label>` : ''}
        <label>${esc(t('t.author'))}<input class="input" data-f="author" list="members-dl" value="${esc(draft.author)}" maxlength="40">
          <datalist id="members-dl">${app.members.map((mb) => `<option value="${esc(mb.pseudo)}">`).join('')}</datalist></label>
        <label class="span2">${esc(t('t.title'))}<input class="input" data-f="title" value="${esc(draft.title)}" placeholder="${esc(t('t.titlePh'))}" maxlength="80"></label>
        ${opts.noBoss ? '' : `<label class="span2">${esc(t('t.boss'))}<input class="input" data-f="boss" value="${esc(draft.boss)}" placeholder="${esc(t('t.bossPh'))}" maxlength="80"></label>`}
      </div>
      ${fmt.leader ? `<p class="muted small">${esc(t('t.leaderHint'))}</p>` : ''}
      ${lu.groups.map((g, gi) => `<div class="edit-group">
        ${groupTitle(fmt, gi, lu.groups.length) ? `<p class="group-title">${esc(groupTitle(fmt, gi, lu.groups.length))}</p>` : ''}
        ${slotsHtml(fmt, g, gi, lu, (sl, i, k) => `<div class="slot-col">
          ${editSlot(sl.u, t('slot.' + fmt.slots[i]), `${k}.u`, '', fmt.leader ? (lu.leader === k ? 'on' : 'off') : null)}
          ${hasSupport(fmt, i) ? editSlot(sl.s, t('slot.support'), `${k}.s`, 'support') : ''}
        </div>`)}
      </div>`).join('')}
      ${fmt.ship ? `<label class="block">${esc(t('t.ship'))}<input class="input" data-ship value="${esc(lu.ship)}" maxlength="60"></label>` : ''}
      <label class="block">${esc(t('t.notes'))}<textarea class="input" data-f="notes" rows="5" placeholder="${esc(t('t.notesPh'))}" maxlength="4000">${esc(draft.notes)}</textarea></label>`;

    $$('[data-f]', m.body).forEach((inp) => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
      if (inp.dataset.f === 'event_type') {
        const before = allSlotUnits(draft.units);
        const keep = { ...draft.units };
        draft.event_type = inp.value;
        draft.units = { ...keep, ...refill(formatOf(draft.event_type), before, draft.units.ship) };
        draw();
      } else draft[inp.dataset.f] = inp.value;
    }));
    const ship = $('[data-ship]', m.body);
    if (ship) ship.oninput = () => { draft.units.ship = ship.value; };
    $$('[data-slot]', m.body).forEach((b) => b.onclick = async () => {
      const [gi, i, k] = b.dataset.slot.split('.');
      const u = await pickUnit({ title: t('t.pick'), members: () => app.members });
      if (u) { draft.units.groups[gi].slots[i][k] = u.id; draw(); }
    });
    $$('[data-clear]', m.body).forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      const [gi, i, k] = b.dataset.clear.split('.');
      draft.units.groups[gi].slots[i][k] = null;
      if (k === 'u' && draft.units.leader === `${gi}.${i}`) draft.units.leader = null;
      draw();
    });
    $$('[data-lead]', m.body).forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      const k = b.dataset.lead;
      draft.units.leader = draft.units.leader === k ? null : k;
      draw();
    });
  };

  $('[data-a="cancel"]', m.el).onclick = () => m.close();
  $('[data-a="save"]', m.el).onclick = async (e) => {
    if (!allSlotUnits(draft.units).length) { toast(t('t.needUnit'), 'err'); return; }
    e.target.disabled = true;
    try {
      const saved = await app.api('saveTeam', { ...draft, id: draft.id || '' });
      const i = app.teams.findIndex((x) => x.id === saved.id);
      if (i >= 0) app.teams[i] = saved; else app.teams.unshift(saved);
      rememberAuthor(draft.author);
      toast(t('t.saved'));
      m.close();
      onSaved();
    } catch (err) { e.target.disabled = false; app.fail(err); }
  };
  draw();
}

function editSlot(id, label, key, cls = '', lead = null) {
  const u = id ? DATA.byId.get(id) : null;
  const base = key.replace(/\.[us]$/, '');
  return `<div class="slot ${cls}">
    <button class="slot-img ${id ? '' : 'empty'}" data-slot="${key}" title="${esc(u ? u.name : t('t.pick'))}">
      ${id ? thumb(id) : '<span class="plus">+</span>'}
    </button>
    ${id ? `<button class="slot-clear" data-clear="${key}" aria-label="${esc(t('t.clear'))}">✕</button>` : ''}
    ${id && lead ? `<button class="slot-lead ${lead}" data-lead="${base}" title="${esc(t('slot.gpLeader'))}">♛</button>` : ''}
    <span class="slot-label">${esc(label)}</span></div>`;
}

function allSlotUnits(lu) {
  const out = [];
  lu.groups.forEach((g) => g.slots.forEach((sl) => { if (sl.u) out.push({ u: sl.u, s: sl.s }); }));
  return out;
}
// Quand on change de mode, on replace les persos déjà choisis dans le nouveau format
function refill(fmt, units, ship) {
  const lu = emptyLineup(fmt);
  lu.ship = fmt.ship ? ship : '';
  let gi = 0; let i = 0;
  for (const x of units) {
    if (i >= fmt.slots.length) {
      if (gi + 1 >= fmt.groups.max) break;
      if (!lu.groups[gi + 1]) lu.groups.push(newGroup(fmt));
      gi++; i = 0;
    }
    lu.groups[gi].slots[i] = { u: x.u, s: hasSupport(fmt, i) ? x.s : null };
    i++;
  }
  return lu;
}

function lastAuthor() { try { return localStorage.getItem('optc.author') || ''; } catch (e) { return ''; } }
function rememberAuthor(a) { try { if (a) localStorage.setItem('optc.author', a); } catch (e) { /* ignore */ } }
