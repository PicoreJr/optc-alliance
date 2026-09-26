// Point d'entrée : connexion, navigation entre onglets, état partagé
import { CONFIG } from './config.js';
import { t, getLang, setLang } from './i18n.js';
import { api, ApiError } from './api.js';
import { DATA, loadCore, loadDetails } from './data.js';
import { esc, $, $$, toast, openModal } from './ui.js';
import { renderChars, refreshChars } from './views/chars.js';
import { renderPvp } from './views/pvp.js';
import { renderKizuna } from './views/kizuna.js';
import { renderMode } from './views/modes.js';
import { renderAlliance, renderMember } from './views/alliance.js';

const root = document.getElementById('app');
document.title = CONFIG.allianceName;
setLang(getLang());

// État partagé par les vues
const app = {
  code: null,
  role: null,
  members: [],
  teams: [],
  get isAdmin() { return this.role === 'admin'; },
  async api(fn, arg) {
    return api[fn](this.code, arg);
  },
  fail(e) {
    if (e instanceof ApiError && e.kind === 'code') { toast(t('err.code'), 'err'); logout(); return; }
    const msg = e instanceof ApiError ? (e.kind === 'network' ? t('err.network') : e.kind === 'admin' ? t('err.admin') : `${t('err.generic')} : ${e.message}`) : t('err.generic');
    toast(msg, 'err');
    console.error(e);
  },
};

// ---------- connexion ----------
function stored() {
  try { return JSON.parse(localStorage.getItem('optc.session') || 'null'); } catch (e) { return null; }
}
function store(s) {
  try { if (s) localStorage.setItem('optc.session', JSON.stringify(s)); else localStorage.removeItem('optc.session'); } catch (e) { /* ignore */ }
}
function logout() {
  app.code = null; app.role = null; app.members = []; app.teams = [];
  store(null);
  try { sessionStorage.removeItem('optc.session'); } catch (e) { /* ignore */ }
  showLogin();
}

function langSwitch() {
  const other = getLang() === 'fr' ? 'en' : 'fr';
  return `<button type="button" class="btn ghost small lang" data-lang="${other}" title="Language">${other.toUpperCase()}</button>`;
}
function bindLang(scope, rerender) {
  $$('[data-lang]', scope).forEach((b) => b.onclick = () => { setLang(b.dataset.lang); rerender(); });
}

function showLogin(error = '') {
  root.innerHTML = `<div class="login">
    <form class="login-card" autocomplete="off">
      <div class="row between"><span></span>${langSwitch()}</div>
      <div class="logo" aria-hidden="true">☠</div>
      <h1>${esc(CONFIG.allianceName)}</h1>
      <p class="muted">${esc(t('login.title'))}</p>
      <label class="block">${esc(t('login.code'))}
        <span class="pw-wrap">
          <input class="input" type="password" name="code" required autofocus
            autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore>
          <button type="button" class="icon-btn pw-eye" data-eye aria-label="${esc(t('login.show'))}" title="${esc(t('login.show'))}">👁</button>
        </span>
      </label>
      <label class="check"><input type="checkbox" name="remember" checked> ${esc(t('login.remember'))}</label>
      <p class="error" role="alert">${esc(error)}</p>
      <button class="btn primary block" type="submit">${esc(t('login.submit'))}</button>
    </form></div>`;
  bindLang(root, () => showLogin());
  const form = $('form', root);
  // « new-password » : le navigateur ne colle pas un mot de passe enregistré dans ce champ
  const codeInput = form.code;
  codeInput.addEventListener('input', () => { const er = $('.error', root); if (er) er.textContent = ''; });
  $('[data-eye]', form).onclick = () => {
    codeInput.type = codeInput.type === 'password' ? 'text' : 'password';
    codeInput.focus();
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const code = form.code.value.normalize('NFC').trim();
    if (!code) return;
    const btn = $('button[type=submit]', form);
    btn.disabled = true; btn.textContent = t('login.checking');
    try {
      const role = await api.login(code);
      if (!role) { showLogin(t('login.bad')); return; }
      const session = { code, role };
      if (form.remember.checked) store(session);
      else try { sessionStorage.setItem('optc.session', JSON.stringify(session)); } catch (e2) { /* ignore */ }
      await start(session);
    } catch (err) {
      showLogin(err instanceof ApiError && err.kind === 'network' ? t('err.network') : t('err.generic'));
    }
  };
}

// ---------- démarrage ----------
async function start(session) {
  app.code = session.code;
  app.role = session.role;
  root.innerHTML = `<div class="loading"><div class="spinner"></div><p>${esc(t('data.loading'))}</p></div>`;
  try {
    const [all] = await Promise.all([api.getAll(app.code), DATA.units.length ? null : loadCore()]);
    app.members = (all && all.members) || [];
    app.teams = (all && all.teams) || [];
  } catch (e) {
    if (e instanceof ApiError && e.kind === 'code') { store(null); showLogin(t('login.bad')); return; }
    root.innerHTML = `<div class="loading"><p class="error">${esc(e instanceof ApiError ? t('err.network') : t('data.error'))}</p>
      <button class="btn primary" onclick="location.reload()">↻</button></div>`;
    return;
  }
  // les capacités (fichier plus lourd) arrivent en arrière-plan
  loadDetails().catch(() => {});
  shell();
  route();
}

// Nouvelles données de persos disponibles (mise à jour en arrière-plan)
DATA.listeners.add((what) => { if (what === 'units') refreshChars(); });

const TABS = ['pvp', 'kizuna', 'tm', 'pka', 'coop', 'blitz', 'alliance'];
const MODE_TABS = ['tm', 'pka', 'coop', 'blitz'];

function shell() {
  root.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#/chars">${esc(CONFIG.allianceName)}</a>
      <nav class="tabs">
        <a href="#/chars" data-tab="chars">${esc(t('tab.chars'))}</a>
        ${TABS.map((id) => `<a href="#/${id}" data-tab="${id}">${esc(t('tab.' + id))}</a>`).join('')}
      </nav>
      <div class="top-actions">
        ${app.isAdmin ? `<button class="btn ghost small admin" data-codes title="${esc(t('nav.codes'))}">★<span class="lbl"> ${esc(t('nav.admin'))}</span></button>` : ''}
        ${langSwitch()}
        <button class="btn ghost small" data-logout title="${esc(t('nav.logout'))}"><span class="lbl">${esc(t('nav.logout'))}</span><span class="ico" aria-hidden="true">⏻</span></button>
      </div>
    </header>
    <main id="main"></main>`;
  bindLang(root, () => { shell(); route(); });
  $('[data-logout]', root).onclick = logout;
  const codes = $('[data-codes]', root);
  if (codes) codes.onclick = openCodes;
}

function route() {
  const main = document.getElementById('main');
  if (!main) return;
  const hash = location.hash.replace(/^#\/?/, '') || 'chars';
  const [page, arg, arg2] = hash.split('/').map((x) => decodeURIComponent(x || ''));
  // anciens liens « #/teams » -> onglet PvP
  if (page === 'teams') { location.replace('#/pvp'); return; }
  const tab = page === 'member' ? 'alliance' : page;
  $$('[data-tab]').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  const on = $('.tabs a.on');
  if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  window.scrollTo(0, 0);
  if (page === 'pvp') renderPvp(main, app, arg, arg2);
  else if (page === 'kizuna') renderKizuna(main, app, arg, arg2);
  else if (MODE_TABS.includes(page)) renderMode(main, app, page);
  else if (page === 'alliance') renderAlliance(main, app);
  else if (page === 'member') renderMember(main, app, arg);
  else renderChars(main, app);
}
window.addEventListener('hashchange', () => { if (app.code) route(); });

// Rafraîchit membres et équipes quand on revient sur l'onglet du navigateur
let lastSync = Date.now();
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !app.code || Date.now() - lastSync < 60000) return;
  if (document.querySelector('.modal-wrap')) return;
  lastSync = Date.now();
  try {
    const all = await api.getAll(app.code);
    app.members = all.members || []; app.teams = all.teams || [];
    route();
  } catch (e) { /* hors ligne : on garde l'état actuel */ }
});

function openCodes() {
  const m = openModal({
    title: esc(t('codes.title')), size: 'small',
    body: `<p class="muted small">${esc(t('codes.hint'))}</p>
      <label class="block">${esc(t('codes.alliance'))}<input class="input" name="alliance" type="text" autocomplete="off"></label>
      <label class="block">${esc(t('codes.admin'))}<input class="input" name="admin" type="text" autocomplete="off"></label>`,
    footer: `<button class="btn ghost" data-a="cancel">${esc(t('t.cancel'))}</button><button class="btn primary" data-a="ok">${esc(t('codes.save'))}</button>`,
  });
  $('[data-a="cancel"]', m.el).onclick = () => m.close();
  $('[data-a="ok"]', m.el).onclick = async () => {
    const a = $('[name=alliance]', m.el).value.trim();
    const ad = $('[name=admin]', m.el).value.trim();
    if (!a && !ad) { m.close(); return; }
    try {
      await api.changeCodes(app.code, a, ad);
      if (ad) { app.code = ad; if (stored()) store({ code: ad, role: 'admin' }); }
      toast(t('codes.done'));
      m.close();
    } catch (e) { app.fail(e); }
  };
}

// ---------- lancement ----------
(function init() {
  let s = stored();
  if (!s) { try { s = JSON.parse(sessionStorage.getItem('optc.session') || 'null'); } catch (e) { s = null; } }
  if (s && s.code) {
    // on revérifie le code (il a pu changer)
    api.login(s.code).then((role) => {
      if (role) { s.role = role; start(s); } else { store(null); showLogin(); }
    }).catch(() => start(s));
  } else showLogin();
})();
