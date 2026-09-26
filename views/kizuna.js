// Onglet Kizuna : un Kizuna par événement, avec ses équipes Boss et Super Boss.
// Un Kizuna est enregistré comme une « équipe » spéciale (event_type = 'kizuna_ev').
import { t, fmtDate } from '../i18n.js';
import { esc, $, $$, openModal, confirmBox, toast } from '../ui.js';
import { renderTeamList, normalizeLineup } from './teams.js';

const EV = 'kizuna_ev';
const events = (app) => app.teams.filter((x) => x.event_type === EV)
  .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
const teamsOf = (app, kz, stage) => app.teams.filter((x) => x.event_type === 'kizuna'
  && (x.units || {}).kz === kz && (!stage || ((x.units || {}).stage || 'boss') === stage));

export function renderKizuna(main, app, id, stage) {
  if (id) return renderEvent(main, app, id, stage || 'boss');
  const list = events(app);
  const loose = app.teams.filter((x) => x.event_type === 'kizuna' && !(x.units || {}).kz);
  main.innerHTML = `<section class="page">
    <div class="page-head">
      <div><h1>${esc(t('ev.kizuna'))}</h1><p class="muted small">${esc(t('kz.intro'))}</p></div>
      <button class="btn primary" data-new>+ ${esc(t('kz.new'))}</button>
    </div>
    ${list.length ? `<div class="kz-grid">${list.map((ev) => {
      const nb = teamsOf(app, ev.id, 'boss').length; const ns = teamsOf(app, ev.id, 'super').length;
      return `<a class="kz-card" href="#/kizuna/${esc(ev.id)}">
        <strong>${esc(ev.title || t('ev.kizuna'))}</strong>
        ${ev.boss ? `<span class="muted">${esc(ev.boss)}</span>` : ''}
        <span class="small">${esc(t('kz.counts', { b: nb, s: ns }))}</span>
        <span class="muted small">${esc(fmtDate(ev.created_at))}</span>
      </a>`;
    }).join('')}</div>` : `<p class="empty">${esc(t('kz.none'))}</p>`}
    ${loose.length ? `<h2 class="section-title">${esc(t('kz.loose'))}</h2><div data-loose></div>` : ''}
  </section>`;
  $('[data-new]', main).onclick = () => editEvent(app, null, (saved) => { location.hash = `#/kizuna/${saved.id}`; });
  const lr = $('[data-loose]', main);
  if (lr) renderTeamList(lr, app, { key: 'kz-loose', events: ['kizuna'], filter: (x) => !(x.units || {}).kz });
}

function renderEvent(main, app, id, stage) {
  const ev = app.teams.find((x) => x.id === id && x.event_type === EV);
  if (!ev) { main.innerHTML = `<section class="page"><a class="back" href="#/kizuna">← ${esc(t('ev.kizuna'))}</a><p class="empty">${esc(t('kz.notFound'))}</p></section>`; return; }
  main.innerHTML = `<section class="page">
    <a class="back" href="#/kizuna">← ${esc(t('ev.kizuna'))}</a>
    <div class="page-head">
      <div><h1>${esc(ev.title || t('ev.kizuna'))}</h1>${ev.boss ? `<p class="muted">${esc(ev.boss)}</p>` : ''}</div>
      <span class="row">
        <button class="btn ghost small" data-edit>${esc(t('t.editBtn'))}</button>
        <button class="btn ghost danger small" data-del>${esc(t('t.delete'))}</button>
      </span>
    </div>
    ${ev.notes ? `<div class="notes card">${esc(ev.notes)}</div>` : ''}
    <nav class="subtabs">
      <a href="#/kizuna/${esc(id)}/boss" class="${stage === 'boss' ? 'on' : ''}">${esc(t('kz.boss'))} <span class="muted">(${teamsOf(app, id, 'boss').length})</span></a>
      <a href="#/kizuna/${esc(id)}/super" class="${stage === 'super' ? 'on' : ''}">${esc(t('kz.super'))} <span class="muted">(${teamsOf(app, id, 'super').length})</span></a>
    </nav>
    <div data-teams></div>
  </section>`;
  $('[data-edit]', main).onclick = () => editEvent(app, ev, () => renderEvent(main, app, id, stage));
  $('[data-del]', main).onclick = async () => {
    const own = teamsOf(app, id);
    if (!await confirmBox(t('kz.confirmDelete', { n: own.length }), { danger: true })) return;
    try {
      for (const tm of own) await app.api('deleteTeam', tm.id);
      await app.api('deleteTeam', ev.id);
      const gone = new Set([ev.id, ...own.map((x) => x.id)]);
      app.teams = app.teams.filter((x) => !gone.has(x.id));
      toast(t('kz.deleted'));
      location.hash = '#/kizuna';
    } catch (e) { app.fail(e); }
  };
  renderTeamList($('[data-teams]', main), app, {
    key: `kz-${id}-${stage}`,
    events: ['kizuna'],
    filter: (x) => (x.units || {}).kz === id && ((x.units || {}).stage || 'boss') === stage,
    defaults: { units: { ...normalizeLineup({ event_type: 'kizuna' }), kz: id, stage }, boss: ev.boss || '' },
    emptyText: t('kz.noTeams'),
    onChange: () => renderEvent(main, app, id, stage),
  });
}

function editEvent(app, ev, onSaved) {
  const m = openModal({
    title: esc(ev ? t('kz.edit') : t('kz.new')), size: 'small',
    body: `<label class="block">${esc(t('kz.name'))}<input class="input" name="title" maxlength="80" value="${esc(ev?.title || '')}" placeholder="${esc(t('kz.namePh'))}"></label>
      <label class="block">${esc(t('kz.bossName'))}<input class="input" name="boss" maxlength="80" value="${esc(ev?.boss || '')}" placeholder="${esc(t('kz.bossPh'))}"></label>
      <label class="block">${esc(t('t.notes'))}<textarea class="input" name="notes" rows="4" maxlength="4000" placeholder="${esc(t('kz.notesPh'))}">${esc(ev?.notes || '')}</textarea></label>`,
    footer: `<button class="btn ghost" data-a="cancel">${esc(t('t.cancel'))}</button><button class="btn primary" data-a="ok">${esc(t('t.save'))}</button>`,
  });
  $('[name=title]', m.el).focus();
  $('[data-a=cancel]', m.el).onclick = () => m.close();
  $('[data-a=ok]', m.el).onclick = async () => {
    const title = $('[name=title]', m.el).value.trim();
    if (!title) { toast(t('kz.needName'), 'err'); return; }
    try {
      const saved = await app.api('saveTeam', {
        id: ev?.id || '', event_type: EV, title,
        boss: $('[name=boss]', m.el).value.trim(), notes: $('[name=notes]', m.el).value.trim(),
        author: ev?.author || '', units: {},
      });
      const i = app.teams.findIndex((x) => x.id === saved.id);
      if (i >= 0) app.teams[i] = saved; else app.teams.unshift(saved);
      m.close();
      onSaved(saved);
    } catch (e) { app.fail(e); }
  };
}
