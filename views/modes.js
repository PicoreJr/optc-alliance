// Onglets simples : Treasure Map, PKA, Coop, Blitz — une liste d'équipes par mode.
import { t } from '../i18n.js';
import { esc, $ } from '../ui.js';
import { renderTeamList } from './teams.js';

const EXTRA = { blitz: ['blitz', 'other'] };

export function renderMode(main, app, id) {
  main.innerHTML = `<section class="page">
    <div class="page-head"><div><h1>${esc(t('tab.' + id))}</h1><p class="muted small">${esc(t('mode.hint.' + id))}</p></div></div>
    <div data-teams></div>
  </section>`;
  renderTeamList($('[data-teams]', main), app, { key: 'mode-' + id, events: EXTRA[id] || [id] });
}
