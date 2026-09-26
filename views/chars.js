// Onglet Personnages + fiche détaillée d'un perso
import { t, fmtDate } from '../i18n.js';
import { CONFIG } from '../config.js';
import { DATA, loadDetails, getDetails, bigUrl } from '../data.js';
import { esc, $, UnitBrowser, openModal, thumb, typeBadges, richText } from '../ui.js';
import { lbLabel } from './box.js';

let browser = null;

export function renderChars(main, app) {
  if (!browser) {
    browser = new UnitBrowser({
      allowList: true,
      members: () => app.members,
      onPick: (u) => openUnit(u.id, app),
    });
  }
  main.innerHTML = `<section class="page">
    <p class="muted small source">${esc(t('data.count', { n: DATA.units.length.toLocaleString() }))} ·
      ${esc(t('data.updated', { id: DATA.maxId }))}</p>
    <div data-browser></div></section>`;
  browser.mount($('[data-browser]', main));
}
export function refreshChars() { if (browser && browser.root.isConnected) browser.refresh(); }

// ---------- fiche perso ----------
const DETAIL_ORDER = [
  'captain', 'special', 'superSpecialCriteria', 'superSpecial', 'swap', 'VSCondition', 'VSSpecial',
  'sailor', 'support', 'potential', 'superTandem', 'lastTap', 'rush', 'limit', 'lLimit',
];

export function openUnit(id, app) {
  const u = DATA.byId.get(Number(id));
  if (!u) return;
  const m = openModal({ title: `<span class="muted">#${u.id}</span> ${esc(u.name)}`, size: 'large' });
  const draw = () => {
    const d = getDetails(u.id);
    const owners = app.members.filter((mb) => mb.box && mb.box[u.id]);
    m.body.innerHTML = `
      <div class="unit-head">
        <div class="unit-art">
          ${thumb(u.id, 'big')}
          <img class="art" src="${bigUrl(u.id)}" alt="" onerror="this.remove()">
        </div>
        <div class="unit-info">
          <div class="badges">${typeBadges(u)} <span class="badge">${esc(u.stars)}★</span>
            <span class="badge ${u.global ? 'glo' : 'jap'}">${esc(u.global ? t('f.glo') : t('f.jap'))}</span></div>
          <p class="classes">${esc(u.classes.join(' · '))}</p>
          <dl class="kv">
            <div><dt>${esc(t('u.cost'))}</dt><dd>${u.cost ?? '—'}</dd></div>
            <div><dt>${esc(t('u.combo'))}</dt><dd>${u.combo ?? '—'}</dd></div>
            <div><dt>${esc(t('u.sockets'))}</dt><dd>${u.sockets}</dd></div>
            <div><dt>${esc(t('u.maxLevel'))}</dt><dd>${u.maxLevel ?? '—'}</dd></div>
            <div><dt>${esc(t('u.cd'))}</dt><dd>${u.cd ? `${u.cd[0]} → ${u.cd[1]}` : '—'}</dd></div>
            <div><dt>${esc(t('u.added'))}</dt><dd>${u.added ? esc(fmtDate(u.added)) : esc(t('u.new'))}</dd></div>
          </dl>
          <table class="stats"><thead><tr><th></th><th>HP</th><th>ATK</th><th>RCV</th></tr></thead><tbody>
            <tr><th>${esc(t('u.min'))}</th><td>${u.minHP ?? '—'}</td><td>${u.minATK ?? '—'}</td><td>${u.minRCV ?? '—'}</td></tr>
            <tr><th>${esc(t('u.max'))}</th><td>${u.hp}</td><td>${u.atk}</td><td>${u.rcv}</td></tr>
          </tbody></table>
          <a class="small" href="${CONFIG.optcDbUnitUrl}${u.id}" target="_blank" rel="noopener">${esc(t('u.openDb'))} ↗</a>
        </div>
      </div>
      <section class="owners">
        <h3>${esc(t('u.inAlliance'))} <span class="muted">(${owners.length})</span></h3>
        ${owners.length ? `<div class="owner-list">${owners.map((mb) => {
          const e = mb.box[u.id] || {};
          const bits = [e.lv ? `${t('u.level')} ${e.lv}` : '', e.lb && e.lb !== 'none' ? lbLabel(e.lb) : ''].filter(Boolean).join(' · ');
          return `<a class="owner" href="#/member/${esc(mb.id)}">${esc(mb.pseudo)}${bits ? ` <span class="muted">${esc(bits)}</span>` : ''}</a>`;
        }).join('')}</div>` : `<p class="muted">${esc(t('u.nobody'))}</p>`}
      </section>
      <section class="details">
        ${d ? renderDetails(d) : `<p class="muted">${esc(t('u.detailsLoading'))}</p>`}
      </section>`;
    m.body.querySelectorAll('a.owner').forEach((a) => a.addEventListener('click', () => m.close()));
  };
  draw();
  if (!DATA.details) loadDetails().then(() => { if (m.el.isConnected) draw(); }).catch(() => {});
}

function renderDetails(d) {
  const keys = [...DETAIL_ORDER.filter((k) => d[k] != null), ...Object.keys(d).filter((k) => !DETAIL_ORDER.includes(k) && !/notes$/i.test(k) && k !== 'specialName' && d[k] != null)];
  return keys.map((k) => {
    let title = t('u.' + k);
    if (title === 'u.' + k) title = k;
    if (k === 'special' && d.specialName) title += ` — <span class="muted">${esc(d.specialName)}</span>`;
    else title = esc(title);
    const notes = d[k + 'Notes'];
    const open = ['captain', 'special', 'superSpecial', 'superSpecialCriteria', 'sailor', 'support', 'potential', 'swap', 'VSCondition', 'VSSpecial'].includes(k);
    return `<details class="ability" ${open ? 'open' : ''}><summary>${title}</summary>
      <div class="ability-body">${renderValue(d[k], k)}${notes ? `<p class="notes">${richText(typeof notes === 'string' ? notes : JSON.stringify(notes))}</p>` : ''}</div>
    </details>`;
  }).join('');
}

const KEY_LABELS = {
  base: 'Base', combined: 'Combined', character1: 'Character 1', character2: 'Character 2',
  llbbase: 'LLB', description: '', Characters: 'Characters',
};
function keyLabel(k) {
  if (k in KEY_LABELS) return KEY_LABELS[k];
  const m = /^level(\d+)$/.exec(k);
  if (m) return `Level ${m[1]}`;
  const l = /^llblevel(\d+)$/.exec(k);
  if (l) return `LLB level ${l[1]}`;
  return k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

// Affichage générique : texte, listes par niveau, objets imbriqués
function renderValue(v, key, depth = 0) {
  if (v == null || v === '') return '';
  if (typeof v === 'string' || typeof v === 'number') return `<p>${richText(String(v))}</p>`;
  if (typeof v === 'boolean') return v ? '<p>✓</p>' : '';
  if (Array.isArray(v)) {
    if (!v.length) return '';
    if (key === 'potential') {
      return v.map((p) => `<div class="pot"><strong>${esc(p.Name || '')}</strong>${renderLevels(p.description)}</div>`).join('');
    }
    if (key === 'support') {
      return v.map((s) => `<div class="pot"><p class="muted">${richText(s.Characters || '')}</p>${renderLevels(s.description)}</div>`).join('');
    }
    if (key === 'limit' || key === 'lLimit') {
      const items = v.map((x, i) => x == null ? '' : `<li><span class="muted">${i + 1}.</span> ${typeof x === 'string' ? richText(x) : renderValue(x, '', depth + 1)}</li>`).filter(Boolean);
      return items.length ? `<ol class="limit">${items.join('')}</ol>` : '';
    }
    if (v.every((x) => typeof x === 'string')) return renderLevels(v);
    return v.map((x, i) => {
      if (x && typeof x === 'object' && 'description' in x) {
        const cd = x.cooldown ? ` <span class="muted">(CD ${esc(x.cooldown.join ? x.cooldown.join(' → ') : x.cooldown)})</span>` : '';
        return `<div class="stage"><span class="muted">Stage ${i + 1}${cd}</span>${renderValue(x.description, '', depth + 1)}</div>`;
      }
      return renderValue(x, '', depth + 1);
    }).join('');
  }
  if (typeof v === 'object') {
    return `<dl class="subkv">${Object.entries(v).filter(([, x]) => x != null && x !== '').map(([k, x]) => {
      const label = keyLabel(k);
      return `<div>${label ? `<dt>${esc(label)}</dt>` : ''}<dd>${renderValue(x, k, depth + 1)}</dd></div>`;
    }).join('')}</dl>`;
  }
  return '';
}
function renderLevels(arr) {
  if (!Array.isArray(arr)) return renderValue(arr);
  if (arr.length === 1) return `<p>${richText(arr[0])}</p>`;
  return `<ol class="levels">${arr.map((x) => `<li>${richText(x)}</li>`).join('')}</ol>`;
}
