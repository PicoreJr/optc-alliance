// Page d'accueil « Quoi de neuf » : nouveaux persos et bateaux, dernières équipes,
// membres mis à jour récemment.
import { t, fmtDate } from '../i18n.js';
import { EVENTS } from '../config.js';
import { DATA, SHIPS, loadShips } from '../data.js';
import { esc, $, $$, thumb, shipThumb } from '../ui.js';
import { openUnit } from './chars.js';
import { openShip } from './ships.js';
import { normalizeLineup } from './teams.js';
import { memberCard } from './alliance.js';

const DAY = 864e5;

// Persos ajoutés ces 7 derniers jours (ou, s'il y en a peu, les 24 plus récents)
function newUnits() {
  const list = [...DATA.units].sort((a, b) => (a.addedSort < b.addedSort ? 1 : a.addedSort > b.addedSort ? -1 : b.id - a.id));
  const week = new Date(Date.now() - 7 * DAY).toISOString().slice(0, 10);
  const recent = list.filter((u) => u.addedSort >= week);
  return recent.length >= 6 ? recent.slice(0, 60) : list.slice(0, 24);
}

export function renderHome(main, app) {
  const units = newUnits();
  const oldest = units.map((u) => u.added).filter(Boolean).sort()[0];
  const teams = app.teams.filter((x) => x.event_type !== 'kizuna_ev')
    .sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at))).slice(0, 6);
  const members = [...app.members].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))).slice(0, 4);

  main.innerHTML = `<section class="page home">
    <div class="page-head"><div><h1>${esc(t('home.title'))}</h1><p class="muted small">${esc(t('home.hint'))}</p></div></div>
    <div class="home-grid">
      <div class="card home-wide">
        <h2>${esc(t('home.newUnits'))} <span class="muted small">${oldest ? esc(t('home.since', { date: fmtDate(oldest) })) : ''}</span></h2>
        <div class="home-units">${units.map((u) => `<button class="uitem" data-uid="${u.id}" title="${esc(u.name)}">${thumb(u.id)}</button>`).join('')}</div>
        <a class="small" href="#/chars">${esc(t('home.allUnits'))} →</a>
      </div>
      <div class="card">
        <h2>${esc(t('home.teams'))}</h2>
        ${teams.length ? `<div class="home-teams">${teams.map(teamRow).join('')}</div>` : `<p class="muted">${esc(t('home.noTeams'))}</p>`}
      </div>
      <div class="card">
        <h2>${esc(t('home.ships'))}</h2>
        <div class="home-ships" data-ships><div class="spinner"></div></div>
        <a class="small" href="#/ships">${esc(t('home.allShips'))} →</a>
      </div>
      ${members.length ? `<div class="card home-wide">
        <h2>${esc(t('home.members'))}</h2>
        <div class="member-grid">${members.map((m) => memberCard(m)).join('')}</div>
        <a class="small" href="#/alliance">${esc(t('home.allMembers'))} →</a>
      </div>` : ''}
    </div>
  </section>`;

  $$('[data-uid]', main).forEach((b) => b.onclick = () => openUnit(Number(b.dataset.uid), app));
  // les bateaux arrivent en arrière-plan
  const box = $('[data-ships]', main);
  loadShips().then(() => {
    if (!box.isConnected) return;
    box.innerHTML = SHIPS.list.slice(-4).reverse().map((s) => `<button class="ship-tile" data-sid="${s.id}" title="${esc(s.name)}">
      ${shipThumb(s.id)}<span class="ship-name">${esc(s.name)}</span></button>`).join('');
    $$('[data-sid]', box).forEach((b) => b.onclick = () => openShip(Number(b.dataset.sid), app));
  }).catch(() => { if (box.isConnected) box.innerHTML = `<p class="muted small">${esc(t('sh.error'))}</p>`; });
}

// Une équipe : mode, titre, auteur, date et ses premiers persos
function teamRow(tm) {
  const ev = EVENTS.find((e) => e.id === tm.event_type) || EVENTS[EVENTS.length - 1];
  const ids = normalizeLineup(tm).groups[0].slots.map((s) => s.u).filter(Boolean).slice(0, 6);
  return `<a class="home-team" href="#/team/${esc(tm.id)}" style="--ev:${ev.color}">
    <span class="home-team-head"><span class="ev-badge">${esc(t('ev.' + ev.id))}</span>
      <strong>${esc(tm.title || tm.boss || t('ev.' + ev.id))}</strong></span>
    <span class="home-team-units">${ids.map((id) => thumb(id, 'xs')).join('')}</span>
    <span class="muted small">${tm.author ? esc(t('t.by', { name: tm.author })) + ' · ' : ''}${esc(fmtDate(tm.updated_at || tm.created_at))}</span>
  </a>`;
}
