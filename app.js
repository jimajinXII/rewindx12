/* Rewind – suivi culturel personnel (V1)
   Données stockées uniquement sur l'appareil (IndexedDB). Aucune donnée n'est envoyée ailleurs,
   sauf les recherches de titres vers TMDB, AniList, Open Library, RAWG et TheSportsDB. */
'use strict';

const APP_VERSION = '1.0.0';
const DAY = 86400000;

/* =========================================================
   1. Constantes
   ========================================================= */
const TYPES = {
  film: { label: 'Film', plural: 'Films' },
  serie: { label: 'Série', plural: 'Séries' },
  anime: { label: 'Anime', plural: 'Anime' },
  doc: { label: 'Docu', plural: 'Documentaires' },
  livre: { label: 'Livre', plural: 'Livres' },
  bd: { label: 'BD', plural: 'BD' },
  manga: { label: 'Manga', plural: 'Manga' },
  jeu: { label: 'Jeu', plural: 'Jeux vidéo' },
  catch: { label: 'Catch', plural: 'Catch' }
};
const ADD_TYPES = ['film', 'serie', 'anime', 'doc', 'livre', 'bd', 'manga', 'jeu', 'sport', 'catch'];
const XP = { ep: { serie: 10, anime: 8, doc: 10, catch: 10 }, film: 30, tome: 15, jeu: 100, match: 25, matchResume: 5,
  catchHebdo: 10, catchPPV: 25, catchShow: 20, catchResume: 5, bonusSaison: 50, bonusSerie: 150, bonusSaga: 150, bonusSagaLivre: 300,
  goal: 100, livreFin: 25 };
const RUNTIME = { serie: 42, anime: 24, doc: 50, catch: 120, film: 110 };
const TEAMS = {
  sixers: { key: 'sixers', name: 'Philadelphia 76ers', short: 'Sixers', abbr: 'PHI', id: '134863', sport: 'nba', league: 'NBA', total: 82, c1: '#1D5FBF', c2: '#E8475F' },
  milan: { key: 'milan', name: 'AC Milan', short: 'Milan', abbr: 'MIL', id: '133667', sport: 'foot', league: 'Serie A', total: 38, c1: '#B3122A', c2: '#151515' }
};
const DEFAULT_FEDS = [{ name: 'AEW', kind: 'major' }, { name: 'WWE', kind: 'major' }, { name: 'Stardom', kind: 'major' }, { name: 'APC', kind: 'inde' }, { name: 'KHAO', kind: 'inde' }];
const CKINDS = { hebdo: 'Hebdo', ppv: 'PPV', show: 'Show' };
const CK_RT = { hebdo: 120, ppv: 240, show: 180 };
const ckXp = (kind) => kind === 'ppv' ? XP.catchPPV : kind === 'show' ? XP.catchShow : XP.catchHebdo;
const fedKind = (name) => { const f = (state.feds || []).find((x) => x.name.toLowerCase() === String(name).toLowerCase()); return f ? f.kind : 'inde'; };
const MODES = { direct: 'Direct', differe: 'Différé', resume: 'Résumé' };
const GOAL_LABELS = { films: 'Films', tomes: 'Tomes et livres', episodes: 'Épisodes', matchs: 'Matchs' };
const IMG = { poster: 'https://image.tmdb.org/t/p/w342', backdrop: 'https://image.tmdb.org/t/p/w780', still: 'https://image.tmdb.org/t/p/w300' };
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/* =========================================================
   2. Utilitaires
   ========================================================= */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const now = () => Date.now();
const pad2 = (n) => String(n).padStart(2, '0');
const monthKey = (ts) => { const d = new Date(ts); return d.getFullYear() + '-' + pad2(d.getMonth() + 1); };
const monthLabel = (mk) => { const [y, m] = mk.split('-'); const s = MONTHS[+m - 1]; return s[0].toUpperCase() + s.slice(1) + ' ' + y; };
const fmtDay = (ts) => new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const fmtDate = (ts) => new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtMatch = (ts) => { const d = new Date(ts); return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
const plural = (n, s, p) => n + ' ' + (n > 1 ? (p || s + 's') : s);
const fmtNum = (n) => Math.round(n).toLocaleString('fr-FR');
const hashHue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; };
const grad = (s) => { const h = hashHue(s); return `linear-gradient(160deg,hsl(${h},40%,20%),hsl(${(h + 28) % 360},55%,46%) 60%,hsl(${(h + 45) % 360},65%,74%))`; };
const initials = (t) => String(t || '?').replace(/^(the|le|la|les|l')\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('');
const abbr = (name) => String(name || '?').replace(/[^A-Za-zÀ-ÿ0-9 ]/g, '').split(' ').filter(Boolean)[0].slice(0, 3).toUpperCase();
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/* =========================================================
   3. État et stockage (IndexedDB, repli localStorage)
   ========================================================= */
function freshState() {
  return {
    version: 1, createdAt: now(), demo: false,
    settings: { tmdbKey: '', rawgKey: '', goals: { films: 4, tomes: 5, episodes: 0, matchs: 8 }, catchTrialStart: now() },
    items: {}, events: [], matches: {}, catchLog: [], shows: {}, feds: DEFAULT_FEDS.map((f) => Object.assign({}, f)), goalsByMonth: {}, unlocked: {}, lastLevel: 1,
    lastExport: null, sportSync: 0, logos: {}, logoTry: {}
  };
}
let state = freshState();

const store = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      try {
        const r = indexedDB.open('rewind', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => { this.db = r.result; res(); };
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
  },
  get(k) {
    return new Promise((res) => {
      if (!this.db) { try { res(JSON.parse(localStorage.getItem('rewind:' + k))); } catch (e) { res(null); } return; }
      const r = this.db.transaction('kv').objectStore('kv').get(k);
      r.onsuccess = () => res(r.result); r.onerror = () => res(null);
    });
  },
  set(k, v) {
    return new Promise((res) => {
      if (!this.db) { try { localStorage.setItem('rewind:' + k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } res(); return; }
      const t = this.db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k);
      t.oncomplete = () => res(); t.onerror = () => res();
    });
  }
};
let saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 250); }
function flush() { clearTimeout(saveTimer); return store.set('state', JSON.parse(JSON.stringify(state))); }
function migrate(s) {
  const f = freshState();
  const out = Object.assign(f, s || {});
  out.settings = Object.assign(f.settings, (s && s.settings) || {});
  out.settings.goals = Object.assign({ films: 4, tomes: 5, episodes: 0, matchs: 8 }, out.settings.goals || {});
  for (const k of ['items', 'matches', 'goalsByMonth', 'unlocked']) out[k] = out[k] || {};
  for (const k of ['events', 'catchLog']) out[k] = out[k] || [];
  out.shows = out.shows || {};
  if (!Array.isArray(out.feds) || !out.feds.length) out.feds = DEFAULT_FEDS.map((f) => Object.assign({}, f));
  // V1.2 : « événement » devient PPV, ou Show pour les indés
  out.catchLog.forEach((c) => { if (c.kind === 'event') c.kind = out.feds.some((f) => f.name === c.fed && f.kind === 'major') ? 'ppv' : 'show'; });
  out.events.forEach((e) => { if (e.kind === 'catch' && e.catchKind === 'event') { const c = out.catchLog.find((x) => 'c:' + x.id === e.item); e.catchKind = c ? c.kind : 'ppv'; } });
  return out;
}

/* =========================================================
   4. Modèle : œuvres, passages, progression
   ========================================================= */
function shape(item) {
  if (item.seasons) return 'episodes';
  if (item.volumes) return item.type === 'livre' ? 'livre' : 'tomes';
  if (item.type === 'jeu') return 'jeu';
  return 'film';
}
function curPass(item) { return item.passes[item.passes.length - 1]; }
function newPass(item) { item.passes.push({ n: item.passes.length + 1, start: now(), done: {} }); }
function createItem(d) {
  const it = Object.assign({
    id: uid(), type: 'film', title: 'Sans titre', subtitle: '', year: '', poster: '', backdrop: '', overview: '',
    src: null, status: 'envie', catchup: false, ended: true, runtime: 0, createdAt: now(), updatedAt: now(),
    passes: [{ n: 1, start: now(), done: {} }]
  }, d);
  state.items[it.id] = it;
  return it;
}
function epKeys(item) { const out = []; for (const s of item.seasons) for (let e = 1; e <= s.count; e++) out.push('s' + s.n + 'e' + e); return out; }
function volKeys(item) { return item.volumes.map((v) => 't' + v.n); }
function seasonDone(item, s, pass) { pass = pass || curPass(item); if (!s.count) return false; for (let e = 1; e <= s.count; e++) if (!pass.done['s' + s.n + 'e' + e]) return false; return true; }
function bookXp(pages) { return pages ? Math.max(100, Math.round(pages / 2)) : 150; }
function volOf(item, key) { const n = +key.replace(/\D/g, ''); return item.volumes.find((v) => v.n === n); }
function epInfo(item, key) {
  const m = /^s(\d+)e(\d+)$/.exec(key); if (!m) return null;
  const s = item.seasons.find((x) => x.n === +m[1]); const n = +m[2];
  const ep = s && s.eps ? s.eps[n - 1] : null;
  return { s: +m[1], e: n, season: s, title: ep && ep.t ? ep.t : 'Épisode ' + n, rt: ep && ep.rt, still: ep && ep.still };
}
function progress(item, pass) {
  pass = pass || curPass(item);
  const sh = shape(item);
  if (sh === 'episodes') { const keys = epKeys(item); const d = keys.filter((k) => pass.done[k]).length; return { done: d, total: keys.length }; }
  if (sh === 'tomes') { const keys = volKeys(item); return { done: keys.filter((k) => pass.done[k]).length, total: keys.length }; }
  if (sh === 'livre') { let d = 0; for (const v of item.volumes) d += pass.done['t' + v.n] ? 1 : pass.done['t' + v.n + 'm'] ? 0.5 : 0; return { done: d, total: item.volumes.length }; }
  if (sh === 'jeu') return { done: pass.done.fin ? 1 : 0, total: 1 };
  return { done: pass.done.v ? 1 : 0, total: 1 };
}
function pct(item) { const p = progress(item); return p.total ? Math.round((p.done / p.total) * 100) : 0; }
function progressText(item) {
  const p = progress(item); const sh = shape(item);
  if (sh === 'episodes') {
    if (item.type === 'catch') return plural(p.done, 'show vu', 'shows vus');
    const nx = nextUnit(item);
    if (!p.total) return 'Aucun épisode';
    if (!nx) return item.ended ? 'Terminé · ' + p.total + ' ép.' : 'À jour · ' + p.done + ' ép.';
    return (item.seasons.length > 1 ? 'S' + nx.s + ' · ' : '') + 'Épisode ' + nx.e + ' / ' + (item.seasons.length > 1 ? nx.season.count : p.total);
  }
  if (sh === 'tomes') { const nx = nextUnit(item); return nx ? 'Tome ' + nx.n + ' / ' + p.total : 'Terminé · ' + plural(p.total, 'tome'); }
  if (sh === 'livre') {
    if (item.volumes.length === 1) return p.done >= 1 ? 'Lu' : p.done ? 'À mi-parcours' : 'Pas commencé';
    const nx = nextUnit(item); return nx ? 'Tome ' + nx.n + ' / ' + p.total + (nx.mid ? '' : ' · moitié lue') : 'Saga terminée';
  }
  if (sh === 'jeu') return p.done ? 'Terminé' : item.status === 'encours' ? 'En cours' : 'Pas commencé';
  return p.done ? (item.passes.length > 1 ? 'Vu ' + item.passes.filter((x) => x.done.v).length + ' fois' : 'Vu') : 'Pas vu';
}
function nextUnit(item) {
  const pass = curPass(item); const sh = shape(item);
  if (sh === 'episodes') {
    for (const k of epKeys(item)) if (!pass.done[k]) { const i = epInfo(item, k); return Object.assign({ key: k }, i, { label: (item.seasons.length > 1 ? 'S' + i.s + ' · ' : '') + 'É' + i.e }); }
    return null;
  }
  if (sh === 'tomes') { for (const v of item.volumes) if (!pass.done['t' + v.n]) return { key: 't' + v.n, n: v.n, label: 'Tome ' + v.n }; return null; }
  if (sh === 'livre') {
    for (const v of item.volumes) {
      if (pass.done['t' + v.n]) continue;
      const one = item.volumes.length === 1;
      if (!pass.done['t' + v.n + 'm']) return { key: 't' + v.n + 'm', n: v.n, mid: true, label: one ? 'Moitié du livre' : 'Moitié du tome ' + v.n };
      return { key: 't' + v.n, n: v.n, label: one ? 'Fin du livre' : 'Fin du tome ' + v.n };
    }
    return null;
  }
  if (sh === 'jeu') return pass.done.fin ? null : { key: 'fin', label: 'Terminé' };
  return pass.done.v ? null : { key: 'v', label: 'Film' };
}
function actionLabel(item, nx) {
  const sh = shape(item);
  if (!nx) return '';
  if (sh === 'episodes') return 'Marquer ' + nx.label + ' vu';
  if (sh === 'tomes') return 'Marquer tome ' + nx.n + ' lu';
  if (sh === 'livre') return nx.mid ? 'J’en suis à la moitié' : 'J’ai fini' + (item.volumes.length > 1 ? ' le tome ' + nx.n : '');
  if (sh === 'jeu') return 'J’ai terminé';
  return 'Je l’ai vu';
}

/* ---------- événements (source de l'XP et de l'historique) ---------- */
function makeEvent(item, key, ts) {
  const pass = curPass(item); const sh = shape(item);
  const legacy = !!item.catchup; const rewatch = pass.n > 1;
  const ev = { id: uid(), ts, item: item.id, pass: pass.n, key, type: item.type, legacy, rewatch, xp: 0, kind: '' };
  if (sh === 'episodes') {
    const i = epInfo(item, key);
    ev.kind = 'ep'; ev.xp = XP.ep[item.type] || 10; ev.rt = (i && i.rt) || item.runtime || RUNTIME[item.type] || 40;
  } else if (sh === 'tomes') { ev.kind = 'tome'; ev.xp = XP.tome; }
  else if (sh === 'livre') {
    const v = volOf(item, key); const total = bookXp(v && v.pages); const mid = Math.round(total * 0.4);
    if (key.endsWith('m')) { ev.kind = 'livre_mi'; ev.xp = mid; }
    else { ev.kind = 'livre_fin'; ev.xp = (pass.done[key + 'm'] ? total - mid : total) + XP.livreFin; ev.pages = (v && v.pages) || 0; }
  } else if (sh === 'jeu') { ev.kind = 'jeu'; ev.xp = XP.jeu; }
  else { ev.kind = 'film'; ev.xp = XP.film; ev.rt = item.runtime || RUNTIME.film; }
  if (legacy) ev.xp = 0; else if (rewatch) ev.xp = Math.round(ev.xp / 2);
  return ev;
}
function setDone(item, key, on, ts) {
  const pass = curPass(item);
  if (on) {
    if (pass.done[key]) return;
    ts = ts || now(); pass.done[key] = ts;
    state.events.push(makeEvent(item, key, ts));
  } else {
    if (!pass.done[key]) return;
    delete pass.done[key];
    state.events = state.events.filter((e) => !(e.item === item.id && e.pass === pass.n && e.key === key));
  }
}
function checkBonuses(item, ts) {
  const pass = curPass(item); const sh = shape(item); const want = {};
  if (item.type !== 'catch') {
    if (sh === 'episodes') {
      if (item.seasons.length > 1) item.seasons.forEach((s) => { if (seasonDone(item, s)) want['bonus:s' + s.n] = ['bonus_saison', XP.bonusSaison, s.n]; });
      if (item.ended && item.seasons.some((s) => s.count) && item.seasons.every((s) => !s.count || seasonDone(item, s))) want['bonus:all'] = ['bonus_serie', XP.bonusSerie];
    }
    if ((sh === 'tomes' || sh === 'livre') && item.ended && item.volumes.length > 1 && item.volumes.every((v) => pass.done['t' + v.n])) {
      want['bonus:all'] = ['bonus_saga', sh === 'livre' ? XP.bonusSagaLivre : XP.bonusSaga];
    }
  }
  state.events = state.events.filter((e) => !(e.item === item.id && e.pass === pass.n && e.kind.startsWith('bonus') && !want[e.key]));
  for (const k in want) {
    if (state.events.some((e) => e.item === item.id && e.pass === pass.n && e.key === k)) continue;
    const [kind, xp, season] = want[k];
    const legacy = !!item.catchup; const rewatch = pass.n > 1;
    state.events.push({ id: uid(), ts: ts || now(), item: item.id, pass: pass.n, key: k, type: item.type, kind, season,
      xp: legacy ? 0 : rewatch ? Math.round(xp / 2) : xp, legacy, rewatch });
  }
}
function refreshStatus(item) {
  const p = progress(item);
  if (p.done > 0 && item.status === 'envie') item.status = 'encours';
  if (p.total > 0 && p.done >= p.total && item.ended !== false) item.status = 'termine';
  else if (item.status === 'termine' && p.done < p.total) item.status = 'encours';
}
function touched(item, ts) { checkBonuses(item, ts); refreshStatus(item); item.updatedAt = now(); }
function markAll(item, ts) {
  const sh = shape(item);
  if (sh === 'episodes') epKeys(item).forEach((k) => setDone(item, k, true, ts));
  else if (sh === 'tomes' || sh === 'livre') volKeys(item).forEach((k) => setDone(item, k, true, ts));
  else if (sh === 'jeu') setDone(item, 'fin', true, ts);
  else setDone(item, 'v', true, ts);
}
function deleteItem(id) {
  delete state.items[id];
  state.events = state.events.filter((e) => e.item !== id);
}

/* ---------- sport ---------- */
function seasonOf(ts) { const d = new Date(ts); const y = d.getFullYear(); return d.getMonth() >= 7 ? y + '-' + String(y + 1).slice(2) : (y - 1) + '-' + String(y).slice(2); }
function matchSee(m, mode) {
  matchUnsee(m);
  m.seen = { mode, ts: now() }; m.dismissed = false;
  state.events.push({ id: uid(), ts: now(), item: 'm:' + m.id, key: 'seen', kind: 'match', type: 'sport', mode,
    team: m.team || null, sport: m.sport, xp: mode === 'resume' ? XP.matchResume : XP.match, legacy: false, rewatch: false, rt: m.sport === 'nba' ? 150 : 110 });
}
function matchUnsee(m) { m.seen = null; state.events = state.events.filter((e) => e.item !== 'm:' + m.id); }
function favTeamSide(m) { const t = TEAMS[m.team]; if (!t) return null; return m.homeId === t.id || (m.home || '').includes(t.short) ? 'home' : 'away'; }
function pendingMatches() {
  const t = now();
  return Object.values(state.matches).filter((m) => m.team && !m.seen && !m.dismissed && m.ts < t - 2 * 3600000 && m.ts > t - 4 * DAY).sort((a, b) => b.ts - a.ts);
}

/* ---------- catch ---------- */
function catchAdd(entry) {
  const e = Object.assign({ id: uid(), ts: now() }, entry);
  state.catchLog.push(e);
  const xp = e.mode === 'resume' ? XP.catchResume : ckXp(e.kind);
  state.events.push({ id: uid(), ts: e.ts, item: 'c:' + e.id, key: 'seen', kind: 'catch', type: 'catch', fed: e.fed, show: e.show,
    catchKind: e.kind, mode: e.mode, xp, legacy: false, rewatch: false, rt: e.mode === 'resume' ? 20 : CK_RT[e.kind] || 120 });
  return e;
}
function catchRemove(id) {
  const c = state.catchLog.find((x) => x.id === id);
  if (c && c.showId && state.shows[c.showId]) state.shows[c.showId].seen = null;
  state.catchLog = state.catchLog.filter((x) => x.id !== id); state.events = state.events.filter((e) => e.item !== 'c:' + id);
}
/* Shows programmés (galas, PPV à venir) : on les confirme comme un match */
function showsUpcoming() { const t = now(); return Object.values(state.shows).filter((s) => !s.seen && !s.dismissed && s.ts > t - 3 * 3600000).sort((a, b) => a.ts - b.ts); }
function showsPending() { const t = now(); return Object.values(state.shows).filter((s) => !s.seen && !s.dismissed && s.ts <= t - 3 * 3600000 && s.ts > t - 14 * DAY).sort((a, b) => b.ts - a.ts); }
function showSee(s, mode) {
  const ts = mode === 'direct' ? Math.min(now(), s.ts + 3 * 3600000) : now();
  const c = catchAdd({ fed: s.fed, show: s.name, kind: s.kind, mode, ts, poster: s.poster || '', showId: s.id });
  s.seen = { mode, logId: c.id }; s.dismissed = false;
}
function showUnsee(s) { if (s.seen) catchRemove(s.seen.logId); s.seen = null; }

/* =========================================================
   5. Statistiques, objectifs, niveaux, badges
   ========================================================= */
const realEvents = () => state.events.filter((e) => !e.legacy);
const isBonus = (e) => e.kind.startsWith('bonus');
function goalsFor(mk) { return state.goalsByMonth[mk] || state.settings.goals; }
function countCat(evs, cat) {
  if (cat === 'films') return evs.filter((e) => e.kind === 'film').length;
  if (cat === 'tomes') return evs.filter((e) => e.kind === 'tome' || e.kind === 'livre_fin').length;
  if (cat === 'episodes') return evs.filter((e) => e.kind === 'ep' && e.type !== 'catch').length;
  if (cat === 'matchs') return evs.filter((e) => e.kind === 'match').length;
  return 0;
}
function goalResults(mk, evs) {
  evs = evs || realEvents().filter((e) => monthKey(e.ts) === mk);
  const g = goalsFor(mk);
  return Object.keys(GOAL_LABELS).filter((k) => g[k] > 0).map((k) => { const c = countCat(evs, k); return { key: k, label: GOAL_LABELS[k], count: c, target: g[k], met: c >= g[k] }; });
}
function monthXp(mk) {
  const evs = realEvents().filter((e) => monthKey(e.ts) === mk);
  return evs.reduce((a, e) => a + e.xp, 0) + goalResults(mk, evs).filter((g) => g.met).length * XP.goal;
}
function activeMonths() {
  const set = new Set(realEvents().map((e) => monthKey(e.ts))); set.add(monthKey(now()));
  return [...set].sort().reverse();
}
function totalXp() { return activeMonths().reduce((a, mk) => a + monthXp(mk), 0); }
const xpForLevel = (n) => 50 * n * (n - 1);
const levelOf = (xp) => Math.max(1, Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2));
function levelInfo() {
  const xp = totalXp(); const lvl = levelOf(xp);
  const base = xpForLevel(lvl); const next = xpForLevel(lvl + 1);
  return { xp, lvl, into: xp - base, need: next - base, pct: Math.round(((xp - base) / (next - base)) * 100) };
}
const BADGES = [
  { id: 'saison', label: 'Saison terminée', icon: 'layers', f: (c) => c.nth((e) => e.kind === 'bonus_saison', 1) },
  { id: 'serie', label: 'Série complète', icon: 'tv', f: (c) => c.nth((e) => e.kind === 'bonus_serie', 1) },
  { id: 'saga', label: 'Saga complète', icon: 'star', f: (c) => c.nth((e) => e.kind === 'bonus_saga', 1) },
  { id: 'ep100', label: '100 épisodes', icon: 'play', f: (c) => c.nth((e) => e.kind === 'ep' && e.type !== 'catch', 100) },
  { id: 'ep500', label: '500 épisodes', icon: 'play', f: (c) => c.nth((e) => e.kind === 'ep' && e.type !== 'catch', 500) },
  { id: 'films10', label: '10 films', icon: 'film', f: (c) => c.nth((e) => e.kind === 'film', 10) },
  { id: 'films50', label: '50 films', icon: 'film', f: (c) => c.nth((e) => e.kind === 'film', 50) },
  { id: 'livre1', label: 'Premier livre', icon: 'book', f: (c) => c.nth((e) => e.kind === 'livre_fin', 1) },
  { id: 'livres10', label: '10 livres', icon: 'book', f: (c) => c.nth((e) => e.kind === 'livre_fin', 10) },
  { id: 'pages1000', label: '1 000 pages', icon: 'book', f: (c) => c.cumul((e) => (e.kind === 'livre_fin' ? e.pages || 0 : 0), 1000) },
  { id: 'tomes25', label: '25 tomes', icon: 'layers', f: (c) => c.nth((e) => e.kind === 'tome', 25) },
  { id: 'jeu1', label: 'Premier jeu fini', icon: 'game', f: (c) => c.nth((e) => e.kind === 'jeu', 1) },
  { id: 'jeux5', label: '5 jeux finis', icon: 'game', f: (c) => c.nth((e) => e.kind === 'jeu', 5) },
  { id: 'match10', label: '10 matchs', icon: 'ball', f: (c) => c.nth((e) => e.kind === 'match', 10) },
  { id: 'sixers20', label: '20 matchs des Sixers', icon: 'ball', f: (c) => c.nth((e) => e.kind === 'match' && e.team === 'sixers', 20) },
  { id: 'milan20', label: '20 matchs du Milan', icon: 'ball', f: (c) => c.nth((e) => e.kind === 'match' && e.team === 'milan', 20) },
  { id: 'catch10', label: '10 shows de catch', icon: 'belt', f: (c) => c.nth((e) => e.kind === 'catch' || (e.kind === 'ep' && e.type === 'catch'), 10) },
  { id: 'revoir', label: 'Premier revisionnage', icon: 'redo', f: (c) => c.nth((e) => e.rewatch && !isBonus(e), 1) },
  { id: 'mois', label: 'Mois parfait', icon: 'target', f: (c) => c.perfectMonth() },
  { id: 'niv5', label: 'Niveau 5', icon: 'star', f: (c) => (c.lvl >= 5 ? c.last : null) },
  { id: 'niv10', label: 'Niveau 10', icon: 'star', f: (c) => (c.lvl >= 10 ? c.last : null) }
];
function badgeCtx() {
  const evs = realEvents().sort((a, b) => a.ts - b.ts);
  return {
    lvl: levelOf(totalXp()), last: evs.length ? evs[evs.length - 1].ts : now(),
    nth(fn, n) { let i = 0; for (const e of evs) if (fn(e) && ++i >= n) return e.ts; return null; },
    cumul(fn, n) { let s = 0; for (const e of evs) { s += fn(e); if (s >= n) return e.ts; } return null; },
    perfectMonth() {
      for (const mk of activeMonths().slice().reverse()) {
        const r = goalResults(mk); if (r.length && r.every((g) => g.met)) {
          const m = evs.filter((e) => monthKey(e.ts) === mk); return m.length ? m[m.length - 1].ts : now();
        }
      }
      return null;
    }
  };
}
function badgeStates() {
  const c = badgeCtx();
  return BADGES.map((b) => { const ts = b.f(c); return Object.assign({}, b, { won: !!ts, ts: state.unlocked[b.id] || ts }); });
}
function checkUnlocks(silent) {
  const out = [];
  for (const b of badgeStates()) {
    if (b.won && !state.unlocked[b.id]) { state.unlocked[b.id] = b.ts || now(); out.push(b); }
    if (!b.won && state.unlocked[b.id]) delete state.unlocked[b.id];
  }
  const lvl = levelOf(totalXp());
  if (!silent) {
    if (lvl > state.lastLevel) toast(`${svgIcon('star', 22, true)}<span>Niveau ${lvl} atteint !</span>`, 'gold', 3600);
    out.forEach((b) => toast(`<span class="medal">${svgIcon(b.icon, 16)}</span><span>Badge débloqué : <b>${esc(b.label)}</b></span>`, 'gold', 3600));
  }
  state.lastLevel = lvl;
}

/* =========================================================
   6. Sources de données (API)
   ========================================================= */
async function getJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function tmdb(path, params) {
  const key = (state.settings.tmdbKey || '').trim();
  if (!key) throw new Error('NOKEY_TMDB');
  const u = new URL('https://api.themoviedb.org/3' + path);
  u.searchParams.set('language', 'fr-FR');
  for (const k in params || {}) u.searchParams.set(k, params[k]);
  const headers = {};
  if (key.length > 40) headers.Authorization = 'Bearer ' + key; else u.searchParams.set('api_key', key);
  return getJSON(u.toString(), { headers });
}
async function anilist(query, variables) {
  const r = await getJSON('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query, variables }) });
  if (r.errors) throw new Error(r.errors[0].message);
  return r.data;
}
const AL_FIELDS = 'id title{romaji english} coverImage{large} bannerImage episodes volumes chapters duration status format startDate{year}';
async function search(type, q) {
  if (type === 'film' || type === 'serie' || type === 'doc') {
    const path = type === 'film' ? '/search/movie' : type === 'serie' ? '/search/tv' : '/search/multi';
    const r = await tmdb(path, { query: q, include_adult: 'false' });
    let res = r.results || [];
    if (type === 'doc') res = res.filter((x) => x.media_type === 'movie' || x.media_type === 'tv').sort((a, b) => ((b.genre_ids || []).includes(99) ? 1 : 0) - ((a.genre_ids || []).includes(99) ? 1 : 0));
    return res.slice(0, 15).map((x) => {
      const kind = type === 'film' ? 'movie' : type === 'serie' ? 'tv' : x.media_type;
      return { src: { api: 'tmdb', id: x.id, kind }, title: x.title || x.name, year: (x.release_date || x.first_air_date || '').slice(0, 4),
        poster: x.poster_path ? IMG.poster + x.poster_path : '', backdrop: x.backdrop_path ? IMG.backdrop + x.backdrop_path : '',
        sub: kind === 'tv' ? 'Série' : 'Film', overview: x.overview || '' };
    });
  }
  if (type === 'anime' || type === 'manga') {
    const d = await anilist(`query($s:String,$t:MediaType){Page(perPage:15){media(search:$s,type:$t,sort:SEARCH_MATCH){${AL_FIELDS}}}}`, { s: q, t: type === 'anime' ? 'ANIME' : 'MANGA' });
    return d.Page.media.map((m) => ({ src: { api: 'anilist', id: m.id }, title: m.title.english || m.title.romaji, year: (m.startDate && m.startDate.year) || '',
      poster: (m.coverImage && m.coverImage.large) || '', backdrop: m.bannerImage || '', episodes: m.episodes, volumes: m.volumes, duration: m.duration,
      ended: m.status === 'FINISHED', sub: type === 'anime' ? (m.episodes ? m.episodes + ' ép.' : 'En cours de diffusion') : (m.volumes ? m.volumes + ' tomes' : m.status === 'FINISHED' ? 'Terminé' : 'En cours de parution') }));
  }
  if (type === 'livre' || type === 'bd') {
    const [gb, ol] = await Promise.allSettled([
      getJSON('https://www.googleapis.com/books/v1/volumes?printType=books&maxResults=15&q=' + encodeURIComponent(q)),
      getJSON('https://openlibrary.org/search.json?limit=15&fields=key,title,author_name,cover_i,number_of_pages_median,first_publish_year&q=' + encodeURIComponent(q))
    ]);
    if (gb.status === 'rejected' && ol.status === 'rejected') throw gb.reason;
    const out = []; const seen = new Set();
    const push = (r) => { const k = r.title.toLowerCase() + '|' + String(r.sub).toLowerCase().split(',')[0]; if (seen.has(k)) return; seen.add(k); out.push(r); };
    if (gb.status === 'fulfilled') (gb.value.items || []).forEach((b) => { const v = b.volumeInfo || {}; if (!v.title) return;
      const img = v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail);
      push({ src: { api: 'gb', id: b.id }, title: v.title + (v.subtitle && v.title.length < 40 ? ' – ' + v.subtitle : ''), year: (v.publishedDate || '').slice(0, 4),
        poster: img ? img.replace(/^http:/, 'https:').replace('&edge=curl', '').replace('zoom=1', 'zoom=2') : '', pages: v.pageCount || 0, sub: (v.authors || []).slice(0, 2).join(', ') }); });
    if (ol.status === 'fulfilled') (ol.value.docs || []).forEach((b) => push({ src: { api: 'ol', id: b.key }, title: b.title, year: b.first_publish_year || '',
      poster: b.cover_i ? 'https://covers.openlibrary.org/b/id/' + b.cover_i + '-L.jpg' : '', pages: b.number_of_pages_median || 0,
      sub: (b.author_name || []).slice(0, 2).join(', ') }));
    return out.slice(0, 20);
  }
  if (type === 'jeu') {
    const key = (state.settings.rawgKey || '').trim(); if (!key) throw new Error('NOKEY_RAWG');
    const r = await getJSON('https://api.rawg.io/api/games?page_size=15&key=' + encodeURIComponent(key) + '&search=' + encodeURIComponent(q));
    return (r.results || []).map((g) => ({ src: { api: 'rawg', id: g.id }, title: g.name, year: (g.released || '').slice(0, 4), poster: g.background_image || '', backdrop: g.background_image || '', sub: (g.platforms || []).slice(0, 3).map((p) => p.platform.name).join(', ') }));
  }
  return [];
}
async function buildFromResult(type, r, opt) {
  const base = { type, title: r.title, year: r.year, poster: r.poster, backdrop: r.backdrop || '', subtitle: r.sub || '', src: r.src, overview: r.overview || '' };
  if (r.src.api === 'tmdb') {
    if (r.src.kind === 'movie') {
      try { const d = await tmdb('/movie/' + r.src.id); base.runtime = d.runtime || 0; base.overview = d.overview || base.overview; if (d.backdrop_path) base.backdrop = IMG.backdrop + d.backdrop_path; } catch (e) { /* hors ligne */ }
      return base;
    }
    const d = await tmdb('/tv/' + r.src.id);
    base.seasons = (d.seasons || []).filter((s) => s.season_number > 0 && s.episode_count > 0).map((s) => ({ n: s.season_number, name: s.name, count: s.episode_count, eps: null }));
    if (!base.seasons.length) base.seasons = [{ n: 1, name: 'Saison 1', count: d.number_of_episodes || 0, eps: null }];
    base.ended = d.status === 'Ended' || d.status === 'Canceled';
    base.runtime = (d.episode_run_time && d.episode_run_time[0]) || 0;
    if (d.backdrop_path) base.backdrop = IMG.backdrop + d.backdrop_path;
    base.overview = d.overview || base.overview; base.syncedAt = now();
    return base;
  }
  if (r.src.api === 'anilist' && type === 'anime') {
    let count = r.episodes || 0; let eps = null;
    try {
      const d = await anilist(`query($id:Int){Media(id:$id){episodes status duration nextAiringEpisode{episode} streamingEpisodes{title thumbnail}}}`, { id: r.src.id });
      const m = d.Media; count = m.episodes || (m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : count);
      if (m.streamingEpisodes && m.streamingEpisodes.length) eps = parseStreamingEps(m.streamingEpisodes, count);
      base.ended = m.status === 'FINISHED';
    } catch (e) { base.ended = r.ended; }
    base.seasons = [{ n: 1, name: 'Épisodes', count, eps }];
    base.runtime = r.duration || 0;
    return base;
  }
  if (type === 'manga' || type === 'bd' || type === 'livre') {
    const n = clamp(+opt.tomes || r.volumes || 1, 1, 300);
    const pages = type === 'livre' ? (+opt.pages || r.pages || 0) : 0;
    base.volumes = Array.from({ length: n }, (_, i) => ({ n: i + 1, pages }));
    base.ended = r.src.api === 'anilist' ? !!r.ended : true;
    return base;
  }
  return base;
}
function parseStreamingEps(list, count) {
  const arr = [];
  list.forEach((x, i) => {
    const m = /(?:Episode|Épisode|Ep\.?)\s*(\d+)\s*[-–:]?\s*(.*)/i.exec(x.title || '');
    const n = m ? +m[1] : i + 1; if (n < 1 || n > 2000) return;
    arr[n - 1] = { t: m && m[2] ? m[2] : x.title, still: x.thumbnail || '' };
  });
  for (let i = 0; i < count; i++) if (!arr[i]) arr[i] = null;
  return arr;
}
const seasonLoading = {};
async function loadSeason(item, n) {
  const k = item.id + ':' + n; if (seasonLoading[k]) return; seasonLoading[k] = true;
  try {
    const d = await tmdb('/tv/' + item.src.id + '/season/' + n);
    const s = item.seasons.find((x) => x.n === n); if (!s) return;
    s.eps = (d.episodes || []).map((e) => ({ t: e.name, still: e.still_path ? IMG.still + e.still_path : '', rt: e.runtime || 0, air: e.air_date || '' }));
    if (s.eps.length > s.count) s.count = s.eps.length;
    save(); render();
  } catch (e) { seasonLoading[k] = 'fail'; }
}
async function refreshTv(item) {
  const d = await tmdb('/tv/' + item.src.id);
  const fresh = (d.seasons || []).filter((s) => s.season_number > 0 && s.episode_count > 0);
  for (const s of fresh) {
    const ex = item.seasons.find((x) => x.n === s.season_number);
    if (ex) { if (s.episode_count > ex.count) { ex.count = s.episode_count; ex.eps = null; delete seasonLoading[item.id + ':' + ex.n]; } }
    else item.seasons.push({ n: s.season_number, name: s.name, count: s.episode_count, eps: null });
  }
  item.seasons.sort((a, b) => a.n - b.n);
  item.ended = d.status === 'Ended' || d.status === 'Canceled';
  item.syncedAt = now();
}
async function syncSport(force) {
  if (!force && now() - (state.sportSync || 0) < 3 * 3600000) return;
  state.sportSync = now();
  let ok = 0;
  for (const t of Object.values(TEAMS)) {
    for (const ep of ['eventslast', 'eventsnext']) {
      try {
        const r = await getJSON(`https://www.thesportsdb.com/api/v1/json/123/${ep}.php?id=${t.id}`);
        const list = r.results || r.events || [];
        list.forEach((ev) => upsertMatch(ev, t)); ok++;
      } catch (e) { /* hors ligne ou limite atteinte */ }
    }
  }
  save();
  if (ok && ['encours', 'biblio', 'match'].includes(ui.route)) render();
  syncLogos().catch(() => {});
  return ok;
}
/* Logos d'équipes : récupérés une seule fois via TheSportsDB, puis gardés sur le téléphone */
async function syncLogos() {
  state.logos = state.logos || {}; state.logoTry = state.logoTry || {};
  const ids = new Set(Object.values(TEAMS).map((t) => t.id));
  Object.values(state.matches).forEach((m) => { if (m.ext) { if (m.homeId) ids.add(String(m.homeId)); if (m.awayId) ids.add(String(m.awayId)); } });
  const todo = [...ids].filter((id) => !state.logos[id] && now() - (state.logoTry[id] || 0) > 7 * 86400000).slice(0, 12);
  let got = 0;
  for (const id of todo) {
    state.logoTry[id] = now();
    try {
      const r = await getJSON(`https://www.thesportsdb.com/api/v1/json/123/lookupteam.php?id=${id}`);
      const t = r.teams && r.teams[0];
      const url = t && (t.strBadge || t.strTeamBadge);
      if (url) { state.logos[id] = url.replace(/^http:/, 'https:') + (/\/tiny$|\/small$|\/medium$/.test(url) ? '' : '/small'); got++; }
    } catch (e) { /* on réessaiera plus tard */ }
  }
  if (todo.length) save();
  if (got && ['encours', 'biblio', 'match', 'histo'].includes(ui.route)) render();
}
function upsertMatch(ev, t) {
  const id = 'tsdb' + ev.idEvent;
  let ts = ev.strTimestamp ? Date.parse(/Z|[+-]\d\d:?\d\d$/.test(ev.strTimestamp) ? ev.strTimestamp : ev.strTimestamp + 'Z') : Date.parse((ev.dateEvent || '') + 'T' + (ev.strTime || '00:00:00') + 'Z');
  if (isNaN(ts)) ts = Date.parse(ev.dateEvent);
  const m = state.matches[id] || { id, seen: null, dismissed: false };
  Object.assign(m, { ext: true, team: t.key, sport: t.sport, league: ev.strLeague || t.league, home: ev.strHomeTeam, away: ev.strAwayTeam,
    homeId: ev.idHomeTeam, awayId: ev.idAwayTeam, ts,
    hs: ev.intHomeScore != null && ev.intHomeScore !== '' ? +ev.intHomeScore : null, as: ev.intAwayScore != null && ev.intAwayScore !== '' ? +ev.intAwayScore : null });
  state.matches[id] = m;
}

/* =========================================================
   7. Interface : icônes, affiches, toasts, modales
   ========================================================= */
const ICONS = {
  play: 'M8 5v14l11-7z', book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3.5 2', user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4 3.6-7 8-7s8 3 8 7',
  check: 'M5 12.5l4.5 4.5L19 7.5', back: 'M19 12H5M11 6l-6 6 6 6', chevD: 'M6 9l6 6 6-6', chevL: 'M15 6l-6 6 6 6', chevR: 'M9 6l6 6-6 6',
  plus: 'M12 5v14M5 12h14', redo: 'M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4-4',
  eyeOff: 'M3 3l18 18M10.6 6.1A9.9 9.9 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-2.4 3M6.6 6.6C4.3 8.2 3 12 3 12s4 6 9 6c1.6 0 3-.4 4.3-1.1',
  eye: 'M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  lock: 'M5 11h14v10H5z M8 11V8a4 4 0 0 1 8 0v3', trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13', edit: 'M4 20h4L19 9l-4-4L4 16z',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16', upload: 'M12 21V9M7 14l5-5 5 5M4 3h16', layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
  tv: 'M3 6h18v12H3z M8 21h8', film: 'M4 4h16v16H4z M8 4v16 M16 4v16 M4 9h4 M4 15h4 M16 9h4 M16 15h4',
  game: 'M6 9h12a4 4 0 0 1 4 4v1a3 3 0 0 1-5.4 1.8L15 14H9l-1.6 1.8A3 3 0 0 1 2 14v-1a4 4 0 0 1 4-4z M8 11v3 M6.5 12.5h3',
  ball: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3.5 9.5c5 1 12 1 17 0 M3.5 14.5c5-1 12-1 17 0 M12 3v18',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', belt: 'M3 10h18v4H3z M9 8h6v8H9z',
  dots: 'M5 12h.01 M12 12h.01 M19 12h.01', key: 'M14 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12z M9.5 14.5L3 21 M5 19l2 2 M7 17l2 2',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1', x: 'M6 6l12 12M18 6L6 18', sync: 'M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9 M18 3v4h-4 M6 21v-4h4'
};
function svgIcon(name, size, filled) {
  size = size || 20;
  return filled
    ? `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor"><path d="${ICONS[name]}"/></svg>`
    : `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[name]}"/></svg>`;
}
function posterHtml(title, src, cls, extra) {
  return `<div class="poster ${cls || ''}" style="background:${grad(title)}" aria-hidden="true"><span class="ph">${esc(initials(title))}</span>${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : ''}${extra || ''}</div>`;
}
function itemPoster(item, cls, extra) { return posterHtml(item.title, item.poster, cls, extra); }
function bar(p, cls) { return `<div class="bar ${cls || ''}" role="img" aria-label="${p} %"><i style="width:${clamp(p, 0, 100)}%"></i></div>`; }
function teamDisc(name, team, cls, id) {
  const t = team && TEAMS[team];
  id = id || (t && t.id) || '';
  const logo = id && state.logos && state.logos[id];
  const c = cls || 'disc';
  if (logo) return `<div class="${c} has-logo" aria-hidden="true"><img src="${esc(logo)}" alt="" loading="lazy" onerror="var p=this.parentNode;if(p)p.classList.remove('has-logo');this.remove()"></div>`;
  const bg = t ? t.c1 : `hsl(${hashHue(name)},45%,32%)`;
  const ring = t ? `;box-shadow:inset 0 0 0 3px ${t.c2}` : '';
  return `<div class="${c}" style="background:${bg}${ring}" aria-hidden="true">${esc(t ? t.abbr : abbr(name))}</div>`;
}
async function imageToDataUrl(file, maxW) {
  maxW = maxW || 480;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const k = Math.min(1, maxW / img.naturalWidth);
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } finally { URL.revokeObjectURL(url); }
}
function importPack(data) {
  let n = 0;
  (data.feds || []).forEach((f) => { if (f && f.name && !state.feds.some((x) => x.name.toLowerCase() === f.name.toLowerCase())) state.feds.push({ name: f.name, kind: f.kind === 'major' ? 'major' : 'inde' }); });
  (data.shows || []).forEach((sh) => {
    if (!sh || !sh.name || !sh.ts) return;
    const id = sh.id || uid(); if (state.shows[id]) return;
    state.shows[id] = { id, fed: sh.fed || 'Autre', name: sh.name, kind: CKINDS[sh.kind] ? sh.kind : 'show', ts: sh.ts, poster: sh.poster || '', seen: null, dismissed: false, createdAt: now() }; n++;
  });
  save(); render(); return n;
}
function toast(html, kind, ms) {
  const box = document.getElementById('toasts'); if (!box) return;
  const el = document.createElement('div'); el.className = 'toast ' + (kind || ''); el.innerHTML = html; box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, ms || 2400);
}
function errText(e) {
  const m = String(e && e.message || e);
  if (m === 'NOKEY_TMDB') return 'Ajoute ta clé TMDB dans Profil › Réglages pour chercher des films et séries.';
  if (m === 'NOKEY_RAWG') return 'Ajoute ta clé RAWG dans Profil › Réglages pour chercher des jeux.';
  if (m.includes('401')) return 'Clé refusée par le service. Vérifie-la dans Profil › Réglages.';
  if (m.includes('Failed to fetch') || m.includes('NetworkError') || m.includes('Load failed')) return 'Service injoignable (hors connexion ou bloqué ici). Tu peux ajouter le titre à la main.';
  return 'Erreur : ' + m;
}

/* =========================================================
   8. État de l'interface
   ========================================================= */
const ui = {
  route: 'encours', arg: null, modal: null, season: {}, ddOpen: false, reveal: {}, matchMode: {},
  biblio: { type: 'tout', status: 'tous' }, histo: 0,
  add: { type: 'serie', q: '', results: null, loading: false, error: '', picked: null, manual: false, status: 'encours', catchup: null, tomes: '', pages: '' }
};
function parseRoute() {
  const h = (location.hash || '#encours').slice(1);
  const i = h.indexOf('-');
  if (i > 0 && ['item', 'match', 'rewind', 'ajouter'].includes(h.slice(0, i))) return { route: h.slice(0, i), arg: h.slice(i + 1) };
  return { route: h || 'encours', arg: null };
}
const TABS = [
  { r: 'encours', label: 'EN COURS', icon: 'play' }, { r: 'biblio', label: 'BIBLIO', icon: 'book' },
  { r: 'envies', label: 'ENVIES', icon: 'star' }, { r: 'histo', label: 'HISTO', icon: 'clock' }, { r: 'profil', label: 'PROFIL', icon: 'user' }
];
function navHtml(active) {
  return `<nav class="nav" aria-label="Navigation principale">${TABS.map((t) => `<a href="#${t.r}" class="${t.r === active ? 'on' : ''}" ${t.r === active ? 'aria-current="page"' : ''}>${svgIcon(t.icon, 20)}${t.label}</a>`).join('')}</nav>`;
}
function fab(href) { return `<a class="fab" href="${href || '#ajouter'}" aria-label="Ajouter">${svgIcon('plus', 26)}</a>`; }

/* =========================================================
   9. Vues
   ========================================================= */
function levelChip() {
  const L = levelInfo();
  return `<a class="lvl" href="#profil" aria-label="Niveau ${L.lvl}, ${L.into} XP sur ${L.need}"><span class="label">NIV. ${L.lvl} · ${fmtNum(L.into)} XP</span>${bar(L.pct, 'thin')}</a>`;
}
function demoBanner() {
  return state.demo ? `<div class="banner warn">${svgIcon('eye', 18)}<span class="grow">Données de démonstration.</span><button class="link" data-a="clear-demo">Effacer</button></div>` : '';
}

/* ---------- En cours ---------- */
function viewEncours() {
  const items = Object.values(state.items).filter((i) => i.status === 'encours' && (i.type !== 'catch' || nextUnit(i))).sort((a, b) => b.updatedAt - a.updatedAt);
  const userItems = Object.values(state.items).filter((i) => !(i.type === 'catch' && !progress(i).total));
  const pend = pendingMatches().slice(0, 3);
  const mk = monthKey(now()); const goals = goalResults(mk);
  let h = `<div class="head"><h1 class="h1">En cours</h1>${levelChip()}</div>${demoBanner()}`;
  if (!userItems.length && !Object.keys(state.matches).length && !state.catchLog.length && !Object.keys(state.shows).length) {
    h += `<section class="glass pad col" aria-label="Bienvenue"><span class="label cyan">Bienvenue sur Rewind</span>
      <p style="margin:0;line-height:1.5">Pour bien démarrer :</p>
      <ol style="margin:0;padding-left:20px;line-height:1.7;color:#CFE3EA">
        <li>Ajoute ta clé TMDB dans <a href="#profil">Profil</a> pour les affiches et les épisodes.</li>
        <li>Ajoute ce que tu suis déjà. Le mode <b>rattrapage</b> coche l’existant sans XP.</li>
        <li>Coche au fur et à mesure : l’XP, les badges et l’historique suivent.</li>
      </ol>
      <a class="btn chrome block" href="#ajouter">${svgIcon('plus', 18)}Ajouter une œuvre</a>
      <button class="btn block" data-a="load-demo">Essayer avec des données de démo</button></section>`;
  }
  pend.forEach((m) => { h += pendingCard(m); });
  showsPending().slice(0, 3).forEach((s) => { h += showCard(s, true); });
  showsUpcoming().filter((s) => s.ts < now() + 30 * DAY).slice(0, 2).forEach((s) => { h += showCard(s, false); });
  if (items.length) {
    const top = items[0]; const nx = nextUnit(top); const p = progress(top);
    const bg = top.backdrop || top.poster;
    h += `<section class="hero-card" aria-label="Continuer">
      <a class="hero-img" href="#item-${top.id}"><div class="bg" style="background:${grad(top.title)}">${bg ? `<img src="${esc(bg)}" alt="" loading="lazy">` : ''}</div>
        <span class="pill">${esc(TYPES[top.type].label)}${nx && shape(top) === 'episodes' ? ' · ' + esc(nx.label) : ''}</span>
        <div class="over"><span class="hero-title">${esc(top.title)}</span><span class="small" style="color:#CFE3EA">${nx ? (shape(top) === 'episodes' ? 'Prochain : ' + esc(nx.title) : esc(nx.label)) : esc(progressText(top))}</span></div></a>
      <div class="col" style="padding:12px 14px 14px;gap:10px">
        <div class="row between label"><span>${esc(progressText(top))}</span><span>${pct(top)} %</span></div>${bar(pct(top))}
        ${nx ? `<button class="btn chrome" data-a="next" data-id="${top.id}">${svgIcon('check', 18)}${esc(actionLabel(top, nx))}</button>` : ''}
        ${top.catchup ? `<span class="label amber" style="text-align:center">Mode rattrapage actif · sans XP</span>` : ''}
      </div></section>`;
    if (items.length > 1) {
      h += `<section class="section" aria-label="Aussi en cours"><h2 class="h2">Aussi en cours</h2>`;
      items.slice(1).forEach((it) => {
        const n2 = nextUnit(it);
        h += `<div class="card-row"><a href="#item-${it.id}" class="row grow" style="color:inherit;text-decoration:none;gap:12px">${itemPoster(it, 'sm')}
          <div class="col grow" style="gap:4px"><span class="label cyan" style="font-size:10px">${esc(TYPES[it.type].label)}</span><span class="ellipsis" style="font-weight:700;font-size:16px">${esc(it.title)}</span>
          <span class="small muted">${esc(progressText(it))}</span>${bar(pct(it), 'thin')}</div></a>
          ${n2 ? `<button class="icon-btn" data-a="next" data-id="${it.id}" aria-label="${esc(actionLabel(it, n2))}">${svgIcon('check', 20)}</button>` : ''}</div>`;
      });
      h += `</section>`;
    }
  } else if (userItems.length) {
    h += `<div class="empty">Rien en cours pour l’instant.<br><a href="#envies">Pioche dans tes envies</a> ou <a href="#ajouter">ajoute quelque chose</a>.</div>`;
  }
  if (goals.length) {
    const met = goals.filter((g) => g.met).length;
    h += `<a class="amber-card row" href="#profil" style="padding:12px 14px;gap:12px;text-decoration:none;color:inherit">
      <span class="medal" style="width:38px;height:38px">${svgIcon('target', 18)}</span>
      <div class="col grow" style="gap:6px"><div class="row between label amber"><span>Objectifs ${esc(MONTHS[new Date().getMonth()])}</span><span>${met} / ${goals.length}</span></div>${bar(Math.round((met / goals.length) * 100), 'thin amber')}</div></a>`;
  }
  return `<main class="view">${h}</main>${navHtml('encours')}${fab()}`;
}
function pendingCard(m) {
  return `<section class="glass pad col" aria-label="Match à confirmer" style="gap:12px">
    <a href="#match-${m.id}" class="row" style="color:inherit;text-decoration:none">${teamDisc(m.home, favTeamSide(m) === 'home' ? m.team : null, 'mini-team', m.homeId)}
      <div class="col grow" style="gap:2px"><span class="label cyan">${esc(m.league || '')} · ${esc(fmtMatch(m.ts))}</span><span style="font-weight:700">${esc(m.home)} – ${esc(m.away)}</span></div>
      ${teamDisc(m.away, favTeamSide(m) === 'away' ? m.team : null, 'mini-team', m.awayId)}</a>
    <h2 class="h3" style="font-size:22px">Tu as vu ce match ?</h2>
    <div class="seg">${Object.keys(MODES).map((k) => `<button data-a="match-seen" data-id="${m.id}" data-mode="${k}">${MODES[k]}</button>`).join('')}<button data-a="match-dismiss" data-id="${m.id}">Pas vu</button></div>
  </section>`;
}

function untilText(ts) {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0); const d1 = new Date(ts); d1.setHours(0, 0, 0, 0);
  const n = Math.round((d1 - d0) / DAY);
  return n <= 0 ? (ts > now() ? 'Ce soir' : 'En ce moment') : n === 1 ? 'Demain' : 'Dans ' + n + ' jours';
}
function showCard(s, pending) {
  return `<section class="glass pad col" aria-label="${pending ? 'Show à confirmer' : 'Prochain show'}" style="gap:12px">
    <button class="row show-head" data-a="show-open" data-id="${s.id}">${posterHtml(s.name, s.poster, 'md')}
      <div class="col grow" style="gap:4px;text-align:left"><span class="label cyan">${esc(s.fed)} · ${esc(CKINDS[s.kind] || 'Show')}</span>
        <span class="h3" style="font-size:24px;line-height:1.05">${esc(s.name)}</span>
        <span class="small" style="color:#CFE3EA">${esc(fmtMatch(s.ts))}</span>
        ${pending ? '' : `<span class="pill amber" style="align-self:flex-start;margin-top:4px">${esc(untilText(s.ts))}</span>`}</div></button>
    ${pending ? `<h2 class="h3" style="font-size:22px">Tu as vu ce show ?</h2>
    <div class="seg">${Object.keys(MODES).map((k) => `<button data-a="show-seen" data-id="${s.id}" data-mode="${k}">${MODES[k]}</button>`).join('')}<button data-a="show-dismiss" data-id="${s.id}">Pas vu</button></div>` : ''}
  </section>`;
}

/* ---------- Bibliothèque ---------- */
function viewBiblio() {
  const f = ui.biblio;
  const chips = [['tout', 'Tout'], ...['film', 'serie', 'anime', 'doc', 'livre', 'bd', 'manga', 'jeu'].map((t) => [t, TYPES[t].plural]), ['sport', 'Sport'], ['catch', 'Catch']];
  let h = `<div class="head"><h1 class="h1">Biblio</h1>${levelChip()}</div>${demoBanner()}
    <div class="chips" role="group" aria-label="Catégorie">${chips.map(([k, l]) => `<button class="chip ${f.type === k ? 'on' : ''}" data-a="bib-type" data-v="${k}" aria-pressed="${f.type === k}">${esc(l)}</button>`).join('')}</div>`;
  if (f.type === 'sport') return `<main class="view">${h}${sportSection()}</main>${navHtml('biblio')}${fab('#ajouter-sport')}`;
  if (f.type === 'catch') return `<main class="view">${h}${catchSection()}</main>${navHtml('biblio')}${fab('#ajouter-catch')}`;
  h += `<div class="seg" role="group" aria-label="Statut">${[['tous', 'Tous'], ['encours', 'En cours'], ['termine', 'Terminés']].map(([k, l]) => `<button class="${f.status === k ? 'on' : ''}" data-a="bib-status" data-v="${k}">${l}</button>`).join('')}</div>
    <label class="search"><span class="sr">Filtrer</span><input class="input" type="search" placeholder="Filtrer par titre…" data-filter="bib"></label>`;
  const list = Object.values(state.items).filter((i) => i.status !== 'envie' && (f.type === 'tout' || i.type === f.type) && (f.status === 'tous' || i.status === f.status) && i.type !== 'catch')
    .sort((a, b) => b.updatedAt - a.updatedAt);
  h += list.length ? `<div class="grid3">${list.map(tileHtml).join('')}</div>` : `<div class="empty">Rien ici pour l’instant.</div>`;
  return `<main class="view">${h}</main>${navHtml('biblio')}${fab()}`;
}
function tileHtml(it) {
  const p = pct(it); const done = it.status === 'termine';
  const extra = `<span class="tag pill" style="font-size:9px;padding:3px 7px">${esc(TYPES[it.type].label)}</span>${done ? `<span class="done-mark">${svgIcon('check', 14)}</span>` : it.status === 'encours' && p > 0 ? `<div class="pbar">${bar(p, 'thin')}</div>` : ''}`;
  return `<a class="tile" href="#item-${it.id}" data-title="${esc(it.title.toLowerCase())}">${itemPoster(it, 'fill', extra)}<span class="t ellipsis">${esc(it.title)}</span><span class="d">${esc(progressText(it))}</span></a>`;
}
function sportSection() {
  const all = Object.values(state.matches).sort((a, b) => b.ts - a.ts);
  let h = '';
  Object.values(TEAMS).forEach((t) => {
    const season = seasonOf(now());
    const seen = all.filter((m) => m.team === t.key && m.seen && seasonOf(m.ts) === season).length;
    h += `<div class="glass pad row" style="gap:12px">${teamDisc(t.name, t.key, 'mini-team')}<div class="col grow" style="gap:6px"><div class="row between"><span style="font-weight:700">${esc(t.name)}</span><span class="label">${seen} / ${t.total} vus</span></div>
      ${bar(Math.round((seen / t.total) * 100), 'thin')}<span class="small muted">${esc(t.league)} · saison ${season}</span></div></div>`;
  });
  h += `<div class="row between"><h2 class="h2">Matchs</h2><button class="link" data-a="sport-sync">${svgIcon('sync', 16)} Actualiser</button></div>`;
  const list = all.filter((m) => m.ts < now() + 14 * DAY).slice(0, 40);
  if (!list.length) h += `<div class="empty">Aucun match pour l’instant. Touche « Actualiser » pour récupérer le calendrier des Sixers et du Milan, ou ajoute un match à la main.</div>`;
  list.forEach((m) => {
    const fut = m.ts > now();
    const st = m.seen ? `<span class="pill cyan">${esc(MODES[m.seen.mode])}</span>` : fut ? `<span class="pill">À venir</span>` : m.dismissed ? `<span class="pill">Pas vu</span>` : `<span class="pill amber">À confirmer</span>`;
    h += `<a class="card-row" href="#match-${m.id}"><div class="col grow" style="gap:3px;padding-left:4px"><span class="label">${esc(fmtMatch(m.ts))} · ${esc(m.league || '')}</span><span class="ellipsis" style="font-weight:600">${esc(m.home)} – ${esc(m.away)}</span></div>${st}</a>`;
  });
  return h;
}
function catchSection() {
  const start = state.settings.catchTrialStart || state.createdAt;
  const day = Math.floor((now() - start) / DAY) + 1;
  const shows = Object.values(state.items).filter((i) => i.type === 'catch');
  let h = day <= 30
    ? `<div class="banner info">${svgIcon('clock', 18)}<span class="grow">Essai catch · jour ${day} / 30. Note tout ce que tu regardes, on fera le point à la fin.</span></div>`
    : `<div class="banner warn">${svgIcon('target', 18)}<span class="grow">Le mois d’essai est terminé : regarde le bilan ci-dessous pour décider de l’organisation.</span></div>`;
  h += `<div class="row between"><span class="small muted">${plural(state.feds.length, 'fédération')} : ${esc(state.feds.map((f) => f.name).join(', '))}</span><button class="link" data-a="feds-open">Gérer</button></div>`;
  h += `<div class="row between"><h2 class="h2">Shows suivis</h2><button class="link" data-a="catch-new-show">+ Show suivi</button></div>`;
  shows.forEach((s) => { h += `<a class="card-row" href="#item-${s.id}">${itemPoster(s, 'sm')}<div class="col grow" style="gap:3px"><span class="label cyan">Hebdo</span><span style="font-weight:700">${esc(s.title)}</span><span class="small muted">${esc(progressText(s))}</span></div></a>`; });
  const planned = Object.values(state.shows).filter((s) => !s.seen && !s.dismissed).sort((a, b) => a.ts - b.ts);
  h += `<div class="row between"><h2 class="h2">À venir</h2><a class="link" href="#ajouter-catch" style="display:flex;align-items:center">+ Programmer</a></div>`;
  if (!planned.length) h += `<div class="empty">Aucun show programmé. Ajoute le prochain gala ou PPV avec son affiche : il apparaîtra dans En cours le jour J.</div>`;
  planned.forEach((s) => { h += `<button class="card-row" data-a="show-open" data-id="${s.id}" style="width:100%;text-align:left">${posterHtml(s.name, s.poster, 'sm')}<div class="col grow" style="gap:3px"><span class="label">${esc(fmtMatch(s.ts))} · ${esc(s.fed)} · ${esc(CKINDS[s.kind] || 'Show')}</span><span style="font-weight:700">${esc(s.name)}</span></div><span class="pill ${s.ts < now() ? 'amber' : ''}">${s.ts < now() ? 'À confirmer' : esc(untilText(s.ts))}</span></button>`; });
  const log = state.catchLog.slice().sort((a, b) => b.ts - a.ts);
  const byFed = {}; log.forEach((c) => { byFed[c.fed] = (byFed[c.fed] || 0) + 1; });
  h += `<div class="row between"><h2 class="h2">Journal</h2><a class="link" href="#ajouter-catch" style="display:flex;align-items:center">+ Noter</a></div>`;
  if (Object.keys(byFed).length) h += `<div class="chips">${Object.entries(byFed).map(([f, n]) => `<span class="chip" style="display:flex;align-items:center">${esc(f)} · ${n}</span>`).join('')}</div>`;
  if (!log.length) h += `<div class="empty">Rien de noté pour l’instant. Touche + pour noter un show, un PPV ou un gala.</div>`;
  log.forEach((c) => {
    h += `<div class="card-row">${c.poster ? posterHtml(c.show || c.fed, c.poster, 'sm') : teamDisc(c.fed, null, 'mini-team')}<div class="col grow" style="gap:3px"><span class="label">${esc(fmtDay(c.ts))} · ${esc(c.fed)} · ${esc(CKINDS[c.kind] || 'Hebdo')}</span>
      <span style="font-weight:600">${esc(c.show || c.fed)}</span>${c.note ? `<span class="small muted">${esc(c.note)}</span>` : ''}</div><span class="pill cyan">${esc(MODES[c.mode])}</span>
      <button class="icon-btn dark" data-a="catch-del" data-id="${c.id}" aria-label="Supprimer">${svgIcon('trash', 18)}</button></div>`;
  });
  return h;
}

/* ---------- Envies ---------- */
function viewEnvies() {
  const list = Object.values(state.items).filter((i) => i.status === 'envie').sort((a, b) => b.createdAt - a.createdAt);
  return `<main class="view"><div class="head"><h1 class="h1">Envies</h1>${levelChip()}</div>${demoBanner()}
    ${list.length ? `<div class="grid3">${list.map(tileHtml).join('')}</div>` : `<div class="empty">Ta liste d’envies est vide.<br>Ajoute ce que tu veux voir, lire ou jouer.</div>`}
  </main>${navHtml('envies')}${fab()}`;
}

/* ---------- Historique ---------- */
function monthGroups(mk) {
  const all = realEvents().filter((e) => monthKey(e.ts) === mk && !isBonus(e));
  const finItems = new Set(all.filter((e) => e.kind === 'livre_fin').map((e) => e.item));
  const evs = all.filter((e) => e.kind !== 'livre_mi' || !finItems.has(e.item));
  const groups = new Map();
  for (const e of evs) {
    let key = e.item;
    if (e.kind === 'match') key = e.team ? 'team:' + e.team : 'sport:' + e.sport;
    if (e.kind === 'catch') key = 'fed:' + e.fed;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const out = [];
  for (const [key, list] of groups) {
    const last = Math.max(...list.map((e) => e.ts)); const rw = list.some((e) => e.rewatch);
    if (key.startsWith('team:')) { const t = TEAMS[key.slice(5)]; const r = list.filter((e) => e.mode === 'resume').length;
      out.push({ last, title: t.short, kind: t.league, poster: sportVignette(t, list), detail: plural(list.length - r, 'match') + (r ? ' · ' + plural(r, 'résumé') : '') }); continue; }
    if (key.startsWith('sport:')) { out.push({ last, title: key.slice(6) === 'nba' ? 'Basket' : key.slice(6) === 'foot' ? 'Football' : 'Sport', kind: 'SPORT', poster: posterHtml(key, '', 'fill'), detail: plural(list.length, 'match') }); continue; }
    if (key.startsWith('fed:')) { const fed = key.slice(4);
      const withPoster = list.slice().sort((a, b) => b.ts - a.ts).map((e) => state.catchLog.find((c) => 'c:' + c.id === e.item)).find((c) => c && c.poster);
      out.push({ last, title: fed, kind: 'CATCH', poster: withPoster ? posterHtml(fed, withPoster.poster, 'fill') : fedVignette(fed), detail: plural(list.length, 'show') }); continue; }
    const it = state.items[key]; if (!it) continue;
    let detail = '';
    const k0 = list[0].kind;
    if (k0 === 'ep') detail = it.type === 'catch' ? plural(list.length, 'show') : plural(list.length, 'épisode');
    else if (k0 === 'tome') { const ns = list.map((e) => +e.key.slice(1)).sort((a, b) => a - b); detail = ns.length === 1 ? 'Tome ' + ns[0] : ns[ns.length - 1] - ns[0] + 1 === ns.length ? 'Tomes ' + ns[0] + ' à ' + ns[ns.length - 1] : plural(ns.length, 'tome'); }
    else if (k0 === 'livre_fin' || k0 === 'livre_mi') { const fins = list.filter((e) => e.kind === 'livre_fin'); const pg = fins.reduce((a, e) => a + (e.pages || 0), 0);
      detail = fins.length ? (it.volumes.length > 1 ? fins.map((e) => 'Tome ' + e.key.slice(1)).join(', ') : 'Terminé') + (pg ? ' · ' + pg + ' p.' : '') : 'À mi-parcours'; }
    else if (k0 === 'film') detail = list.length > 1 ? 'Vu ' + list.length + ' fois' : rw ? 'Revu' : 'Vu';
    else if (k0 === 'jeu') detail = 'Terminé';
    if (rw && k0 !== 'film') detail += ' · revisionnage';
    out.push({ last, title: it.title, kind: TYPES[it.type].label, poster: itemPoster(it, 'fill'), detail, href: '#item-' + it.id });
  }
  return out.sort((a, b) => b.last - a.last);
}
function sportVignette(t, list) {
  const logo = state.logos && state.logos[t.id];
  const lastEv = list.slice().sort((a, b) => b.ts - a.ts)[0];
  const m = lastEv && state.matches[String(lastEv.item).slice(2)];
  let oppId = '', oppName = '';
  if (m) { const home = favTeamSide(m) === 'home'; oppId = String(home ? m.awayId || '' : m.homeId || ''); oppName = home ? m.away : m.home; }
  const opp = oppId && state.logos && state.logos[oppId];
  return `<div class="poster fill vig" style="background:radial-gradient(120% 80% at 50% 30%,${t.c1},${t.c2} 120%)" aria-hidden="true">
    ${logo ? `<img class="main" src="${esc(logo)}" alt="">` : `<span class="vig-abbr">${esc(t.abbr)}</span>`}
    ${m ? `<span class="vig-opp">${opp ? `<img src="${esc(opp)}" alt="">` : `<b>${esc(abbr(oppName))}</b>`}</span>` : ''}</div>`;
}
function fedVignette(fed) {
  return `<div class="poster fill vig" style="background:radial-gradient(120% 80% at 50% 30%,hsl(${hashHue(fed)},45%,30%),#0A1A24 120%)" aria-hidden="true"><span class="vig-abbr" style="font-size:${fed.length <= 4 ? 34 : fed.length <= 7 ? 24 : 17}px">${esc(fed)}</span></div>`;
}
function viewHisto() {
  const months = activeMonths();
  ui.histo = clamp(ui.histo, 0, months.length - 1);
  const mk = months[ui.histo];
  const evs = realEvents().filter((e) => monthKey(e.ts) === mk);
  const goals = goalResults(mk, evs);
  const badges = badgeStates().filter((b) => b.won && b.ts && monthKey(b.ts) === mk);
  const groups = monthGroups(mk);
  const year = mk.slice(0, 4);
  const catchN = evs.filter((e) => e.kind === 'catch' || (e.kind === 'ep' && e.type === 'catch')).length;
  let h = `<div class="head"><h1 class="h1">Historique</h1>${levelChip()}</div>${demoBanner()}
    <div class="row"><button class="icon-btn" data-a="histo" data-v="1" aria-label="Mois précédent" ${ui.histo >= months.length - 1 ? 'disabled style="opacity:.3"' : ''}>${svgIcon('chevL', 18)}</button>
      <span class="grow" style="text-align:center;font-family:var(--f-title);font-weight:700;font-size:22px;letter-spacing:2px;text-transform:uppercase">${monthLabel(mk)}</span>
      <button class="icon-btn" data-a="histo" data-v="-1" aria-label="Mois suivant" ${ui.histo <= 0 ? 'disabled style="opacity:.3"' : ''}>${svgIcon('chevR', 18)}</button></div>
    <section class="glass pad col" style="gap:14px" aria-label="Résumé du mois">
      <div class="row between" style="align-items:flex-end"><div class="col" style="gap:2px"><span class="label">XP gagnée</span><span class="gtext" style="font-family:var(--f-title);font-weight:800;font-size:48px;line-height:.95">+${fmtNum(monthXp(mk))} XP</span></div>
      ${goals.length ? `<span class="pill amber">Objectifs ${goals.filter((g) => g.met).length} / ${goals.length}</span>` : ''}</div>
      <div class="counters">${[['épisodes', countCat(evs, 'episodes')], ['films', countCat(evs, 'films')], ['tomes', countCat(evs, 'tomes')], [catchN ? 'catch' : 'matchs', catchN ? catchN : countCat(evs, 'matchs')]].map(([l, v]) => `<div class="counter"><b>${v}</b><span class="label">${l}</span></div>`).join('')}</div>
      ${catchN ? `<span class="small muted" style="text-align:center">${plural(countCat(evs, 'matchs'), 'match')} ce mois-ci</span>` : ''}
    </section>`;
  if (badges.length) h += `<section class="section"><h2 class="h2">Badges du mois</h2><div class="grid3">${badges.map((b) => `<div class="badge-cell amber-card" style="padding:12px 6px"><span class="medal" style="width:46px;height:46px">${svgIcon(b.icon, 22)}</span><b style="font-size:12px">${esc(b.label)}</b><span class="muted">${esc(fmtDay(b.ts))}</span></div>`).join('')}</div></section>`;
  h += `<section class="section"><h2 class="h2">Vu et lu</h2>${groups.length ? `<div class="grid3">${groups.map((g) => `<${g.href ? `a href="${g.href}"` : 'div'} class="tile">${g.poster}<span class="t ellipsis">${esc(g.title)}</span><span class="d">${esc(g.kind)} · ${esc(g.detail)}</span></${g.href ? 'a' : 'div'}>`).join('')}</div>` : `<div class="empty">Rien de noté ce mois-ci.</div>`}</section>
    <a class="btn accent block" href="#rewind-${year}">${svgIcon('redo', 18)}Ton Rewind ${year}</a>`;
  return `<main class="view">${h}</main>${navHtml('histo')}`;
}

/* ---------- Rewind (bilan annuel) ---------- */
function viewRewind(year) {
  year = String(year || new Date().getFullYear());
  const evs = realEvents().filter((e) => String(new Date(e.ts).getFullYear()) === year);
  const content = evs.filter((e) => !isBonus(e));
  const xp = activeMonths().filter((mk) => mk.startsWith(year)).reduce((a, mk) => a + monthXp(mk), 0);
  const minutes = content.reduce((a, e) => a + (e.rt || 0), 0);
  const pages = evs.filter((e) => e.kind === 'livre_fin').reduce((a, e) => a + (e.pages || 0), 0);
  const byMonth = {}; content.forEach((e) => { const m = new Date(e.ts).getMonth(); byMonth[m] = (byMonth[m] || 0) + 1; });
  const topMonth = Object.entries(byMonth).sort((a, b) => b[1] - a[1])[0];
  const byItem = {}; content.filter((e) => state.items[e.item]).forEach((e) => { byItem[e.item] = (byItem[e.item] || 0) + 1; });
  const topItem = Object.entries(byItem).sort((a, b) => b[1] - a[1])[0];
  const byType = {}; content.forEach((e) => { const t = e.kind === 'match' ? 'sport' : e.type; byType[t] = (byType[t] || 0) + 1; });
  const topType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0];
  const finished = Object.values(state.items).filter((i) => evs.some((e) => e.item === i.id) && i.status === 'termine');
  const badges = badgeStates().filter((b) => b.won && b.ts && String(new Date(b.ts).getFullYear()) === year);
  const it = topItem && state.items[topItem[0]];
  const typeName = topType ? (topType[0] === 'sport' ? 'le sport' : TYPES[topType[0]] ? TYPES[topType[0]].plural.toLowerCase() : topType[0]) : '';
  let h = `<div class="row"><a class="icon-btn dark" href="#histo" aria-label="Retour">${svgIcon('back', 20)}</a></div>
    <section class="rw-hero col" style="gap:10px"><span class="label cyan">Ton année ${year}</span><span class="rw-big">REWIND<br><span class="gtext">${year}</span></span>
      <span style="font-size:15px;color:#CFE3EA">${content.length ? `${plural(content.length, 'moment')} noté${content.length > 1 ? 's' : ''}, ${fmtNum(minutes / 60)} h devant l’écran ou dans les pages, et ${fmtNum(xp)} XP gagnés.` : 'Rien de noté cette année pour l’instant. Reviens en fin d’année !'}</span></section>`;
  if (content.length) {
    h += `<div class="grid2">${[[countCat(evs, 'episodes'), 'épisodes'], [countCat(evs, 'films'), 'films'], [countCat(evs, 'tomes'), 'tomes et livres'], [pages, 'pages lues'], [countCat(evs, 'matchs'), 'matchs'], [evs.filter((e) => e.kind === 'catch' || (e.kind === 'ep' && e.type === 'catch')).length, 'shows de catch'], [evs.filter((e) => e.kind === 'jeu').length, 'jeux terminés'], [finished.length, 'œuvres terminées']].map(([v, l]) => `<div class="rw-stat"><b>${fmtNum(v)}</b><span class="label">${l}</span></div>`).join('')}</div>`;
    if (it) h += `<section class="glass pad row" style="gap:14px">${itemPoster(it, 'md')}<div class="col grow"><span class="label amber">Œuvre de l’année</span><span class="h3">${esc(it.title)}</span><span class="small muted">${plural(topItem[1], 'moment')} passé${topItem[1] > 1 ? 's' : ''} avec elle</span></div></section>`;
    h += `<div class="grid2">${topMonth ? `<div class="rw-stat"><span class="label">Mois le plus actif</span><b style="font-size:26px">${esc(MONTHS[topMonth[0]])}</b></div>` : ''}${topType ? `<div class="rw-stat"><span class="label">Ta passion</span><b style="font-size:26px">${esc(typeName)}</b></div>` : ''}
      <div class="rw-stat"><span class="label">Niveau</span><b>${levelInfo().lvl}</b></div><div class="rw-stat"><span class="label">Badges</span><b>${badges.length}</b></div></div>`;
    if (badges.length) h += `<section class="section"><h2 class="h2">Badges de l’année</h2><div class="grid4">${badges.map((b) => `<div class="badge-cell"><span class="medal lg">${svgIcon(b.icon, 24)}</span>${esc(b.label)}</div>`).join('')}</div></section>`;
  }
  return `<main class="view">${h}</main>`;
}

/* ---------- Profil ---------- */
function viewProfil() {
  const L = levelInfo(); const mk = monthKey(now()); const goals = goalResults(mk);
  const bs = badgeStates(); const won = bs.filter((b) => b.won);
  const s = state.settings;
  const deg = Math.round((L.pct / 100) * 360);
  return `<main class="view"><div class="head"><h1 class="h1">Profil</h1></div>${demoBanner()}
  <section class="glass pad row" style="gap:16px" aria-label="Niveau">
    <div class="ring" role="img" aria-label="Niveau ${L.lvl}, ${L.into} XP sur ${L.need}" style="background:conic-gradient(#7FD6F0 0deg,#B9A8FF ${deg}deg,rgba(255,255,255,.08) ${deg}deg)"><div><span class="label">Niveau</span><b>${L.lvl}</b></div></div>
    <div class="col grow" style="gap:6px"><span class="gtext" style="font-family:var(--f-title);font-weight:800;font-size:28px;line-height:1">${fmtNum(L.into)} / ${fmtNum(L.need)} XP</span>
      <span class="small" style="color:#CFE3EA">Plus que ${fmtNum(L.need - L.into)} XP avant le niveau ${L.lvl + 1}</span><span class="small muted">Total : ${fmtNum(L.xp)} XP</span></div>
  </section>
  <section class="glass pad col" style="gap:12px" aria-label="Objectifs du mois">
    <div class="row between"><h2 class="h2" style="color:var(--text)">Objectifs de ${esc(MONTHS[new Date().getMonth()])}</h2><button class="link" data-a="edit-goals">Modifier</button></div>
    ${goals.length ? goals.map((g) => `<div class="col" style="gap:6px"><div class="row between"><span style="font-weight:600">${esc(g.label)}</span><span class="label ${g.met ? 'amber' : ''}">${g.count} / ${g.target}</span></div>${bar(Math.round((g.count / g.target) * 100), 'thin' + (g.met ? ' amber' : ''))}</div>`).join('') : '<span class="muted small">Aucun objectif ce mois-ci.</span>'}
    <span class="small muted">Chaque objectif atteint rapporte ${XP.goal} XP.</span>
  </section>
  <section class="section" aria-label="Badges"><div class="row between"><h2 class="h2">Badges</h2><span class="label">${won.length} / ${bs.length}</span></div>
    <div class="grid4">${bs.sort((a, b) => (b.won ? 1 : 0) - (a.won ? 1 : 0)).map((b) => `<div class="badge-cell ${b.won ? '' : 'locked'}"><span class="medal lg ${b.won ? '' : 'locked'}">${svgIcon(b.won ? b.icon : 'lock', 24)}</span>${esc(b.label)}${b.won && b.ts ? `<span class="muted" style="font-size:10px">${esc(fmtDay(b.ts))}</span>` : ''}</div>`).join('')}</div></section>
  <section class="glass pad col" style="gap:12px" aria-label="Réglages">
    <h2 class="h2" style="color:var(--text)">Réglages</h2>
    <form class="col" style="gap:12px" data-form="keys">
      <label class="field"><span>Clé TMDB (films, séries, docus)</span><input class="input" name="tmdb" value="${esc(s.tmdbKey)}" autocomplete="off" spellcheck="false" placeholder="Clé API ou jeton d’accès"></label>
      <label class="field"><span>Clé RAWG (jeux vidéo, facultatif)</span><input class="input" name="rawg" value="${esc(s.rawgKey)}" autocomplete="off" spellcheck="false" placeholder="Clé API RAWG"></label>
      <span class="small muted">Tes clés restent sur ce téléphone. AniList (anime, manga), Open Library (livres) et TheSportsDB (sport) n’en demandent pas.</span>
      <div class="row"><button class="btn accent grow" type="submit">Enregistrer</button><button class="btn" type="button" data-a="test-tmdb">Tester TMDB</button></div>
    </form>
  </section>
  <section class="glass pad col" style="gap:12px" aria-label="Sauvegarde">
    <h2 class="h2" style="color:var(--text)">Sauvegarde</h2>
    <span class="small muted">Tes données sont uniquement sur ce téléphone. Exporte-les régulièrement.${state.lastExport ? ' Dernier export : ' + esc(fmtDate(state.lastExport)) + '.' : ' Aucun export pour l’instant.'}</span>
    <div class="grid2"><button class="btn" data-a="export">${svgIcon('download', 18)}Exporter</button>
      <label class="btn" style="cursor:pointer">${svgIcon('upload', 18)}Importer<input type="file" accept="application/json,.json" data-change="import" class="sr"></label></div>
    <button class="link" data-a="copy-data" style="align-self:center">Copier les données (si l’export ne marche pas)</button>
  </section>
  <section class="col" style="gap:8px">
    ${!state.demo && !Object.values(state.items).some((i) => i.type !== 'catch') ? `<button class="btn block" data-a="load-demo">Charger des données de démo</button>` : ''}
    <button class="btn danger block" data-a="wipe">${svgIcon('trash', 18)}Tout effacer</button>
    <span class="small muted" style="text-align:center;line-height:1.6">Rewind ${APP_VERSION} · Films et séries : TMDB (ce produit utilise l’API TMDB mais n’est ni approuvé ni certifié par TMDB) · Anime et manga : AniList · Livres : Open Library · Jeux : RAWG · Sport : TheSportsDB</span>
  </section></main>${navHtml('profil')}`;
}

/* ---------- Ajouter ---------- */
function viewAjouter(arg) {
  const a = ui.add;
  if (arg && ADD_TYPES.includes(arg) && a.type !== arg) { Object.assign(a, { type: arg, results: null, picked: null, manual: false, error: '' }); }
  let h = `<div class="row"><button class="icon-btn dark" data-a="back" aria-label="Retour">${svgIcon('back', 20)}</button><h1 class="h1 grow" style="font-size:34px">Ajouter</h1></div>
    <div class="chips" role="group" aria-label="Type">${ADD_TYPES.map((t) => `<button class="chip ${a.type === t ? 'on' : ''}" data-a="add-type" data-v="${t}">${t === 'sport' ? 'Match' : t === 'catch' ? 'Catch' : esc(TYPES[t].label)}</button>`).join('')}</div>`;
  if (a.type === 'sport') return `<main class="view">${h}${matchForm()}</main>`;
  if (a.type === 'catch') return `<main class="view">${h}${catchForm()}</main>`;
  if (a.picked) return `<main class="view">${h}${pickedPanel()}</main>`;
  if (a.manual) return `<main class="view">${h}${manualForm()}</main>`;
  h += `<form class="search" data-form="search"><label class="grow"><span class="sr">Rechercher</span><input class="input" name="q" value="${esc(a.q)}" placeholder="Titre à rechercher…" autocomplete="off" enterkeyhint="search"></label><button class="icon-btn" style="width:48px;height:48px;border-radius:14px" type="submit" aria-label="Rechercher">${svgIcon('search', 20)}</button></form>`;
  if (a.loading) h += `<div class="empty">Recherche…</div>`;
  if (a.error) h += `<div class="banner warn">${esc(a.error)}</div>`;
  if (a.results) {
    if (!a.results.length) h += `<div class="empty">Aucun résultat.</div>`;
    a.results.forEach((r, i) => { h += `<button class="result" data-a="pick" data-i="${i}">${posterHtml(r.title, r.poster, 'sm')}<div class="col grow" style="gap:3px"><span style="font-weight:700">${esc(r.title)}</span><span class="small muted">${esc([r.year, r.sub].filter(Boolean).join(' · '))}</span></div></button>`; });
  }
  h += `<button class="btn block" data-a="add-manual">${svgIcon('edit', 18)}Ajouter à la main</button>`;
  return `<main class="view">${h}</main>`;
}
function statusPicker() {
  const a = ui.add;
  if (a.catchup === null) a.catchup = defaultCatchup(a.status);
  return `<div class="field"><span>Statut</span><div class="seg">${[['envie', 'Envie'], ['encours', 'En cours'], ['termine', 'Terminé']].map(([k, l]) => `<button type="button" class="${a.status === k ? 'on' : ''}" data-a="add-status" data-v="${k}">${l}</button>`).join('')}</div></div>
    ${a.status !== 'envie' ? `<label class="toggle"><input type="checkbox" data-change="add-catchup" ${a.catchup ? 'checked' : ''}><span class="sw"></span><span class="col grow" style="gap:2px"><b style="font-size:14px">Déjà vu ou lu avant aujourd’hui</b><span class="small muted">Rattrapage : ce que tu coches maintenant ne rapporte pas d’XP et n’entre pas dans l’historique.</span></span></label>` : ''}`;
}
// pendant les 2 premières semaines, ce qu'on ajoute "en cours" est probablement déjà entamé : rattrapage par défaut
function defaultCatchup(status) { return status === 'termine' || (status === 'encours' && now() - state.createdAt < 14 * DAY); }
function pickedPanel() {
  const a = ui.add; const r = a.picked; const t = a.type;
  const needsTomes = t === 'bd' || t === 'livre' || (t === 'manga' && !r.volumes);
  return `<form class="col" style="gap:14px" data-form="confirm-add">
    <div class="glass pad row" style="gap:14px">${posterHtml(r.title, r.poster, 'md')}<div class="col grow" style="gap:4px"><span class="label cyan">${esc(TYPES[t].label)}</span><span class="h3" style="font-size:24px">${esc(r.title)}</span><span class="small muted">${esc([r.year, r.sub].filter(Boolean).join(' · '))}</span></div></div>
    ${statusPicker()}
    ${needsTomes || t === 'manga' ? `<label class="field"><span>Nombre de tomes${t === 'livre' ? ' (1 pour un livre seul)' : ''}</span><input class="input" name="tomes" type="number" min="1" max="300" inputmode="numeric" value="${esc(a.tomes || r.volumes || 1)}"></label>` : ''}
    ${t === 'livre' ? `<label class="field"><span>Pages par tome</span><input class="input" name="pages" type="number" min="1" inputmode="numeric" value="${esc(a.pages || r.pages || '')}" placeholder="Ex. 350"></label><span class="small muted">Les pages servent à calculer l’XP : environ 1 XP pour 2 pages, 100 XP minimum.</span>` : ''}
    <button class="btn chrome block" type="submit" ${a.loading ? 'disabled' : ''}>${a.loading ? 'Ajout…' : 'Ajouter'}</button>
    ${a.error ? `<div class="banner warn">${esc(a.error)}</div>` : ''}
    <button class="btn block" type="button" data-a="unpick">Changer de titre</button></form>`;
}
function manualForm() {
  const a = ui.add; const t = a.type;
  const eps = t === 'serie' || t === 'anime' || t === 'doc';
  return `<form class="col" style="gap:14px" data-form="manual-add">
    <label class="field"><span>Titre</span><input class="input" name="title" required autocomplete="off"></label>
    <label class="field"><span>Année (facultatif)</span><input class="input" name="year" inputmode="numeric" maxlength="4"></label>
    ${eps ? `<label class="field"><span>Épisodes par saison</span><input class="input" name="seasons" placeholder="Ex. 10, 8, 12 (vide pour un docu unique)" ${t === 'doc' ? '' : 'required'}></label>
      <label class="toggle"><input type="checkbox" name="ended" checked><span class="sw"></span><span class="grow"><b style="font-size:14px">Série terminée</b><br><span class="small muted">Décoche si de nouveaux épisodes vont sortir.</span></span></label>` : ''}
    ${t === 'bd' || t === 'manga' || t === 'livre' ? `<label class="field"><span>Nombre de tomes</span><input class="input" name="tomes" type="number" min="1" max="300" value="1" inputmode="numeric"></label>` : ''}
    ${t === 'livre' ? `<label class="field"><span>Pages par tome</span><input class="input" name="pages" type="number" min="1" inputmode="numeric" placeholder="Ex. 350"></label>` : ''}
    ${t === 'film' || t === 'doc' ? `<label class="field"><span>Durée en minutes (facultatif)</span><input class="input" name="runtime" type="number" min="1" inputmode="numeric"></label>` : ''}
    ${statusPicker()}
    <button class="btn chrome block" type="submit">Ajouter</button>
    <button class="btn block" type="button" data-a="add-search">Revenir à la recherche</button></form>`;
}
function matchForm() {
  const d = new Date(); const local = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + 'T' + pad2(d.getHours()) + ':00';
  return `<div class="banner info">${svgIcon('sync', 18)}<span class="grow">Les matchs des Sixers et du Milan arrivent tout seuls.</span><button class="link" data-a="sport-sync">Actualiser</button></div>
  <form class="col" style="gap:14px" data-form="match-add">
    <label class="field"><span>Sport</span><select class="input" name="sport"><option value="nba">Basket</option><option value="foot">Football</option><option value="autre">Autre</option></select></label>
    <label class="field"><span>Compétition</span><input class="input" name="league" placeholder="Ex. NBA, Serie A, Ligue des champions"></label>
    <div class="grid2"><label class="field"><span>Domicile</span><input class="input" name="home" required></label><label class="field"><span>Extérieur</span><input class="input" name="away" required></label></div>
    <label class="field"><span>Date et heure</span><input class="input" name="date" type="datetime-local" value="${local}" required></label>
    <div class="grid2"><label class="field"><span>Score dom. (facult.)</span><input class="input" name="hs" type="number" min="0" inputmode="numeric"></label><label class="field"><span>Score ext.</span><input class="input" name="as" type="number" min="0" inputmode="numeric"></label></div>
    <label class="field"><span>Vu en</span><select class="input" name="mode"><option value="direct">Direct</option><option value="differe" selected>Différé</option><option value="resume">Résumé</option><option value="">Pas encore vu</option></select></label>
    <button class="btn chrome block" type="submit">Ajouter le match</button></form>`;
}
function posterField(cur) {
  return `<div class="field"><span>Affiche (facultatif)</span>
    <div class="row" style="gap:12px;align-items:center"><div class="poster sm" data-poster-preview style="background:${grad('affiche')}">${cur ? `<img src="${esc(cur)}" alt="">` : `<span class="ph">${svgIcon('upload', 18)}</span>`}</div>
      <div class="col grow" style="gap:8px"><label class="btn" style="cursor:pointer">${svgIcon('upload', 18)}Choisir une image<input type="file" accept="image/*" data-change="poster-file" class="sr"></label>
      <input class="input" name="posterUrl" data-keep="url" placeholder="ou colle un lien d’image" autocomplete="off" inputmode="url"></div></div>
    <input type="hidden" name="posterData" value="${cur && cur.startsWith('data:') ? esc(cur) : ''}"></div>`;
}
function catchForm() {
  const a = ui.add; const cf = a.cf || (a.cf = {});
  if (!a.fed || !state.feds.some((f) => f.name === a.fed)) a.fed = state.feds[0] ? state.feds[0].name : 'AEW';
  const major = fedKind(a.fed) === 'major';
  const kind = major ? (a.ckind === 'ppv' ? 'ppv' : 'hebdo') : 'show';
  const plan = !!a.cplan;
  const d = new Date(); const today = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  return `<form class="col" style="gap:14px" data-form="catch-add">
    <div class="seg"><button type="button" class="${plan ? '' : 'on'}" data-a="catch-plan" data-v="0">Déjà vu</button><button type="button" class="${plan ? 'on' : ''}" data-a="catch-plan" data-v="1">À venir</button></div>
    <div class="field"><span>Fédération</span><div class="chips">${state.feds.map((f) => `<button type="button" class="chip ${a.fed === f.name ? 'on' : ''}" data-a="catch-fed" data-v="${esc(f.name)}">${esc(f.name)}</button>`).join('')}<button type="button" class="chip" data-a="feds-open">+ Fédération</button></div></div>
    <div class="field"><span>Type</span>${major
      ? `<div class="seg"><button type="button" class="${kind === 'hebdo' ? 'on' : ''}" data-a="catch-kind" data-v="hebdo">Hebdo (+${XP.catchHebdo} XP)</button><button type="button" class="${kind === 'ppv' ? 'on' : ''}" data-a="catch-kind" data-v="ppv">PPV (+${XP.catchPPV} XP)</button></div>`
      : `<div class="pill" style="align-self:flex-start">Show (+${XP.catchShow} XP)</div>`}</div>
    <label class="field"><span>Nom</span><input class="input" name="show" data-keep="show" value="${esc(cf.show || '')}" placeholder="${major ? 'Ex. Collision, Full Gear…' : 'Ex. Anarchie, Doomsday…'}" ${plan ? 'required' : ''} autocomplete="off"></label>
    <div class="grid2"><label class="field"><span>Date</span><input class="input" name="date" data-keep="date" type="date" value="${esc(cf.date || today)}" required></label>
      <label class="field"><span>Heure</span><input class="input" name="time" data-keep="time" type="time" value="${esc(cf.time || (major ? '02:00' : '19:00'))}"></label></div>
    ${plan ? '' : `<label class="field"><span>Vu en</span><select class="input" name="mode" data-keep="mode">${Object.keys(MODES).map((k) => `<option value="${k}" ${(cf.mode || 'differe') === k ? 'selected' : ''}>${MODES[k]}${k === 'resume' ? ` (+${XP.catchResume} XP)` : ''}</option>`).join('')}</select></label>`}
    ${posterField(a.cposter)}
    ${plan ? '' : `<label class="field"><span>Un mot (facultatif)</span><input class="input" name="note" data-keep="note" value="${esc(cf.note || '')}" placeholder="Ex. main event incroyable"></label>`}
    <button class="btn chrome block" type="submit">${plan ? 'Programmer le show' : 'Noter dans le journal'}</button>
    <span class="small muted">${plan ? 'Le jour J, le show apparaît dans En cours. Une fois passé, Rewind te demande si tu l’as vu.' : 'Pour AEW Dynamite, utilise plutôt sa fiche dans Biblio › Catch : chaque épisode s’y coche comme une série.'}</span></form>`;
}
function fedsModal() {
  openModal('Fédérations', `<div class="col" style="gap:10px">${state.feds.map((f, i) => `<div class="card-row" style="padding:8px 10px"><b class="grow">${esc(f.name)}</b>
      <div class="seg" style="width:auto"><button class="${f.kind === 'major' ? 'on' : ''}" data-a="fed-kind" data-i="${i}" data-v="major">Major</button><button class="${f.kind === 'inde' ? 'on' : ''}" data-a="fed-kind" data-i="${i}" data-v="inde">Indé</button></div>
      <button class="icon-btn dark" data-a="fed-del" data-i="${i}" aria-label="Retirer ${esc(f.name)}">${svgIcon('trash', 16)}</button></div>`).join('')}
    <span class="small muted">Major : Hebdo et PPV. Indé : Show.</span>
    <form class="row" style="gap:8px" data-form="fed-add"><input class="input grow" name="name" placeholder="Ex. GCW" required autocomplete="off"><select class="input" name="kind" style="width:auto"><option value="inde">Indé</option><option value="major">Major</option></select><button class="btn chrome" type="submit">Ajouter</button></form>
    <button class="btn block" data-a="modal-close">Fermer</button></div>`);
}
function showModal(s) {
  const past = s.ts < now();
  openModal(s.name, `<div class="col" style="gap:12px">${s.poster ? `<img src="${esc(s.poster)}" alt="Affiche de ${esc(s.name)}" style="width:100%;border-radius:12px;max-height:60vh;object-fit:contain;background:#000">` : ''}
    <span class="label cyan">${esc(s.fed)} · ${esc(CKINDS[s.kind] || 'Show')} · ${esc(fmtMatch(s.ts))}</span>
    ${past && !s.seen ? `<div class="seg">${Object.keys(MODES).map((k) => `<button data-a="show-seen" data-id="${s.id}" data-mode="${k}">${MODES[k]}</button>`).join('')}</div>` : ''}
    <div class="grid2"><button class="btn danger" data-a="show-del" data-id="${s.id}">${svgIcon('trash', 16)}Supprimer</button><button class="btn" data-a="modal-close">Fermer</button></div></div>`);
}

/* ---------- Fiche œuvre ---------- */
function viewItem(id) {
  const it = state.items[id];
  if (!it) return `<main class="view"><div class="empty">Cette œuvre n’existe plus.<br><a href="#biblio">Retour à la bibliothèque</a></div></main>`;
  const sh = shape(it); const p = progress(it); const pass = curPass(it);
  const bg = it.backdrop || it.poster;
  let h = `<section class="detail-hero" aria-label="${esc(it.title)}"><div class="bg" style="background:${grad(it.title)}">${bg ? `<img src="${esc(bg)}" alt="" loading="lazy">` : ''}</div>
    <button class="icon-btn dark back" data-a="back" aria-label="Retour">${svgIcon('back', 20)}</button>
    <button class="icon-btn dark menu" data-a="item-menu" data-id="${it.id}" aria-label="Options">${svgIcon('dots', 22)}</button>
    <div class="info">${itemPoster(it, 'md')}<div class="col grow" style="gap:6px;padding-bottom:2px">
      <span class="label cyan">${esc(TYPES[it.type].label)}${it.year ? ' · ' + esc(it.year) : ''}${sh === 'episodes' && it.seasons.length > 1 ? ' · ' + it.seasons.length + ' saisons' : ''}</span>
      <h1 class="detail-title">${esc(it.title)}</h1>
      ${sh !== 'film' && sh !== 'jeu' ? bar(pct(it)) + `<span class="label">${esc(progressText(it))} · ${pct(it)} %</span>` : `<span class="label">${esc(progressText(it))}</span>`}
    </div></div></section>
    <div class="seg" role="group" aria-label="Statut">${[['envie', 'Envie'], ['encours', 'En cours'], ['termine', 'Terminé']].map(([k, l]) => `<button class="${it.status === k ? 'on' : ''}" data-a="item-status" data-id="${it.id}" data-v="${k}">${l}</button>`).join('')}</div>`;
  if (pass.n > 1) h += `<div class="banner info">${svgIcon('redo', 18)}<span class="grow">Passage ${pass.n} (revisionnage) : moitié des XP.</span></div>`;
  if (it.status !== 'envie' || it.catchup) {
    h += `<label class="toggle"><input type="checkbox" data-change="catchup" data-id="${it.id}" ${it.catchup ? 'checked' : ''}><span class="sw"></span><span class="col grow" style="gap:2px"><b style="font-size:14px">Mode rattrapage</b><span class="small muted">${it.catchup ? 'Actif : tes coches ne donnent pas d’XP. Désactive-le quand tu es à jour.' : 'Pour cocher ce que tu avais vu avant, sans XP.'}</span></span></label>`;
  }
  if (sh === 'episodes') h += episodesBlock(it);
  else if (sh === 'tomes') h += tomesBlock(it);
  else if (sh === 'livre') h += livreBlock(it);
  else if (sh === 'jeu') h += jeuBlock(it);
  else h += filmBlock(it);
  if (it.overview) h += `<section class="section"><h2 class="h2">Résumé</h2><p style="margin:0;line-height:1.55;color:#CFE3EA;font-size:14px">${esc(it.overview)}</p></section>`;
  if ((sh === 'episodes' || sh === 'tomes' || sh === 'livre') && p.done > 0) {
    h += `<button class="btn block" data-a="rewatch" data-id="${it.id}">${svgIcon('redo', 18)}${it.type === 'livre' || it.type === 'bd' || it.type === 'manga' ? 'Commencer une relecture' : 'Commencer un revisionnage'}</button>`;
  }
  return `<main class="view no-pad-top">${h}</main>`;
}
function episodesBlock(it) {
  const pass = curPass(it);
  const nx = nextUnit(it);
  let sn = ui.season[it.id];
  if (!it.seasons.find((s) => s.n === sn)) sn = nx ? nx.s : it.seasons.length ? it.seasons[it.seasons.length - 1].n : 1;
  ui.season[it.id] = sn;
  const s = it.seasons.find((x) => x.n === sn);
  let h = '';
  if (it.seasons.length > 1) {
    h += `<div class="dropdown ${ui.ddOpen ? 'open' : ''}"><button data-a="dd" aria-haspopup="listbox" aria-expanded="${ui.ddOpen}"><span class="dd-title">${esc(s.name && !/^Saison \d+$/.test(s.name) ? s.name : 'Saison ' + s.n)}</span><span class="label">${it.seasons.length > 1 ? epCountDone(it, s) + ' / ' + s.count : ''}</span><span class="chev">${svgIcon('chevD', 18)}</span></button>
      ${ui.ddOpen ? `<div class="dd-list" role="listbox" aria-label="Choisir une saison">${it.seasons.map((x) => `<button role="option" aria-selected="${x.n === sn}" class="${x.n === sn ? 'on' : ''}" data-a="pick-season" data-id="${it.id}" data-v="${x.n}"><span class="grow">Saison ${x.n}</span>${seasonDone(it, x) ? `<span style="color:var(--amber)">${svgIcon('star', 14, true)}</span>` : ''}<span class="label">${epCountDone(it, x)} / ${x.count}</span></button>`).join('')}</div>` : ''}</div>`;
  }
  if (it.seasons.length > 1 && it.type !== 'catch') {
    const done = seasonDone(it, s);
    h += `<div class="badge-strip ${done ? 'won' : 'locked'}"><span class="medal ${done ? '' : 'locked'}">${svgIcon(done ? 'star' : 'lock', 16, done)}</span><div class="col grow" style="gap:1px"><span class="label ${done ? 'amber' : ''}" style="font-size:10px">${done ? 'Badge débloqué' : 'Badge à débloquer'}</span><b style="font-size:14px">${done ? 'Saison ' + s.n + ' terminée' : 'Encore ' + (s.count - epCountDone(it, s)) + ' ép. pour la saison ' + s.n}</b></div>
      <button class="link" data-a="season-all" data-id="${it.id}" data-v="${s.n}">${done ? 'Tout décocher' : 'Tout cocher'}</button></div>`;
  } else if (s && s.count) {
    h += `<div class="row between"><span class="label">${epCountDone(it, s)} / ${s.count} vus · appui long : cocher jusqu’ici</span><button class="link" data-a="season-all" data-id="${it.id}" data-v="${s.n}">${seasonDone(it, s) ? 'Tout décocher' : 'Tout cocher'}</button></div>`;
  }
  h += `<div class="col" style="gap:6px">`;
  for (let e = 1; e <= (s ? s.count : 0); e++) {
    const k = 's' + s.n + 'e' + e; const on = !!pass.done[k]; const ep = s.eps && s.eps[e - 1];
    const title = ep && ep.t ? ep.t : (it.type === 'catch' && ep && ep.date ? 'Épisode du ' + fmtDay(ep.date) : 'Épisode ' + e);
    const rt = (ep && ep.rt) || it.runtime;
    h += `<button class="ep ${on ? 'done' : 'spoil'}" data-a="ep" data-lp="ep-upto" data-id="${it.id}" data-k="${k}" aria-pressed="${on}">
      <span class="thumb" aria-hidden="true"><span class="grad" style="background:${grad(it.title + e)}"></span>${ep && ep.still ? `<img src="${esc(ep.still)}" alt="" loading="lazy">` : ''}${on ? '' : `<span class="eye">${svgIcon('eyeOff', 16)}</span>`}</span>
      <span class="col grow" style="gap:2px"><span class="label cyan" style="font-size:11px">É${e}${rt ? ' · ' + rt + ' min' : ''}</span><span class="ellipsis" style="font-weight:600;font-size:14px">${esc(title)}</span></span>
      <span class="check ${on ? 'on' : ''}">${on ? svgIcon('check', 15) : ''}</span></button>`;
  }
  h += `</div>`;
  if (!it.ended || it.type === 'catch' || (s && !s.count)) {
    h += `<button class="btn block" data-a="add-ep" data-id="${it.id}" data-v="${s ? s.n : 1}">${svgIcon('plus', 18)}${it.type === 'catch' ? 'Ajouter l’épisode de cette semaine' : 'Ajouter un épisode'}</button>`;
  }
  if (it.src && it.src.api === 'tmdb' && s && !s.eps && seasonLoading[it.id + ':' + s.n] !== 'fail') setTimeout(() => loadSeason(it, s.n), 0);
  return h;
}
function epCountDone(it, s) { const pass = curPass(it); let n = 0; for (let e = 1; e <= s.count; e++) if (pass.done['s' + s.n + 'e' + e]) n++; return n; }
function sagaStrip(it) {
  if (it.volumes.length < 2 || !it.ended) return '';
  const p = progress(it); const done = p.done >= p.total;
  return `<div class="badge-strip ${done ? 'won' : 'locked'}"><span class="medal ${done ? '' : 'locked'}">${svgIcon(done ? 'star' : 'lock', 16, done)}</span><div class="col grow" style="gap:1px"><span class="label ${done ? 'amber' : ''}" style="font-size:10px">${done ? 'Badge débloqué' : 'Badge à débloquer'}</span><b style="font-size:14px">${done ? 'Saga terminée' : 'Encore ' + Math.ceil(p.total - p.done) + ' tome' + (p.total - p.done > 1 ? 's' : '') + ' pour finir la saga'}</b></div></div>`;
}
function tomesBlock(it) {
  const pass = curPass(it);
  let h = sagaStrip(it) + `<div class="row between"><span class="label">Appui long : cocher jusqu’ici</span><button class="link" data-a="vol-all" data-id="${it.id}">${progress(it).done >= it.volumes.length ? 'Tout décocher' : 'Tout cocher'}</button></div><div class="tomes">`;
  it.volumes.forEach((v) => { const on = !!pass.done['t' + v.n]; h += `<button class="tome ${on ? 'on' : ''}" data-a="vol" data-lp="vol-upto" data-id="${it.id}" data-k="t${v.n}" aria-pressed="${on}" aria-label="Tome ${v.n}">${v.n}<small>${on ? 'LU' : 'TOME'}</small></button>`; });
  h += `</div><button class="btn block" data-a="add-vol" data-id="${it.id}">${svgIcon('plus', 18)}Ajouter un tome</button>`;
  return h;
}
function livreBlock(it) {
  const pass = curPass(it);
  let h = sagaStrip(it) + `<div class="col" style="gap:8px">`;
  it.volumes.forEach((v) => {
    const fin = !!pass.done['t' + v.n]; const mid = !!pass.done['t' + v.n + 'm'];
    const total = bookXp(v.pages);
    h += `<div class="book-row"><span class="tome ${fin ? 'on' : mid ? 'half' : ''}" style="width:52px;flex:none" aria-hidden="true">${v.n}<small>${fin ? 'LU' : mid ? '½' : 'TOME'}</small></span>
      <div class="col grow" style="gap:2px"><b style="font-size:14px">${it.volumes.length > 1 ? 'Tome ' + v.n : 'Le livre'}</b><span class="small muted">${v.pages ? v.pages + ' pages · ' : ''}${total + XP.livreFin} XP${pass.n > 1 ? ' (÷2)' : ''}</span></div>
      <button class="btn small ${mid ? 'accent' : ''}" data-a="book" data-id="${it.id}" data-k="t${v.n}m" aria-pressed="${mid}" ${fin && !mid ? 'disabled' : ''}>Moitié</button>
      <button class="btn small ${fin ? 'accent' : ''}" data-a="book" data-id="${it.id}" data-k="t${v.n}" aria-pressed="${fin}">Fini</button></div>`;
  });
  h += `</div><span class="small muted">« Moitié » te donne 40 % des XP tout de suite, le reste et +${XP.livreFin} XP à la fin.</span>`;
  if (it.volumes.length > 1 || it.type === 'livre') h += `<button class="btn block" data-a="add-vol" data-id="${it.id}">${svgIcon('plus', 18)}Ajouter un tome</button>`;
  return h;
}
function filmBlock(it) {
  const views = it.passes.filter((p) => p.done.v);
  let h = `<button class="btn chrome block" data-a="film-seen" data-id="${it.id}">${svgIcon(views.length ? 'redo' : 'check', 18)}${views.length ? 'Je l’ai revu' : 'Je l’ai vu'}</button>`;
  if (views.length) {
    h += `<section class="section"><h2 class="h2">Visionnages</h2>${views.map((p, i) => `<div class="card-row" style="padding:10px 12px"><span class="grow"><b>${i === 0 ? 'Premier visionnage' : 'Revisionnage ' + i}</b><br><span class="small muted">${it.catchup && i === 0 ? 'Avant Rewind' : esc(fmtDate(p.done.v))}</span></span>
      <button class="icon-btn dark" data-a="film-unsee" data-id="${it.id}" data-v="${p.n}" aria-label="Retirer ce visionnage">${svgIcon('x', 18)}</button></div>`).join('')}</section>`;
  }
  return h;
}
function jeuBlock(it) {
  const done = !!curPass(it).done.fin;
  return done
    ? `<div class="badge-strip won"><span class="medal">${svgIcon('game', 16)}</span><b class="grow">Terminé le ${esc(fmtDate(curPass(it).done.fin))}</b><button class="link" data-a="jeu-undo" data-id="${it.id}">Annuler</button></div>`
    : `<button class="btn chrome block" data-a="jeu-done" data-id="${it.id}">${svgIcon('check', 18)}J’ai terminé ce jeu (+${XP.jeu} XP)</button>`;
}

/* ---------- Fiche match ---------- */
function viewMatch(id) {
  const m = state.matches[id];
  if (!m) return `<main class="view"><div class="empty">Match introuvable.<br><a href="#biblio">Retour</a></div></main>`;
  const side = favTeamSide(m); const t = TEAMS[m.team];
  const show = m.seen || ui.reveal[id];
  const hasScore = m.hs != null && m.as != null;
  const fut = m.ts > now();
  const mode = ui.matchMode[id] || 'differe';
  const homeColor = side === 'home' && t ? t.c1 : `hsl(${hashHue(m.home)},45%,32%)`;
  const awayColor = side === 'away' && t ? t.c1 : `hsl(${hashHue(m.away)},45%,32%)`;
  let res = '';
  if (hasScore && side && show) { const mine = side === 'home' ? m.hs : m.as; const other = side === 'home' ? m.as : m.hs; res = mine > other ? 'Victoire' : mine < other ? 'Défaite' : 'Nul'; }
  let h = `<section class="match-hero" style="background:linear-gradient(115deg,${homeColor}99 0%,rgba(6,20,28,.2) 50%,${awayColor}99 100%)">
    <button class="icon-btn dark back" data-a="back" aria-label="Retour">${svgIcon('back', 20)}</button>
    <span class="comp label" style="color:#CFE3EA">${esc(m.league || (m.sport === 'nba' ? 'Basket' : 'Football'))}</span>
    <div class="teams"><div class="team">${teamDisc(m.home, side === 'home' ? m.team : null, '', m.homeId)}<span class="nm">${esc(m.home)}</span><span class="small muted">Domicile</span></div>
      <div class="score">${hasScore ? (show ? `<span class="num">${m.hs} – ${m.as}</span>${res ? `<span class="label cyan">${res}</span>` : ''}` : `<div class="masked"><span class="num" aria-hidden="true">${m.hs} – ${m.as}</span><span class="pill">${svgIcon('eyeOff', 14)}Score masqué</span></div>`) : `<span class="num" style="font-size:34px">${fut ? 'À venir' : '– : –'}</span>`}
        <span class="small" style="color:#CFE3EA">${esc(fmtMatch(m.ts))}</span></div>
      <div class="team">${teamDisc(m.away, side === 'away' ? m.team : null, '', m.awayId)}<span class="nm">${esc(m.away)}</span><span class="small muted">Extérieur</span></div></div></section>`;
  if (m.seen) {
    h += `<section class="glass pad col" style="gap:12px"><h2 class="h3">Match vu</h2><div class="badge-strip won"><span class="medal">${svgIcon('star', 15, true)}</span><b class="grow">Vu en ${esc(MODES[m.seen.mode].toLowerCase())} · +${m.seen.mode === 'resume' ? XP.matchResume : XP.match} XP</b><button class="link" data-a="match-unsee" data-id="${id}">Annuler</button></div></section>`;
  } else if (!fut) {
    h += `<section class="glass pad col" style="gap:12px"><h2 class="h3">Tu as vu ce match ?</h2>
      <div class="seg" role="radiogroup" aria-label="Mode de visionnage">${Object.keys(MODES).map((k) => `<button role="radio" aria-checked="${mode === k}" class="${mode === k ? 'on' : ''}" data-a="match-mode" data-id="${id}" data-v="${k}" style="height:56px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px">${MODES[k]}<span class="label amber" style="font-size:10px">+${k === 'resume' ? XP.matchResume : XP.match} XP</span></button>`).join('')}</div>
      <button class="btn chrome block" data-a="match-seen" data-id="${id}" data-mode="${mode}">${svgIcon('check', 18)}Marquer vu${hasScore ? ' et révéler' : ''}</button>
      <div class="row between">${hasScore && !show ? `<button class="link" data-a="reveal" data-id="${id}">Révéler sans marquer</button>` : '<span></span>'}${m.dismissed ? '<span class="label">Marqué « pas vu »</span>' : `<button class="link" data-a="match-dismiss" data-id="${id}">Pas vu</button>`}</div></section>`;
  }
  if (t) {
    const season = seasonOf(m.ts);
    const list = Object.values(state.matches).filter((x) => x.team === m.team && seasonOf(x.ts) === season && x.ts < now()).sort((a, b) => b.ts - a.ts);
    const seenN = list.filter((x) => x.seen).length;
    h += `<section class="glass pad col" style="gap:10px"><div class="row between"><h2 class="h2" style="color:var(--text)">${esc(t.short)} ${season}</h2><span class="label">${seenN} / ${t.total} vus</span></div>${bar(Math.round((seenN / t.total) * 100), 'thin')}
      ${list.slice(0, 6).map((x) => { const sd = favTeamSide(x); const opp = sd === 'home' ? 'vs ' + x.away : '@ ' + x.home; return `<a class="row" href="#match-${x.id}" style="height:44px;padding:0 12px;border-radius:12px;background:rgba(255,255,255,.04);color:inherit;text-decoration:none"><span class="small muted" style="width:56px">${esc(fmtDay(x.ts))}</span><span class="grow ellipsis" style="font-weight:600;font-size:14px">${esc(opp)}</span><span class="pill ${x.seen ? 'cyan' : ''}">${x.seen ? esc(MODES[x.seen.mode]) : 'Non vu'}</span></a>`; }).join('')}</section>`;
  }
  if (!m.ext) h += `<button class="btn danger block" data-a="match-del" data-id="${id}">${svgIcon('trash', 18)}Supprimer ce match</button>`;
  return `<main class="view no-pad-top">${h}</main>`;
}

/* =========================================================
   10. Modales
   ========================================================= */
function modalHtml() {
  if (!ui.modal) return '';
  return `<div class="modal-bg" data-a="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(ui.modal.title || '')}">${ui.modal.title ? `<h2 class="h3">${esc(ui.modal.title)}</h2>` : ''}${ui.modal.html}</div></div>`;
}
function openModal(title, html, extra) { ui.modal = Object.assign({ title, html }, extra || {}); render(); }
function closeModal() { ui.modal = null; render(); }
function confirmBox(title, text, yesLabel, onYes, danger) {
  openModal(title, `<p style="margin:0;line-height:1.5;color:#CFE3EA">${text}</p><div class="grid2"><button class="btn" data-a="modal-close">Annuler</button><button class="btn ${danger ? 'danger' : 'chrome'}" data-a="modal-yes">${esc(yesLabel)}</button></div>`, { onYes });
}

/* =========================================================
   11. Actions
   ========================================================= */
function withXp(fn) {
  const before = totalXp(); fn(); const gained = totalXp() - before;
  checkUnlocks(); save(); render();
  if (gained > 0) toast(`<span class="xp-pop">+${gained} XP</span>`, '', 1600);
}
function doNext(it) {
  const nx = nextUnit(it); if (!nx) return;
  if (shape(it) === 'jeu') { askJeuDone(it); return; }
  withXp(() => { if (shape(it) === 'film' && curPass(it).done.v) newPass(it); setDone(it, nx.key, true); touched(it); });
}
function askJeuDone(it) { confirmBox('Jeu terminé ?', `Marquer <b>${esc(it.title)}</b> comme terminé ${it.catchup ? '(rattrapage, sans XP)' : `(+${XP.jeu} XP)`} ?`, 'Terminé', () => withXp(() => { setDone(it, 'fin', true); touched(it); })); }
function upTo(it, key) {
  const keys = shape(it) === 'episodes' ? epKeys(it) : volKeys(it);
  const idx = keys.indexOf(key); if (idx < 0) return;
  withXp(() => { keys.slice(0, idx + 1).forEach((k) => setDone(it, k, true)); touched(it); });
  if (navigator.vibrate) try { navigator.vibrate(20); } catch (e) { /* */ }
  toast('Coché jusqu’ici', '', 1400);
}
const ACT = {
  back() { if (history.length > 1) history.back(); else location.hash = '#encours'; },
  next(d) { const it = state.items[d.id]; if (it) doNext(it); },
  ep(d) { const it = state.items[d.id]; const on = !curPass(it).done[d.k]; withXp(() => { setDone(it, d.k, on); touched(it); }); },
  'ep-upto'(d) { upTo(state.items[d.id], d.k); },
  'vol-upto'(d) { upTo(state.items[d.id], d.k); },
  vol(d) { const it = state.items[d.id]; const on = !curPass(it).done[d.k]; withXp(() => { setDone(it, d.k, on); touched(it); }); },
  'vol-all'(d) { const it = state.items[d.id]; const all = progress(it).done >= it.volumes.length; withXp(() => { volKeys(it).forEach((k) => setDone(it, k, !all)); touched(it); }); },
  book(d) {
    const it = state.items[d.id]; const pass = curPass(it); const on = !pass.done[d.k];
    withXp(() => { setDone(it, d.k, on); touched(it); });
  },
  'season-all'(d) {
    const it = state.items[d.id]; const s = it.seasons.find((x) => x.n === +d.v); const all = seasonDone(it, s);
    withXp(() => { for (let e = 1; e <= s.count; e++) setDone(it, 's' + s.n + 'e' + e, !all); touched(it); });
  },
  dd() { ui.ddOpen = !ui.ddOpen; render(); },
  'pick-season'(d) { ui.season[d.id] = +d.v; ui.ddOpen = false; render(); },
  'add-ep'(d) {
    const it = state.items[d.id]; const s = it.seasons.find((x) => x.n === +d.v) || it.seasons[0];
    s.count++; if (s.eps || it.type === 'catch') { s.eps = s.eps || []; s.eps[s.count - 1] = it.type === 'catch' ? { date: now() } : null; }
    it.ended = it.type === 'catch' ? false : it.ended; touched(it); save(); render();
  },
  'add-vol'(d) { const it = state.items[d.id]; const last = it.volumes[it.volumes.length - 1]; it.volumes.push({ n: it.volumes.length + 1, pages: last ? last.pages : 0 }); touched(it); save(); render(); },
  'film-seen'(d) { const it = state.items[d.id]; withXp(() => { if (curPass(it).done.v) newPass(it); setDone(it, 'v', true); touched(it); }); },
  'film-unsee'(d) {
    const it = state.items[d.id]; const n = +d.v; const p = it.passes.find((x) => x.n === n); if (!p) return;
    withXp(() => {
      delete p.done.v; state.events = state.events.filter((e) => !(e.item === it.id && e.pass === n));
      if (it.passes.length > 1) { it.passes = it.passes.filter((x) => x.n !== n); it.passes.forEach((x, i) => { state.events.filter((e) => e.item === it.id && e.pass === x.n).forEach((e) => { e.pass = i + 1; }); x.n = i + 1; }); }
      refreshStatus(it); if (!it.passes.some((x) => x.done.v)) it.status = 'envie';
    });
  },
  'jeu-done'(d) { askJeuDone(state.items[d.id]); },
  'jeu-undo'(d) { const it = state.items[d.id]; withXp(() => { setDone(it, 'fin', false); it.status = 'encours'; }); },
  rewatch(d) {
    const it = state.items[d.id];
    confirmBox('Nouveau passage ?', `Tu repars de zéro sur <b>${esc(it.title)}</b>. Ton premier passage reste dans l’historique, et ce nouveau passage rapporte la moitié des XP.`, 'C’est parti', () => { newPass(it); it.status = 'encours'; it.updatedAt = now(); save(); closeModal(); });
  },
  'item-status'(d) {
    const it = state.items[d.id];
    if (d.v === 'termine' && progress(it).done < progress(it).total && shape(it) !== 'film' && shape(it) !== 'jeu') {
      confirmBox('Marquer comme terminé ?', 'Veux-tu aussi cocher tout ce qui reste ?' + (it.catchup ? ' (rattrapage : sans XP)' : ''), 'Tout cocher', () => { withXp(() => { markAll(it); touched(it); it.status = 'termine'; }); closeModal(); });
      ui.modal.html = ui.modal.html.replace('<div class="grid2">', `<button class="btn block" data-a="status-only" data-id="${it.id}">Changer seulement le statut</button><div class="grid2">`); render();
      return;
    }
    if (d.v === 'termine' && (shape(it) === 'film' || shape(it) === 'jeu') && !progress(it).done) { if (shape(it) === 'jeu') askJeuDone(it); else ACT['film-seen'](d); return; }
    it.status = d.v; it.updatedAt = now(); save(); render();
  },
  'status-only'(d) { const it = state.items[d.id]; it.status = 'termine'; it.updatedAt = now(); save(); closeModal(); },
  'item-menu'(d) {
    const it = state.items[d.id];
    openModal(it.title, `<div class="col" style="gap:8px">
      <button class="btn block" data-a="item-edit" data-id="${it.id}">${svgIcon('edit', 18)}Modifier</button>
      ${it.src && it.src.api === 'tmdb' && it.seasons ? `<button class="btn block" data-a="item-refresh" data-id="${it.id}">${svgIcon('sync', 18)}Actualiser les épisodes</button>` : ''}
      <button class="btn danger block" data-a="item-del" data-id="${it.id}">${svgIcon('trash', 18)}Supprimer</button>
      <button class="btn block" data-a="modal-close">Fermer</button></div>`);
  },
  async 'item-refresh'(d) {
    const it = state.items[d.id]; closeModal();
    try { await refreshTv(it); touched(it); save(); render(); toast('Épisodes à jour'); } catch (e) { toast(esc(errText(e)), '', 3500); }
  },
  'item-edit'(d) {
    const it = state.items[d.id]; const sh = shape(it);
    openModal('Modifier', `<form class="col" style="gap:12px" data-form="item-edit" data-id="${it.id}">
      <label class="field"><span>Titre</span><input class="input" name="title" value="${esc(it.title)}" required></label>
      ${sh === 'episodes' && !(it.src && it.src.api === 'tmdb') ? `<label class="field"><span>Épisodes par saison</span><input class="input" name="seasons" value="${esc(it.seasons.map((s) => s.count).join(', '))}"></label>` : ''}
      ${sh === 'tomes' || sh === 'livre' ? `<label class="field"><span>Nombre de tomes</span><input class="input" name="tomes" type="number" min="1" max="300" value="${it.volumes.length}"></label>` : ''}
      ${sh === 'livre' ? `<label class="field"><span>Pages par tome</span><input class="input" name="pages" type="number" min="0" value="${esc(it.volumes[0] ? it.volumes[0].pages || '' : '')}"></label>` : ''}
      ${posterField(it.poster)}
      ${sh === 'episodes' || sh === 'tomes' || sh === 'livre' ? `<label class="toggle"><input type="checkbox" name="ended" ${it.ended ? 'checked' : ''}><span class="sw"></span><span class="grow"><b style="font-size:14px">Terminée (plus de suite prévue)</b></span></label>` : ''}
      <div class="grid2"><button class="btn" type="button" data-a="modal-close">Annuler</button><button class="btn chrome" type="submit">Enregistrer</button></div></form>`);
  },
  'item-del'(d) {
    const it = state.items[d.id];
    confirmBox('Supprimer ?', `<b>${esc(it.title)}</b> et tout son historique (et l’XP associée) seront supprimés. C’est définitif.`, 'Supprimer', () => { deleteItem(it.id); checkUnlocks(true); save(); ui.modal = null; history.back(); }, true);
  },
  'match-seen'(d) { const m = state.matches[d.id]; withXp(() => matchSee(m, d.mode)); },
  'match-unsee'(d) { withXp(() => matchUnsee(state.matches[d.id])); },
  'match-dismiss'(d) { const m = state.matches[d.id]; m.dismissed = true; save(); render(); },
  'match-mode'(d) { ui.matchMode[d.id] = d.v; render(); },
  'match-del'(d) { confirmBox('Supprimer ce match ?', 'Le match et l’XP associée seront supprimés.', 'Supprimer', () => { matchUnsee(state.matches[d.id]); delete state.matches[d.id]; checkUnlocks(true); save(); ui.modal = null; history.back(); }, true); },
  reveal(d) { ui.reveal[d.id] = true; render(); },
  async 'sport-sync'() { toast('Récupération des matchs…', '', 1400); const ok = await syncSport(true); toast(ok ? 'Matchs à jour' : 'Impossible de joindre TheSportsDB pour le moment.', '', 2600); },
  'catch-del'(d) { confirmBox('Supprimer cette entrée ?', 'L’entrée et son XP seront retirées du journal.', 'Supprimer', () => { catchRemove(d.id); checkUnlocks(true); save(); closeModal(); }, true); },
  'catch-fed'(d) { ui.add.fed = d.v; render(); },
  'catch-kind'(d) { ui.add.ckind = d.v; render(); },
  'catch-plan'(d) { ui.add.cplan = d.v === '1'; render(); },
  'feds-open'() { fedsModal(); },
  'fed-kind'(d) { state.feds[+d.i].kind = d.v; save(); fedsModal(); },
  'fed-del'(d) { if (state.feds.length <= 1) return; state.feds.splice(+d.i, 1); save(); fedsModal(); },
  'show-open'(d) { const s0 = state.shows[d.id]; if (s0) showModal(s0); },
  'show-seen'(d) { const s0 = state.shows[d.id]; ui.modal = null; withXp(() => showSee(s0, d.mode)); },
  'show-dismiss'(d) { state.shows[d.id].dismissed = true; save(); render(); },
  'show-del'(d) { confirmBox('Supprimer ce show ?', 'Il sera retiré des shows programmés.', 'Supprimer', () => { delete state.shows[d.id]; save(); closeModal(); }, true); },
  'catch-new-show'() {
    openModal('Nouveau show suivi', `<form class="col" style="gap:12px" data-form="catch-show"><label class="field"><span>Nom du show</span><input class="input" name="title" placeholder="Ex. AEW Collision" required></label><div class="grid2"><button class="btn" type="button" data-a="modal-close">Annuler</button><button class="btn chrome" type="submit">Ajouter</button></div></form>`);
  },
  'bib-type'(d) { ui.biblio.type = d.v; render(); if (d.v === 'sport') syncSport(); },
  'bib-status'(d) { ui.biblio.status = d.v; render(); },
  histo(d) { ui.histo += +d.v; render(); },
  'add-type'(d) {
    Object.assign(ui.add, { type: d.v, results: null, picked: null, manual: false, error: '', tomes: '', pages: '' });
    try { history.replaceState(null, '', '#ajouter-' + d.v); } catch (e) { /* */ }
    lastRouteKey = 'ajouter:' + d.v; render();
  },
  'add-status'(d) { ui.add.status = d.v; ui.add.catchup = defaultCatchup(d.v); render(); },
  'add-manual'() { ui.add.manual = true; ui.add.error = ''; render(); },
  'add-search'() { ui.add.manual = false; render(); },
  pick(d) { ui.add.picked = ui.add.results[+d.i]; ui.add.error = ''; ui.add.catchup = null; render(); },
  unpick() { ui.add.picked = null; render(); },
  'edit-goals'() {
    const g = goalsFor(monthKey(now()));
    openModal('Objectifs du mois', `<form class="col" style="gap:12px" data-form="goals">${Object.keys(GOAL_LABELS).map((k) => `<label class="field"><span>${GOAL_LABELS[k]} (0 = pas d’objectif)</span><input class="input" type="number" min="0" max="999" inputmode="numeric" name="${k}" value="${g[k] || 0}"></label>`).join('')}
      <span class="small muted">S’applique à ce mois-ci et aux suivants. Les mois passés gardent leurs objectifs.</span>
      <div class="grid2"><button class="btn" type="button" data-a="modal-close">Annuler</button><button class="btn chrome" type="submit">Enregistrer</button></div></form>`);
  },
  async 'test-tmdb'() {
    const inp = document.querySelector('input[name=tmdb]'); if (inp) state.settings.tmdbKey = inp.value.trim();
    try { await tmdb('/configuration'); toast('Clé TMDB valide', 'gold'); save(); } catch (e) { toast(esc(errText(e)), '', 3500); }
  },
  export() {
    try {
      const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = 'rewind-sauvegarde-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      state.lastExport = now(); save(); render(); toast('Sauvegarde exportée');
    } catch (e) { toast('Export impossible ici. Utilise « Copier les données ».', '', 3500); }
  },
  async 'copy-data'() {
    try { await navigator.clipboard.writeText(JSON.stringify(state)); state.lastExport = now(); save(); toast('Données copiées dans le presse-papiers'); render(); }
    catch (e) { toast('Copie impossible ici.', '', 2600); }
  },
  'load-demo'() { loadDemo(); toast('Données de démo chargées'); },
  'clear-demo'() { confirmBox('Effacer la démo ?', 'Toutes les données de démonstration seront supprimées. Tes clés sont conservées.', 'Effacer', () => { resetState(); closeModal(); }, true); },
  wipe() { confirmBox('Tout effacer ?', 'Toutes tes données (œuvres, historique, XP, badges) seront supprimées de ce téléphone. Exporte une sauvegarde avant si besoin. C’est définitif.', 'Tout effacer', () => { resetState(); closeModal(); }, true); },
  'modal-close'() { closeModal(); },
  'modal-yes'() { const f = ui.modal && ui.modal.onYes; ui.modal = null; if (f) f(); render(); },
  'modal-bg'(d, el, e) { if (e.target === el) closeModal(); }
};
function resetState() {
  const keep = { tmdbKey: state.settings.tmdbKey, rawgKey: state.settings.rawgKey };
  state = freshState(); Object.assign(state.settings, keep); seedState(); save(); location.hash = '#encours'; render();
}
const FORMS = {
  async search(fd) {
    const q = String(fd.get('q') || '').trim(); if (!q) return;
    const a = ui.add; a.q = q; a.loading = true; a.error = ''; a.results = null; render();
    try { a.results = await search(a.type, q); } catch (e) { a.error = errText(e); }
    a.loading = false; render();
  },
  async 'confirm-add'(fd) {
    const a = ui.add; a.loading = true; a.error = ''; a.tomes = fd.get('tomes') || ''; a.pages = fd.get('pages') || ''; render();
    try {
      const data = await buildFromResult(a.type, a.picked, { tomes: a.tomes, pages: a.pages });
      finishAdd(data);
    } catch (e) { a.error = errText(e); }
    a.loading = false; render();
  },
  'manual-add'(fd) {
    const a = ui.add; const t = a.type;
    const data = { type: t, title: String(fd.get('title')).trim(), year: String(fd.get('year') || '').trim(), src: { api: 'manuel' } };
    const seasons = String(fd.get('seasons') || '').split(/[,;\s]+/).map(Number).filter((n) => n > 0);
    if ((t === 'serie' || t === 'anime') || (t === 'doc' && seasons.length)) { data.seasons = (seasons.length ? seasons : [1]).map((c, i) => ({ n: i + 1, name: 'Saison ' + (i + 1), count: c, eps: null })); data.ended = !!fd.get('ended'); }
    if (t === 'bd' || t === 'manga' || t === 'livre') { const n = clamp(+fd.get('tomes') || 1, 1, 300); const pages = +fd.get('pages') || 0; data.volumes = Array.from({ length: n }, (_, i) => ({ n: i + 1, pages })); }
    if (fd.get('runtime')) data.runtime = +fd.get('runtime');
    finishAdd(data);
  },
  'match-add'(fd) {
    const id = uid(); const ts = Date.parse(fd.get('date')) || now();
    const m = { id, ext: false, team: null, sport: fd.get('sport'), league: String(fd.get('league') || '').trim(), home: String(fd.get('home')).trim(), away: String(fd.get('away')).trim(), ts,
      hs: fd.get('hs') !== '' ? +fd.get('hs') : null, as: fd.get('as') !== '' ? +fd.get('as') : null, seen: null, dismissed: false };
    for (const t of Object.values(TEAMS)) if ([m.home, m.away].some((n) => n.toLowerCase().includes(t.short.toLowerCase()) || n.toLowerCase() === t.name.toLowerCase())) { m.team = t.key; m.homeId = m.home.toLowerCase().includes(t.short.toLowerCase()) ? t.id : ''; }
    state.matches[id] = m;
    const mode = fd.get('mode');
    withXp(() => { if (mode) matchSee(m, mode); });
    location.hash = '#match-' + id;
  },
  'catch-add'(fd) {
    const a = ui.add; const fed = a.fed || 'AEW';
    const kind = fedKind(fed) === 'major' ? (a.ckind === 'ppv' ? 'ppv' : 'hebdo') : 'show';
    const ts = Date.parse(fd.get('date') + 'T' + (fd.get('time') || '20:00') + ':00') || now();
    const poster = String(fd.get('posterData') || '').trim() || String(fd.get('posterUrl') || '').trim();
    const name = String(fd.get('show') || '').trim();
    if (a.cplan) {
      const id = uid(); state.shows[id] = { id, fed, name, kind, ts, poster, seen: null, dismissed: false, createdAt: now() };
      save(); toast(esc(name) + ' programmé', '', 2200);
    } else {
      withXp(() => catchAdd({ fed, show: name, kind, mode: fd.get('mode'), note: String(fd.get('note') || '').trim(), ts, poster }));
    }
    a.cf = {}; a.cposter = ''; a.cplan = false;
    ui.biblio.type = 'catch'; location.hash = '#biblio';
  },
  'fed-add'(fd) {
    const name = String(fd.get('name') || '').trim(); if (!name) return;
    if (!state.feds.some((f) => f.name.toLowerCase() === name.toLowerCase())) state.feds.push({ name, kind: fd.get('kind') === 'major' ? 'major' : 'inde' });
    ui.add.fed = name; save(); fedsModal();
  },
  'catch-show'(fd) {
    createItem({ type: 'catch', title: String(fd.get('title')).trim(), status: 'encours', ended: false, src: { api: 'manuel' }, seasons: [{ n: 1, name: 'Épisodes', count: 0, eps: [] }] });
    save(); closeModal();
  },
  keys(fd) { state.settings.tmdbKey = String(fd.get('tmdb') || '').trim(); state.settings.rawgKey = String(fd.get('rawg') || '').trim(); save(); toast('Réglages enregistrés'); },
  goals(fd) {
    const g = {}; for (const k of Object.keys(GOAL_LABELS)) g[k] = clamp(+fd.get(k) || 0, 0, 999);
    // fige les objectifs des mois passés avant de changer la valeur par défaut
    activeMonths().forEach((mk) => { if (mk < monthKey(now()) && !state.goalsByMonth[mk]) state.goalsByMonth[mk] = Object.assign({}, state.settings.goals); });
    state.settings.goals = g; state.goalsByMonth[monthKey(now())] = Object.assign({}, g);
    checkUnlocks(); save(); closeModal();
  },
  'item-edit'(fd, form) {
    const it = state.items[form.dataset.id]; const sh = shape(it);
    it.title = String(fd.get('title')).trim() || it.title;
    const poster = String(fd.get('posterData') || '').trim() || String(fd.get('posterUrl') || '').trim();
    if (poster) it.poster = poster;
    if (fd.has('seasons')) { const c = String(fd.get('seasons')).split(/[,;\s]+/).map(Number).filter((n) => n > 0); if (c.length) it.seasons = c.map((n, i) => Object.assign(it.seasons[i] || { n: i + 1, name: 'Saison ' + (i + 1), eps: null }, { count: n })); }
    if (fd.has('tomes')) { const n = clamp(+fd.get('tomes') || 1, 1, 300); const pages = fd.has('pages') ? +fd.get('pages') || 0 : 0; it.volumes = Array.from({ length: n }, (_, i) => Object.assign({ n: i + 1, pages }, it.volumes[i] || {}, sh === 'livre' && fd.has('pages') ? { pages } : {})); }
    if (sh === 'episodes' || sh === 'tomes' || sh === 'livre') it.ended = !!fd.get('ended');
    withXp(() => touched(it)); closeModal();
  }
};
function finishAdd(data) {
  const a = ui.add;
  const it = createItem(Object.assign(data, { status: a.status, catchup: a.status !== 'envie' && !!a.catchup }));
  if (a.status === 'termine') { withXp(() => { markAll(it); touched(it); it.status = 'termine'; }); }
  else { save(); }
  Object.assign(ui.add, { results: null, picked: null, manual: false, q: '', error: '', loading: false, catchup: null, tomes: '', pages: '' });
  toast(`<span>${esc(it.title)} ajouté</span>`);
  location.replace('#item-' + it.id);
}

/* =========================================================
   12. Rendu, routes, événements
   ========================================================= */
let lastRouteKey = '';
function render() {
  const r = parseRoute(); ui.route = r.route; ui.arg = r.arg;
  const key = r.route + ':' + (r.arg || '');
  const sameRoute = key === lastRouteKey; const y = window.scrollY;
  let html;
  switch (r.route) {
    case 'biblio': html = viewBiblio(); break;
    case 'envies': html = viewEnvies(); break;
    case 'histo': html = viewHisto(); break;
    case 'profil': html = viewProfil(); break;
    case 'ajouter': html = viewAjouter(r.arg); break;
    case 'item': html = viewItem(r.arg); break;
    case 'match': html = viewMatch(r.arg); break;
    case 'rewind': html = viewRewind(r.arg); break;
    default: html = viewEncours();
  }
  const app = document.getElementById('app');
  app.innerHTML = html + modalHtml();
  if (sameRoute) window.scrollTo(0, y); else { window.scrollTo(0, 0); ui.ddOpen = false; }
  lastRouteKey = key;
  const chipOn = app.querySelector('.chips .chip.on');
  if (chipOn && chipOn.parentElement.scrollWidth > chipOn.parentElement.clientWidth) chipOn.parentElement.scrollLeft = chipOn.offsetLeft - chipOn.parentElement.clientWidth / 2 + chipOn.clientWidth / 2;
  const titles = { encours: 'En cours', biblio: 'Biblio', envies: 'Envies', histo: 'Historique', profil: 'Profil', ajouter: 'Ajouter', rewind: 'Rewind ' + (r.arg || '') };
  document.title = 'Rewind' + (titles[r.route] ? ' · ' + titles[r.route] : r.route === 'item' && state.items[r.arg] ? ' · ' + state.items[r.arg].title : '');
}

// clics délégués
let lpTimer = null; let lpFired = false; let lpStart = null; let lpAt = 0;
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  if (lpFired) { lpFired = false; if (now() - lpAt < 800) { e.preventDefault(); return; } }
  const fn = ACT[el.dataset.a];
  if (fn) { if (el.tagName === 'A') e.preventDefault(); fn(el.dataset, el, e); }
});
// appui long : cocher jusqu'ici
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-lp]'); if (!el) return;
  lpFired = false; lpStart = { x: e.clientX, y: e.clientY };
  clearTimeout(lpTimer);
  lpTimer = setTimeout(() => { lpFired = true; lpAt = now(); const fn = ACT[el.dataset.lp]; if (fn) fn(el.dataset, el); }, 550);
});
document.addEventListener('pointermove', (e) => { if (lpStart && (Math.abs(e.clientX - lpStart.x) > 10 || Math.abs(e.clientY - lpStart.y) > 10)) { clearTimeout(lpTimer); lpStart = null; } });
['pointerup', 'pointercancel'].forEach((t) => document.addEventListener(t, () => { clearTimeout(lpTimer); lpStart = null; }));
document.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-lp]')) e.preventDefault(); });
// formulaires
document.addEventListener('submit', (e) => {
  const f = e.target; const fn = FORMS[f.dataset.form]; if (!fn) return;
  e.preventDefault(); fn(new FormData(f), f);
});
// cases à cocher et fichiers
document.addEventListener('change', (e) => {
  const el = e.target; const a = el.dataset.change; if (!a) return;
  if (a === 'catchup') { const it = state.items[el.dataset.id]; it.catchup = el.checked; save(); render(); toast(el.checked ? 'Rattrapage activé : sans XP' : 'Rattrapage terminé : l’XP compte à nouveau', '', 2400); }
  if (a === 'add-catchup') { ui.add.catchup = el.checked; }
  if (a === 'poster-file') {
    const file = el.files && el.files[0]; if (!file) return;
    const form = el.closest('form');
    imageToDataUrl(file).then((data) => {
      if (form && form.elements.posterData) form.elements.posterData.value = data;
      const pv = form && form.querySelector('[data-poster-preview]'); if (pv) pv.innerHTML = `<img src="${data}" alt="">`;
      if (form && form.dataset.form === 'catch-add') ui.add.cposter = data;
    }).catch(() => toast('Image illisible.', '', 2600));
    el.value = '';
  }
  if (a === 'import') {
    const file = el.files && el.files[0]; if (!file) return;
    file.text().then((txt) => {
      let data; try { data = JSON.parse(txt); } catch (err) { toast('Fichier illisible.', '', 3000); return; }
      if (data && data.rewindPack) { const n = importPack(data); toast(n ? plural(n, 'show') + ' ajouté' + (n > 1 ? 's' : '') : 'Rien de nouveau dans ce fichier', n ? 'gold' : '', 2600); return; }
      if (!data || !data.items || !data.events) { toast('Ce fichier n’est pas une sauvegarde Rewind.', '', 3000); return; }
      confirmBox('Importer cette sauvegarde ?', `Elle contient ${plural(Object.keys(data.items).length, 'œuvre')} et ${plural(data.events.length, 'événement')}. Tes données actuelles seront remplacées.`, 'Importer', () => { state = migrate(data); checkUnlocks(true); save(); toast('Sauvegarde importée', 'gold'); location.hash = '#encours'; render(); });
    });
    el.value = '';
  }
});
// garde la saisie du formulaire catch quand on change d'onglet de type
document.addEventListener('input', (e) => { const k = e.target.dataset && e.target.dataset.keep; if (k && e.target.closest('form[data-form="catch-add"]')) { ui.add.cf = ui.add.cf || {}; ui.add.cf[k] = e.target.value; } });
document.addEventListener('change', (e) => { const k = e.target.dataset && e.target.dataset.keep; if (k && e.target.closest('form[data-form="catch-add"]')) { ui.add.cf = ui.add.cf || {}; ui.add.cf[k] = e.target.value; } });
// filtre local de la bibliothèque (sans re-rendu)
document.addEventListener('input', (e) => {
  if (e.target.dataset.filter !== 'bib') return;
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('.tile[data-title]').forEach((t) => { t.style.display = !q || t.dataset.title.includes(q) ? '' : 'none'; });
});
// images qui ne chargent pas : on garde le dégradé
document.addEventListener('error', (e) => { if (e.target && e.target.tagName === 'IMG') e.target.remove(); }, true);
window.addEventListener('hashchange', () => { if (ui.modal) ui.modal = null; render(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.modal) closeModal(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

/* =========================================================
   13. Données de démonstration
   ========================================================= */
function seedState() {
  if (!Object.values(state.items).some((i) => i.type === 'catch')) {
    createItem({ type: 'catch', title: 'AEW Dynamite', status: 'encours', ended: false, src: { api: 'manuel' }, seasons: [{ n: 1, name: 'Épisodes', count: 0, eps: [] }], createdAt: now() - 1000, updatedAt: now() - 1000 });
  }
}
function loadDemo() {
  const keep = { tmdbKey: state.settings.tmdbKey, rawgKey: state.settings.rawgKey };
  state = freshState(); Object.assign(state.settings, keep); state.demo = true;
  const T = now(); const d = (days, h) => T - days * DAY + (h || 0) * 3600000;
  const serie = createItem({ type: 'serie', title: 'Station Zéro', year: '2025', status: 'encours', runtime: 44, overview: 'Exemple de série (données de démonstration).',
    seasons: [{ n: 1, name: 'Saison 1', count: 8, eps: ['Signal perdu', 'Quai 9', 'Les Invités', 'Pression', 'Zone froide', 'La Passerelle', 'Dernier relais', 'Cap sur Zéro'].map((t) => ({ t })) },
      { n: 2, name: 'Saison 2', count: 9, eps: ['Retour d’écho', 'Sas', 'Fréquence 12', 'Nuit blanche', 'Le Couloir', 'Bruit blanc', 'Les Registres', 'Contact', 'Station Zéro'].map((t) => ({ t })) }] });
  for (let e = 1; e <= 8; e++) setDone(serie, 's1e' + e, true, d(40 - e * 3));
  checkBonuses(serie, d(17));
  for (let e = 1; e <= 4; e++) setDone(serie, 's2e' + e, true, d(10 - e * 2));
  touched(serie, d(2)); serie.updatedAt = d(1);
  const anime = createItem({ type: 'anime', title: 'Kōkai Ryū', year: '2024', status: 'encours', ended: false, runtime: 24, seasons: [{ n: 1, name: 'Épisodes', count: 64, eps: null }] });
  anime.catchup = true; for (let e = 1; e <= 30; e++) setDone(anime, 's1e' + e, true, d(60));
  anime.catchup = false; for (let e = 31; e <= 41; e++) setDone(anime, 's1e' + e, true, d(45 - e));
  touched(anime); anime.updatedAt = d(3);
  const manga = createItem({ type: 'manga', title: 'Lames d’Argent', status: 'encours', ended: true, volumes: Array.from({ length: 23 }, (_, i) => ({ n: i + 1 })) });
  manga.catchup = true; for (let v = 1; v <= 6; v++) setDone(manga, 't' + v, true, d(80)); manga.catchup = false;
  for (let v = 7; v <= 12; v++) setDone(manga, 't' + v, true, d(30 - v));
  touched(manga); manga.updatedAt = d(4);
  const livre = createItem({ type: 'livre', title: 'Le Dernier Archiviste', status: 'encours', ended: true, volumes: [{ n: 1, pages: 380 }, { n: 2, pages: 400 }, { n: 3, pages: 420 }] });
  setDone(livre, 't1m', true, d(50)); setDone(livre, 't1', true, d(42)); setDone(livre, 't2m', true, d(20)); setDone(livre, 't2', true, d(6)); setDone(livre, 't3m', true, d(1));
  touched(livre); livre.updatedAt = d(5);
  const film = createItem({ type: 'film', title: 'Nuit d’Orage', year: '2019', runtime: 118 });
  setDone(film, 'v', true, d(35)); newPass(film); setDone(film, 'v', true, d(8)); touched(film);
  const film2 = createItem({ type: 'film', title: 'Hors Saison', year: '2023', runtime: 102 }); setDone(film2, 'v', true, d(25)); touched(film2);
  const film3 = createItem({ type: 'film', title: 'Le Grand Calme', year: '2021', runtime: 95 }); setDone(film3, 'v', true, d(12)); touched(film3);
  const jeu = createItem({ type: 'jeu', title: 'Néon Drift', status: 'encours' }); jeu.updatedAt = d(6);
  createItem({ type: 'film', title: 'Les Cartographes', year: '2026', status: 'envie' });
  createItem({ type: 'serie', title: 'Les Registres', status: 'envie', seasons: [{ n: 1, name: 'Saison 1', count: 6, eps: null }] });
  createItem({ type: 'livre', title: 'Mer de Verre', status: 'envie', volumes: [{ n: 1, pages: 300 }] });
  const dyn = createItem({ type: 'catch', title: 'AEW Dynamite', status: 'encours', ended: false, seasons: [{ n: 1, name: 'Épisodes', count: 4, eps: [{ date: d(21) }, { date: d(14) }, { date: d(7) }, { date: d(0) }] }] });
  [21, 14, 7].forEach((x, i) => setDone(dyn, 's1e' + (i + 1), true, d(x, 3))); touched(dyn); dyn.updatedAt = d(7);
  const opp = [['Boston Celtics', 6], ['New York Knicks', 4], ['Miami Heat', 2], ['Milwaukee Bucks', 0.6]];
  opp.forEach(([o, days], i) => {
    const id = 'demo' + i; const home = i % 2 === 0;
    state.matches[id] = { id, ext: false, team: 'sixers', sport: 'nba', league: 'NBA', home: home ? 'Philadelphia 76ers' : o, away: home ? o : 'Philadelphia 76ers', homeId: home ? TEAMS.sixers.id : '', ts: d(days), hs: 104 + i * 3, as: 99 + i * 4, seen: null, dismissed: false };
    if (i === 0) matchSee(state.matches[id], 'direct'); if (i === 1) matchSee(state.matches[id], 'resume');
  });
  state.matches.demoM = { id: 'demoM', ext: false, team: 'milan', sport: 'foot', league: 'Serie A', home: 'AC Milan', away: 'Juventus', homeId: TEAMS.milan.id, ts: d(9), hs: 2, as: 1, seen: null, dismissed: false };
  matchSee(state.matches.demoM, 'differe');
  state.events.forEach((e) => { if (e.kind === 'match') e.ts = state.matches[e.item.slice(2)].ts + 3 * 3600000; });
  catchAdd({ fed: 'APC', show: 'Gala APC', kind: 'show', mode: 'direct', note: 'Exemple', ts: d(16) });
  state.shows.demoS = { id: 'demoS', fed: 'KHAO', name: 'Show KHAO (démo)', kind: 'show', ts: now() + 5 * DAY, poster: '', seen: null, dismissed: false, createdAt: now() };
  catchAdd({ fed: 'Stardom', show: 'Stardom World', kind: 'hebdo', mode: 'differe', note: '', ts: d(5) });
  state.settings.catchTrialStart = d(9);
  checkUnlocks(true); save(); location.hash = '#encours'; render();
}

/* =========================================================
   14. Démarrage
   ========================================================= */
async function init() {
  try { await store.open(); } catch (e) { /* repli localStorage */ }
  const saved = await store.get('state');
  if (saved) state = migrate(saved); else seedState();
  checkUnlocks(true);
  render();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* */ }
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (navigator.onLine !== false) syncSport().catch(() => {});
  save();
}
init();
