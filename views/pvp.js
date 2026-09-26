// Onglet PvP : Pirate Rumble, Assault Rumble, Grand Party (équipes + guides)
// Les guides viennent de l'« OPTC Rumble Sheet » de Nydato (voir config.PVP_GUIDE).
import { t, fmtDate } from '../i18n.js';
import { PVP_GUIDE } from '../config.js';
import { DATA } from '../data.js';
import { esc, $, $$, thumb } from '../ui.js';
import { renderTeamList } from './teams.js';
import { openUnit } from './chars.js';

const MODES = {
  prumble: ['teams', 'meta', 'tier', 'comps'],
  arumble: ['teams', 'bosses'],
  gp: ['teams', 'season', 'leaders', 'gptier'],
  res: ['exp'],
};
const TYPES = ['STR', 'DEX', 'QCK', 'PSY', 'INT'];

let guide = null;
let guidePromise = null;
function loadGuide() {
  if (!guidePromise) {
    guidePromise = fetch(PVP_GUIDE.url, { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then((g) => { guide = g; return g; }).catch((e) => { guidePromise = null; throw e; });
  }
  return guidePromise;
}

export function renderPvp(main, app, mode, sub) {
  mode = MODES[mode] ? mode : 'prumble';
  sub = MODES[mode].includes(sub) ? sub : MODES[mode][0];
  main.innerHTML = `<section class="page">
    <nav class="subtabs big">
      ${Object.keys(MODES).map((m) => `<a href="#/pvp/${m}" class="${m === mode ? 'on' : ''}">${esc(t('ev.' + m))}</a>`).join('')}
    </nav>
    <nav class="subtabs">
      ${MODES[mode].map((s) => `<a href="#/pvp/${mode}/${s}" class="${s === sub ? 'on' : ''}">${esc(t('pvp.' + s))}</a>`).join('')}
    </nav>
    <div data-body></div>
  </section>`;
  const body = $('[data-body]', main);
  // sur mobile, on fait défiler les sous-onglets jusqu'à celui qui est actif
  $$('.subtabs a.on', main).forEach((a) => { const nav = a.parentElement; nav.scrollLeft = a.offsetLeft - nav.offsetLeft - 16; });
  if (sub === 'teams') {
    body.innerHTML = `<p class="muted small">${esc(t('pvp.teamsHint.' + mode))}</p><div data-teams></div>`;
    renderTeamList($('[data-teams]', body), app, { key: 'pvp-' + mode, events: [mode], emptyText: t('t.none') });
    return;
  }
  body.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  loadGuide().then((g) => {
    if (!body.isConnected) return;
    body.innerHTML = sourceNote(g) + (RENDER[sub] ? RENDER[sub](g) : '');
    $$('[data-uid]', body).forEach((n) => n.onclick = () => openUnit(Number(n.dataset.uid), app));
    $$('[data-toggle]', body).forEach((b) => b.onclick = () => b.closest('.gblock').classList.toggle('open'));
  }).catch(() => { body.innerHTML = `<p class="empty">${esc(t('pvp.noGuide'))}</p>`; });
}

// ---------- petits éléments ----------
function sourceNote(g) {
  const s = g.source || {};
  return `<p class="source-note small muted">${esc(t('pvp.source'))}
    <a href="${esc(PVP_GUIDE.sheet)}" target="_blank" rel="noopener">OPTC Rumble Sheet</a> (${esc(s.author || 'Nydato')})
    ${s.patch ? ' · patch ' + esc(s.patch) : ''}${s.updated ? ' · ' + esc(t('pvp.updated', { d: fmtDate(s.updated) })) : ''}</p>`;
}
function unit(id, cls = '') {
  if (typeof id === 'string') {
    const src = guide && guide.images && guide.images[id];
    return src ? `<span class="gunit ${cls}" title="${esc(t('pvp.notInDb'))}"><img src="${src}" alt="" loading="lazy"></span>`
      : `<span class="gunit unknown ${cls}" title="?">?</span>`;
  }
  if (!id) return `<span class="gunit unknown ${cls}" title="?">?</span>`;
  const u = DATA.byId.get(id);
  return `<button class="gunit ${cls}" data-uid="${id}" title="${esc(u ? u.name : '#' + id)}">${thumb(id)}</button>`;
}
const units = (ids, cls) => (ids || []).map((id) => unit(id, cls)).join('');
function icon(name) {
  if (!name) return '';
  if (TYPES.includes(name)) return `<span class="badge t-${name}">${name}</span>`;
  if (name === 'ALL') return `<span class="badge">${esc(t('pvp.allUnits'))}</span>`;
  if (name === 'DUAL') return `<span class="badge">${esc(t('pvp.dual'))}</span>`;
  if (/^(OP|SS|S|A|B|C|D)$/.test(name)) return `<span class="tier tier-${name}">${name}</span>`;
  return `<span class="badge">${esc(name)}</span>`;
}
const icons = (list) => (list || []).map(icon).join(' ');
const lines = (txt) => String(txt || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => '<br>' + esc(l)).join('');

// ---------- Pirate Rumble ----------
function renderMeta(g) {
  const seen = new Set();
  const comps = (g.metaComps || []).filter((c) => { const k = JSON.stringify(c); if (seen.has(k)) return false; seen.add(k); return true; });
  return `<p class="muted small">${esc(t('pvp.metaIntro'))}</p>
  <div class="glist">${comps.map((c) => `<div class="gcomp">
    <div class="gcomp-head">${icon(c.tier)} <strong>${esc(c.label || '')}</strong> ${icons(c.icons.filter((x) => !(c.label || '').includes(x)))}</div>
    <div class="gteam"><div><p class="slot-group">${esc(t('slot.mains'))}</p><div class="grow-units">${units(c.main)}</div></div>
      <div><p class="slot-group">${esc(t('slot.subs'))}</p><div class="grow-units">${units(c.sub)}</div></div></div>
  </div>`).join('')}</div>`;
}

function tierBlock(tiers, legend, withCost) {
  return tiers.map((tr) => `<div class="gtier">
    <div class="gtier-head">${icon(tr.tier)} <span class="muted small">${esc((legend || {})[tr.tier] || '')}</span></div>
    ${(tr.groups || [{ ids: tr.ids }]).map((gr) => `<div class="gtier-group">
      ${withCost && gr.cost ? `<span class="cost">${esc(t('pvp.cost', { n: gr.cost }))}</span>` : ''}
      <div class="grow-units">${units(gr.ids)}</div></div>`).join('')}
  </div>`).join('');
}
function renderTier(g) {
  const tl = g.tierList || {};
  return `<p class="muted small">${esc(t('pvp.tierIntro'))}${tl.updated ? ' · ' + esc(t('pvp.updated', { d: fmtDate(tl.updated) })) : ''}</p>
    ${tierBlock(tl.tiers || [], tl.legend, true)}`;
}

function renderComps(g) {
  return `<p class="muted small">${esc(t('pvp.compsIntro'))}</p>
  ${(g.comps || []).map((c, ci) => `<div class="gblock ${ci === 0 ? 'open' : ''}">
    <button class="gblock-head" data-toggle>${icon(c.rank)} <strong>${esc(c.title)}</strong> ${icons((c.icon || []).filter((x) => !c.title.toUpperCase().includes(x.toUpperCase())))}
      <span class="small">${c.strong?.length ? esc(t('pvp.strong')) + ' ' + icons(c.strong) : ''} ${c.weak?.length ? esc(t('pvp.weak')) + ' ' + icons(c.weak) : ''}</span>
      <span class="chev">▾</span></button>
    <div class="gblock-body">
      ${(c.lines || []).map((l) => `<p class="slot-group">${esc(l.o ? t('pvp.options') : t('pvp.lineup'))}</p>
        <div class="grole-list">${l.s.map(([col, id, name, desc]) => `<div class="grole">
          ${unit(id)}
          <div><span class="small muted">${esc(roleAt(c.roles, col))}</span><br><strong class="small">${esc(name || (DATA.byId.get(id) || {}).name || '')}</strong>
          ${desc ? `<p class="tiny">${esc(String(desc).split('\n').filter(Boolean).join(' · '))}</p>` : ''}</div></div>`).join('')}</div>`).join('')}
      ${c.req ? `<p class="small"><strong>${esc(t('pvp.requirements'))}</strong>${lines(c.req)}</p>` : ''}
    </div></div>`).join('')}`;
}
function roleAt(roles, col) {
  let r = '';
  for (const [c, name] of roles || []) if (c <= col) r = name;
  return r ? r.charAt(0) + r.slice(1).toLowerCase() : '';
}

// ---------- Assault Rumble ----------
function renderBosses(g) {
  return `<p class="muted small">${esc(t('pvp.bossIntro'))}</p>
  ${(g.assault || []).map((b, bi) => `<div class="gblock ${bi === 0 ? 'open' : ''}">
    <button class="gblock-head" data-toggle><strong>${esc(b.name)}</strong> <span class="chev">▾</span></button>
    <div class="gblock-body">
      <div class="gboss-grid">
        <div><p class="slot-group">${esc(t('pvp.bossUnits'))}</p>
          ${b.units.map((u) => `<div class="grole">${unit(u.id)}<div><strong class="small">${esc(u.name)}</strong><br>${icons(u.icons)}</div></div>`).join('')}</div>
        <div><p class="slot-group">${esc(t('pvp.synergy'))}</p><ul class="small">${b.buffs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
        ${b.specials.length ? `<div><p class="slot-group">${esc(t('pvp.specials'))}</p><ul class="small">${b.specials.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
          ${b.extra ? `<p class="tiny muted">${esc(b.extra)}</p>` : ''}</div>` : ''}
        <div><p class="slot-group">${esc(t('pvp.resist'))}</p><p class="small">${esc(t('pvp.evade'))} ${esc(b.evade.join(', '))}<br>${esc(t('pvp.reduce'))} ${esc(b.reduce || '—')}</p>
          <p class="small">${esc(t('pvp.weakTo'))} ${icons(b.weak)}<br>${esc(t('pvp.strongVs'))} ${icons(b.strong)}</p></div>
      </div>
      <p class="slot-group">${esc(t('pvp.recoTeams'))}</p>
      ${b.teams.map((tm) => `<div class="gteam">${icons(tm.icons)}<div class="grow-units">${units(tm.main)}</div><span class="sep">|</span><div class="grow-units">${units(tm.sub)}</div></div>`).join('')}
    </div></div>`).join('')}`;
}

// ---------- Grand Party ----------
function renderSeason(g) {
  const r = g.gpRules || {};
  const s = r.season || {};
  return `<div class="card">
    <h2>${esc(t('pvp.season'))} ${s.dates ? `<span class="muted small">${esc(s.dates)}</span>` : ''}</h2>
    ${s.condition ? `<p class="small">${esc(t('pvp.seasonCond'))} <strong>${esc(s.condition)}</strong></p>` : ''}
    <ul class="small">${(s.bonuses || []).map((b) => `<li>${icons(b.who)} ${esc(b.what)}</li>`).join('')}</ul>
    ${s.recommended?.length ? `<p class="slot-group">${esc(t('pvp.recoUnits'))}</p><div class="grow-units">${units(s.recommended)}</div>` : ''}
    ${s.leaders ? `<p class="small">${esc(t('pvp.recoLeaders'))} <strong>${esc(s.leaders)}</strong></p>` : ''}
  </div>
  <div class="card"><h2>${esc(t('pvp.universal'))}</h2>
    <div class="table-scroll"><table class="utable gtable"><thead><tr>${['day', 'battle', 'refresh', 'retries', 'hidden'].map((k) => `<th>${esc(t('pvp.col.' + k))}</th>`).join('')}</tr></thead>
    <tbody>${(r.universal || []).map((x) => `<tr><td>${esc(x.day)}</td><td>${esc(x.battle)}</td><td>${esc(x.refresh)}</td><td>${esc(x.retries)}</td><td>${esc(t('pvp.hid.' + x.hidden))}</td></tr>`).join('')}</tbody></table></div>
  </div>`;
}
function renderLeaders(g) {
  return `<p class="muted small">${esc(t('pvp.leadersIntro'))}</p>
  ${(g.gpLeaders || []).map((l, li) => `<div class="gblock ${li === 0 ? 'open' : ''}">
    <button class="gblock-head" data-toggle>${l.portrait ? unit(l.portrait, 'small') : ''}<strong>${esc(l.name)}</strong> ${l.boosted?.length ? `<span class="small">${esc(t('pvp.boosted'))} ${icons(l.boosted)}</span>` : ''} <span class="chev">▾</span></button>
    <div class="gblock-body">
      ${l.teams.map((tm) => `<div class="gteam ${tm.alt ? 'alt' : ''}">
        <div class="gteam-meta">${tm.alt ? `<span class="tiny muted">${esc(t('pvp.altTeam'))}</span>` : ''}${icons(tm.icons)}</div>
        <div class="grow-units">${units(tm.main)}</div><span class="sep">|</span><div class="grow-units">${units(tm.sub)}</div>
        <div class="small gteam-vs">${tm.good?.length ? esc(t('pvp.good')) + ' ' + icons(tm.good) : ''} ${tm.bad?.length ? ' · ' + esc(t('pvp.bad')) + ' ' + icons(tm.bad) : ''}</div>
      </div>`).join('')}
      ${l.when ? `<p class="small"><strong>${esc(t('pvp.when'))}</strong>${lines(l.when)}</p>` : ''}
      ${l.burst ? `<p class="small"><strong>${esc(t('pvp.burst'))}</strong><br>${lines(l.burst)}</p>` : ''}
    </div></div>`).join('')}`;
}
function renderGpTier(g) {
  const tl = g.gpTier || {};
  return `<p class="muted small">${esc(t('pvp.gpTierIntro'))}${tl.updated ? ' · ' + esc(t('pvp.updated', { d: fmtDate(tl.updated) })) : ''}</p>${tierBlock(tl.tiers || [], tl.legend, false)}`;
}

// ---------- Ressources ----------
const nf = (n) => Number(n || 0).toLocaleString();
function scrollCell(img, label) {
  const src = guide && guide.images && guide.images[img];
  return src ? `<img class="scroll-img" src="${src}" alt="${esc(label)}" title="${esc(label)}">` : esc(label);
}
function renderExp(g) {
  const e = g.exp || {};
  const sc = e.scrolls || [];
  const head = `<tr><th></th>${sc.map((s) => `<th class="num">${scrollCell(s.img, s.size)}</th>`).join('')}${sc.map((s) => `<th class="num">${scrollCell(s.otherImg, s.size)}</th>`).join('')}</tr>`;
  const groupHead = `<tr><th></th><th class="num" colspan="${sc.length}">${esc(t('pvp.ownType'))}</th><th class="num" colspan="${sc.length}">${esc(t('pvp.otherType'))}</th></tr>`;
  return `<p class="muted small">${esc(t('pvp.expIntro'))}</p>
  <div class="card"><h2>${esc(t('pvp.scrolls'))}</h2>
    <div class="table-scroll"><table class="utable gtable">
      <thead>${groupHead}${head}</thead>
      <tbody><tr><td>${esc(t('pvp.expGiven'))}</td>${sc.map((s) => `<td class="num">${nf(s.own)}</td>`).join('')}${sc.map((s) => `<td class="num">${nf(s.other)}</td>`).join('')}</tr></tbody>
    </table></div></div>
  ${(e.rarities || []).map((r) => `<div class="card"><h2>${esc(t('pvp.rar.' + r.name))} <span class="muted small">${esc(r.stars || '')}</span></h2>
    <div class="table-scroll"><table class="utable gtable"><thead><tr><th>${esc(t('pvp.ability'))}</th><th class="num">${esc(t('pvp.maxLv'))}</th><th class="num">${esc(t('pvp.totalExp'))}</th></tr></thead>
    <tbody>${r.rows.map((x) => `<tr><td>${esc(x.what)}</td><td class="num">${x.max}</td><td class="num">${nf(x.total)}</td></tr>`).join('')}</tbody></table></div>
    <p class="slot-group">${esc(t('pvp.itemsToMax'))}</p>
    <div class="table-scroll"><table class="utable gtable"><thead>${groupHead}${head}</thead>
    <tbody>${(r.items || []).map((x) => `<tr><td>${esc(x.what)}<br><span class="tiny muted">${nf(x.total)} EXP</span></td>${x.own.map((n) => `<td class="num">${n || '–'}</td>`).join('')}${x.other.map((n) => `<td class="num">${n || '–'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
  </div>`).join('')}`;
}

const RENDER = { meta: renderMeta, tier: renderTier, comps: renderComps, bosses: renderBosses, season: renderSeason, leaders: renderLeaders, gptier: renderGpTier, exp: renderExp };
