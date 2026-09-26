// Onglet Équipes : équipes partagées par événement
import { t, fmtDate } from '../i18n.js';
import { EVENTS, FORMATS } from '../config.js';
import { DATA } from '../data.js';
import { esc, $, $$, openModal, confirmBox, toast, thumb, pickUnit, debounce } from '../ui.js';
import { openUnit } from './chars.js';

const state = { event: '', q: '', feasibleFor: '' };

const eventById = (id) => EVENTS.find((e) => e.id === id) || EVENTS[EVENTS.length - 1];
const formatOf = (eventId) => FORMATS[eventById(eventId).format] || FORMATS.standard;

function emptyLineup(fmt) {
  return {
    groups: Array.from({ length: fmt.groups.min }, () => ({ slots: fmt.slots.map(() => ({ u: null, s: null })) })),
    ship: '',
  };
}
function normalizeLineup(team) {
  const fmt = formatOf(team.event_type);
  const lu = team.units && typeof team.units === 'object' && !Array.isArray(team.units) ? team.units : {};
  const groups = Array.isArray(lu.groups) && lu.groups.length ? lu.groups : emptyLineup(fmt).groups;
  return {
    groups: groups.map((g) => ({ slots: fmt.slots.map((_, i) => ({ u: (g.slots || [])[i]?.u ?? null, s: (g.slots || [])[i]?.s ?? null })) })),
    ship: lu.ship || '',
  };
}
// Persos « obligatoires » d'une équipe (hors ami capitaine et supports)
function requiredUnits(team) {
  const fmt = formatOf(team.event_type);
  const lu = normalizeLineup(team);
  const ids = new Set();
  lu.groups.forEach((g) => g.slots.forEach((sl, i) => { if (sl.u && fmt.slots[i] !== 'friend') ids.add(sl.u); }));
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

export function renderTeams(main, app) {
  main.innerHTML = `<section class="page">
    <div class="page-head">
      <h1>${esc(t('tab.teams'))}</h1>
      <button class="btn primary" data-new>+ ${esc(t('t.new'))}</button>
    </div>
    <div class="toolbar">
      <div class="row chips scroll-x">
        <button class="chip ${!state.event ? 'on' : ''}" data-ev="">${esc(t('ev.all'))}</button>
        ${EVENTS.map((e) => `<button class="chip ev ${state.event === e.id ? 'on' : ''}" style="--ev:${e.color}" data-ev="${e.id}">${esc(t('ev.' + e.id))}</button>`).join('')}
      </div>
      <div class="row wrap">
        <input type="search" class="input grow" data-q placeholder="${esc(t('t.search'))}" value="${esc(state.q)}">
        <select class="input" data-feasible aria-label="${esc(t('t.feasibleFor'))}">
          <option value="">${esc(t('t.feasibleFor'))} : ${esc(t('t.anyMember'))}</option>
          ${app.members.map((m) => `<option value="${esc(m.id)}" ${state.feasibleFor === m.id ? 'selected' : ''}>${esc(t('t.feasibleFor'))} : ${esc(m.pseudo)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="team-list" data-list></div>
  </section>`;

  const drawList = () => {
    const q = state.q.trim().toLowerCase();
    const fm = state.feasibleFor ? app.members.find((m) => m.id === state.feasibleFor) : null;
    const list = app.teams.filter((tm) => {
      if (state.event && tm.event_type !== state.event) return false;
      if (fm && !feasibleMembers(tm, [fm]).length) return false;
      if (q) {
        const hay = [tm.title, tm.boss, tm.notes, tm.author, ...allUnits(tm).map((id) => DATA.byId.get(id)?.name)].join(' ').toLowerCase();
        if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    const box = $('[data-list]', main);
    box.innerHTML = list.length ? list.map((tm) => teamCard(tm, app)).join('')
      : `<p class="empty">${esc(app.teams.length ? t('t.noneFilter') : t('t.none'))}</p>`;
    $$('[data-team]', box).forEach((card) => {
      const tm = app.teams.find((x) => x.id === card.dataset.team);
      $$('[data-uid]', card).forEach((n) => n.onclick = () => openUnit(Number(n.dataset.uid), app));
      const on = (sel, fn) => { const b = $(sel, card); if (b) b.onclick = fn; };
      on('[data-edit]', () => openEditor(app, tm, () => renderTeams(main, app)));
      on('[data-dup]', () => openEditor(app, { ...tm, id: null, title: tm.title ? tm.title + ' (2)' : '' }, () => renderTeams(main, app)));
      on('[data-del]', async () => {
        if (!await confirmBox(t('t.confirmDelete'), { danger: true })) return;
        try {
          await app.api('deleteTeam', tm.id);
          app.teams = app.teams.filter((x) => x !== tm);
          toast(t('t.deleted'));
          drawList();
        } catch (e) { app.fail(e); }
      });
    });
  };

  $$('[data-ev]', main).forEach((b) => b.onclick = () => {
    state.event = b.dataset.ev;
    $$('[data-ev]', main).forEach((x) => x.classList.toggle('on', x === b));
    drawList();
  });
  $('[data-q]', main).addEventListener('input', debounce((e) => { state.q = e.target.value; drawList(); }, 150));
  $('[data-feasible]', main).onchange = (e) => { state.feasibleFor = e.target.value; drawList(); };
  $('[data-new]', main).onclick = () => openEditor(app, { event_type: state.event || 'kizuna' }, () => renderTeams(main, app));
  drawList();
}

function slotTile(id, label, cls = '') {
  const u = id ? DATA.byId.get(id) : null;
  return `<div class="slot ${cls}">
    ${id ? `<button class="slot-img" data-uid="${id}" title="${esc(u ? u.name : '#' + id)}">${thumb(id)}</button>`
      : '<div class="slot-img empty"></div>'}
    <span class="slot-label">${esc(label)}</span></div>`;
}

function teamCard(tm, app) {
  const ev = eventById(tm.event_type);
  const fmt = formatOf(tm.event_type);
  const lu = normalizeLineup(tm);
  const feas = feasibleMembers(tm, app.members);
  const hasReq = requiredUnits(tm).length > 0;
  return `<article class="team-card" data-team="${esc(tm.id)}" style="--ev:${ev.color}">
    <header>
      <span class="ev-badge">${esc(t('ev.' + ev.id))}</span>
      <h3>${esc(tm.title || tm.boss || t('ev.' + ev.id))}</h3>
      ${tm.title && tm.boss ? `<p class="muted">${esc(tm.boss)}</p>` : ''}
    </header>
    ${lu.groups.map((g, gi) => `
      ${lu.groups.length > 1 ? `<p class="group-title">${esc(t('t.group', { n: gi + 1 }))}</p>` : ''}
      <div class="lineup">${g.slots.map((sl, i) => `<div class="slot-col">
        ${slotTile(sl.u, t('slot.' + fmt.slots[i]))}
        ${fmt.supports && sl.s ? slotTile(sl.s, t('slot.support'), 'support') : ''}
      </div>`).join('')}</div>`).join('')}
    ${lu.ship ? `<p class="small"><strong>${esc(t('t.ship'))} :</strong> ${esc(lu.ship)}</p>` : ''}
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

// ---------- éditeur ----------
function openEditor(app, team, onSaved) {
  const draft = {
    id: team.id || null,
    event_type: team.event_type || 'kizuna',
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
        <label>${esc(t('t.event'))}<select class="input" data-f="event_type">
          ${EVENTS.map((e) => `<option value="${e.id}" ${draft.event_type === e.id ? 'selected' : ''}>${esc(t('ev.' + e.id))}</option>`).join('')}
        </select></label>
        <label>${esc(t('t.author'))}<input class="input" data-f="author" list="members-dl" value="${esc(draft.author)}" maxlength="40">
          <datalist id="members-dl">${app.members.map((mb) => `<option value="${esc(mb.pseudo)}">`).join('')}</datalist></label>
        <label class="span2">${esc(t('t.title'))}<input class="input" data-f="title" value="${esc(draft.title)}" placeholder="${esc(t('t.titlePh'))}" maxlength="80"></label>
        <label class="span2">${esc(t('t.boss'))}<input class="input" data-f="boss" value="${esc(draft.boss)}" placeholder="${esc(t('t.bossPh'))}" maxlength="80"></label>
      </div>
      ${lu.groups.map((g, gi) => `<div class="edit-group">
        ${fmt.groups.max > 1 ? `<div class="row between"><p class="group-title">${esc(t('t.group', { n: gi + 1 }))}</p>
          ${lu.groups.length > fmt.groups.min ? `<button class="btn ghost small danger" data-rmgroup="${gi}">${esc(t('t.removeGroup'))}</button>` : ''}</div>` : ''}
        <div class="lineup edit">${g.slots.map((sl, i) => `<div class="slot-col">
          ${editSlot(sl.u, t('slot.' + fmt.slots[i]), `${gi}.${i}.u`)}
          ${fmt.supports ? editSlot(sl.s, t('slot.support'), `${gi}.${i}.s`, 'support') : ''}
        </div>`).join('')}</div></div>`).join('')}
      ${fmt.groups.max > lu.groups.length ? `<button class="btn ghost" data-addgroup>${esc(t('t.addGroup'))}</button>` : ''}
      ${fmt.ship ? `<label class="block">${esc(t('t.ship'))}<input class="input" data-ship value="${esc(lu.ship)}" maxlength="60"></label>` : ''}
      <label class="block">${esc(t('t.notes'))}<textarea class="input" data-f="notes" rows="5" placeholder="${esc(t('t.notesPh'))}" maxlength="4000">${esc(draft.notes)}</textarea></label>`;

    $$('[data-f]', m.body).forEach((inp) => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
      if (inp.dataset.f === 'event_type') {
        const before = allSlotUnits(draft.units);
        draft.event_type = inp.value;
        draft.units = refill(formatOf(draft.event_type), before, draft.units.ship);
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
      draft.units.groups[gi].slots[i][k] = null; draw();
    });
    const add = $('[data-addgroup]', m.body);
    if (add) add.onclick = () => { draft.units.groups.push({ slots: fmt.slots.map(() => ({ u: null, s: null })) }); draw(); };
    $$('[data-rmgroup]', m.body).forEach((b) => b.onclick = () => { draft.units.groups.splice(Number(b.dataset.rmgroup), 1); draw(); });
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

function editSlot(id, label, key, cls = '') {
  const u = id ? DATA.byId.get(id) : null;
  return `<div class="slot ${cls}">
    <button class="slot-img ${id ? '' : 'empty'}" data-slot="${key}" title="${esc(u ? u.name : t('t.pick'))}">
      ${id ? thumb(id) : '<span class="plus">+</span>'}
    </button>
    ${id ? `<button class="slot-clear" data-clear="${key}" aria-label="${esc(t('t.clear'))}">✕</button>` : ''}
    <span class="slot-label">${esc(label)}</span></div>`;
}

function allSlotUnits(lu) {
  const out = [];
  lu.groups.forEach((g) => g.slots.forEach((sl) => { if (sl.u) out.push({ u: sl.u, s: sl.s }); }));
  return out;
}
// Quand on change d'événement, on replace les persos déjà choisis dans le nouveau format
function refill(fmt, units, ship) {
  const lu = emptyLineup(fmt);
  lu.ship = fmt.ship ? ship : '';
  let gi = 0; let i = 0;
  for (const x of units) {
    if (i >= fmt.slots.length) {
      if (lu.groups.length >= fmt.groups.max) break;
      lu.groups.push({ slots: fmt.slots.map(() => ({ u: null, s: null })) });
      gi++; i = 0;
    }
    lu.groups[gi].slots[i] = { u: x.u, s: fmt.supports ? x.s : null };
    i++;
  }
  return lu;
}

function lastAuthor() { try { return localStorage.getItem('optc.author') || ''; } catch (e) { return ''; } }
function rememberAuthor(a) { try { if (a) localStorage.setItem('optc.author', a); } catch (e) { /* ignore */ } }
