// Onglet Alliance : liste des membres et fiche d'un membre (profil + box)
import { t, fmtNumber, fmtDate } from '../i18n.js';
import { DATA } from '../data.js';
import { esc, $, $$, UnitBrowser, openModal, confirmBox, toast, debounce, cardArt } from '../ui.js';
import { openBoxEntry, lbShort } from './box.js';

let listSort = 'pseudo';

export function renderAlliance(main, app) {
  const members = [...app.members].sort(sorter(listSort));
  main.innerHTML = `<section class="page">
    <div class="page-head">
      <h1>${esc(t('tab.alliance'))} <span class="muted">(${members.length})</span></h1>
      <div class="row wrap">
        <select class="input" data-sort aria-label="${esc(t('m.sortBy'))}">
          ${[['pseudo', t('m.pseudo')], ['level', t('m.level')], ['bounty', t('m.bounty')], ['box', t('m.box')]]
            .map(([v, l]) => `<option value="${v}" ${listSort === v ? 'selected' : ''}>${esc(t('m.sortBy'))} : ${esc(l)}</option>`).join('')}
        </select>
        ${app.isAdmin ? `<button class="btn primary" data-add>${esc(t('m.add'))}</button>` : ''}
      </div>
    </div>
    ${members.length ? `<div class="member-grid">${members.map((m) => memberCard(m)).join('')}</div>`
      : `<p class="empty">${esc(app.isAdmin ? t('m.noneAdmin') : t('m.none'))}</p>`}
  </section>`;
  $('[data-sort]', main).onchange = (e) => { listSort = e.target.value; renderAlliance(main, app); };
  const add = $('[data-add]', main);
  if (add) add.onclick = () => openNewMember(app);
}

function sorter(k) {
  return {
    pseudo: (a, b) => a.pseudo.localeCompare(b.pseudo),
    level: (a, b) => (b.level || 0) - (a.level || 0),
    bounty: (a, b) => (b.bounty || 0) - (a.bounty || 0),
    box: (a, b) => boxCount(b) - boxCount(a),
  }[k];
}
// Seules les clés numériques de la box sont des persos (voir CARD_KEY)
function boxCount(m) { return m.box ? Object.keys(m.box).filter((k) => /^\d+$/.test(k)).length : 0; }

// Thème de la carte de membre : l'illustration d'un perso du Super Sugo-Fest.
// Rangé dans la box sous la clé « _card » ({ u: id }) pour ne rien changer côté base.
const CARD_KEY = '_card';
function cardTheme(m) {
  const c = m.box && m.box[CARD_KEY];
  const id = c && Number(c.u);
  return id && DATA.byId.has(id) ? id : null;
}
function totalLegends() { return DATA.units.filter((u) => u.legend).length; }
function legendCount(m) {
  if (!m.box) return 0;
  let n = 0;
  for (const id in m.box) { const u = DATA.byId.get(Number(id)); if (u && u.legend) n++; }
  return n;
}

// preview : la même carte, non cliquable (aperçu sur la fiche du membre)
function memberCard(m, preview = false) {
  const art = cardTheme(m);
  const tag = preview ? 'div' : 'a';
  return `<${tag} class="member-card ${art ? 'themed' : ''} ${preview ? 'preview' : ''}" ${preview ? '' : `href="#/member/${esc(m.id)}"`}>
    ${art ? cardArt(art) : ''}
    <div class="mc-body">
      <div class="mc-top"><strong>${esc(m.pseudo)}</strong>${m.level ? `<span class="badge">${esc(t('m.level'))} ${fmtNumber(m.level)}</span>` : ''}</div>
      <dl class="kv small">
        <div><dt>${esc(t('m.gameId'))}</dt><dd>${esc(m.game_id || '—')}</dd></div>
        <div><dt>${esc(t('m.bounty'))}</dt><dd>${m.bounty ? fmtNumber(m.bounty) : '—'}</dd></div>
        <div><dt>${esc(t('m.box'))}</dt><dd>${esc(t('m.units', { n: boxCount(m) }))} · ${esc(t('m.legends', { n: legendCount(m) }))}</dd></div>
      </dl>
      <span class="muted small">${esc(t('m.updated', { date: fmtDate(m.updated_at) }))}</span>
    </div>
  </${tag}>`;
}

// Choix du thème parmi les persos du Super Sugo-Fest (liste à jour avec OPTC-DB)
function pickTheme(mb) {
  return new Promise((resolve) => {
    let picked = null;
    const m = openModal({ title: esc(t('m.themeTitle', { name: mb.pseudo })), size: 'large', onClose: () => resolve(picked) });
    new UnitBrowser({
      baseFilter: (u) => !!u.flags.superlrr,
      isSelected: (u) => u.id === cardTheme(mb),
      defaults: { sort: 'idDesc' },
      onPick: (u) => { picked = u; m.close(); },
    }).mount(m.body);
  });
}

function openNewMember(app) {
  const m = openModal({
    title: esc(t('m.newMember')), size: 'small',
    body: profileFields({}),
    footer: `<button class="btn ghost" data-a="cancel">${esc(t('t.cancel'))}</button>
             <button class="btn primary" data-a="ok">${esc(t('m.create'))}</button>`,
  });
  $('[data-a="cancel"]', m.el).onclick = () => m.close();
  $('[name="pseudo"]', m.el).focus();
  $('[data-a="ok"]', m.el).onclick = async () => {
    const data = readProfile(m.el);
    if (!data.pseudo) { toast(t('m.needPseudo'), 'err'); return; }
    try {
      const saved = await app.api('saveMember', { ...data, box: {} });
      app.members.push(saved);
      m.close();
      location.hash = `#/member/${saved.id}`;
    } catch (e) { app.fail(e); }
  };
}

function profileFields(mb) {
  return `<div class="form-grid">
    <label>${esc(t('m.pseudo'))}<input class="input" name="pseudo" maxlength="40" value="${esc(mb.pseudo || '')}" required></label>
    <label>${esc(t('m.gameId'))}<input class="input" name="game_id" maxlength="30" value="${esc(mb.game_id || '')}" inputmode="numeric"></label>
    <label>${esc(t('m.level'))}<input class="input" name="level" type="number" min="1" max="9999" value="${mb.level ?? ''}" inputmode="numeric"></label>
    <label>${esc(t('m.bounty'))}<input class="input" name="bounty" type="number" min="0" value="${mb.bounty ?? ''}" inputmode="numeric"></label>
  </div>`;
}
function readProfile(root) {
  const v = (n) => $(`[name="${n}"]`, root).value.trim();
  return { pseudo: v('pseudo'), game_id: v('game_id'), level: v('level'), bounty: v('bounty') };
}

// ---------- fiche membre ----------
let boxBrowser = null;
let saveTimer = null;
let savePending = null;

window.addEventListener('beforeunload', (e) => {
  if (savePending) { e.preventDefault(); e.returnValue = ''; }
});

export function renderMember(main, app, id) {
  const mb = app.members.find((m) => m.id === id);
  if (!mb) { main.innerHTML = `<section class="page"><a href="#/alliance">${esc(t('m.back'))}</a><p class="empty">${esc(t('m.notFound'))}</p></section>`; return; }
  mb.box = mb.box && typeof mb.box === 'object' && !Array.isArray(mb.box) ? mb.box : {};

  main.innerHTML = `<section class="page">
    <a class="back" href="#/alliance">${esc(t('m.back'))}</a>
    <div class="page-head">
      <h1>${esc(mb.pseudo)}</h1>
      <span class="save-status muted small" data-status></span>
    </div>
    <div class="card">
      <h2>${esc(t('m.profile'))}</h2>
      <div data-profile>${profileFields(mb)}</div>
      ${mb.game_id ? `<button class="btn ghost small" data-copy>${esc(t('m.copy'))} ID</button>` : ''}
      ${app.isAdmin ? `<button class="btn danger ghost small" data-del>${esc(t('m.delete'))}</button>` : ''}
      <div class="theme-row" data-theme></div>
    </div>
    <div class="card">
      <div class="page-head"><h2>${esc(t('m.box'))} <span class="muted" data-boxcount></span></h2></div>
      <p class="muted small">${esc(t('m.boxHint'))}</p>
      <div data-box></div>
    </div>
  </section>`;

  const status = $('[data-status]', main);
  const setStatus = (s) => { if (status.isConnected) { status.textContent = s ? t('m.' + s) : ''; status.dataset.s = s || ''; } };
  const save = () => {
    savePending = mb;
    setStatus('unsaved');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      setStatus('saving');
      try {
        const saved = await app.api('saveMember', mb);
        mb.updated_at = saved.updated_at;
        if (savePending === mb) savePending = null;
        setStatus('saved');
      } catch (e) { setStatus('unsaved'); app.fail(e); }
    }, 800);
  };
  const updateCount = () => {
    const c = $('[data-boxcount]', main);
    if (c) c.textContent = `(${t('m.legendsOf', { n: legendCount(mb), total: totalLegends() })} · ${t('m.units', { n: boxCount(mb) })})`;
    // l'aperçu de la carte affiche aussi le nombre de persos
    const pv = $('[data-theme] .theme-preview', main);
    if (pv) pv.innerHTML = memberCard(mb, true);
  };
  updateCount();

  // thème de la carte : aperçu + choix
  const drawTheme = () => {
    const box = $('[data-theme]', main);
    if (!box) return;
    const art = cardTheme(mb);
    box.innerHTML = `<div class="theme-preview">${memberCard(mb, true)}</div>
      <div class="theme-info">
        <p class="field-label">${esc(t('m.cardTheme'))}</p>
        <p class="muted small">${esc(art ? DATA.byId.get(art).name : t('m.cardThemeHint'))}</p>
        <div class="row wrap">
          <button class="btn small" data-pick-theme>${esc(t(art ? 'm.changeTheme' : 'm.pickTheme'))}</button>
          ${art ? `<button class="btn ghost small" data-no-theme>${esc(t('m.noTheme'))}</button>` : ''}
        </div>
      </div>`;
    $('[data-pick-theme]', box).onclick = async () => {
      const u = await pickTheme(mb);
      if (!u) return;
      mb.box[CARD_KEY] = { u: u.id };
      drawTheme(); save();
    };
    const none = $('[data-no-theme]', box);
    if (none) none.onclick = () => { delete mb.box[CARD_KEY]; drawTheme(); save(); };
  };
  drawTheme();

  // profil
  $$('[data-profile] input', main).forEach((inp) => inp.addEventListener('input', debounce(() => {
    const data = readProfile(main);
    if (!data.pseudo) return;
    Object.assign(mb, {
      pseudo: data.pseudo, game_id: data.game_id || null,
      level: data.level ? Number(data.level) : null, bounty: data.bounty ? Number(data.bounty) : null,
    });
    $('h1', main).textContent = mb.pseudo;
    drawTheme();
    save();
  }, 400)));
  const copy = $('[data-copy]', main);
  if (copy) copy.onclick = () => navigator.clipboard.writeText(mb.game_id).then(() => toast(t('m.copied')));
  const del = $('[data-del]', main);
  if (del) del.onclick = async () => {
    if (!await confirmBox(t('m.confirmDelete', { name: mb.pseudo }), { danger: true })) return;
    try {
      await app.api('deleteMember', mb.id);
      app.members = app.members.filter((m) => m !== mb);
      if (savePending === mb) { savePending = null; clearTimeout(saveTimer); }
      toast(t('m.deleted'));
      location.hash = '#/alliance';
    } catch (e) { app.fail(e); }
  };

  // box
  function afterBoxChange() {
    boxBrowser.refresh();
    updateCount();
    const empty = $('[data-emptybox]', main);
    if (empty && boxCount(mb)) empty.remove();
    save();
  }
  if (boxBrowser) boxBrowser.destroy();
  // Toutes les légendes sont affichées : grisées = pas encore dans la box.
  // 1er clic = sélectionner, clic suivant = détails (LB/LLB, potentiels…)
  boxBrowser = new UnitBrowser({
    hideOwner: true,
    // rangée comme la Collection du jeu (Super Sugo-Fest, Anniversaire, Kizuna…)
    collection: true,
    defaults: { sort: 'collection' },
    baseFilter: (u) => u.legend || !!mb.box[u.id],
    ownBox: () => mb.box,
    isSelected: (u) => !!mb.box[u.id],
    dimUnselected: true,
    badge: (u) => lbShort(mb.box[u.id]),
    actions: `<button class="btn ghost small" data-addunits>${esc(t('m.otherUnits'))}</button>`,
    onPick: (u) => {
      if (!mb.box[u.id]) {
        mb.box[u.id] = {};
        boxBrowser.updateItem(u.id);
        updateCount();
        save();
        return;
      }
      openBoxEntry(mb, u.id, {
        onChange: () => { boxBrowser.updateItem(u.id); save(); },
        onRemove: afterBoxChange,
      });
    },
    onToolbar: (root) => { $('[data-addunits]', root).onclick = () => openPicker(mb, app, afterBoxChange); },
  });
  boxBrowser.mount($('[data-box]', main));
}

// Ajout rapide de persos à la box
function openPicker(mb, app, onDone) {
  let changed = false;
  const m = openModal({
    title: esc(t('m.boxPicker', { name: mb.pseudo })), size: 'large',
    footer: `<span class="muted small grow">${esc(t('m.pickerHint'))}</span><button class="btn primary" data-a="done">${esc(t('m.done'))}</button>`,
    onClose: () => { if (changed) onDone(); },
  });
  $('[data-a="done"]', m.el).onclick = () => m.close();
  const br = new UnitBrowser({
    members: () => app.members,
    hideOwner: true,
    isSelected: (u) => !!mb.box[u.id],
    actions: `<button class="btn ghost small" data-all></button>`,
    onPick: async (u) => {
      if (mb.box[u.id]) {
        if (Object.keys(mb.box[u.id]).length && !await confirmBox(t('b.confirmRemove'), { danger: true })) return;
        delete mb.box[u.id];
      } else {
        mb.box[u.id] = {};
      }
      br.updateItem(u.id);
      if (br.afterRefresh) br.afterRefresh();
      onDone();
    },
    onToolbar: (root) => {
      const btn = $('[data-all]', root);
      const label = () => { btn.textContent = t('m.selectVisible', { n: br.results.filter((u) => !mb.box[u.id]).length }); };
      br.afterRefresh = label;
      btn.onclick = async () => {
        const toAdd = br.results.filter((u) => !mb.box[u.id]);
        if (!toAdd.length) return;
        if (!await confirmBox(t('m.confirmSelectVisible', { n: toAdd.length }))) return;
        toAdd.forEach((u) => { mb.box[u.id] = {}; });
        changed = true;
        br.refresh();
      };
    },
  });
  const origRefresh = br.refresh.bind(br);
  br.refresh = () => { origRefresh(); if (br.afterRefresh) br.afterRefresh(); };
  br.mount(m.body);
}
