// Appels à Supabase : toutes les opérations passent par des fonctions
// protégées par le code (aucun accès direct aux tables).
import { CONFIG } from './config.js';

export class ApiError extends Error {
  constructor(message, kind) { super(message); this.kind = kind; }
}

async function rpc(fn, args) {
  let res;
  try {
    res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: CONFIG.supabaseKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
  } catch (e) {
    throw new ApiError(e.message, 'network');
  }
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (e) { body = text; }
  if (!res.ok) {
    const code = body && body.code;
    const msg = (body && body.message) || res.statusText;
    if (code === '28000') throw new ApiError(msg, 'code');
    if (code === '42501') throw new ApiError(msg, 'admin');
    throw new ApiError(msg, 'generic');
  }
  return body;
}

export const api = {
  login: (code) => rpc('login', { p_code: code }),
  getAll: (code) => rpc('get_all', { p_code: code }),
  saveMember: (code, member) => rpc('save_member', { p_code: code, p_member: member }),
  deleteMember: (code, id) => rpc('delete_member', { p_code: code, p_id: id }),
  saveTeam: (code, team) => rpc('save_team', { p_code: code, p_team: team }),
  deleteTeam: (code, id) => rpc('delete_team', { p_code: code, p_id: id }),
  changeCodes: (code, alliance, admin) =>
    rpc('change_codes', { p_code: code, p_new_alliance: alliance, p_new_admin: admin }),
};
