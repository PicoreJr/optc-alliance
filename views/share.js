// Partage d'une équipe : lien direct (#/team/<id>) et image à envoyer sur Discord.
// L'image est dessinée dans un <canvas> aux couleurs du thème « encre ».
import { t, fmtDate } from '../i18n.js';
import { CONFIG } from '../config.js';
import { DATA, THUMB_STAGES, SHIP_STAGES, thumbUrl, shipOf } from '../data.js';
import { esc, $, openModal, toast } from '../ui.js';

export const teamLink = (tm) => `${location.origin}${location.pathname}#/team/${encodeURIComponent(tm.id)}`;

/**
 * info = { tm, lu, fmt, ev, order: { main, sub }, supports, groupTitles }
 * (préparé par views/teams.js : composition normalisée, ordre des emplacements comme sur le site)
 */
export function openShare(info) {
  const { tm } = info;
  const link = teamLink(tm);
  const canFiles = typeof navigator.canShare === 'function';
  const m = openModal({
    title: esc(t('share.title')),
    body: `<div class="share-preview"><div class="spinner"></div><p class="muted small">${esc(t('share.making'))}</p></div>
      <div class="share-actions">
        <button class="btn primary" data-copy-img disabled>${esc(t('share.copyImg'))}</button>
        <button class="btn" data-dl disabled>${esc(t('share.download'))}</button>
        ${canFiles ? `<button class="btn" data-native disabled hidden>${esc(t('share.native'))}</button>` : ''}
      </div>
      <label class="block">${esc(t('share.link'))}
        <span class="row"><input class="input grow" readonly value="${esc(link)}" data-link>
        <button class="btn" data-copy-link>${esc(t('share.copyLink'))}</button></span></label>
      <p class="muted small">${esc(t('share.hint'))}</p>`,
  });
  const linkInput = $('[data-link]', m.el);
  linkInput.onfocus = () => linkInput.select();
  $('[data-copy-link]', m.el).onclick = () => {
    const done = () => toast(t('share.linkCopied'));
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, () => { linkInput.select(); document.execCommand('copy'); done(); });
    else { linkInput.select(); document.execCommand('copy'); done(); }
  };

  let url = null;
  // nom de fichier sans accents ni symboles (sinon certains navigateurs l'ignorent)
  const name = `${(tm.title || tm.boss || t('ev.' + tm.event_type)).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'equipe'}.png`;
  teamImage(info).then((blob) => {
    if (!m.el.isConnected) return;
    url = URL.createObjectURL(blob);
    const file = new File([blob], name, { type: 'image/png' });
    $('.share-preview', m.el).innerHTML = `<img src="${url}" alt="${esc(tm.title || '')}">`;
    const copy = $('[data-copy-img]', m.el);
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      copy.disabled = false;
      copy.onclick = () => navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        .then(() => toast(t('share.imgCopied')), () => toast(t('share.copyFail'), 'err'));
    } else copy.remove();
    const dl = $('[data-dl]', m.el);
    dl.disabled = false;
    dl.onclick = () => {
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.append(a); a.click(); a.remove();
    };
    const nat = $('[data-native]', m.el);
    if (nat && navigator.canShare({ files: [file] })) {
      nat.hidden = false; nat.disabled = false;
      nat.onclick = () => navigator.share({ files: [file], title: tm.title || t('share.title') }).catch(() => {});
    }
  }).catch((e) => {
    console.error(e);
    if (m.el.isConnected) $('.share-preview', m.el).innerHTML = `<p class="error">${esc(t('share.imgError'))}</p>`;
  });
  // libère l'image quand la fenêtre se ferme
  const obs = new MutationObserver(() => { if (!m.el.isConnected) { if (url) URL.revokeObjectURL(url); obs.disconnect(); } });
  obs.observe(document.body, { childList: true });
}

// ---------- image ----------
const W = 760;          // largeur (px CSS), dessinée en ×2 pour être nette
const P = 28;           // marge
const SCALE = 2;
const C = {
  paper: '#f2efe8', surface: '#fbfaf6', surface2: '#e9e5dc', border: '#c9c3b6',
  ink: '#121212', muted: '#5d5850', gold: '#e0a100',
};
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const BRUSH = '"Yuji Syuku", "Shippori Mincho B1", Georgia, serif';

// Charge une image en essayant chaque adresse (sans « salir » le canvas : CORS anonyme)
function loadImg(urls) {
  return new Promise((resolve) => {
    let i = 0;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), 10000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => {
      if (++i < urls.length) img.src = urls[i];
      else { clearTimeout(timer); resolve(null); }
    };
    img.src = urls[0];
  });
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Découpe un texte en lignes qui tiennent dans maxW (retours à la ligne gardés)
function wrap(ctx, text, maxW) {
  const lines = [];
  for (const para of String(text || '').split(/\r?\n/)) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxW) { line = test; continue; }
      if (line) lines.push(line);
      // mot trop long : on le coupe
      let w = word;
      while (ctx.measureText(w).width > maxW && w.length > 1) {
        let n = w.length - 1;
        while (n > 1 && ctx.measureText(w.slice(0, n)).width > maxW) n--;
        lines.push(w.slice(0, n));
        w = w.slice(n);
      }
      line = w;
    }
    lines.push(line);
  }
  return lines;
}

export async function teamImage({ tm, lu, fmt, ev, order, supports, groupTitles }) {
  if (document.fonts && document.fonts.load) await document.fonts.load(`30px ${BRUSH}`).catch(() => {});
  // images des persos et du bateau
  const ids = new Set();
  lu.groups.forEach((g) => g.slots.forEach((sl) => { if (sl.u) ids.add(sl.u); if (sl.s) ids.add(sl.s); }));
  const pics = new Map(await Promise.all([...ids].map(async (id) =>
    [id, await loadImg(THUMB_STAGES.map((_, s) => thumbUrl(id, s)))])));
  const ship = fmt.ship && (lu.ship || lu.shipId) ? shipOf(lu.shipId, lu.ship) : null;
  const shipId = ship ? ship.id : lu.shipId;
  const shipPic = shipId ? await loadImg(SHIP_STAGES.map((f) => f(shipId))) : null;
  const shipName = ship ? ship.name : lu.ship;

  const measure = document.createElement('canvas').getContext('2d');
  const H = draw(measure, true);
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  draw(ctx, false);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png'));

  // Dessine tout (ou mesure seulement si dry) et renvoie la hauteur totale
  function draw(ctx, dry) {
    const D = (fn) => { if (!dry) fn(); };
    const text = (s, x, y, font, color, align = 'left') => D(() => {
      ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
      ctx.fillText(s, x, y);
    });
    const fit = (s, font, maxW) => {
      ctx.font = font;
      if (ctx.measureText(s).width <= maxW) return s;
      let n = s.length;
      while (n > 1 && ctx.measureText(s.slice(0, n) + '…').width > maxW) n--;
      return s.slice(0, n) + '…';
    };
    const thumb = (id, x, y, size) => D(() => {
      if (!id) {
        ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = C.border; ctx.lineWidth = 2;
        rrect(ctx, x + 1, y + 1, size - 2, size - 2, 6); ctx.stroke(); ctx.restore();
        return;
      }
      const img = pics.get(id);
      ctx.save();
      rrect(ctx, x, y, size, size, 7); ctx.clip();
      if (img) ctx.drawImage(img, x, y, size, size);
      else {
        ctx.fillStyle = C.surface2; ctx.fillRect(x, y, size, size);
        ctx.font = `600 ${Math.round(size / 5)}px ${SANS}`; ctx.fillStyle = C.muted; ctx.textAlign = 'center';
        ctx.fillText(`#${id}`, x + size / 2, y + size / 2 + size / 14);
      }
      ctx.restore();
    });
    const label = (s, cx, y, maxW) => text(fit(s, `11px ${SANS}`, maxW), cx, y, `11px ${SANS}`, C.muted, 'center');

    // fond + cadre d'encre
    D(() => {
      ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, 10000);
    });
    // bandeau : nom de l'alliance + mode
    D(() => { ctx.fillStyle = C.ink; ctx.fillRect(0, 0, W, 60); ctx.fillStyle = ev.color; ctx.fillRect(0, 60, W, 5); });
    text(CONFIG.allianceName, P, 40, `26px ${BRUSH}`, C.paper);
    const evName = t('ev.' + ev.id).toUpperCase();
    ctx.font = `700 13px ${SANS}`;
    const evW = ctx.measureText(evName).width + 24;
    D(() => { ctx.fillStyle = ev.color; rrect(ctx, W - P - evW, 18, evW, 26, 4); ctx.fill(); });
    text(evName, W - P - evW / 2, 36, `700 13px ${SANS}`, '#fff', 'center');
    let y = 65 + 44;

    // titre + boss
    const title = tm.title || tm.boss || t('ev.' + ev.id);
    ctx.font = `30px ${BRUSH}`;
    const tl = wrap(ctx, title, W - 2 * P).slice(0, 2);
    tl.forEach((l, i) => text(l, P, y + i * 38, `30px ${BRUSH}`, C.ink));
    y += (tl.length - 1) * 38;
    if (tm.title && tm.boss) { y += 26; text(fit(tm.boss, `16px ${SANS}`, W - 2 * P), P, y, `16px ${SANS}`, C.muted); }
    y += 26;

    // composition
    lu.groups.forEach((g, gi) => {
      if (groupTitles[gi]) {
        y += 8;
        text(groupTitles[gi].toUpperCase(), P, y + 12, `700 12px ${SANS}`, C.muted);
        y += 22;
      }
      if (!order.sub.length && order.main.length === 6) {
        // 2 colonnes de 3 (ami capitaine en haut à gauche), support à droite de chaque perso
        const T = 116, S = 74, cellW = T + 10 + S, gap = 48;
        const x0 = (W - (2 * cellW + gap)) / 2;
        order.main.forEach((i, k) => {
          const x = x0 + (k % 2) * (cellW + gap);
          const yy = y + Math.floor(k / 2) * (T + 34);
          const sl = g.slots[i];
          thumb(sl.u, x, yy, T);
          label(t('slot.' + fmt.slots[i]), x + T / 2, yy + T + 15, T + 6);
          if (supports[i]) {
            thumb(sl.s, x + T + 10, yy + 12, S);
            label(t('slot.support'), x + T + 10 + S / 2, yy + 12 + S + 15, S + 6);
          }
        });
        y += 3 * (T + 34);
      } else {
        // PvP / Grand Party : principaux puis secondaires
        const T = lu.groups.length > 1 ? 92 : 108, gap = 12;
        const row = (list, name) => {
          if (!list.length) return;
          text(name.toUpperCase(), P, y + 12, `700 11px ${SANS}`, C.muted);
          y += 20;
          const x0 = (W - (list.length * T + (list.length - 1) * gap)) / 2;
          list.forEach((i, k) => {
            const x = x0 + k * (T + gap);
            thumb(g.slots[i].u, x, y, T);
            if (lu.leader === `${gi}.${i}` && g.slots[i].u) {
              text('♛', x + T / 2, y + 4, `22px ${SANS}`, C.gold, 'center');
            }
          });
          y += T + 14;
        };
        row(order.main, order.sub.length ? t('slot.mains') : '');
        row(order.sub, t('slot.subs'));
      }
    });

    // bateau
    if (shipName) {
      y += 6;
      D(() => { ctx.fillStyle = C.surface; rrect(ctx, P, y, W - 2 * P, 60, 4); ctx.fill(); ctx.strokeStyle = C.border; ctx.lineWidth = 1; ctx.stroke(); });
      const pic = shipPic;
      D(() => {
        if (pic) { ctx.save(); rrect(ctx, P + 8, y + 8, 44, 44, 6); ctx.clip(); ctx.drawImage(pic, P + 8, y + 8, 44, 44); ctx.restore(); }
      });
      const lx = P + (pic ? 64 : 14);
      text(t('t.ship').toUpperCase(), lx, y + 24, `700 11px ${SANS}`, C.muted);
      text(fit(shipName, `600 16px ${SANS}`, W - 2 * P - (lx - P) - 12), lx, y + 45, `600 16px ${SANS}`, C.ink);
      y += 60 + 6;
    }

    // leader Grand Party
    if (lu.leader) {
      const [gi, i] = lu.leader.split('.');
      const id = lu.groups[gi]?.slots[i]?.u;
      if (id) {
        y += 22;
        text(fit(`♛ ${t('slot.gpLeader')} : ${DATA.byId.get(id)?.name || '#' + id}`, `600 14px ${SANS}`, W - 2 * P), P, y, `600 14px ${SANS}`, C.ink);
        y += 6;
      }
    }

    // notes
    if (tm.notes) {
      y += 12;
      ctx.font = `15px ${SANS}`;
      let lines = wrap(ctx, tm.notes, W - 2 * P - 28);
      if (lines.length > 18) lines = [...lines.slice(0, 17), '…'];
      const h = 16 + lines.length * 22 + 8;
      D(() => { ctx.fillStyle = C.surface2; rrect(ctx, P, y, W - 2 * P, h, 4); ctx.fill(); });
      lines.forEach((l, i) => text(l, P + 14, y + 30 + i * 22, `15px ${SANS}`, C.ink));
      y += h;
    }

    // pied : auteur + date
    y += 22;
    D(() => { ctx.fillStyle = C.border; ctx.fillRect(P, y, W - 2 * P, 1); });
    y += 24;
    const by = [tm.author ? t('t.by', { name: tm.author }) : '', fmtDate(tm.updated_at || tm.created_at)].filter(Boolean).join(' · ');
    text(by, P, y, `13px ${SANS}`, C.muted);
    y += 20;

    // cadre d'encre autour de l'image
    D(() => { ctx.strokeStyle = C.ink; ctx.lineWidth = 4; ctx.strokeRect(2, 2, W - 4, y - 4); });
    return y;
  }
}
