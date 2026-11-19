/* Rewind – suivi culturel personnel
   Données stockées uniquement sur l'appareil (IndexedDB). Aucune donnée n'est envoyée ailleurs,
   sauf les recherches de titres vers TMDB, AniList (manga), Google Books, Open Library, RAWG et TheSportsDB. */
'use strict';

const APP_VERSION = '3.3.0';
const DAY = 86400000;

/* =========================================================
   1. Constantes
   ========================================================= */
const TYPES = {
  film: { label: 'Film', plural: 'Films' },
  serie: { label: 'Série', plural: 'Séries' },
  doc: { label: 'Docu', plural: 'Documentaires' },
  livre: { label: 'Livre', plural: 'Livres' },
  bd: { label: 'BD', plural: 'BD' },
  manga: { label: 'Manga', plural: 'Manga' },
  jeu: { label: 'Jeu', plural: 'Jeux vidéo' },
  catch: { label: 'Catch', plural: 'Catch' }
};
const ADD_TYPES = ['film', 'serie', 'doc', 'livre', 'manga', 'bd', 'jeu', 'sport', 'catch'];
const XP = { ep: { serie: 10, doc: 10, catch: 25 }, film: 30, tome: 15, jeu: 100, match: 25, matchResume: 5,
  catchHebdo: 25, catchPPV: 50, catchShow: 35, catchResume: 5, bonusSaison: 50, bonusSaga: 150, bonusSagaLivre: 300,
  goal: 100, livreFin: 25 };
const RUNTIME = { serie: 42, doc: 50, catch: 120, film: 110 };
/* Épisodes : l'XP dépend du format de la série (durée moyenne enregistrée à l'ajout, ou choisie à la main).
   ref = durée de référence, utilisée par le plafond anti-triche. Un film de moins d'1 h prend le format correspondant. */
const FORMATS = { court: { label: 'Court (25 min ou moins)', xp: 6, ref: 25 }, demi: { label: 'Demi-heure (26 à 35 min)', xp: 8, ref: 35 }, standard: { label: 'Standard (36 à 50 min)', xp: 11, ref: 50 }, long: { label: 'Long (plus de 50 min)', xp: 15, ref: 60 } };
const fmtOfRuntime = (m) => (!m ? null : m <= 25 ? 'court' : m <= 35 ? 'demi' : m <= 50 ? 'standard' : 'long');
const epFormat = (item) => (FORMATS[item.format] ? item.format : fmtOfRuntime(item.runtime));
const CAP_MIN = 16 * 60; // plafond : 16 h de contenu par 24 h
const CINE_XP = 20; const CINE_MAX_DAY = 4;
const TEAMS = {
  sixers: { key: 'sixers', name: 'Philadelphia 76ers', short: 'Sixers', abbr: 'PHI', id: '134863', sport: 'nba', league: 'NBA', total: 82, c1: '#1D5FBF', c2: '#E8475F' },
  milan: { key: 'milan', name: 'AC Milan', short: 'Milan', abbr: 'MIL', id: '133667', sport: 'foot', league: 'Serie A', total: 38, c1: '#B3122A', c2: '#151515' }
};
/* Les 30 équipes NBA (abréviation, nom, surnom pour reconnaître le nom renvoyé par TheSportsDB, couleurs) */
const NBA_TEAMS = [
  ['ATL', 'Atlanta Hawks', 'Hawks', '#E03A3E', '#26282A'], ['BOS', 'Boston Celtics', 'Celtics', '#007A33', '#BA9653'], ['BKN', 'Brooklyn Nets', 'Nets', '#2B2B2B', '#8A8D8F'],
  ['CHA', 'Charlotte Hornets', 'Hornets', '#1D1160', '#00788C'], ['CHI', 'Chicago Bulls', 'Bulls', '#CE1141', '#1A1A1A'], ['CLE', 'Cleveland Cavaliers', 'Cavaliers', '#860038', '#FDBB30'],
  ['DAL', 'Dallas Mavericks', 'Mavericks', '#00538C', '#002B5E'], ['DEN', 'Denver Nuggets', 'Nuggets', '#0E2240', '#FEC524'], ['DET', 'Detroit Pistons', 'Pistons', '#C8102E', '#1D42BA'],
  ['GSW', 'Golden State Warriors', 'Warriors', '#1D428A', '#FFC72C'], ['HOU', 'Houston Rockets', 'Rockets', '#CE1141', '#1A1A1A'], ['IND', 'Indiana Pacers', 'Pacers', '#002D62', '#FDBB30'],
  ['LAC', 'Los Angeles Clippers', 'Clippers', '#C8102E', '#1D428A'], ['LAL', 'Los Angeles Lakers', 'Lakers', '#552583', '#FDB927'], ['MEM', 'Memphis Grizzlies', 'Grizzlies', '#5D76A9', '#12173F'],
  ['MIA', 'Miami Heat', 'Heat', '#98002E', '#F9A01B'], ['MIL', 'Milwaukee Bucks', 'Bucks', '#00471B', '#EEE1C6'], ['MIN', 'Minnesota Timberwolves', 'Timberwolves', '#0C2340', '#236192'],
  ['NOP', 'New Orleans Pelicans', 'Pelicans', '#0C2340', '#C8102E'], ['NYK', 'New York Knicks', 'Knicks', '#006BB6', '#F58426'], ['OKC', 'Oklahoma City Thunder', 'Thunder', '#007AC1', '#EF3B24'],
  ['ORL', 'Orlando Magic', 'Magic', '#0077C0', '#C4CED4'], ['PHI', 'Philadelphia 76ers', '76ers', '#006BB6', '#ED174C'], ['PHX', 'Phoenix Suns', 'Suns', '#1D1160', '#E56020'],
  ['POR', 'Portland Trail Blazers', 'Blazers', '#E03A3E', '#1A1A1A'], ['SAC', 'Sacramento Kings', 'Kings', '#5A2D81', '#63727A'], ['SAS', 'San Antonio Spurs', 'Spurs', '#8A9399', '#111111'],
  ['TOR', 'Toronto Raptors', 'Raptors', '#CE1141', '#1A1A1A'], ['UTA', 'Utah Jazz', 'Jazz', '#002B5C', '#F9A01B'], ['WAS', 'Washington Wizards', 'Wizards', '#002B5C', '#E31837']
].map(([abbr, name, nick, c1, c2]) => ({ abbr, name, nick, c1, c2 }));
const NBA_BY = Object.fromEntries(NBA_TEAMS.map((t) => [t.abbr, t]));
const NBA_LEAGUE = '4387';
NBA_TEAMS.forEach((t) => { t.rx = new RegExp('(^|\\s)' + t.nick.toLowerCase() + '$'); });
function nbaAbbr(name) { const n = String(name || '').toLowerCase().trim(); const t = NBA_TEAMS.find((x) => x.rx.test(n) || n === x.name.toLowerCase()); return t ? t.abbr : null; }
const nightKey = (ts) => new Date(ts - 5 * 3600000).toISOString().slice(0, 10); // date de la soirée côté États-Unis
function nightLabel(k) {
  const d = new Date(k + 'T12:00:00'); const e = new Date(d.getTime() + DAY);
  const f = (x, o) => x.toLocaleDateString('fr-FR', o);
  return 'Nuit du ' + f(d, { day: 'numeric' }) + (d.getMonth() !== e.getMonth() ? ' ' + f(d, { month: 'short' }) : '') + ' au ' + f(e, { day: 'numeric', month: 'short' });
}
const DEFAULT_FEDS = [{ name: 'AEW', kind: 'major' }, { name: 'WWE', kind: 'major' }, { name: 'Stardom', kind: 'major' }, { name: 'APC', kind: 'inde' }, { name: 'KHAO', kind: 'inde' }];
const CATCH_LEAGUES = { AEW: '4563', WWE: '4444' };
const HEBDO_RX = /dynamite|collision|rampage|battle of the belts|raw\b|smackdown|nxt|main event|saturday night|evolve|speed|level up|roh tv|ring of honor/i;
const CKINDS = { hebdo: 'Hebdo', ppv: 'PPV', show: 'Show' };
const CK_RT = { hebdo: 120, ppv: 240, show: 180 };
const ckXp = (kind) => kind === 'ppv' ? XP.catchPPV : kind === 'show' ? XP.catchShow : XP.catchHebdo;
const fedKind = (name) => { const f = (state.feds || []).find((x) => x.name.toLowerCase() === String(name).toLowerCase()); return f ? f.kind : 'inde'; };
const TSDB = 'https://www.thesportsdb.com/api/v1/json/123/';
// horodatage d'un événement TheSportsDB (UTC si aucun fuseau n'est indiqué)
function tsdbTs(ev, defTime) {
  const t = ev.strTimestamp ? Date.parse(/Z|[+-]\d\d:?\d\d$/.test(ev.strTimestamp) ? ev.strTimestamp : ev.strTimestamp + 'Z') : Date.parse((ev.dateEvent || '') + 'T' + (ev.strTime || defTime || '00:00:00') + 'Z');
  return isNaN(t) ? Date.parse(ev.dateEvent) : t;
}
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
const hhmm = (ts) => { const d = new Date(ts); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
const isoDay = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const fmtMatch = (ts) => new Date(ts).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + hhmm(ts);
const plural = (n, s, p) => n + ' ' + (n > 1 ? (p || s + 's') : s);
const fmtNum = (n) => Math.round(n).toLocaleString('fr-FR');
const hashHue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; };
const grad = (s) => { const h = hashHue(s); return `linear-gradient(160deg,hsl(${h},40%,20%),hsl(${(h + 28) % 360},55%,46%) 60%,hsl(${(h + 45) % 360},65%,74%))`; };
const initials = (t) => String(t || '?').replace(/^(the|le|la|les|l')\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('');
const abbr = (name) => (String(name || '').replace(/[^A-Za-zÀ-ÿ0-9 ]/g, '').split(' ').filter(Boolean)[0] || '?').slice(0, 3).toUpperCase();
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/* =========================================================
   3. État et stockage (IndexedDB, repli localStorage)
   ========================================================= */
function freshState() {
  return {
    version: 1, createdAt: now(), demo: false,
    settings: { tmdbKey: '', rawgKey: '', pseudo: '', avatar: '', avatarSrc: '', goals: { films: 4, tomes: 5, episodes: 20, matchs: 8 }, catchTrialStart: now(), title: '', vitrine: [], banner: '' },
    items: {}, events: [], matches: {}, catchLog: [], shows: {}, feds: DEFAULT_FEDS.map((f) => Object.assign({}, f)), goalsByMonth: {}, unlocked: {}, lastLevel: 1,
    tiers: {}, secrets: {}, colls: {}, v33At: now(), lastExport: null, sportSync: 0, logos: {}, logoTry: {}, catchFeed: {}, catchSync: {}, nba: { ids: { PHI: '134863', BOS: '134860' }, feed: {}, lastRun: 0 }
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
  // renvoie false si l'écriture a échoué (stockage plein ou indisponible)
  set(k, v) {
    return new Promise((res) => {
      if (!this.db) { try { localStorage.setItem('rewind:' + k, JSON.stringify(v)); res(true); } catch (e) { res(false); } return; }
      try {
        const t = this.db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k);
        t.oncomplete = () => res(true); t.onerror = () => res(false); t.onabort = () => res(false);
      } catch (e) { res(false); }
    });
  },
  del(k) {
    return new Promise((res) => {
      if (!this.db) { try { localStorage.removeItem('rewind:' + k); } catch (e) { /* */ } res(); return; }
      const t = this.db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k);
      t.oncomplete = () => res(); t.onerror = () => res();
    });
  },
  keys() {
    return new Promise((res) => {
      if (!this.db) { try { res(Object.keys(localStorage).filter((k) => k.startsWith('rewind:')).map((k) => k.slice(7))); } catch (e) { res([]); } return; }
      const r = this.db.transaction('kv').objectStore('kv').getAllKeys();
      r.onsuccess = () => res(r.result || []); r.onerror = () => res([]);
    });
  }
};
/* Images ajoutées depuis le téléphone : rangées à part (clés « img:<id> »), les données n'en gardent qu'une référence « idb:<id> ».
   En mémoire, les images restent sous forme data: pour l'affichage et l'export. */
const imgIds = new Map(); // data: → id
const imgSaved = new Set(); // ids déjà enregistrés
let imgPending = null;
function imgReplacer(k, v) {
  if (typeof v !== 'string' || v.length < 200 || !v.startsWith('data:image/')) return v;
  let id = imgIds.get(v);
  if (!id) { id = uid() + uid(); imgIds.set(v, id); }
  imgPending.set(id, v);
  return 'idb:' + id;
}
async function rehydrate(obj) {
  const refs = new Set();
  const walk = (o) => { if (!o || typeof o !== 'object') return; for (const k in o) { const v = o[k]; if (typeof v === 'string') { if (v.startsWith('idb:')) refs.add(v.slice(4)); } else if (v && typeof v === 'object') walk(v); } };
  walk(obj);
  const data = {};
  await Promise.all([...refs].map(async (id) => { const d = await store.get('img:' + id); if (d) { data[id] = d; imgIds.set(d, id); imgSaved.add(id); } }));
  const put = (o) => { if (!o || typeof o !== 'object') return; for (const k in o) { const v = o[k]; if (typeof v === 'string') { if (v.startsWith('idb:')) o[k] = data[v.slice(4)] || ''; } else if (v && typeof v === 'object') put(v); } };
  put(obj);
  return obj;
}
let saveTimer = null;
function save() { memoClear(); clearTimeout(saveTimer); saveTimer = setTimeout(flush, 250); }
let imgGcAt = 0;
let flushChain = Promise.resolve();
let saveWarned = false;
// les sauvegardes passent l'une après l'autre : deux sauvegardes simultanées pouvaient effacer une image tout juste ajoutée
function flush() {
  clearTimeout(saveTimer);
  flushChain = flushChain.then(flushNow, flushNow);
  return flushChain;
}
async function flushNow() {
  memoClear();
  imgPending = new Map();
  const light = JSON.parse(JSON.stringify(state, imgReplacer));
  const used = imgPending; imgPending = null;
  let ok = true;
  for (const [id, d] of used) if (!imgSaved.has(id)) { if (await store.set('img:' + id, d)) imgSaved.add(id); else ok = false; }
  if (!(await store.set('state', light))) ok = false;
  if (!ok && !saveWarned) { saveWarned = true; toast('Sauvegarde impossible sur ce téléphone (stockage plein ?). Exporte tes données depuis le Profil.', '', 6000); }
  if (ok) saveWarned = false;
  // ménage des images qui ne servent plus (au plus une fois par minute)
  if (ok && now() - imgGcAt > 60000) {
    imgGcAt = now();
    const keys = await store.keys();
    for (const k of keys) if (String(k).startsWith('img:') && !used.has(k.slice(4))) { await store.del(k); imgSaved.delete(k.slice(4)); }
    for (const [d, id] of imgIds) if (!used.has(id)) imgIds.delete(d);
  }
}
function migrate(s) {
  const upgrade33 = !!s && !s.v33At; // première ouverture en 3.3.0
  const f = freshState();
  const out = Object.assign(f, s || {});
  out.settings = Object.assign(f.settings, (s && s.settings) || {});
  out.settings.goals = Object.assign({ films: 4, tomes: 5, episodes: 0, matchs: 8 }, out.settings.goals || {});
  for (const k of ['items', 'matches', 'goalsByMonth', 'unlocked']) out[k] = out[k] || {};
  for (const k of ['events', 'catchLog']) out[k] = out[k] || [];
  out.nba = out.nba || {}; out.nba.ids = Object.assign({ PHI: '134863', BOS: '134860' }, out.nba.ids || {}); out.nba.feed = out.nba.feed || {}; out.nba.lastRun = out.nba.lastRun || 0;
  out.shows = out.shows || {}; out.catchFeed = out.catchFeed || {}; out.catchSync = out.catchSync || {};
  if (!Array.isArray(out.feds) || !out.feds.length) out.feds = DEFAULT_FEDS.map((f) => Object.assign({}, f));
  // V1.2 : « événement » devient PPV, ou Show pour les indés
  out.catchLog.forEach((c) => { if (c.kind === 'event') c.kind = out.feds.some((f) => f.name === c.fed && f.kind === 'major') ? 'ppv' : 'show'; });
  out.events.forEach((e) => { if (e.kind === 'catch' && e.catchKind === 'event') { const c = out.catchLog.find((x) => 'c:' + x.id === e.item); e.catchKind = c ? c.kind : 'ppv'; } });
  mergeAnime(out);
  // V3 : plus de petit commentaire sur les entrées de catch
  out.catchLog.forEach((c) => { delete c.note; });
  sanitize(out);
  if (upgrade33) migrate33(out);
  return out;
}
/* 3.3.0 : fige les objectifs des mois passés avant de changer les valeurs par défaut (sinon l'XP passée bougerait),
   active l'objectif de 20 épisodes, et prépare l'écran « Ta collection est prête » */
function migrate33(s) {
  const cur = monthKey(now()); const old = Object.assign({}, s.settings.goals);
  new Set(s.events.map((e) => monthKey(e.ts))).forEach((mk) => { if (mk < cur && !s.goalsByMonth[mk]) s.goalsByMonth[mk] = Object.assign({}, old); });
  if (!s.settings.goals.episodes) s.settings.goals.episodes = 20;
  if (s.goalsByMonth[cur] && !s.goalsByMonth[cur].episodes) s.goalsByMonth[cur].episodes = 20;
  s.v33At = now(); s.recapPending = s.events.length > 0;
}
/* Sécurité : une sauvegarde importée (ou modifiée à la main) ne doit pas pouvoir glisser du code dans la page.
   Les identifiants restent de simples mots, les nombres restent des nombres ; ce qui ne respecte pas ces règles est écarté. */
const SAFE_ID = /^[A-Za-z0-9_.:-]{1,80}$/;
const num = (v, d) => { const n = Number(v); return v !== null && v !== '' && isFinite(n) ? n : d; };
const numOrNull = (v) => num(v, null);
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const safeImg = (v) => (typeof v === 'string' && v.startsWith('data:image/') ? v : '');
function sanitize(s) {
  for (const k of ['items', 'matches', 'shows', 'goalsByMonth', 'unlocked', 'logos', 'catchFeed', 'tiers', 'secrets', 'colls']) if (!isObj(s[k])) s[k] = {};
  for (const k of Object.keys(s.tiers)) { if (!FAM[k] || !Array.isArray(s.tiers[k])) { delete s.tiers[k]; continue; } s.tiers[k] = s.tiers[k].slice(0, 4).map((h) => (isObj(h) ? { ts: num(h.ts, now()), item: String(h.item || ''), retro: !!h.retro } : null)); }
  for (const k of Object.keys(s.secrets)) { const h = s.secrets[k]; if (!SECRET[k] || !isObj(h)) delete s.secrets[k]; else s.secrets[k] = { ts: num(h.ts, now()), item: String(h.item || ''), retro: !!h.retro }; }
  for (const k of Object.keys(s.colls)) { const c = s.colls[k]; if (!/^\d+$/.test(k) || !isObj(c) || !Array.isArray(c.parts)) { delete s.colls[k]; continue; } c.name = String(c.name || ''); c.at = num(c.at, 0); c.parts = c.parts.filter(isObj).map((x) => ({ id: num(x.id, 0), title: String(x.title || ''), date: /^\d{4}-\d\d-\d\d$/.test(x.date) ? x.date : '', poster: String(x.poster || '') })); }
  s.v33At = s.v33At == null ? undefined : num(s.v33At, now());
  s.settings.title = String(s.settings.title || '').slice(0, 40); s.settings.banner = SAFE_ID.test(String(s.settings.banner || '')) ? s.settings.banner : '';
  s.settings.vitrine = Array.isArray(s.settings.vitrine) ? s.settings.vitrine.filter((k) => FAM[k] || SECRET[String(k).slice(2)]).slice(0, 3) : [];
  for (const k of ['events', 'catchLog']) if (!Array.isArray(s[k])) s[k] = [];
  for (const [id, it] of Object.entries(s.items)) {
    if (!isObj(it) || !SAFE_ID.test(id) || it.id !== id) { delete s.items[id]; continue; }
    if (!TYPES[it.type]) it.type = Array.isArray(it.seasons) ? 'serie' : 'film';
    it.title = String(it.title == null ? 'Sans titre' : it.title);
    for (const k of ['runtime', 'createdAt', 'updatedAt']) it[k] = num(it[k], k === 'runtime' ? 0 : now());
    if (it.playtime != null) it.playtime = num(it.playtime, 0);
    if (it.format != null && !FORMATS[it.format]) delete it.format;
    if (it.countries != null && !Array.isArray(it.countries)) delete it.countries;
    if (Array.isArray(it.seasons)) it.seasons.forEach((x, i) => { x.n = num(x.n, i + 1); x.count = Math.max(0, Math.floor(num(x.count, 0))); if (Array.isArray(x.eps)) x.eps.forEach((e) => { if (isObj(e)) e.rt = num(e.rt, 0); }); else x.eps = null; });
    else delete it.seasons;
    if (Array.isArray(it.volumes)) it.volumes.forEach((v, i) => { v.n = num(v.n, i + 1); v.pages = num(v.pages, 0); }); else delete it.volumes;
    if (!Array.isArray(it.passes) || !it.passes.length) it.passes = [{ n: 1, start: now(), done: {} }];
    it.passes.forEach((p, i) => { p.n = num(p.n, i + 1); if (!isObj(p.done)) p.done = {}; });
    if (it.glow && !(isObj(it.glow) && (it.glow.rgb === null || /^\d{1,3},\d{1,3},\d{1,3}$/.test(it.glow.rgb)))) delete it.glow;
  }
  s.events = s.events.filter((e) => isObj(e) && typeof e.item === 'string' && (e.kind !== 'badge' || /^b:([a-z]+:[0-3]|s:[a-z]+)$/.test(e.item) && (FAM[e.item.split(':')[1]] || SECRET[e.item.split(':')[2]])));
  s.events.forEach((e) => { e.kind = String(e.kind || ''); e.ts = num(e.ts, now()); e.xp = num(e.xp, 0); e.pass = num(e.pass, 1); if (e.rt != null) e.rt = num(e.rt, 0); if (e.cineXp != null) e.cineXp = num(e.cineXp, 0); if (e.fmt != null && !FORMATS[e.fmt]) e.fmt = ''; if (e.pages != null) e.pages = num(e.pages, 0); });
  for (const [id, m] of Object.entries(s.matches)) {
    if (!isObj(m) || !SAFE_ID.test(id) || m.id !== id) { delete s.matches[id]; continue; }
    m.ts = num(m.ts, now()); m.hs = numOrNull(m.hs); m.as = numOrNull(m.as); if (m.team && !TEAMS[m.team]) m.team = null;
    m.home = String(m.home || ''); m.away = String(m.away || '');
  }
  for (const [id, x] of Object.entries(s.shows)) { if (!isObj(x) || !SAFE_ID.test(id) || x.id !== id) delete s.shows[id]; else x.ts = num(x.ts, now()); }
  s.catchLog = s.catchLog.filter((c) => isObj(c) && SAFE_ID.test(String(c.id)));
  s.catchLog.forEach((c) => { c.ts = num(c.ts, now()); });
  for (const fed of Object.keys(s.catchFeed)) s.catchFeed[fed] = Array.isArray(s.catchFeed[fed]) ? s.catchFeed[fed].filter((x) => isObj(x) && SAFE_ID.test(String(x.id))).map((x) => Object.assign(x, { ts: num(x.ts, 0) })) : [];
  if (isObj(s.nba) && isObj(s.nba.feed)) for (const [id, f] of Object.entries(s.nba.feed)) {
    if (!isObj(f) || !SAFE_ID.test(id) || f.id !== id || !NBA_BY[f.h] || !NBA_BY[f.a]) { delete s.nba.feed[id]; continue; }
    f.ts = num(f.ts, 0); f.hs = numOrNull(f.hs); f.as = numOrNull(f.as); f.night = /^\d{4}-\d\d-\d\d$/.test(f.night) ? f.night : nightKey(f.ts);
  }
  const g = s.settings.goals; for (const k in g) g[k] = num(g[k], 0);
  for (const mk of Object.keys(s.goalsByMonth)) { const x = s.goalsByMonth[mk]; if (!isObj(x)) delete s.goalsByMonth[mk]; else for (const k in x) x[k] = num(x[k], 0); }
  for (const k of Object.keys(s.unlocked)) s.unlocked[k] = num(s.unlocked[k], now());
  s.settings.pseudo = String(s.settings.pseudo || '').slice(0, 24);
  s.settings.avatar = safeImg(s.settings.avatar); s.settings.avatarSrc = safeImg(s.settings.avatarSrc);
  s.lastLevel = num(s.lastLevel, 1);
}
/* V3 : la catégorie Anime disparaît. Anime en épisodes → série ; anime en un seul long épisode (film) → film.
   Coches, dates et XP déjà gagnée sont conservées. */
function animeIsFilm(it) {
  if (it.format === 'MOVIE') return true;
  const total = (it.seasons || []).reduce((a, x) => a + (x.count || 0), 0);
  return total === 1 && (it.runtime || 0) >= 60;
}
function mergeAnime(s) {
  for (const it of Object.values(s.items)) {
    if (it.type !== 'anime') continue;
    const film = animeIsFilm(it);
    it.type = film ? 'film' : 'serie';
    s.events.forEach((e) => {
      if (e.item !== it.id) return;
      e.type = it.type;
      if (film && e.kind === 'ep') { e.kind = 'film'; e.key = 'v'; }
    });
    if (film) {
      it.passes.forEach((ps) => { const ts = ps.done.s1e1; ps.done = ts ? { v: ts } : {}; });
      delete it.seasons; delete it.ended;
    }
  }
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
// séries à plusieurs saisons : la barre suit la saison en cours (comme le texte « S1 · Épisode 15 / 32 »)
// la barre suit la saison en cours (épisodes vus de cette saison / épisodes de la saison), comme le texte « 2 / 10 vus »
function curPct(item) {
  if (shape(item) === 'episodes' && item.type !== 'catch') {
    const nx = nextUnit(item);
    if (nx && nx.season && nx.season.count) return Math.round((epCountDone(item, nx.season) / nx.season.count) * 100);
  }
  return pct(item);
}
const epLabel = (item, nx) => (item.seasons.length > 1 ? 'S' + nx.s + ' · ' : '') + 'Ép. ' + nx.e;
// « Prochain : S1 · Ép. 3 » (ce qui t'attend)…
function progressText(item) {
  const p = progress(item); const sh = shape(item);
  if (sh === 'episodes') {
    if (item.type === 'catch') return plural(p.done, 'show vu', 'shows vus');
    const nx = nextUnit(item);
    if (!p.total) return 'Aucun épisode';
    if (!nx) return item.ended ? 'Terminé · ' + p.total + ' ép.' : 'À jour · ' + p.done + ' ép.';
    return 'Prochain : ' + epLabel(item, nx);
  }
  if (sh === 'tomes') { const nx = nextUnit(item); return nx ? 'Prochain : tome ' + nx.n : 'Terminé · ' + plural(p.total, 'tome'); }
  if (sh === 'livre') {
    if (item.volumes.length === 1) return p.done >= 1 ? 'Lu' : p.done ? 'Lu à moitié' : 'Pas commencé';
    const nx = nextUnit(item); return nx ? 'Prochain : tome ' + nx.n + (nx.mid ? '' : ' · moitié lue') : 'Saga terminée';
  }
  if (sh === 'jeu') return p.done ? 'Terminé' : item.status === 'encours' ? 'En cours' : 'Pas commencé';
  return p.done ? (item.passes.length > 1 ? 'Vu ' + item.passes.filter((x) => x.done.v).length + ' fois' : 'Vu') : 'Pas vu';
}
// … et « 2 / 10 vus » (où tu en es), affiché à droite
function countText(item) {
  const sh = shape(item); const p = progress(item);
  if (sh === 'episodes') {
    if (item.type === 'catch') return '';
    const nx = nextUnit(item); return nx && nx.season ? epCountDone(item, nx.season) + ' / ' + nx.season.count + ' vus' : '';
  }
  if (sh === 'tomes') return p.done + ' / ' + p.total + ' lus';
  if (sh === 'livre') return item.volumes.length > 1 ? Math.floor(p.done) + ' / ' + p.total + ' lus' : pct(item) + ' %';
  return '';
}
function nextUnit(item) {
  const pass = curPass(item); const sh = shape(item);
  if (sh === 'episodes') {
    for (const k of epKeys(item)) if (!pass.done[k]) { const i = epInfo(item, k); return Object.assign({ key: k }, i); }
    return null;
  }
  if (sh === 'tomes') { for (const v of item.volumes) if (!pass.done['t' + v.n]) return { key: 't' + v.n, n: v.n }; return null; }
  if (sh === 'livre') {
    for (const v of item.volumes) {
      if (pass.done['t' + v.n]) continue;
      const one = item.volumes.length === 1;
      if (!pass.done['t' + v.n + 'm']) return { key: 't' + v.n + 'm', n: v.n, mid: true };
      return { key: 't' + v.n, n: v.n };
    }
    return null;
  }
  if (sh === 'jeu') return pass.done.fin ? null : { key: 'fin' };
  return pass.done.v ? null : { key: 'v' };
}
/* ---------- événements (source de l'XP et de l'historique) ---------- */
function makeEvent(item, key, ts) {
  const pass = curPass(item); const sh = shape(item);
  const legacy = !!item.catchup; const rewatch = pass.n > 1;
  const ev = { id: uid(), ts, item: item.id, pass: pass.n, key, type: item.type, legacy, rewatch, xp: 0, kind: '' };
  if (sh === 'episodes') {
    const i = epInfo(item, key);
    ev.kind = 'ep'; ev.rt = (i && i.rt) || item.runtime || RUNTIME[item.type] || 40;
    if (item.type === 'catch') ev.xp = XP.ep.catch;
    else { const f = epFormat(item); ev.fmt = f || ''; ev.xp = f ? FORMATS[f].xp : 10; }
  } else if (sh === 'tomes') { ev.kind = 'tome'; ev.xp = XP.tome; }
  else if (sh === 'livre') {
    const v = volOf(item, key); const total = bookXp(v && v.pages); const mid = Math.round(total * 0.4);
    if (key.endsWith('m')) { ev.kind = 'livre_mi'; ev.xp = mid; }
    else { ev.kind = 'livre_fin'; ev.xp = (pass.done[key + 'm'] ? total - mid : total) + XP.livreFin; ev.pages = (v && v.pages) || 0; }
  } else if (sh === 'jeu') { ev.kind = 'jeu'; ev.xp = item.playtime ? clamp(Math.round(item.playtime * 12), 100, 600) : XP.jeu; }
  else {
    // film : 30 XP quelle que soit sa durée ; moins d'1 h (OAV, court-métrage) = XP du format épisode
    const f = item.runtime && item.runtime < 60 ? fmtOfRuntime(item.runtime) : null;
    ev.kind = 'film'; ev.xp = f ? FORMATS[f].xp : XP.film; ev.rt = item.runtime || RUNTIME.film; if (f) { ev.short = true; ev.fmt = f; }
  }
  if (legacy) ev.xp = 0; else if (rewatch) ev.xp = Math.round(ev.xp / 2);
  // plafond de vraisemblance : au-delà de 16 h de contenu en 24 h, la séance compte mais sans XP
  if (!legacy && (ev.kind === 'ep' || ev.kind === 'film') && overCap(ev)) { ev.xp = 0; ev.capped = true; capNotice(); }
  return ev;
}
const refMin = (e) => (e.kind === 'film' ? (e.short ? FORMATS[e.fmt].ref : 120) : e.type === 'catch' ? 120 : FORMATS[e.fmt] ? FORMATS[e.fmt].ref : 45);
function overCap(ev) {
  let sum = refMin(ev);
  for (const e of state.events) if ((e.kind === 'ep' || e.kind === 'film') && !e.legacy && !e.capped && e.ts > ev.ts - DAY && e.ts <= ev.ts) sum += refMin(e);
  return sum > CAP_MIN;
}
let capToldAt = 0;
function capNotice() {
  if (now() - capToldAt < 60000) return; capToldAt = now();
  setTimeout(() => toast('Tu as beaucoup regardé en 24 h : ces séances comptent dans ta progression, mais sans XP.', '', 5000), 0);
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
      // +50 par saison terminée (toutes les saisons, même pour une série d'une seule saison)
      item.seasons.forEach((s) => { if (seasonDone(item, s)) want['bonus:s' + s.n] = ['bonus_saison', XP.bonusSaison, s.n, item.seasons.length === 1]; });
      // série complète : 100 + 1 par épisode, 400 au plus
      if (item.ended && item.seasons.some((s) => s.count) && item.seasons.every((s) => !s.count || seasonDone(item, s))) want['bonus:all'] = ['bonus_serie', Math.min(400, 100 + seriesEps(item))];
    }
    if ((sh === 'tomes' || sh === 'livre') && item.ended && item.volumes.length > 1 && item.volumes.every((v) => pass.done['t' + v.n])) {
      want['bonus:all'] = ['bonus_saga', sh === 'livre' ? XP.bonusSagaLivre : XP.bonusSaga];
    }
    if (sh === 'film') sagaBonus(item, ts);
  }
  state.events = state.events.filter((e) => !(e.item === item.id && e.pass === pass.n && e.kind.startsWith('bonus') && e.kind !== 'bonus_tsaga' && !want[e.key]));
  for (const k in want) {
    if (state.events.some((e) => e.item === item.id && e.pass === pass.n && e.key === k)) continue;
    const [kind, xp, season, newRule] = want[k];
    const legacy = !!item.catchup; const rewatch = pass.n > 1;
    // règle ajoutée en 3.3.0 (bonus de saison d'une série à saison unique) : pas d'XP pour une saison finie avant
    const old = newRule && Object.values(pass.done).every((t) => t < (state.v33At || 0));
    state.events.push({ id: uid(), ts: ts || now(), item: item.id, pass: pass.n, key: k, type: item.type, kind, season,
      xp: legacy || old ? 0 : rewatch ? Math.round(xp / 2) : xp, legacy, rewatch });
  }
}
/* Saga (collection TMDB) : quand tous ses films sortis sont vus, +100 et +20 par film (300 au plus), une seule fois.
   Le bonus est rangé sur le film qui complète la saga ; il disparaît si la saga redevient incomplète. */
const filmSeen = (it) => it.passes.some((p) => p.done.v);
function sagaState(collId) {
  const c = state.colls && state.colls[collId]; if (!c || !c.parts || !c.parts.length) return null;
  const today = isoDay(new Date());
  const parts = c.parts.filter((x) => x.date && x.date <= today);
  const mine = Object.values(state.items).filter((i) => i.coll && String(i.coll.id) === String(collId) && i.src && i.src.api === 'tmdb');
  const seen = parts.filter((x) => mine.some((i) => String(i.src.id) === String(x.id) && filmSeen(i)));
  return { name: c.name, parts, seen, done: parts.length > 1 && seen.length === parts.length };
}
function sagaBonus(item, ts) {
  if (!item.coll) return; const id = String(item.coll.id); const key = 'bonus:saga:' + id;
  const st = sagaState(id); const has = state.events.find((e) => e.key === key);
  if (st && st.done && !has) {
    const legacy = !!item.catchup;
    state.events.push({ id: uid(), ts: ts || now(), item: item.id, pass: curPass(item).n, key, type: 'film', kind: 'bonus_tsaga', coll: id, xp: legacy ? 0 : Math.min(300, 100 + 20 * st.parts.length), legacy, rewatch: false });
  } else if (has && (!st || !st.done)) state.events = state.events.filter((e) => e.key !== key);
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
  const coll = state.items[id] && state.items[id].coll;
  delete state.items[id];
  state.events = state.events.filter((e) => e.item !== id);
  // la saga n'est plus complète : son bonus disparaît, même s'il était rangé sur un autre film
  if (coll) { const st = sagaState(String(coll.id)); if (!st || !st.done) state.events = state.events.filter((e) => e.key !== 'bonus:saga:' + coll.id); }
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
function favTeamSide(m) {
  const t = TEAMS[m.team]; if (!t) return null;
  if (String(m.homeId || '') === t.id) return 'home';
  if (String(m.awayId || '') === t.id) return 'away';
  return (m.home || '').includes(t.short) && !/inter/i.test(m.home || '') ? 'home' : 'away';
}
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
/* Catch via TMDB : PPV (films) et épisodes d'hebdos (séries), pour ajouter un show passé ou à venir */
const FED_GUESS = [
  ['WWE', 'major', /\bWWE\b|\bNXT\b|wrestlemania|summerslam|royal rumble|survivor series|money in the bank|elimination chamber|\braw\b|smackdown|saturday night.s main event/i],
  ['AEW', 'major', /\bAEW\b|dynamite|collision|rampage|full gear|\ball in\b|\ball out\b|double or nothing|worlds end|forbidden door|revolution|dynasty|grand slam/i],
  ['TNA', 'major', /\bTNA\b|impact wrestling|bound for glory|slammiversary/i], ['ROH', 'major', /\bROH\b|ring of honor/i],
  ['NJPW', 'major', /\bNJPW\b|new japan|wrestle kingdom/i], ['Stardom', 'major', /stardom/i], ['GCW', 'inde', /\bGCW\b|game changer wrestling/i]];
function guessFed(title) {
  const g = FED_GUESS.find(([, , rx]) => rx.test(title)); if (!g) return null;
  if (!state.feds.some((f) => f.name.toLowerCase() === g[0].toLowerCase())) state.feds.push({ name: g[0], kind: g[1] });
  return state.feds.find((f) => f.name.toLowerCase() === g[0].toLowerCase()).name;
}
const cleanShowName = (t) => String(t || '').replace(/^(WWE|AEW|NJPW|TNA|ROH|GCW)\s*[:\-–]?\s*/i, '').trim() || t;
const fmtLong = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
async function catchTmdbSearch(q) {
  const r = await tmdb('/search/multi', { query: q, include_adult: 'false' });
  return (r.results || []).filter((x) => x.media_type === 'movie' || x.media_type === 'tv').slice(0, 12).map((x) => ({
    mt: x.media_type, id: x.id, title: x.title || x.name, date: x.release_date || x.first_air_date || '', poster: x.poster_path ? IMG.poster + x.poster_path : '' }));
}
// remplit le formulaire catch à partir d'un résultat TMDB ; le mode (déjà vu / à venir) suit la date de diffusion
function catchFillFromTmdb({ name, air, poster, kind, ref, fedHint }) {
  const a = ui.add; const fed = guessFed(fedHint || name); if (fed) a.fed = fed;
  const today = isoDay(new Date());
  a.cplan = !!air && air > today; a.cair = air || ''; a.ctmdb = ref; a.cpick = null;
  a.ckind = kind; a.cposter = poster || '';
  a.cf = Object.assign(a.cf || {}, { show: cleanShowName(name), date: a.cplan ? air : today });
  a.ctm = null;
  render();
}
/* Shows AEW / WWE récupérés sur TheSportsDB (clé gratuite : plusieurs méthodes en repli) */
function tsdbShow(ev, fed) {
  const ts = tsdbTs(ev, '01:00:00');
  const name = String(ev.strEvent || '').replace(/^(AEW|WWE)\s*[:\-–]?\s*/i, '').trim() || ev.strEvent;
  const img = ev.strPoster || ev.strThumb || ev.strSquare || ev.strFanart || '';
  return { id: 'tsdb' + ev.idEvent, fed, name, kind: HEBDO_RX.test(ev.strEvent || '') ? 'hebdo' : 'ppv', ts, poster: img ? img.replace(/^http:/, 'https:') : '' };
}
async function syncCatch(fed, force) {
  const lid = CATCH_LEAGUES[fed]; if (!lid) return 0;
  if (!force && now() - (state.catchSync[fed] || 0) < 3 * 3600000) return 0;
  state.catchSync[fed] = now();
  const base = TSDB;
  const found = {};
  const take = (list) => (list || []).forEach((ev) => { if (ev && ev.idEvent && String(ev.idLeague || lid) === lid) { const sh = tsdbShow(ev, fed); if (!isNaN(sh.ts)) found[sh.id] = sh; } });
  for (const ep of ['eventspastleague', 'eventsnextleague']) {
    try { const r = await getJSON(`${base}${ep}.php?id=${lid}`); take(r.events || r.results); } catch (e) { /* limite ou hors ligne */ }
  }
  // repli : jour par jour sur les 10 derniers jours si la liste est vide ou trop courte
  if (Object.values(found).filter((x) => x.ts < now()).length < 4) {
    for (let i = 0; i <= 10; i++) {
      const d = new Date(now() - i * DAY); const day = d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
      try { const r = await getJSON(`${base}eventsday.php?d=${day}&l=${lid}`); take(r.events); } catch (e) { /* */ }
    }
  }
  const list = Object.values(found);
  if (list.length) {
    const old = {}; (state.catchFeed[fed] || []).forEach((x) => { old[x.id] = x; });
    list.forEach((x) => { old[x.id] = x; });
    state.catchFeed[fed] = Object.values(old).filter((x) => x.ts > now() - 60 * DAY).sort((a, b) => b.ts - a.ts).slice(0, 40);
  } else state.catchSync[fed] = now() - 2.5 * 3600000; // rien reçu : on réessaie dans 30 min
  save();
  if (ui.route === 'ajouter' && ui.add.type === 'catch') render();
  return list.length;
}

/* Shows programmés (galas, PPV à venir) : on les confirme comme un match */
function showsUpcoming() { const t = now(); return Object.values(state.shows).filter((s) => !s.seen && !s.dismissed && s.ts > t - 3 * 3600000).sort((a, b) => a.ts - b.ts); }
function showsPending() { const t = now(); return Object.values(state.shows).filter((s) => !s.seen && !s.dismissed && s.ts <= t - 3 * 3600000 && s.ts > t - 14 * DAY).sort((a, b) => b.ts - a.ts); }
function showSee(s, mode) {
  const ts = mode === 'direct' ? Math.min(now(), s.ts + 3 * 3600000) : now();
  const c = catchAdd({ fed: s.fed, show: s.name, kind: s.kind, mode, ts, poster: s.poster || '', showId: s.id });
  s.seen = { mode, logId: c.id }; s.dismissed = false;
}

/* =========================================================
   5. Statistiques, objectifs, niveaux, badges
   ========================================================= */
/* Calculs mis en cache le temps d'un affichage ; vidé à chaque modification (save, withXp) et à chaque rendu */
let MEMO = {};
function memoClear() { MEMO = {}; }
function memo(k, fn) { return k in MEMO ? MEMO[k] : (MEMO[k] = fn()); }
const realEvents = () => memo('re', () => state.events.filter((e) => !e.legacy));
const eventsByMonth = () => memo('bym', () => { const m = {}; for (const e of realEvents()) (m[monthKey(e.ts)] || (m[monthKey(e.ts)] = [])).push(e); return m; });
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
  evs = evs || eventsByMonth()[mk] || [];
  const g = goalsFor(mk);
  return Object.keys(GOAL_LABELS).filter((k) => g[k] > 0).map((k) => { const c = countCat(evs, k); return { key: k, label: GOAL_LABELS[k], count: c, target: g[k], met: c >= g[k] }; });
}
function monthXp(mk) {
  return memo('mx:' + mk, () => { const evs = eventsByMonth()[mk] || []; return evs.reduce((a, e) => a + e.xp, 0) + goalResults(mk, evs).filter((g) => g.met).length * XP.goal; });
}
function activeMonths() {
  return memo('am', () => { const set = new Set(Object.keys(eventsByMonth())); set.add(monthKey(now())); return [...set].sort().reverse(); });
}
function totalXp() { return memo('xp', () => activeMonths().reduce((a, mk) => a + monthXp(mk), 0)); }
/* ---------- niveaux (100) et rangs ---------- */
// courbe douce : le niveau 100 se gagne en ~8 ans au rythme moyen (~700 XP / mois)
const LEVEL_MAX = 100;
const xpForLevel = (n) => (n <= 1 ? 0 : Math.round(163 * Math.pow(n - 1, 1.31)));
function levelOf(xp) { let n = 1; while (n < LEVEL_MAX && xp >= xpForLevel(n + 1)) n++; return n; }
function levelInfo() {
  const xp = totalXp(); const lvl = levelOf(xp);
  if (lvl >= LEVEL_MAX) return { xp, lvl, into: xp - xpForLevel(lvl), need: 0, pct: 100, max: true };
  const base = xpForLevel(lvl); const next = xpForLevel(lvl + 1);
  return { xp, lvl, into: xp - base, need: next - base, pct: Math.round(((xp - base) / (next - base)) * 100) };
}
// 8 rangs de cinéma ; chacun débloque un cadre d'avatar (couleurs du dégradé, étoiles, éclat)
const RANKS = [
  { id: 'figurant', name: 'Figurant', lvl: 1, c: ['#5B9BFF', '#7C6BFF'], frame: 'Anneau bleu' },
  { id: 'second', name: 'Second rôle', lvl: 5, c: ['#E0A877', '#8A5530'], frame: 'Cadre bronze' },
  { id: 'premier', name: 'Premier rôle', lvl: 12, c: ['#F2F5F8', '#8C99A8'], frame: 'Cadre argent' },
  { id: 'tete', name: 'Tête d’affiche', lvl: 20, c: ['#FFE2A6', '#C8892E'], frame: 'Cadre or' },
  { id: 'scenariste', name: 'Scénariste', lvl: 35, c: ['#FFE2A6', '#C8892E'], frame: 'Cadre or étoilé', stars: 2 },
  { id: 'realisateur', name: 'Réalisateur', lvl: 50, c: ['#DDE8FF', '#7C6BFF'], frame: 'Cadre platine' },
  { id: 'producteur', name: 'Producteur', lvl: 75, c: ['#7FE3FF', '#B07CFF', '#FF8AC8'], frame: 'Cadre holographique' },
  { id: 'legende', name: 'Légende', lvl: 100, c: ['#FFF1C9', '#EDB965', '#FF8A5B'], frame: 'Cadre or lumineux', glow: true }
];
const rankOf = (lvl) => RANKS.filter((r) => lvl >= r.lvl).pop();
const nextRank = (lvl) => RANKS.find((r) => r.lvl > lvl) || null;

/* ---------- badges à paliers ---------- */
const TIERS = ['bronze', 'argent', 'or', 'platine'];
const TIER_LABEL = { bronze: 'Bronze', argent: 'Argent', or: 'Or', platine: 'Platine' };
const TIER_XP = [25, 50, 100, 300];
const SECRET_XP = 100;
// paliers réglés pour tomber vers les niveaux 5 / 25 / 50 / 100 au rythme moyen ; title = titre débloqué par l'or
const FAMS = [
  { id: 'episodes', group: 'series', label: 'Épisodes', icon: 'tv', tiers: [50, 500, 1000, 2500], unit: 'épisodes vus', title: 'Sériephile', desc: 'Regarder des épisodes de séries et de docus.' },
  { id: 'saisons', group: 'series', label: 'Saisons finies', icon: 'layers', tiers: [3, 30, 75, 200], unit: 'saisons terminées', title: 'Bingeur', desc: 'Terminer des saisons entières.' },
  { id: 'series', group: 'series', label: 'Séries complètes', icon: 'trophy', tiers: [1, 5, 15, 40], unit: 'séries terminées', title: 'Finisseur', desc: 'Terminer une série jusqu’au dernier épisode.' },
  { id: 'longcours', group: 'series', label: 'Long cours', icon: 'inf', tiers: [1, 2, 4, 8], unit: 'séries de plus de 100 épisodes', title: 'Endurant', desc: 'Terminer une série de plus de 100 épisodes.' },
  { id: 'films', group: 'films', label: 'Films vus', icon: 'reel', tiers: [5, 50, 150, 400], unit: 'films vus', title: 'Cinévore', desc: 'Voir des films (les revisionnages ne comptent pas).' },
  { id: 'revoir', group: 'films', label: 'Revisionnage', icon: 'redo', tiers: [1, 5, 10, 25], unit: 'œuvres revues', title: 'Nostalgique', desc: 'Revoir ou relire une œuvre déjà terminée.' },
  { id: 'decennies', group: 'films', label: 'Décennies', icon: 'clock', tiers: [3, 5, 7, 10], unit: 'décennies de cinéma', title: 'Archiviste', desc: 'Voir des films de décennies différentes.' },
  { id: 'voyageur', group: 'films', label: 'Voyageur', icon: 'globe', tiers: [3, 10, 20, 40], unit: 'pays d’origine', title: 'Globe-trotter', desc: 'Regarder des œuvres venues de pays différents.' },
  { id: 'cinephile', group: 'films', label: 'Cinéphile', icon: 'ticket', tiers: [1, 10, 25, 60], unit: 'séances en salle', title: 'Cinéphile', desc: 'Voir des films au cinéma.' },
  { id: 'sagas', group: 'films', label: 'Sagas', icon: 'star', tiers: [1, 3, 6, 15], unit: 'sagas complètes', title: 'Collectionneur', desc: 'Voir tous les films d’une saga (collections TMDB).' },
  { id: 'marathon', group: 'habits', label: 'Marathon', icon: 'bolt', tiers: [5, 8, 12, 20], unit: 'épisodes dans la journée (record)', title: 'Marathonien', desc: 'Regarder beaucoup d’épisodes dans la même journée. Un épisode de moins de 25 min compte pour ½.' },
  { id: 'jourmeme', group: 'habits', label: 'Le jour même', icon: 'cal', tiers: [1, 15, 35, 100], unit: 'épisodes vus le jour de leur diffusion', title: 'Toujours à l’heure', desc: 'Regarder un épisode le jour de sa diffusion.' },
  { id: 'noctambule', group: 'habits', label: 'Noctambule', icon: 'moon', tiers: [1, 30, 75, 200], unit: 'séances entre minuit et 5 h', title: 'Noctambule', desc: 'Regarder un épisode ou un film entre minuit et 5 h.' },
  { id: 'fidele', group: 'habits', label: 'Fidèle', icon: 'heart', tiers: [1, 2, 4, 10], unit: 'séries finies plus d’un an après leur début', title: 'Fidèle', desc: 'Terminer une série commencée plus d’un an avant.' },
  { id: 'matchs', group: 'perso', label: 'Matchs', icon: 'ball', tiers: [10, 100, 300, 750], unit: 'matchs regardés', title: 'Supporter', desc: 'Regarder des matchs.' },
  { id: 'sixers', group: 'perso', label: 'Sixers', icon: 'ball', tiers: [5, 50, 150, 400], unit: 'matchs des Sixers', title: 'Trust the Process', desc: 'Regarder des matchs des Philadelphia 76ers.' },
  { id: 'milan', group: 'perso', label: 'Milan', icon: 'ball', tiers: [3, 30, 75, 200], unit: 'matchs du Milan', title: 'Rossonero', desc: 'Regarder des matchs du Milan AC.' },
  { id: 'catch', group: 'perso', label: 'Catch', icon: 'belt', tiers: [10, 75, 200, 500], unit: 'shows de catch', title: 'Ringside', desc: 'Regarder des shows de catch.' },
  { id: 'tomes', group: 'perso', label: 'Tomes', icon: 'volume', tiers: [5, 75, 200, 500], unit: 'tomes lus', title: 'Bédéphile', desc: 'Lire des tomes de BD et de manga.' },
  { id: 'livres', group: 'perso', label: 'Livres', icon: 'bookOpen', tiers: [1, 15, 40, 100], unit: 'livres finis', title: 'Lecteur', desc: 'Finir des livres.' },
  { id: 'pages', group: 'perso', label: 'Pages', icon: 'bookOpen', tiers: [500, 5000, 12000, 30000], unit: 'pages lues', title: 'Rat de bibliothèque', desc: 'Lire des pages de livres.' },
  { id: 'jeux', group: 'perso', label: 'Jeux finis', icon: 'game', tiers: [1, 5, 15, 40], unit: 'jeux terminés', title: 'Gamer', desc: 'Terminer des jeux vidéo.' }
];
const FAM = Object.fromEntries(FAMS.map((f) => [f.id, f]));
const SECRETS = [
  { id: 'triple', label: 'Triple séance', icon: 'reel', desc: 'Voir 3 films dans la même journée.' },
  { id: 'integrale', label: 'Intégrale', icon: 'trophy', desc: 'Regarder une série entière en moins de 7 jours.' },
  { id: 'reveillon', label: 'Réveillon', icon: 'star', desc: 'Regarder quelque chose le 31 décembre après 23 h.' },
  { id: 'pile', label: 'Pile à l’heure', icon: 'cal', desc: 'Voir un film le jour de sa sortie.' },
  { id: 'retour', label: 'Retour aux sources', icon: 'redo', desc: 'Reprendre une série après plus de 6 mois d’arrêt.' },
  { id: 'classique', label: 'Séance classique', icon: 'ticket', desc: 'Voir en salle un film sorti il y a plus de 25 ans.' },
  { id: 'parfait', label: 'Mois parfait', icon: 'target', desc: 'Atteindre tous les objectifs d’un mois.' }
];
const SECRET = Object.fromEntries(SECRETS.map((s) => [s.id, s]));
const GROUPS = [['series', 'Séries'], ['films', 'Films'], ['habits', 'Habitudes'], ['perso', 'Ma version']];
const dayOf = (ts) => isoDay(new Date(ts));
const epWeight = (e) => (e.fmt === 'court' ? 0.5 : 1);
const seriesEps = (it) => (it && it.seasons ? it.seasons.reduce((a, s) => a + (s.count || 0), 0) : 0);
/* Un seul passage chronologique sur les événements. Les badges de collection comptent aussi le rattrapage ;
   les badges d'habitudes et les secrets ne comptent que les vraies séances (ni rattrapage, ni surplus du plafond). */
function badgeData() {
  return memo('bdg', () => {
    const evs = state.events.slice().sort((a, b) => a.ts - b.ts);
    const val = {}; const hits = {}; const sec = {};
    FAMS.forEach((f) => { val[f.id] = 0; hits[f.id] = []; });
    const bump = (fid, v, e) => {
      const f = FAM[fid]; if (v <= val[fid]) return; val[fid] = v;
      f.tiers.forEach((t, i) => { if (v >= t && !hits[fid][i]) hits[fid][i] = { ts: e.ts, item: e.item }; });
    };
    const secret = (id, e) => { if (!sec[id]) sec[id] = { ts: e.ts, item: e.item }; };
    const decades = new Set(); const countries = new Set(); const seenItems = new Set(); const rewatched = new Set();
    const dayEps = {}; const dayFilms = {}; const firstEp = {}; const lastEp = {};
    let n = { episodes: 0, saisons: 0, series: 0, longcours: 0, films: 0, sagas: 0, cine: 0, jour: 0, noct: 0, fidele: 0, matchs: 0, sixers: 0, milan: 0, catch: 0, tomes: 0, livres: 0, pages: 0, jeux: 0 };
    for (const e of evs) {
      if (e.kind === 'badge') continue;
      const it = state.items[e.item]; const real = !e.legacy && !e.capped;
      const isEp = e.kind === 'ep' && e.type !== 'catch'; const isFilm = e.kind === 'film';
      if (isEp) {
        bump('episodes', ++n.episodes, e);
        if (real) {
          const d = dayOf(e.ts); dayEps[d] = (dayEps[d] || 0) + epWeight(e); bump('marathon', dayEps[d], e);
          const inf = it && epInfo(it, e.key); const ep = inf && inf.season && inf.season.eps && inf.season.eps[inf.e - 1];
          if (ep && ep.air && ep.air === d) bump('jourmeme', ++n.jour, e);
          if (lastEp[e.item] && e.ts - lastEp[e.item] > 180 * DAY) secret('retour', e);
        }
        if (!firstEp[e.item]) firstEp[e.item] = e.ts; lastEp[e.item] = e.ts;
      }
      if (isFilm && !e.rewatch) {
        bump('films', ++n.films, e);
        if (it && +it.year) { decades.add(Math.floor(+it.year / 10)); bump('decennies', decades.size, e); }
      }
      if (isFilm && real) {
        const d = dayOf(e.ts); if (!e.short) { dayFilms[d] = (dayFilms[d] || 0) + 1; if (dayFilms[d] >= 3) secret('triple', e); }
        if (e.cine) { bump('cinephile', ++n.cine, e); if (it && +it.year && +it.year <= new Date(e.ts).getFullYear() - 25) secret('classique', e); }
        if (it && it.release && it.release === d) secret('pile', e);
      }
      if ((isEp || isFilm) && real) {
        const dt = new Date(e.ts);
        if (dt.getHours() < 5) bump('noctambule', ++n.noct, e);
        if (dt.getMonth() === 11 && dt.getDate() === 31 && dt.getHours() === 23) secret('reveillon', e);
      }
      if ((isEp || isFilm || e.kind === 'tome' || e.kind === 'livre_fin' || e.kind === 'jeu') && !seenItems.has(e.item)) {
        seenItems.add(e.item); if (it && Array.isArray(it.countries)) { it.countries.forEach((c) => countries.add(c)); bump('voyageur', countries.size, e); }
      }
      if (e.rewatch && !e.kind.startsWith('bonus')) { const k = e.item + ':' + e.pass; if (!rewatched.has(k)) { rewatched.add(k); bump('revoir', rewatched.size, e); } }
      if (e.kind === 'bonus_saison') bump('saisons', ++n.saisons, e);
      if (e.kind === 'bonus_serie') {
        bump('series', ++n.series, e);
        if (seriesEps(it) >= 100) bump('longcours', ++n.longcours, e);
        if (real && firstEp[e.item] && e.ts - firstEp[e.item] >= 365 * DAY) bump('fidele', ++n.fidele, e);
        if (real && firstEp[e.item] && e.ts - firstEp[e.item] <= 7 * DAY && !state.events.some((x) => x.item === e.item && x.kind === 'ep' && (x.legacy || x.capped))) secret('integrale', e);
      }
      if (e.kind === 'bonus_tsaga') bump('sagas', ++n.sagas, e);
      if (e.kind === 'match') { bump('matchs', ++n.matchs, e); if (e.team === 'sixers') bump('sixers', ++n.sixers, e); if (e.team === 'milan') bump('milan', ++n.milan, e); }
      if (e.kind === 'catch' || (e.kind === 'ep' && e.type === 'catch')) bump('catch', ++n.catch, e);
      if (e.kind === 'tome') bump('tomes', ++n.tomes, e);
      if (e.kind === 'livre_fin') { bump('livres', ++n.livres, e); n.pages += e.pages || 0; bump('pages', n.pages, e); }
      if (e.kind === 'jeu') bump('jeux', ++n.jeux, e);
    }
    // mois parfait : un mois terminé (ou le mois en cours) où tous les objectifs sont atteints
    for (const mk of activeMonths().slice().reverse()) {
      const r = goalResults(mk); if (r.length && r.every((g) => g.met)) { const m = (eventsByMonth()[mk] || []); const last = m[m.length - 1]; secret('parfait', { ts: last ? last.ts : now(), item: '' }); break; }
    }
    return { val, hits, sec };
  });
}
// paliers obtenus d'une famille (0 à 4) et meilleur palier
const famTier = (fid) => (state.tiers[fid] || []).filter(Boolean).length;
function badgeCount() {
  const fams = famsShown(); const tiers = fams.reduce((a, f) => a + famTier(f.id), 0); const sec = Object.keys(state.secrets || {}).length;
  return { won: tiers + sec, total: fams.length * 4 + SECRETS.length, sec };
}
/* Attribution : chaque palier atteint rapporte son XP une seule fois (événement « badge »).
   Un palier atteint avant la 3.3.0, ou découvert après coup pour une séance ancienne, entre dans la collection sans XP. */
function badgeEvent(id, xp, ts) { return { id: uid(), ts, item: 'b:' + id, key: 'badge', kind: 'badge', type: 'badge', xp, legacy: false, rewatch: false }; }
function checkUnlocks(silent) {
  const d = badgeData(); const fresh = []; const cutoff = state.v33At || now();
  state.tiers = state.tiers || {}; state.secrets = state.secrets || {};
  for (const f of FAMS) {
    const have = state.tiers[f.id] || (state.tiers[f.id] = []);
    f.tiers.forEach((t, i) => {
      const h = d.hits[f.id][i];
      if (h && !have[i]) {
        const retro = silent || h.ts < cutoff;
        have[i] = { ts: retro ? h.ts : now(), item: h.item, retro };
        if (!retro) { state.events.push(badgeEvent(f.id + ':' + i, TIER_XP[i], now())); fresh.push({ fam: f.id, i }); }
      } else if (!h && have[i]) { have[i] = null; state.events = state.events.filter((e) => e.item !== 'b:' + f.id + ':' + i); }
    });
  }
  for (const s of SECRETS) {
    const h = d.sec[s.id];
    if (h && !state.secrets[s.id]) {
      const retro = silent || h.ts < cutoff; state.secrets[s.id] = { ts: retro ? h.ts : now(), item: h.item, retro };
      if (!retro) { state.events.push(badgeEvent('s:' + s.id, SECRET_XP, now())); fresh.push({ secret: s.id }); }
    } else if (!h && state.secrets[s.id]) { delete state.secrets[s.id]; state.events = state.events.filter((e) => e.item !== 'b:s:' + s.id); }
  }
  memoClear();
  const lvl = levelOf(totalXp()); const before = state.lastLevel || lvl;
  const rankUp = !silent && rankOf(lvl).lvl > rankOf(before).lvl ? rankOf(lvl) : null;
  state.lastLevel = lvl;
  if (!silent) celebrate(fresh, rankUp);
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
const AL_FIELDS = 'id title{romaji english} coverImage{large} bannerImage volumes status startDate{year}';
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
  if (type === 'manga') {
    const d = await anilist(`query($s:String){Page(perPage:15){media(search:$s,type:MANGA,sort:SEARCH_MATCH){${AL_FIELDS}}}}`, { s: q });
    return d.Page.media.map((m) => ({ src: { api: 'anilist', id: m.id }, title: m.title.english || m.title.romaji, year: (m.startDate && m.startDate.year) || '',
      poster: (m.coverImage && m.coverImage.large) || '', backdrop: m.bannerImage || '', volumes: m.volumes,
      ended: m.status === 'FINISHED', sub: m.volumes ? m.volumes + ' tomes' : m.status === 'FINISHED' ? 'Terminé' : 'En cours de parution' }));
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
    return (r.results || []).map((g) => ({ src: { api: 'rawg', id: g.id }, title: g.name, year: (g.released || '').slice(0, 4), poster: g.background_image || '', backdrop: g.background_image || '', sub: (g.platforms || []).slice(0, 3).map((p) => p.platform.name).join(', '), playtime: g.playtime || 0 }));
  }
  return [];
}
async function buildFromResult(type, r, opt) {
  const base = { type, title: r.title, year: r.year, poster: r.poster, backdrop: r.backdrop || '', subtitle: r.sub || '', src: r.src, overview: r.overview || '' };
  if (r.playtime) base.playtime = r.playtime; // jeux : durée moyenne RAWG (heures), sert à l'XP
  if (r.src.api === 'tmdb') {
    if (r.src.kind === 'movie') {
      try { const d = await tmdb('/movie/' + r.src.id); base.runtime = d.runtime || 0; base.overview = d.overview || base.overview; if (d.backdrop_path) base.backdrop = IMG.backdrop + d.backdrop_path; Object.assign(base, tmdbMeta(d, 'movie')); } catch (e) { /* hors ligne */ }
      return base;
    }
    const d = await tmdb('/tv/' + r.src.id);
    base.seasons = (d.seasons || []).filter((s) => s.season_number > 0 && s.episode_count > 0).map((s) => ({ n: s.season_number, name: s.name, count: s.episode_count, eps: null }));
    if (!base.seasons.length) base.seasons = [{ n: 1, name: 'Saison 1', count: d.number_of_episodes || 0, eps: null }];
    base.ended = d.status === 'Ended' || d.status === 'Canceled';
    base.runtime = (d.episode_run_time && d.episode_run_time[0]) || 0;
    if (d.backdrop_path) base.backdrop = IMG.backdrop + d.backdrop_path;
    base.overview = d.overview || base.overview; base.syncedAt = now(); Object.assign(base, tmdbMeta(d, 'tv'));
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
const seasonLoading = {};
async function loadSeason(item, n) {
  const k = item.id + ':' + n; if (seasonLoading[k]) return; seasonLoading[k] = true;
  try {
    const d = await tmdb('/tv/' + item.src.id + '/season/' + n);
    const s = item.seasons.find((x) => x.n === n); if (!s) return;
    s.eps = (d.episodes || []).map((e) => ({ t: e.name, still: e.still_path ? IMG.still + e.still_path : '', rt: e.runtime || 0, air: e.air_date || '' }));
    if (s.eps.length > s.count) s.count = s.eps.length;
    save(); render();
  } catch (e) {
    // échec (hors connexion, limite…) : on réessaiera dans une minute au lieu de jamais
    seasonLoading[k] = 'fail'; setTimeout(() => { if (seasonLoading[k] === 'fail') delete seasonLoading[k]; }, 60000);
  }
}
/* Anciens anime ajoutés via AniList (une seule liste d'épisodes) : on peut les relier à TMDB
   pour avoir les saisons, les titres français et les miniatures, sans perdre ce qui est coché */
const normT = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/g, ' ').trim();
async function tmdbTvCandidates(titles, year) {
  const out = new Map();
  for (const t of titles.slice(0, 3)) {
    try {
      const r = await tmdb('/search/tv', { query: t });
      (r.results || []).forEach((x) => { if (!out.has(x.id)) out.set(x.id, x); });
    } catch (e) { if (String(e.message).startsWith('NOKEY')) throw e; }
    if (out.size >= 8) break;
  }
  const names = titles.map(normT);
  return [...out.values()].map((x) => {
    const y = +(x.first_air_date || '').slice(0, 4);
    let score = 0;
    if ((x.genre_ids || []).includes(16)) score += 3;
    if ((x.origin_country || []).includes('JP') || x.original_language === 'ja') score += 2;
    if (names.includes(normT(x.name)) || names.includes(normT(x.original_name))) score += 4;
    if (year && y) score += y === +year ? 3 : Math.abs(y - year) <= 1 ? 1 : -2;
    return { x, score };
  }).sort((a, b) => b.score - a.score);
}
async function tmdbTvSeasons(id) {
  const d = await tmdb('/tv/' + id);
  let seasons = (d.seasons || []).filter((s) => s.season_number > 0 && s.episode_count > 0).map((s) => ({ n: s.season_number, name: s.name, count: s.episode_count, eps: null }));
  if (!seasons.length) seasons = [{ n: 1, name: 'Saison 1', count: d.number_of_episodes || 0, eps: null }];
  return { d, seasons };
}
// remplace l'épisodage AniList (une seule liste) par les saisons TMDB, sans perdre ce qui est coché
async function linkTmdb(it, tvId) {
  const { d, seasons } = await tmdbTvSeasons(tvId);
  const total = seasons.reduce((a, x) => a + x.count, 0);
  const map = (abs) => { let left = abs; for (const x of seasons) { if (left <= x.count) return 's' + x.n + 'e' + left; left -= x.count; } const last = seasons[seasons.length - 1]; return 's' + last.n + 'e' + (last.count + left); };
  const re = /^s1e(\d+)$/;
  it.passes.forEach((ps) => { const nd = {}; Object.keys(ps.done).forEach((k) => { const m = re.exec(k); nd[m ? map(+m[1]) : k] = ps.done[k]; }); ps.done = nd; });
  state.events.forEach((e) => { if (e.item === it.id) { const m = re.exec(e.key || ''); if (m) e.key = map(+m[1]); } });
  const old = it.seasons.reduce((a, x) => a + x.count, 0);
  if (old > total) seasons[seasons.length - 1].count += old - total;
  it.seasons = seasons;
  it.src = { api: 'tmdb', id: tvId, kind: 'tv', al: it.src && it.src.api === 'anilist' ? it.src.id : (it.src && it.src.al) };
  it.ended = d.status === 'Ended' || d.status === 'Canceled';
  if (d.overview) it.overview = d.overview;
  if (!it.backdrop && d.backdrop_path) it.backdrop = IMG.backdrop + d.backdrop_path;
  it.runtime = it.runtime || (d.episode_run_time && d.episode_run_time[0]) || 0;
  it.syncedAt = now(); it.tmdbTried = true;
  delete ui.season[it.id];
  // badges de saisons déjà terminées avant le lien : sans XP
  const cu = it.catchup; it.catchup = true; checkBonuses(it); it.catchup = cu;
  Object.keys(seasonLoading).forEach((k) => { if (k.startsWith(it.id + ':')) delete seasonLoading[k]; });
}
const needsTmdbLink = (it) => it.seasons && it.src && it.src.api === 'anilist' && it.type !== 'catch';
async function autoLinkTmdb(it) {
  if (!needsTmdbLink(it) || it.tmdbTried || !(state.settings.tmdbKey || '').trim()) return;
  it.tmdbTried = true; save();
  try {
    const c = await tmdbTvCandidates([it.title].concat(it.altTitles || []), it.year);
    if (c[0] && c[0].score >= 8) { await linkTmdb(it, c[0].x.id); save(); render(); toast('Titres et miniatures récupérés sur TMDB', 'gold', 2400); }
  } catch (e) { /* on proposera le bouton */ }
}
/* Données utiles aux badges : pays d'origine, date de sortie, saga (collection), durée moyenne des épisodes */
function tmdbMeta(d, kind) {
  const countries = [...new Set([].concat(d.origin_country || [], (d.production_countries || []).map((c) => c.iso_3166_1)))].filter((c) => /^[A-Z]{2}$/.test(c)).slice(0, 6);
  const m = { countries, release: String(d.release_date || d.first_air_date || '').slice(0, 10), metaAt: now() };
  if (kind === 'movie' && d.belongs_to_collection) m.coll = { id: d.belongs_to_collection.id, name: d.belongs_to_collection.name };
  if (kind === 'tv' && d.episode_run_time && d.episode_run_time[0]) m.runtime = d.episode_run_time[0];
  return m;
}
async function loadColl(id) {
  state.colls = state.colls || {};
  const c = await tmdb('/collection/' + id);
  state.colls[id] = { name: c.name || '', parts: (c.parts || []).map((x) => ({ id: x.id, title: x.title || x.name || '', date: x.release_date || '', poster: x.poster_path ? IMG.poster + x.poster_path : '' })), at: now() };
}
/* Complète en arrière-plan les œuvres TMDB déjà enregistrées (au plus 30 par passage, une requête toutes les 0,4 s) */
let enrichRun = false;
async function enrichTmdb() {
  if (enrichRun || !(state.settings.tmdbKey || '').trim() || navigator.onLine === false) return;
  enrichRun = true; let changed = false;
  try {
    const todo = Object.values(state.items).filter((i) => i.src && i.src.api === 'tmdb' && !i.metaAt && (i.src.kind === 'movie' || i.src.kind === 'tv')).slice(0, 30);
    for (const it of todo) {
      try { const d = await tmdb('/' + it.src.kind + '/' + it.src.id); const m = tmdbMeta(d, it.src.kind); if (it.runtime) delete m.runtime; Object.assign(it, m); changed = true; }
      catch (e) { if (String(e.message).startsWith('NOKEY') || String(e.message).includes('401')) break; it.metaAt = now(); }
      await sleep(400);
    }
    const colls = [...new Set(Object.values(state.items).filter((i) => i.coll).map((i) => String(i.coll.id)))].filter((id) => !state.colls || !state.colls[id] || now() - state.colls[id].at > 30 * DAY);
    for (const id of colls.slice(0, 10)) { try { await loadColl(id); changed = true; } catch (e) { /* plus tard */ } await sleep(400); }
    if (changed) { Object.values(state.items).filter((i) => i.coll && shape(i) === 'film').forEach((i) => sagaBonus(i)); checkUnlocks(); save(); if (['profil', 'badges', 'item'].includes(ui.route)) render(); else renderFs(); }
  } finally { enrichRun = false; }
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
        const r = await getJSON(`${TSDB}${ep}.php?id=${t.id}`);
        const list = r.results || r.events || [];
        list.forEach((ev) => upsertMatch(ev, t)); ok++;
      } catch (e) { /* hors ligne ou limite atteinte */ }
    }
  }
  if (ok) state.sportOk = now();
  save();
  if (ok && ['encours', 'biblio', 'match'].includes(ui.route)) render();
  syncLogos().catch(() => {});
  return ok;
}
/* ---------- Toute la NBA : dernier match de chacune des 30 équipes, une fois par jour ---------- */
let nbaRun = null; // { done, total } pendant une récupération
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let NBA_GAP = 2100; // espacement des requêtes (clé gratuite : ~30 par minute)
function nbaDue() { const b = new Date(); b.setHours(10, 0, 0, 0); if (Date.now() < b.getTime()) b.setDate(b.getDate() - 1); return (state.nba.lastRun || 0) < b.getTime(); }
function nbaLearn(name, id) {
  const ab = nbaAbbr(name); if (!ab || !id) return false;
  id = String(id); if (state.nba.ids[ab] === id) return false;
  state.nba.ids[ab] = id; return true;
}
function nbaAddFeed(ev) {
  if (!ev || !ev.idEvent) return false;
  const lg = String(ev.strLeague || ''); if ((ev.idLeague && String(ev.idLeague) !== NBA_LEAGUE && !/^NBA( Cup)?$/i.test(lg)) || /summer|g league|all-star/i.test(lg)) return false;
  const h = nbaAbbr(ev.strHomeTeam), a = nbaAbbr(ev.strAwayTeam); if (!h || !a) return false;
  const ts = tsdbTs(ev);
  if (isNaN(ts) || ts > now()) return false;
  const id = 'tsdb' + ev.idEvent; const isNew = !state.nba.feed[id];
  const sc = (v) => v != null && v !== '' ? +v : null;
  state.nba.feed[id] = { id, h, a, home: ev.strHomeTeam, away: ev.strAwayTeam, homeId: String(ev.idHomeTeam || ''), awayId: String(ev.idAwayTeam || ''), ts, hs: sc(ev.intHomeScore), as: sc(ev.intAwayScore), night: nightKey(ts), thumb: ev.strThumb || '' };
  return isNew;
}
function nbaProgress() { const el = document.getElementById('nba-prog'); if (el && nbaRun) el.textContent = `Récupération des matchs… ${nbaRun.done} / ${nbaRun.total} équipes`; }
async function syncNba(force) {
  if (nbaRun || (!force && !nbaDue())) return 0;
  const N = state.nba; const base = TSDB;
  nbaRun = { done: 0, total: 30 }; if (ui.route === 'biblio') render();
  let calls = 0, fails = 0, got = 0;
  const call = async (url) => { if (calls) await sleep(NBA_GAP); calls++; return getJSON(base + url); };
  // 1. tenter d'abord la liste des équipes (souvent tronquée avec la clé gratuite)
  if (Object.keys(N.ids).length < 30 && now() - (N.allTried || 0) > 7 * DAY) {
    N.allTried = now();
    try { const r = await call('lookup_all_teams.php?id=' + NBA_LEAGUE); (r.teams || []).forEach((t) => nbaLearn(t.strTeam, t.idTeam)); } catch (e) { /* */ }
  }
  // 1 bis. tant qu'il manque des équipes : matchs récents de toute la ligue (fait apparaître les 30 équipes)
  if (Object.keys(N.ids).length < 30) {
    const eps = ['eventspastleague.php?id=' + NBA_LEAGUE, 'eventsnextleague.php?id=' + NBA_LEAGUE];
    for (let d = 1; d <= 6 && eps.length < 8; d++) { const x = new Date(now() - d * DAY); eps.push('eventsday.php?l=' + NBA_LEAGUE + '&d=' + x.getUTCFullYear() + '-' + pad2(x.getUTCMonth() + 1) + '-' + pad2(x.getUTCDate())); }
    for (const ep of eps) {
      if (Object.keys(N.ids).length >= 30) break;
      try { const r = await call(ep); (r.events || r.results || []).forEach((ev) => { nbaLearn(ev.strHomeTeam, ev.idHomeTeam); nbaLearn(ev.strAwayTeam, ev.idAwayTeam); if (nbaAddFeed(ev)) got++; }); } catch (e) { /* */ }
    }
  }
  // 2. dernier match de chaque équipe connue ; les adversaires font découvrir les équipes manquantes
  const queue = [...new Set(Object.values(N.ids))]; const done = new Set();
  while (queue.length && calls < 50) {
    const id = queue.shift(); if (done.has(id)) continue; done.add(id);
    try {
      const r = await call('eventslast.php?id=' + id);
      (r.results || r.events || []).forEach((ev) => {
        [[ev.strHomeTeam, ev.idHomeTeam], [ev.strAwayTeam, ev.idAwayTeam]].forEach(([n, i]) => { nbaLearn(n, i); const k = String(i || ''); if (k && nbaAbbr(n) && !done.has(k) && !queue.includes(k)) queue.push(k); });
        if (nbaAddFeed(ev)) got++;
      });
    } catch (e) { fails++; }
    nbaRun.done = done.size; nbaRun.total = Math.max(30, done.size + queue.length); nbaProgress();
  }
  if (fails <= done.size / 2) N.lastRun = now(); // trop d'échecs : on retentera plus tard
  Object.keys(N.feed).forEach((k) => { if (N.feed[k].ts < now() - 21 * DAY) delete N.feed[k]; });
  nbaRun = null; save();
  if (['biblio', 'ajouter'].includes(ui.route)) render();
  syncLogos().catch(() => {});
  return got;
}
function nbaSee(f, mode) {
  let m = state.matches[f.id];
  if (!m) {
    const fav = f.h === 'PHI' || f.a === 'PHI';
    m = { id: f.id, ext: true, team: fav ? 'sixers' : null, sport: 'nba', league: 'NBA', home: f.home, away: f.away, homeId: f.homeId, awayId: f.awayId, ts: f.ts, hs: f.hs, as: f.as, seen: null, dismissed: false };
    state.matches[f.id] = m;
  }
  if (!m.seen) matchSee(m, mode);
}
/* Logos d'équipes : récupérés une seule fois via TheSportsDB, puis gardés sur le téléphone */
let logosRun = null;
function syncLogos() {
  // une seule récupération à la fois (le sport et la NBA la lançaient en parallèle)
  if (!logosRun) logosRun = syncLogosNow().finally(() => { logosRun = null; });
  return logosRun;
}
async function syncLogosNow() {
  state.logos = state.logos || {}; state.logoTry = state.logoTry || {};
  const ids = new Set(Object.values(TEAMS).map((t) => t.id));
  Object.values(state.matches).forEach((m) => { if (m.ext) { if (m.homeId) ids.add(String(m.homeId)); if (m.awayId) ids.add(String(m.awayId)); } });
  Object.values((state.nba && state.nba.ids) || {}).forEach((id) => ids.add(String(id)));
  const todo = [...ids].filter((id) => !state.logos[id] && now() - (state.logoTry[id] || 0) > 7 * 86400000).slice(0, 36);
  let got = 0;
  for (const [i, id] of todo.entries()) {
    if (i) await sleep(todo.length > 6 ? NBA_GAP : 300);
    state.logoTry[id] = now();
    try {
      const r = await getJSON(`${TSDB}lookupteam.php?id=${id}`);
      const t = r.teams && r.teams[0];
      const url = t && (t.strBadge || t.strTeamBadge);
      if (url) { state.logos[id] = url.replace(/^http:/, 'https:') + (/\/tiny$|\/small$|\/medium$/.test(url) ? '' : '/small'); got++; }
    } catch (e) { /* on réessaiera plus tard */ }
  }
  if (todo.length) save();
  if (got && ['encours', 'biblio', 'match', 'histo'].includes(ui.route)) render();
}
function upsertMatch(ev, t) {
  if (!ev || !ev.idEvent) return;
  const id = 'tsdb' + ev.idEvent;
  const ts = tsdbTs(ev); if (isNaN(ts)) return;
  const m = state.matches[id] || { id, seen: null, dismissed: false };
  Object.assign(m, { ext: true, team: t.key, sport: t.sport, league: ev.strLeague || t.league, home: ev.strHomeTeam, away: ev.strAwayTeam,
    homeId: ev.idHomeTeam, awayId: ev.idAwayTeam, ts,
    hs: ev.intHomeScore != null && ev.intHomeScore !== '' ? +ev.intHomeScore : null, as: ev.intAwayScore != null && ev.intAwayScore !== '' ? +ev.intAwayScore : null });
  state.matches[id] = m;
}

/* =========================================================
   7. Interface : icônes, pictogrammes, affiches, toasts
   ========================================================= */
const ICONS = {
  play: 'M8 5v14l11-7z', star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3.5 2', user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.5 20.5c1.3-3.6 4.2-5.4 7.5-5.4s6.2 1.8 7.5 5.4',
  biblio: 'M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z M9 4v16',
  check: 'M5 12.5l4.5 4.5L19 7.5', back: 'M19 12H5M11 6l-6 6 6 6', chevD: 'M6 9l6 6 6-6', chevL: 'M15 6l-6 6 6 6', chevR: 'M9 6l6 6-6 6',
  plus: 'M12 5v14M5 12h14', redo: 'M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4-4',
  eyeOff: 'M3 3l18 18M10.6 6.1A9.9 9.9 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-2.4 3M6.6 6.6C4.3 8.2 3 12 3 12s4 6 9 6c1.6 0 3-.4 4.3-1.1',
  eye: 'M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  lock: 'M5 11h14v10H5z M8 11V8a4 4 0 0 1 8 0v3', trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13', edit: 'M4 20h4L19 9l-4-4L4 16z',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16', upload: 'M12 21V9M7 14l5-5 5 5M4 3h16', layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
  image: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M3 16l5-5 4 4 3-3 6 6 M15.5 8.5h.01',
  list: 'M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01', target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  dots: 'M5 12h.01 M12 12h.01 M19 12h.01', x: 'M6 6l12 12M18 6L6 18', sync: 'M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9 M18 3v4h-4 M6 21v-4h4',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  // pictogrammes de catégories
  tv: 'M3.5 6.5h17v11h-17z M8.5 20.5h7 M9 3.5l3 3 3-3',
  reel: 'M3.5 12a8.5 8.5 0 1 0 17 0 8.5 8.5 0 1 0-17 0z M10.4 7.5a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0z M10.4 16.5a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0z M5.9 12a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0z M14.9 12a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0z',
  cam: 'M5 7h8.5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z M15.5 10.5l5-3v9l-5-3z',
  bookOpen: 'M4 5.5c2.8-1 5.5-1 8 .8v13c-2.5-1.8-5.2-1.8-8-.8z M20 5.5c-2.8-1-5.5-1-8 .8v13c2.5-1.8 5.2-1.8 8-.8z',
  volume: 'M6 3.5h10.5A1.5 1.5 0 0 1 18 5v15.5H7.5A1.5 1.5 0 0 1 6 19z M6 17h12 M10 7.5h5',
  game: 'M8 7.5h8a5 5 0 0 1 0 10H8a5 5 0 0 1 0-10z M8 10.5v4 M6 12.5h4 M15.5 11.5h.01 M17.5 13.5h.01',
  ball: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z M3.5 12h17 M12 3.5c2.6 2.4 2.6 14.6 0 17 M12 3.5c-2.6 2.4-2.6 14.6 0 17',
  bolt: 'M13 3L5 13h6l-1 8 8-10h-6z', moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z', cal: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4 M10 14l2 2 3-3',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c2.5 2.6 2.5 15.4 0 18 M12 3c-2.5 2.6-2.5 15.4 0 18', heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  inf: 'M7 9a3 3 0 1 0 0 6c2 0 3-1.5 5-3s3-3 5-3a3 3 0 1 1 0 6c-2 0-3-1.5-5-3S9 9 7 9z', trophy: 'M8 4h8v5a4 4 0 0 1-8 0z M8 6H5a3 3 0 0 0 3 4 M16 6h3a3 3 0 0 1-3 4 M12 13v4 M8 20h8',
  ticket: 'M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z M10 6v12', q: 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 1-1 1.7v.5 M12 17h.01',
  belt: 'M2.5 10h4 M17.5 10h4 M2.5 14h4 M17.5 14h4 M9.5 6.5h5a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-5a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3z M9.8 12a2.2 2.2 0 1 0 4.4 0 2.2 2.2 0 1 0-4.4 0z'
};
function svgIcon(name, size, filled) {
  size = size || 20;
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" ${filled ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}><path d="${ICONS[name]}"/></svg>`;
}
/* Catégories : un pictogramme par famille (Manga et BD partagent le même tome fermé) */
const CAT = {
  serie: ['tv', 'Série'], film: ['reel', 'Film'], doc: ['cam', 'Docu'], livre: ['bookOpen', 'Livre'], manga: ['volume', 'Manga'], bd: ['volume', 'BD'],
  jeu: ['game', 'Jeu'], sport: ['ball', 'Sport'], catch: ['belt', 'Catch']
};
const FILTERS = [['tout', 'Tout'], ['serie', 'Séries'], ['film', 'Films'], ['doc', 'Docus'], ['livre', 'Livres'], ['mangabd', 'Manga, BD', 'volume'], ['jeu', 'Jeux'], ['sport', 'Sport'], ['catch', 'Catch']];
const typeIn = (f, type) => f === 'tout' || f === type || (f === 'mangabd' && (type === 'manga' || type === 'bd'));
const catIcon = (type) => (CAT[type] || CAT.serie)[0];
// iconOnly : pictogramme seul dans un carré (grande carte, petites cartes « En ce moment »)
function catBadge(type, iconOnly) { const c = CAT[type] || CAT.serie; return iconOnly ? `<span class="cat ico" role="img" aria-label="${c[1]}">${svgIcon(c[0], 14)}</span>` : `<span class="cat">${svgIcon(c[0], 13)}${c[1]}</span>`; }
function chipsHtml(list, on, action, label) {
  return `<div class="chips" role="group" aria-label="${label || 'Catégorie'}">${list.map(([k, l, ic]) => {
    const icon = ic || (CAT[k] && CAT[k][0]);
    return `<button class="chip ${on === k ? 'on' : ''}" data-a="${action}" data-v="${k}" aria-pressed="${on === k}">${icon ? svgIcon(icon, 15) : ''}${esc(l)}</button>`;
  }).join('')}</div>`;
}
function posterHtml(title, src, cls, extra) {
  return `<div class="poster ${cls || ''}" style="background:${grad(title)}" aria-hidden="true"><span class="ph">${esc(initials(title))}</span>${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : ''}${extra || ''}</div>`;
}
function itemPoster(item, cls, extra) { return posterHtml(item.title, item.poster, cls, extra); }
function bar(p, cls) { return `<div class="bar ${cls || ''}" role="img" aria-label="${p} %"><i style="width:${clamp(p, 0, 100)}%"></i></div>`; }
function teamDisc(name, team, cls, id) {
  const t = team && TEAMS[team];
  id = id || (t && t.id) || (state.nba && state.nba.ids[nbaAbbr(name)]) || '';
  const logo = id && state.logos && state.logos[id];
  const c = cls || 'disc';
  // si le logo ne charge pas, l'écouteur « error » global retire l'image et la classe has-logo (pas de script dans le HTML)
  if (logo) return `<div class="${c} has-logo" aria-hidden="true"><img src="${esc(logo)}" alt="" loading="lazy"></div>`;
  const n = !t && NBA_BY[nbaAbbr(name)];
  const bg = t ? t.c1 : n ? n.c1 : `hsl(${hashHue(name)},45%,32%)`;
  const ring = t || n ? `;box-shadow:inset 0 0 0 3px ${(t || n).c2}` : '';
  return `<div class="${c}" style="background:${bg}${ring}" aria-hidden="true">${esc(t ? t.abbr : n ? n.abbr : abbr(name))}</div>`;
}
function loadImage(src, cors) {
  return new Promise((res, rej) => { const img = new Image(); if (cors) img.crossOrigin = 'anonymous'; img.onload = () => res(img); img.onerror = rej; img.src = src; });
}
async function imageToDataUrl(file, maxW, maxH) {
  maxW = maxW || 480; maxH = maxH || 4000;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const k = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } finally { URL.revokeObjectURL(url); }
}
/* Recadrage de la photo de profil : on fait glisser la photo dans le cercle, on zoome au curseur ou en pinçant.
   Le résultat fait 256 × 256 ; l'original (réduit à 1024 px) est gardé pour pouvoir recadrer plus tard. */
const CROP_S = 260;
async function openCrop(form, src) {
  const host = form && form.querySelector('.crop-host'); if (!host) return;
  let img; try { img = await loadImage(src); } catch (e) { toast('Image illisible.', '', 2600); return; }
  const w = img.naturalWidth, h = img.naturalHeight, base = CROP_S / Math.min(w, h);
  const st = { zoom: 1, scale: base, ox: (CROP_S - w * base) / 2, oy: (CROP_S - h * base) / 2 };
  host.innerHTML = `<div class="crop"><div class="crop-stage"><canvas width="${CROP_S * 2}" height="${CROP_S * 2}"></canvas><span class="crop-mask" aria-hidden="true"></span></div>
    <label class="crop-zoom">${svgIcon('image', 16)}<span class="sr">Zoom</span><input type="range" min="1" max="4" step="0.01" value="1">${svgIcon('image', 22)}</label>
    <span class="small muted" style="text-align:center">Fais glisser la photo pour la placer dans le cercle. Pince ou utilise le curseur pour zoomer.</span>
    <div class="grid2"><button type="button" class="btn" data-crop="cancel">Annuler</button><button type="button" class="btn prim" data-crop="ok">Valider</button></div></div>`;
  form.classList.add('cropping');
  const cv = host.querySelector('canvas'); const ctx = cv.getContext('2d'); const range = host.querySelector('input[type=range]');
  const clampPos = () => { const dw = w * st.scale, dh = h * st.scale; st.ox = clamp(st.ox, CROP_S - dw, 0); st.oy = clamp(st.oy, CROP_S - dh, 0); };
  const draw = () => { ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.fillStyle = '#0A0D11'; ctx.fillRect(0, 0, CROP_S, CROP_S); ctx.drawImage(img, st.ox, st.oy, w * st.scale, h * st.scale); };
  // zoom autour d'un point (centre du cercle, ou milieu des deux doigts)
  const setZoom = (z, px, py) => {
    z = clamp(z, 1, 4); px = px == null ? CROP_S / 2 : px; py = py == null ? CROP_S / 2 : py;
    const ix = (px - st.ox) / st.scale, iy = (py - st.oy) / st.scale;
    st.zoom = z; st.scale = base * z; st.ox = px - ix * st.scale; st.oy = py - iy * st.scale; clampPos(); range.value = String(z); draw();
  };
  const stage = host.querySelector('.crop-stage'); const pts = new Map(); let pinch = null;
  const local = (e) => { const r = stage.getBoundingClientRect(); const k = CROP_S / r.width; return [(e.clientX - r.left) * k, (e.clientY - r.top) * k]; };
  stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, local(e)); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: st.zoom }; } });
  stage.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return; const p = local(e); const prev = pts.get(e.pointerId); pts.set(e.pointerId, p);
    if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; setZoom(pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
    else if (pts.size === 1) { st.ox += p[0] - prev[0]; st.oy += p[1] - prev[1]; clampPos(); draw(); }
  });
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  stage.addEventListener('wheel', (e) => { e.preventDefault(); const p = local(e); setZoom(st.zoom * (e.deltaY < 0 ? 1.1 : 0.9), p[0], p[1]); }, { passive: false });
  range.addEventListener('input', () => setZoom(+range.value));
  const close = () => { host.innerHTML = ''; form.classList.remove('cropping'); };
  host.querySelector('[data-crop="cancel"]').addEventListener('click', close);
  host.querySelector('[data-crop="ok"]').addEventListener('click', () => {
    const out = document.createElement('canvas'); out.width = out.height = 256;
    out.getContext('2d').drawImage(img, -st.ox / st.scale, -st.oy / st.scale, CROP_S / st.scale, CROP_S / st.scale, 0, 0, 256, 256);
    const data = out.toDataURL('image/jpeg', 0.86);
    form.elements.avatarData.value = data; form.elements.avatarSrcData.value = src;
    const pv = form.querySelector('[data-preview="avatar"]'); if (pv) pv.innerHTML = `<img src="${data}" alt="">`;
    const rc = form.querySelector('[data-a="avatar-recrop"]'); if (rc) rc.hidden = false;
    close();
  });
  draw();
}
/* Lueur de la carte principale : couleur dominante de l'image (miniature 24×24),
   en ignorant les quasi-noirs, quasi-blancs et gris ; repli sur le bleu si l'image est illisible */
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn; const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return [f(0), f(8), f(4)];
}
async function dominantColor(src) {
  const img = await loadImage(src, !src.startsWith('data:'));
  const c = document.createElement('canvas'); c.width = c.height = 24;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 24, 24);
  const d = x.getImageData(0, 0, 24, 24).data; // lève une erreur si l'image est « teintée » (CORS)
  const bins = Array.from({ length: 24 }, () => [0, 0, 0, 0]);
  for (let i = 0; i < d.length; i += 4) {
    const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
    if (l < 0.12 || l > 0.9 || s < 0.18) continue;
    const w = s * (1 - Math.abs(l - 0.5) * 1.4); const bn = bins[Math.floor(h / 15) % 24];
    bn[0] += d[i] * w; bn[1] += d[i + 1] * w; bn[2] += d[i + 2] * w; bn[3] += w;
  }
  const best = bins.reduce((a, b) => (b[3] > a[3] ? b : a));
  if (best[3] < 2) return null;
  const [h, s] = rgbToHsl(best[0] / best[3], best[1] / best[3], best[2] / best[3]);
  return hslToRgb(h, clamp(s, 0.3, 0.6), 0.45).join(',');
}
const glowJobs = new Set();
function glowOf(it) {
  const src = it.backdrop || it.poster; if (!src) return null;
  const sig = src.length + ':' + src.slice(-48);
  if (it.glow && it.glow.sig === sig) return it.glow.rgb;
  if (!glowJobs.has(it.id)) {
    glowJobs.add(it.id);
    dominantColor(src).catch(() => null).then((rgb) => { it.glow = { sig, rgb }; glowJobs.delete(it.id); save(); if (rgb && ui.route === 'encours') render(); });
  }
  return null;
}
function importPack(data) {
  let n = 0;
  (data.feds || []).forEach((f) => { if (f && f.name && !state.feds.some((x) => x.name.toLowerCase() === f.name.toLowerCase())) state.feds.push({ name: f.name, kind: f.kind === 'major' ? 'major' : 'inde' }); });
  (data.shows || []).forEach((sh) => {
    if (!sh || !sh.name || !isFinite(Number(sh.ts))) return;
    const id = SAFE_ID.test(String(sh.id || '')) ? String(sh.id) : uid(); if (state.shows[id]) return;
    state.shows[id] = { id, fed: String(sh.fed || 'Autre'), name: String(sh.name), kind: CKINDS[sh.kind] ? sh.kind : 'show', ts: Number(sh.ts), poster: String(sh.poster || ''), seen: null, dismissed: false, createdAt: now() }; n++;
  });
  save(); render(); return n;
}
// action facultative { label, fn } : bouton dans le message (ex. « Annuler »)
function toast(html, kind, ms, action) {
  // les messages avec « Annuler » s'affichent en bas, au-dessus des onglets (à portée de pouce)
  let box = document.getElementById(action ? 'toasts-act' : 'toasts');
  if (!box && action) { box = document.createElement('div'); box.id = 'toasts-act'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  if (!box) return;
  const el = document.createElement('div'); el.className = 'toast ' + (kind || '') + (action ? ' has-act' : ''); el.innerHTML = html;
  if (action) {
    box.querySelectorAll('.toast.has-act').forEach((t) => t.remove()); // un seul « Annuler » à la fois : le plus récent
    const b = document.createElement('button'); b.type = 'button'; b.className = 'toast-act'; b.textContent = action.label;
    b.addEventListener('click', () => { el.remove(); action.fn(); }, { once: true }); el.appendChild(b);
  }
  box.appendChild(el);
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
   8. État de l'interface, en-tête, barre d'onglets
   ========================================================= */
const ui = {
  route: 'encours', arg: null, modal: null, season: {}, ddOpen: false, reveal: {}, matchMode: {},
  biblio: { type: 'tout', status: 'tous' }, envies: 'tout', histoF: 'tout',
  add: { type: 'serie', q: '', results: null, loading: false, error: '', picked: null, manual: false, status: 'encours', catchup: null, tomes: '', pages: '' }
};
function parseRoute() {
  const h = (location.hash || '#encours').slice(1);
  const i = h.indexOf('-');
  if (i > 0 && ['item', 'match', 'rewind', 'ajouter'].includes(h.slice(0, i))) return { route: h.slice(0, i), arg: h.slice(i + 1) };
  return { route: h || 'encours', arg: null };
}
const TABS = [{ r: 'encours', label: 'En cours', icon: 'play' }, { r: 'biblio', label: 'Biblio', icon: 'biblio' }, { r: 'envies', label: 'Envies', icon: 'star' }, { r: 'histo', label: 'Histo', icon: 'clock' }];
// 4 onglets et le bouton + au centre (le profil est dans l'avatar, en haut à droite)
function navHtml(active, plusHref) {
  const tab = (t) => `<a href="#${t.r}" class="${t.r === active ? 'on' : ''}" ${t.r === active ? 'aria-current="page"' : ''}>${svgIcon(t.icon, 24)}<span>${t.label}</span></a>`;
  const plus = plusHref ? `<a class="plus" href="${plusHref}" aria-label="Ajouter">${svgIcon('plus', 24)}</a>` : `<button class="plus" data-a="add-menu" aria-label="Ajouter">${svgIcon('plus', 24)}</button>`;
  return `<nav class="nav" aria-label="Navigation principale">${TABS.slice(0, 2).map(tab).join('')}<span class="plus-slot">${plus}</span>${TABS.slice(2).map(tab).join('')}</nav>`;
}
const CROWN = '<svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true"><path d="M1 3.5l4 3.5 4-6 4 6 4-3.5-1.6 9H2.6z" fill="currentColor"/></svg>';
// visage de l'avatar : ta photo, sinon l'initiale de ton pseudo, sinon le pictogramme
function faceInner(size) {
  const s = state.settings;
  if (s.avatar) return `<img src="${esc(s.avatar)}" alt="">`;
  if (s.pseudo) return `<span class="initial" style="font-size:${Math.round(size * 0.95)}px">${esc(s.pseudo.trim()[0].toUpperCase())}</span>`;
  return svgIcon('user', size);
}
function avatarHtml() {
  const L = levelInfo(); const who = state.settings.pseudo ? esc(state.settings.pseudo) + ' · ' : '';
  return `<a class="avatar" href="#profil" aria-label="Profil · ${who}niveau ${L.lvl}, ${L.into} XP sur ${L.need}"><span class="lv"><b>${CROWN}Niv. ${L.lvl}</b><small>${L.max ? esc(rankOf(L.lvl).name) : fmtNum(L.into) + ' / ' + fmtNum(L.need) + ' XP'}</small></span>
    ${frameHtml(46, rankOf(L.lvl), L.pct, 'rga', faceInner(18))}</a>`;
}
function head(title, right) {
  return `<header class="head"><h1 class="h1">${title}</h1>${right == null ? avatarHtml() : right}</header>${demoBanner()}`;
}
function demoBanner() {
  return state.demo ? `<div class="banner warn">${svgIcon('eye', 18)}<span class="grow">Données de démonstration.</span><button class="link" data-a="clear-demo">Effacer</button></div>` : '';
}
function secHead(title, href, link) { return `<div class="sec-head"><h2 class="h2">${title}</h2>${href ? `<a href="${href}">${link || 'Voir tout'}${svgIcon('chevR', 15)}</a>` : ''}</div>`; }
function page(body, active, plusHref, cls) { return `<main class="view${cls ? ' ' + cls : ''}">${body}</main>${navHtml(active, plusHref)}`; }

/* ---------- cartes d'œuvres ---------- */
function shortProgress(it) {
  const sh = shape(it);
  if (sh === 'livre') return 'Lu à ' + pct(it) + ' %';
  return progressText(it);
}
function envieMeta(it) {
  if (it.seasons && it.type !== 'catch') return plural(it.seasons.length, 'saison');
  if (it.volumes && it.volumes.length > 1) return plural(it.volumes.length, 'tome');
  if (it.runtime) return fmtRt(it.runtime);
  return it.year || TYPES[it.type].label;
}
// opts : short (petites cartes), extra (boutons), noCat (filtre déjà sur une catégorie : l'étiquette est inutile), menu (bouton ⋯ sur l'affiche)
function mcard(it, opts) {
  opts = opts || {};
  const done = it.status === 'termine';
  const meta = it.status === 'envie' ? envieMeta(it) : opts.short ? shortProgress(it) : progressText(it);
  const more = opts.menu ? `<button class="mc-more" data-a="${opts.menu}" data-id="${it.id}" aria-label="Plus d’options pour ${esc(it.title)}"><span>${svgIcon('dots', 18)}</span></button>` : '';
  return `<div class="mcard" data-title="${esc(it.title.toLowerCase())}"><a class="im" href="#item-${it.id}">${posterHtml(it.title, it.backdrop || it.poster, '')}${opts.noCat ? '' : catBadge(it.type, opts.short)}<span class="tt">${esc(it.title)}</span></a>${more}
    <div class="bd"><span class="meta">${done ? svgIcon('check', 15) : ''}${esc(meta)}</span>${it.status === 'encours' ? bar(curPct(it)) : ''}${opts.extra || ''}</div></div>`;
}
/* Bouton principal à la première personne : ce que tu déclares en le touchant.
   Rond vide au repos (comme les épisodes de la fiche) ; la coche n'apparaît qu'une fois l'action faite. */
const RING = '<svg class="ring-ic" aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="9"/></svg>';
const RING_DONE = '<svg class="ring-ic done" aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10.5" fill="currentColor"/><path d="M7.4 12.4l3.1 3.1 6.1-6.6" stroke="#7FB2FF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ARROW = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
function doneLabel(it, nx) {
  const sh = shape(it); const one = it.volumes && it.volumes.length === 1;
  if (sh === 'episodes') return it.type === 'catch' ? 'J’ai vu le show' : 'J’ai vu l’ép. ' + nx.e;
  if (sh === 'tomes') return 'J’ai lu le tome ' + nx.n;
  if (sh === 'livre') return nx.mid ? (one ? 'J’ai lu la moitié' : 'J’ai lu la moitié du tome ' + nx.n) : one ? 'J’ai fini le livre' : 'J’ai fini le tome ' + nx.n;
  if (sh === 'jeu') return 'J’ai fini le jeu';
  return curPass(it).done.v ? 'Je l’ai revu' : 'J’ai vu le film';
}
// confirmation courte (bouton pendant ~1 s, message « Annuler »)
function doneShort(it, nx, long) {
  const sh = shape(it); const one = it.volumes && it.volumes.length === 1;
  if (sh === 'episodes') return it.type === 'catch' ? 'Show vu' : (it.seasons.length > 1 ? 'S' + nx.s + ' · ' : '') + (long ? 'Épisode ' : 'Ép. ') + nx.e + ' vu';
  if (sh === 'tomes') return 'Tome ' + nx.n + ' lu';
  if (sh === 'livre') return nx.mid ? 'Moitié lue' : one ? 'Livre fini' : 'Tome ' + nx.n + ' fini';
  if (sh === 'jeu') return 'Jeu terminé';
  return curPass(it).done.v ? 'Film revu' : 'Film vu';
}
// Envies : un verbe par univers
function envieVerb(it) {
  if (it.type === 'film') return { label: 'J’ai vu le film', icon: RING, a: 'envie-seen' };
  if (it.type === 'livre' || it.type === 'manga' || it.type === 'bd') return { label: 'Je lis', icon: ARROW, a: 'envie-start' };
  if (it.type === 'jeu') return { label: 'Je joue', icon: ARROW, a: 'envie-start' };
  return { label: 'Je regarde', icon: ARROW, a: 'envie-start' };
}
const TYPE_OF = { serie: ['cette série', 'la série'], film: ['ce film', 'le film'], doc: ['ce docu', 'le docu'], livre: ['ce livre', 'le livre'], bd: ['cette BD', 'la BD'], manga: ['ce manga', 'le manga'], jeu: ['ce jeu', 'le jeu'], catch: ['ce show', 'le show'] };
const MODE_PHRASE = { direct: 'en direct', differe: 'en différé', resume: 'en résumé' };
const modeCap = (k) => { const s = MODE_PHRASE[k] || ''; return s ? s[0].toUpperCase() + s.slice(1) : ''; };
// bouton principal (En cours et fiche) ; pendant ~1 s après l'appui, il montre la confirmation et l'XP gagnée
function mainBtn(it, nx, cls) {
  const jd = ui.justDone && ui.justDone.id === it.id ? ui.justDone : null;
  if (jd) return `<button class="btn prim is-done ${cls || ''}" type="button" tabindex="-1" aria-live="polite">${RING_DONE}<span>${esc(jd.label)}</span>${jd.xp > 0 ? `<span class="xp-chip">+${jd.xp} XP</span>` : ''}</button>`;
  if (!nx) return '';
  return `<button class="btn prim ${cls || ''}" data-a="next" data-id="${it.id}">${RING}<span>${esc(doneLabel(it, nx))}</span></button>`;
}
function fmtRt(m) { m = Math.round(m || 0); if (!m) return ''; return m >= 60 ? Math.floor(m / 60) + ' h ' + pad2(m % 60) : m + ' min'; }
function isToday(ts) { const a = new Date(ts), b = new Date(); return a.toDateString() === b.toDateString(); }
function untilText(ts) {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0); const d1 = new Date(ts); d1.setHours(0, 0, 0, 0);
  const n = Math.round((d1 - d0) / DAY);
  return n <= 0 ? (ts > now() ? 'Ce soir' : 'En ce moment') : n === 1 ? 'Demain' : 'Dans ' + n + ' jours';
}
function matchThumb(m) {
  if (m.cover) return posterHtml(m.home, m.cover, 'th');
  if (!TEAMS[m.team] && m.sport === 'nba') { const h = nbaAbbr(m.home), a = nbaAbbr(m.away); if (h && a) return `<div class="poster th nba-thumb" aria-hidden="true">${nbaLogo(h, 30)}${nbaLogo(a, 30)}</div>`; }
  const side = favTeamSide(m); const t = TEAMS[m.team] || null;
  const id = side === 'home' ? m.homeId : m.awayId;
  const logo = (id && state.logos && state.logos[id]) || (t && state.logos && state.logos[t.id]);
  return `<div class="poster th vig" style="background:radial-gradient(120% 80% at 50% 30%,${t ? t.c1 : '#222B36'},${t ? t.c2 : '#0A0D11'} 120%)" aria-hidden="true">${logo ? `<img class="main" src="${esc(logo)}" alt="" style="width:46%">` : `<span class="vig-abbr">${esc(t ? t.abbr : abbr(m.home))}</span>`}</div>`;
}
function fedVignette(fed) {
  return `<div class="poster th vig" style="background:radial-gradient(120% 80% at 50% 30%,hsl(${hashHue(fed)},40%,28%),#0A0D11 120%)" aria-hidden="true"><span class="vig-abbr" style="font-size:${fed.length <= 4 ? 22 : fed.length <= 7 ? 17 : 13}px">${esc(fed)}</span></div>`;
}

/* =========================================================
   9. Vues
   ========================================================= */
/* ---------- En cours ---------- */
function viewEncours() {
  const items = Object.values(state.items).filter((i) => i.status === 'encours' && (i.type !== 'catch' || nextUnit(i))).sort((a, b) => b.updatedAt - a.updatedAt);
  const userItems = Object.values(state.items).filter((i) => !(i.type === 'catch' && !progress(i).total));
  const pend = pendingMatches().slice(0, 3);
  const pshows = showsPending().slice(0, 3);
  const upcoming = showsUpcoming().filter((s) => s.ts < now() + 45 * DAY).slice(0, 4);
  let h = head('En cours');
  if (!userItems.length && !Object.keys(state.matches).length && !state.catchLog.length && !Object.keys(state.shows).length) {
    h += `<section class="card pad col" aria-label="Bienvenue"><span class="label accent">Bienvenue sur Rewind</span>
      <p style="margin:0;line-height:1.5">Pour bien démarrer :</p>
      <ol style="margin:0;padding-left:20px;line-height:1.7;color:var(--soft)">
        <li>Ajoute ta clé TMDB dans <a href="#profil">Profil</a> pour les affiches et les épisodes.</li>
        <li>Ajoute ce que tu suis déjà. Le mode <b>rattrapage</b> coche l’existant sans XP.</li>
        <li>Coche au fur et à mesure : l’XP, les badges et l’historique suivent.</li>
      </ol>
      <button class="btn prim block" data-a="add-menu">${svgIcon('plus', 18)}Ajouter une œuvre</button>
      <button class="btn block" data-a="load-demo">Essayer avec des données de démo</button></section>`;
  }
  if (items.length) {
    const top = items[0]; const nx = nextUnit(top); const sh = shape(top);
    const img = top.backdrop || top.poster; const glow = glowOf(top);
    const named = nx && nx.title && !/^Épisode \d+$/.test(nx.title);
    const jd = ui.justDone && ui.justDone.id === top.id ? ui.justDone : null;
    const topBar = jd ? `<div class="bar thick bar-anim" role="img" aria-label="${curPct(top)} %" style="--from:${jd.from}%"><i style="width:${curPct(top)}%"></i></div>` : bar(curPct(top), 'thick');
    const sub = nx && sh === 'episodes' ? [named ? '« ' + nx.title + ' »' : '', fmtRt(nx.rt || top.runtime)].filter(Boolean).join(' · ') : '';
    const ptext = progressText(top); const ctext = countText(top);
    const lead = ptext.startsWith('Prochain : ') ? `Prochain : <b>${esc(ptext.slice(11))}</b>` : esc(ptext);
    h += `<div class="hero-wrap"${glow && /^\d{1,3},\d{1,3},\d{1,3}$/.test(glow) ? ` style="--glow:${glow}"` : ''}><section class="hero${glow ? ' tinted' : ''}${jd ? ' just' : ''}" aria-label="${esc(top.title)}, en cours">
      <a class="img" href="#item-${top.id}" aria-label="Ouvrir la fiche de ${esc(top.title)}" style="background:${grad(top.title)}">${img ? `<img src="${esc(img)}" alt="" fetchpriority="high">` : ''}${catBadge(top.type, true)}<h2 class="tt">${esc(top.title)}</h2></a>
      <div class="body"><div class="col" style="gap:3px"><div class="line"><span>${lead}</span>${ctext ? `<span class="cnt">${esc(ctext)}</span>` : ''}</div>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</div>
        ${topBar}
        ${top.catchup ? `<span class="label amber">Mode rattrapage actif · sans XP</span>` : ''}
        <div class="acts">${nx || jd ? mainBtn(top, nx) : `<a class="btn prim" href="#item-${top.id}">Voir la fiche</a>`}
          ${sh === 'episodes' || sh === 'tomes' || sh === 'livre' ? `<a class="sq" href="#item-${top.id}" aria-label="Voir ${sh === 'episodes' ? 'les épisodes' : 'les tomes'}">${svgIcon('list', 24)}</a>` : ''}</div>
      </div></section></div>`;
    if (items.length > 1) h += `<section class="section" aria-label="En ce moment">${secHead('En ce moment', '#biblio')}<div class="mrow">${items.slice(1, 10).map((it) => mcard(it, { short: true })).join('')}</div></section>`;
  } else if (userItems.length) {
    h += `<div class="empty">Rien en cours pour l’instant.<br><a href="#envies">Pioche dans tes envies</a> ou ajoute quelque chose avec +.</div>`;
  }
  if (pend.length || pshows.length) {
    h += `<section class="section" aria-label="À confirmer">${secHead('Tu l’as vu ?')}<div class="list">${pend.map((m) => `<div class="lrow"><a href="#match-${m.id}" class="lrow-link">${matchThumb(m)}<div class="tx"><span class="tag ac">${esc(fmtDay(m.ts))} · ${esc(m.league || '')}</span><b>${esc(m.home)} – ${esc(m.away)}</b></div></a><button class="go" data-a="match-confirm" data-id="${m.id}">J’ai regardé</button></div>`).join('')}
      ${pshows.map((x) => `<div class="lrow"><button data-a="show-open" data-id="${x.id}" class="lrow-link">${posterHtml(x.name, x.poster, 'th')}<div class="tx"><span class="tag ac">${esc(fmtDay(x.ts))} · ${esc(x.fed)}</span><b>${esc(x.name)}</b></div></button><button class="go" data-a="show-confirm" data-id="${x.id}">J’ai regardé</button></div>`).join('')}</div></section>`;
  }
  if (upcoming.length) {
    h += `<section class="section" aria-label="À venir"><div class="sec-head"><h2 class="h2">À venir</h2><button class="link" data-a="goto-catch">Voir tout${svgIcon('chevR', 15)}</button></div><div class="mgrid">${upcoming.map((x) => {
      const live = isToday(x.ts); const t = new Date(x.ts);
      const po = x.poster ? `<img class="main" src="${esc(x.poster)}" alt="" loading="lazy">` : '';
      return `<button class="ev" data-a="show-open" data-id="${x.id}"><div class="poster" style="background:${grad(x.name)}" aria-hidden="true"><span class="ph">${esc(initials(x.name))}</span>${po}</div><div class="bd"><span class="date${live ? ' live' : ''}">${live ? 'Ce soir' : esc(t.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\.$/, ''))}${live ? '' : `<span class="until">· ${esc(untilText(x.ts).toLowerCase())}</span>`}</span><span class="nm">${esc(x.name)}</span><span class="sb">${hhmm(x.ts)} · ${esc(x.fed)}</span></div></button>`;
    }).join('')}</div></section>`;
  }
  return page(h, 'encours');
}

/* ---------- Bibliothèque ---------- */
function viewBiblio() {
  const f = ui.biblio;
  let h = head('Biblio') + chipsHtml(FILTERS, f.type, 'bib-type');
  if (f.type === 'sport') return page(h + sportSection() + nbaSection(), 'biblio', '#ajouter-sport');
  if (f.type === 'catch') return page(h + catchSection(), 'biblio', '#ajouter-catch');
  h += `<div class="seg" role="group" aria-label="Statut">${[['tous', 'Tous'], ['encours', 'En cours'], ['termine', 'Terminés']].map(([k, l]) => `<button class="${f.status === k ? 'on' : ''}" data-a="bib-status" data-v="${k}" aria-pressed="${f.status === k}">${l}</button>`).join('')}</div>
    <label class="search"><span class="sr">Filtrer</span>${svgIcon('search', 18)}<input class="input" type="search" placeholder="Filtrer ma bibliothèque" data-filter="bib"></label>`;
  const list = Object.values(state.items).filter((i) => i.status !== 'envie' && i.type !== 'catch' && typeIn(f.type, i.type) && (f.status === 'tous' || i.status === f.status))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  if (list.length) h += `<div class="mgrid">${list.map((it) => mcard(it, { noCat: f.type !== 'tout' })).join('')}</div>${searchEmptySlot(f.type, 'encours')}`;
  else {
    const hasEnvies = Object.values(state.items).some((i) => i.status === 'envie' && typeIn(f.type, i.type));
    const link = hasEnvies ? `<a class="link" href="#envies" data-a="goto-envies" data-v="${f.type}">Ou pioche dans tes envies</a>` : '';
    if (f.status === 'termine') h += emptyState('check', 'Rien de terminé pour l’instant', 'Quand tu finiras une série, un livre ou un jeu, il viendra se ranger ici.', `<button class="btn ghost-ac" data-a="bib-status" data-v="encours">Voir ce que tu as en cours</button>`);
    else if (f.status === 'encours') h += emptyState('play', 'Rien en cours ici', 'Passe une envie en cours, ou ajoute ce que tu as commencé.', emptyBtns(f.type === 'tout' ? EMPTY.tout[3] : EMPTY[f.type][3], 'encours'), link);
    else { const e = EMPTY[f.type] || EMPTY.tout; h += emptyState(e[0], e[1], e[2], emptyBtns(e[3], 'encours'), link); }
  }
  return page(h, 'biblio');
}
/* États vides : un pictogramme, une phrase et une action directe, par catégorie */
const EMPTY = {
  tout: ['biblio', 'Ta bibliothèque est vide', 'Ajoute ce que tu regardes, lis ou joues : tout viendra se ranger ici.', [['menu', 'Ajouter une œuvre']]],
  serie: ['tv', 'Aucune série pour l’instant', 'Quelle série regardes-tu en ce moment ? Ajoute-la et reprends là où tu en es.', [['serie', 'Ajouter une série']]],
  film: ['reel', 'La salle est encore vide', 'Commence par le dernier film que tu as vu, ou celui qui t’attend ce week-end.', [['film', 'Ajouter un film']]],
  doc: ['cam', 'Pas encore de documentaire', 'Un docu qui t’a appris quelque chose, ou retourné ? Garde-en la trace ici.', [['doc', 'Ajouter un docu']]],
  livre: ['bookOpen', 'Ta bibliothèque attend sa première histoire', 'Ajoute le livre que tu lis en ce moment : tu suivras tes pages au fil de la lecture.', [['livre', 'Ajouter mon premier livre']]],
  mangabd: ['volume', 'L’étagère n’a pas encore de tome', 'Ajoute une série manga ou BD, puis coche chaque tome lu.', [['manga', 'Ajouter un manga'], ['bd', 'Une BD']]],
  jeu: ['game', 'Quel jeu t’a fait veiller trop tard ?', 'Ajoute-le, et marque-le terminé le jour où tu verras le générique.', [['jeu', 'Ajouter un jeu']]],
  envies: ['star', 'Ta liste d’envies est vide', 'Une série qu’on t’a conseillée, un film pour un soir de pluie ? Garde-les ici pour plus tard.', [['menu', 'Ajouter une envie']]]
};
function emptyBtns(list, status) {
  return `<div class="row" style="gap:10px;flex-wrap:wrap;justify-content:center">${list.map(([t, l], i) => `<button class="btn ${i ? 'ghost-ac' : 'prim'}" data-a="empty-add" data-v="${t}" data-st="${status}">${i ? '' : svgIcon('plus', 18)}${esc(l)}</button>`).join('')}</div>`;
}
function emptyState(icon, title, text, actions, extra) {
  return `<section class="empty-state" aria-label="${esc(title)}"><span class="es-ic">${svgIcon(icon, 40)}</span><h2 class="es-ti">${esc(title)}</h2><p class="es-tx">${esc(text)}</p>${actions || ''}${extra || ''}</section>`;
}
// recherche locale sans résultat : rempli à la volée par le filtre (voir l'écouteur « input »)
function searchEmptySlot(type, status) { return `<div class="es-search" hidden data-type="${esc(type)}" data-st="${status}"></div>`; }
function searchEmptyHtml(q, type, status) {
  return emptyState('search', `Rien ne correspond à « ${q} »`, status === 'envie' ? 'Pas encore dans tes envies. Tu peux le chercher pour l’ajouter.' : 'Pas encore dans ta bibliothèque. Tu peux le chercher pour l’ajouter.',
    `<button class="btn prim" data-a="search-add" data-v="${esc(type)}" data-st="${status}" data-q="${esc(q)}">${svgIcon('search', 18)}Chercher « ${esc(q)} » pour l’ajouter</button>`);
}
function sportSection() {
  const all = Object.values(state.matches).sort((a, b) => b.ts - a.ts);
  const season = seasonOf(now());
  let h = '';
  Object.values(TEAMS).forEach((t) => {
    const seen = all.filter((m) => m.team === t.key && m.seen && seasonOf(m.ts) === season).length;
    const nextM = all.filter((m) => m.team === t.key && m.ts > now()).sort((a, b) => a.ts - b.ts)[0];
    const opp = nextM ? (favTeamSide(nextM) === 'home' ? nextM.away : nextM.home) : '';
    const oppShort = opp ? (NBA_BY[nbaAbbr(opp)] ? NBA_BY[nbaAbbr(opp)].name.split(' ').pop() : opp) : '';
    h += `<div class="card pad row" style="gap:12px">${teamDisc(t.name, t.key, 'mini-team')}<div class="col grow" style="gap:3px"><span style="font-weight:700">${esc(t.name)}</span>
      <span class="team-seen">${seen ? `<b>${plural(seen, 'match regardé', 'matchs regardés')}</b> cette saison` : 'Pas encore de match regardé cette saison'}</span>
      <span class="small muted">${esc(t.league)} ${season}${nextM ? ' · prochain : ' + esc(fmtMatch(nextM.ts)) + ' contre ' + esc(oppShort) : ''}</span></div></div>`;
  });
  h += `<div class="sec-head"><h2 class="h2">Matchs</h2><span class="row" style="gap:6px">${state.sportOk ? `<span class="small muted">Mis à jour à ${esc(hhmm(state.sportOk))}</span>` : ''}<button class="link" data-a="sport-sync" aria-label="Actualiser les matchs">${svgIcon('sync', 16)}${state.sportOk ? '' : ' Actualiser'}</button></span></div>`;
  const list = all.filter((m) => m.ts < now() + 14 * DAY).slice(0, 40);
  if (!list.length) h += `<div class="empty">Aucun match pour l’instant. Touche « Actualiser » pour récupérer le calendrier des Sixers et du Milan, ou ajoute un match avec +.</div>`;
  else h += `<div class="list">${list.map((m) => {
    const fut = m.ts > now(); const side = favTeamSide(m);
    // à droite : soit l'état du match, soit la façon dont tu l'as regardé (plus de « Direct » ambigu)
    const st = m.seen ? `<span class="seen-tag"><span>${svgIcon('check', 16)}Regardé</span><small>${esc(MODE_PHRASE[m.seen.mode] || '')}</small></span>`
      : fut ? `<span class="pill">À venir</span>` : m.dismissed ? `<span class="pill">Pas vu</span>` : `<span class="pill amber">Tu l’as vu ?</span>`;
    const tm = (name, mine, id) => `<span class="tm">${teamDisc(name, mine ? m.team : null, 'tdisc', id)}<span>${esc(name)}</span></span>`;
    return `<a class="lrow match-line" href="#match-${m.id}"><div class="tx" style="gap:5px"><span class="label">${esc(fmtMatch(m.ts))} · ${esc(m.league || '')}</span>${tm(m.home, side === 'home', m.homeId)}${tm(m.away, side === 'away', m.awayId)}</div>${st}</a>`;
  }).join('')}</div>`;
  return h;
}
function nbaLogo(ab, size) {
  const t = NBA_BY[ab]; const id = state.nba.ids[ab]; const logo = id && state.logos && state.logos[id];
  return `<span class="nba-logo" style="width:${size}px;height:${size}px;${logo ? '' : `background:linear-gradient(135deg,${t.c1},${t.c2})`}" aria-hidden="true">${logo ? `<img src="${esc(logo)}" alt="">` : `<b style="font-size:${Math.round(size * 0.32)}px">${ab}</b>`}</span>`;
}
function nbaSection() {
  const feed = Object.values(state.nba.feed);
  const nights = [...new Set(feed.map((f) => f.night))].sort().reverse();
  const i = clamp(ui.nbaNight || 0, 0, Math.max(0, nights.length - 1)); ui.nbaNight = i;
  const upd = state.nba.lastRun ? `<span class="small muted">Mis à jour à ${esc(hhmm(state.nba.lastRun))}</span>` : '';
  let h = `<div class="sec-head" style="margin-top:6px"><h2 class="h2">Toute la NBA</h2><span class="row" style="gap:6px">${upd}<button class="link" data-a="nba-sync" aria-label="Actualiser la NBA" ${nbaRun ? 'disabled' : ''}>${svgIcon('sync', 16)}${upd ? '' : ' Actualiser'}</button></span></div>`;
  if (nbaRun) h += `<div class="banner info">${svgIcon('sync', 18)}<span class="grow" id="nba-prog">Récupération des matchs… ${nbaRun.done} / ${nbaRun.total} équipes</span></div>`;
  if (!nights.length) return h + `<div class="empty">${nbaRun ? 'Les matchs arrivent…' : 'Aucun match récupéré pour l’instant. Touche « Actualiser » : la récupération prend environ une minute.'}</div>`;
  const k = nights[i];
  h += `<div class="month-nav"><button class="icon-btn" data-a="nba-night" data-v="${i + 1}" ${i >= nights.length - 1 ? 'disabled' : ''} aria-label="Nuit précédente">${svgIcon('chevL', 20)}</button><span>${esc(nightLabel(k))}</span><button class="icon-btn" data-a="nba-night" data-v="${i - 1}" ${i === 0 ? 'disabled' : ''} aria-label="Nuit suivante">${svgIcon('chevR', 20)}</button></div>`;
  const list = feed.filter((f) => f.night === k).sort((a, b) => a.ts - b.ts);
  h += `<div class="list">${list.map((f) => {
    const m = state.matches[f.id]; const seen = m && m.seen;
    const hasScore = f.hs != null && f.as != null; const revealed = !seen && ui.reveal[f.id] && hasScore;
    const score = hasScore ? `${f.hs} – ${f.as}` : '';
    const line = seen ? `<span class="ac-line">${svgIcon('check', 14)}Regardé ${esc(MODE_PHRASE[m.seen.mode] || '')}${score ? ' · ' + score : ''}</span>`
      : revealed ? `<span class="soft-line">${svgIcon('eye', 14)}${score} · score seulement</span>` : `<span>${hhmm(f.ts)}${hasScore ? ' · score masqué' : ''}</span>`;
    const teams = `${nbaLogo(f.h, 38)}<div class="tx"><b>${esc(NBA_BY[f.h].nick)} – ${esc(NBA_BY[f.a].nick)}</b>${line}</div>${nbaLogo(f.a, 38)}`;
    if (seen) return `<div class="lrow nba-row"><a href="#match-${f.id}" class="nba-teams">${teams}</a></div>`;
    // deux actions séparées : déclarer qu'on a regardé, ou seulement voir le score sans rien enregistrer
    return `<div class="lrow nba-row col-row"><div class="nba-teams">${teams}</div><div class="nba-acts"><button class="btn small sel" data-a="nba-ask" data-id="${f.id}">${RING}J’ai regardé</button>${hasScore && !revealed ? `<button class="btn small" data-a="nba-reveal" data-id="${f.id}">${svgIcon('eye', 17)}Voir le score</button>` : ''}</div></div>`;
  }).join('')}</div><span class="small muted" style="padding:0 6px">Les scores restent cachés tant que tu ne choisis pas « J’ai regardé » ou « Voir le score ».</span>`;
  return h;
}
function nbaForm() {
  const a = ui.add; const n = a.nba || (a.nba = { h: null, a: null });
  const def = isoDay(new Date(now() - DAY));
  const sel = (ab) => n.h === ab ? 'home' : n.a === ab ? 'away' : '';
  return `<form class="col" style="gap:14px" data-form="nba-add">
    <div class="nba-pickline"><div class="slot ${n.h ? 'on' : ''}">${n.h ? nbaLogo(n.h, 34) : ''}<span><small>Domicile</small><b>${n.h ? esc(NBA_BY[n.h].nick) : 'Choisis'}</b></span></div><span class="vs">vs</span>
      <div class="slot ${n.a ? 'on' : ''}">${n.a ? nbaLogo(n.a, 34) : ''}<span><small>Extérieur</small><b>${n.a ? esc(NBA_BY[n.a].nick) : n.h ? 'Choisis' : '—'}</b></span></div>
      ${n.h ? `<button type="button" class="icon-btn" data-a="nba-pick-reset" aria-label="Effacer">${svgIcon('x', 16)}</button>` : ''}</div>
    <div class="nba-grid" role="group" aria-label="Équipes">${NBA_TEAMS.map((t) => `<button type="button" class="nba-cell ${sel(t.abbr)}" data-a="nba-pick" data-v="${t.abbr}" aria-label="${esc(t.name)}">${nbaLogo(t.abbr, 40)}<span>${t.abbr}</span></button>`).join('')}</div>
    <label class="field"><span>Soirée (date américaine)</span><input class="input" type="date" name="night" value="${esc(n.night || def)}"></label>
    <div class="grid2"><label class="field"><span>Score dom. (facult.)</span><input class="input" name="hs" type="number" min="0" inputmode="numeric"></label><label class="field"><span>Score ext.</span><input class="input" name="as" type="number" min="0" inputmode="numeric"></label></div>
    <label class="field"><span>Vu en</span><select class="input" name="mode"><option value="direct">Direct</option><option value="differe">Différé</option><option value="resume" selected>Résumé</option></select></label>
    <button class="btn prim block" type="submit" ${n.h && n.a ? '' : 'disabled'}>Ajouter le match</button>
    <span class="small muted">Si ce match a déjà été récupéré automatiquement, Rewind reprend son score et son horaire.</span></form>`;
}
function catchSection() {
  const start = state.settings.catchTrialStart || state.createdAt;
  const day = Math.floor((now() - start) / DAY) + 1;
  const shows = Object.values(state.items).filter((i) => i.type === 'catch');
  let h = day <= 30
    ? `<div class="banner info">${svgIcon('clock', 18)}<span class="grow">Essai catch · jour ${day} / 30. Ajoute tout ce que tu regardes, on fera le point à la fin.</span></div>`
    : `<div class="banner warn">${svgIcon('target', 18)}<span class="grow">Le mois d’essai est terminé : regarde le bilan ci-dessous pour décider de l’organisation.</span></div>`;
  h += `<div class="row between"><span class="small muted">${plural(state.feds.length, 'fédération')} : ${esc(state.feds.map((f) => f.name).join(', '))}</span><button class="link" data-a="feds-open">Gérer</button></div>`;
  h += `<div class="sec-head"><h2 class="h2">Shows suivis</h2><button class="link" data-a="catch-new-show">+ Show suivi</button></div>`;
  shows.forEach((s) => { h += `<a class="card-row" href="#item-${s.id}">${itemPoster(s, 'sm')}<div class="col grow" style="gap:3px"><span class="label accent">Hebdo</span><span class="ti">${esc(s.title)}</span><span class="small muted">${esc(progressText(s))}</span></div></a>`; });
  const planned = Object.values(state.shows).filter((s) => !s.seen && !s.dismissed).sort((a, b) => a.ts - b.ts);
  h += `<div class="sec-head"><h2 class="h2">À venir</h2><a class="link" href="#ajouter-catch">+ Programmer</a></div>`;
  if (!planned.length) h += `<div class="empty">Aucun show programmé. Ajoute le prochain gala ou PPV avec son affiche : il apparaîtra dans En cours le jour J.</div>`;
  planned.forEach((s) => { h += `<button class="card-row" data-a="show-open" data-id="${s.id}">${posterHtml(s.name, s.poster, 'sm')}<div class="col grow" style="gap:3px"><span class="label">${esc(fmtMatch(s.ts))} · ${esc(s.fed)} · ${esc(CKINDS[s.kind] || 'Show')}</span><span class="ti">${esc(s.name)}</span></div><span class="pill ${s.ts < now() ? 'amber' : isToday(s.ts) ? 'live' : ''}">${s.ts < now() ? 'Tu l’as vu ?' : esc(untilText(s.ts))}</span></button>`; });
  const log = state.catchLog.slice().sort((a, b) => b.ts - a.ts);
  const byFed = {}; log.forEach((c) => { byFed[c.fed] = (byFed[c.fed] || 0) + 1; });
  h += `<div class="sec-head"><h2 class="h2">Journal</h2><a class="link" href="#ajouter-catch">+ Ajouter</a></div>`;
  if (Object.keys(byFed).length) h += `<div class="chips">${Object.entries(byFed).map(([f, n]) => `<span class="chip">${esc(f)} · ${n}</span>`).join('')}</div>`;
  if (!log.length) h += `<div class="empty">Rien pour l’instant. Touche + pour ajouter un show, un PPV ou un gala.</div>`;
  log.forEach((c) => {
    h += `<div class="card-row">${c.poster ? posterHtml(c.show || c.fed, c.poster, 'sm') : teamDisc(c.fed, null, 'mini-team')}<div class="col grow" style="gap:3px"><span class="label">${esc(fmtDay(c.ts))} · ${esc(c.fed)} · ${esc(CKINDS[c.kind] || 'Hebdo')}${c.air && c.air !== isoDay(new Date(c.ts)) ? ' · diffusé le ' + esc(fmtLong(c.air)) : ''}</span>
      <span class="ti">${esc(c.show || c.fed)}</span></div><span class="pill ac">${esc(modeCap(c.mode))}</span>
      <button class="icon-btn" data-a="catch-del" data-id="${c.id}" aria-label="Supprimer">${svgIcon('trash', 18)}</button></div>`;
  });
  return h;
}

/* ---------- Envies ---------- */
function viewEnvies() {
  const f = ui.envies;
  const all = Object.values(state.items).filter((i) => i.status === 'envie').sort((a, b) => b.createdAt - a.createdAt);
  const filters = FILTERS.filter(([k]) => k === 'tout' || all.some((i) => typeIn(k, i.type)));
  const list = all.filter((i) => typeIn(f, i.type));
  // un verbe par univers ; la croix (prise pour « fermer ») laisse place au menu ⋯ de l'affiche
  const acts = (it) => { const v = envieVerb(it); return `<div class="acts"><button class="btn prim" data-a="${v.a}" data-id="${it.id}">${v.a === 'envie-seen' ? v.icon : ''}${esc(v.label)}${v.a === 'envie-seen' ? '' : v.icon}</button></div>`; };
  let h = head('Envies');
  if (all.length) h += chipsHtml(filters, f, 'env-type') + `<label class="search"><span class="sr">Rechercher</span>${svgIcon('search', 18)}<input class="input" type="search" placeholder="Rechercher dans mes envies" data-filter="bib"></label>`;
  if (list.length) h += `<div class="mgrid">${list.map((it) => mcard(it, { extra: acts(it), noCat: f !== 'tout', menu: 'envie-menu' })).join('')}</div>${searchEmptySlot(f, 'envie')}`;
  else { const e = EMPTY.envies; h += emptyState(e[0], e[1], e[2], emptyBtns(e[3], 'envie')); }
  return page(h, 'envies');
}

/* ---------- Historique ---------- */
function histoRows(evs) {
  // une ligne par œuvre et par jour
  const map = new Map();
  for (const e of evs) {
    const d = new Date(e.ts); const key = e.item + '|' + d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(e);
  }
  const rows = [];
  for (const list of map.values()) {
    list.sort((a, b) => a.ts - b.ts);
    const e = list[list.length - 1]; const k = e.kind; let th, title, what, tag = '', href = '', type = e.type;
    if (k === 'badge') {
      const [, a, b] = String(e.item).split(':'); const sec = a === 's' && SECRET[b]; const f = !sec && FAM[a]; if (!sec && !f) continue;
      type = 'badge'; title = sec ? sec.label : f.label + ' · ' + TIER_LABEL[TIERS[+b]].toLowerCase(); what = sec ? sec.desc : fmtNum(f.tiers[+b]) + ' ' + f.unit;
      tag = 'Badge · +' + e.xp + ' XP'; href = '#badges'; th = `<span class="poster th badge-th">${medalHtml(sec ? sec.icon : f.icon, sec ? 'or' : TIERS[+b], 46)}</span>`;
    } else if (k === 'match') {
      const m = state.matches[String(e.item).slice(2)]; type = 'sport';
      title = m ? m.home + ' – ' + m.away : (e.title || 'Match'); th = m ? matchThumb(m) : posterHtml('Match', '', 'th');
      what = (m && m.league ? m.league + ' · ' : '') + (MODE_PHRASE[e.mode] ? 'Regardé ' + MODE_PHRASE[e.mode] : 'Regardé'); href = m ? '#match-' + m.id : '';
    } else if (k === 'catch') {
      const c = state.catchLog.find((x) => 'c:' + x.id === e.item); type = 'catch';
      title = (c && c.show) || e.show || e.fed; th = c && c.poster ? posterHtml(title, c.poster, 'th') : fedVignette(e.fed);
      tag = CKINDS[e.catchKind] || ''; what = e.fed + (MODE_PHRASE[e.mode] ? ' · Regardé ' + MODE_PHRASE[e.mode] : '');
    } else {
      const it = state.items[e.item]; if (!it) continue;
      title = it.title; href = '#item-' + it.id; th = posterHtml(it.title, it.backdrop || it.poster, 'th'); type = it.type;
      if (k === 'ep') {
        const infos = list.filter((x) => x.kind === 'ep').map((x) => epInfo(it, x.key)).filter(Boolean);
        const sp = (i) => (it.seasons.length > 1 ? 'S' + i.s + ' · ' : '');
        if (it.type === 'catch') what = plural(infos.length, 'show');
        else if (infos.length === 1) { const i = infos[0]; what = sp(i) + 'Ép. ' + i.e + (i.title && !/^Épisode \d+$/.test(i.title) ? ' · ' + i.title : ''); }
        else if (infos.length) { const a = infos[0], b = infos[infos.length - 1]; what = sp(a) + 'Ép. ' + a.e + ' à ' + (a.s !== b.s ? 'S' + b.s + ' · ' : '') + b.e; }
      } else if (k === 'tome') { const ns = list.filter((x) => x.kind === 'tome').map((x) => +x.key.slice(1)).sort((a, b) => a - b); what = ns.length === 1 ? 'Tome ' + ns[0] + ' lu' : 'Tomes ' + ns[0] + ' à ' + ns[ns.length - 1]; }
      else if (k === 'livre_fin') what = it.volumes && it.volumes.length > 1 ? 'Tome ' + e.key.slice(1) + ' terminé' : 'Livre terminé' + (e.pages ? ' · ' + e.pages + ' p.' : '');
      else if (k === 'livre_mi') what = 'À mi-parcours';
      else if (k === 'film') what = (e.rewatch ? 'Film revu' : 'Film vu') + (e.cine ? ' · au cinéma' : '');
      else if (k === 'jeu') what = 'Jeu terminé';
      else what = TYPES[it.type] ? TYPES[it.type].label : '';
      if (e.rewatch && k !== 'film') what += ' · revisionnage';
    }
    rows.push({ ts: e.ts, type, th, title, what, tag, href, xp: list.reduce((a, x) => a + (x.xp || 0), 0) });
  }
  return rows.sort((a, b) => b.ts - a.ts);
}
function histoRowHtml(r, when) {
  const tagName = r.href ? `a href="${r.href}"` : 'div';
  return `<${tagName} class="lrow${r.type === 'badge' ? ' gold-row' : ''}"><span class="thw">${r.th}${r.type === 'badge' ? '' : `<span class="ci" title="${esc((CAT[r.type] || CAT.serie)[1])}">${svgIcon(catIcon(r.type), 13)}</span>`}</span><div class="tx">${r.tag ? `<span class="tag">${esc(r.tag)}</span>` : ''}<b class="ti">${esc(r.title)}</b><span>${esc(r.what)}</span></div><span class="when">${esc(when)}</span></${r.href ? 'a' : 'div'}>`;
}
function viewHisto() {
  const f = ui.histoF;
  const rowsAll = histoRows(realEvents().filter((e) => !isBonus(e)));
  const rows = rowsAll.filter((r) => typeIn(f, r.type));
  const d0 = new Date(); d0.setHours(0, 0, 0, 0); const t0 = d0.getTime();
  const groups = []; const add = (key, label, r) => { let g = groups.find((x) => x.key === key); if (!g) groups.push(g = { key, label, rows: [] }); g.rows.push(r); };
  rows.forEach((r) => {
    if (r.ts >= t0) add('t', 'Aujourd’hui', r);
    else if (r.ts >= t0 - 6 * DAY) add('w', 'Cette semaine', r);
    else { const mk = monthKey(r.ts); add(mk, monthLabel(mk), r); }
  });
  const when = (r) => r.ts >= t0 ? hhmm(r.ts) : r.ts >= t0 - 6 * DAY ? new Date(r.ts).toLocaleDateString('fr-FR', { weekday: 'short' }).replace(/\.$/, '') : fmtDay(r.ts);
  const used = FILTERS.filter(([k]) => k === 'tout' || rowsAll.some((r) => typeIn(k, r.type)));
  let h = head('Historique') + chipsHtml(used, f, 'histo-type');
  if (!groups.length) h += `<div class="empty">Rien pour l’instant.<br>Ce que tu coches apparaîtra ici, jour après jour.</div>`;
  // les mois les plus anciens étaient cachés sans le dire : on les propose maintenant
  const shown = ui.histoN || 14;
  groups.slice(0, shown).forEach((g) => {
    h += `<section class="section"><div class="sec-head"><h2 class="h2">${esc(g.label)}</h2><span class="count">${g.rows.length}</span></div>
      <div class="list">${g.rows.map((r) => histoRowHtml(r, when(r))).join('')}</div></section>`;
  });
  if (groups.length > shown) h += `<button class="btn block" data-a="histo-more">Voir les mois précédents</button>`;
  const year = new Date().getFullYear();
  h += `<a class="btn prim block" href="#rewind-${year}">${svgIcon('redo', 18)}Ton Rewind ${year}</a>`;
  return page(h, 'histo');
}

/* ---------- Rewind (bilan annuel) ---------- */
function viewRewind(year) {
  year = String(year || new Date().getFullYear());
  const evs = realEvents().filter((e) => String(new Date(e.ts).getFullYear()) === year);
  const content = evs.filter((e) => !isBonus(e) && e.kind !== 'badge');
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
  const badges = wonList().filter((w) => !(w.secret ? state.secrets[w.secret].retro : state.tiers[w.fam][w.i].retro) && String(new Date(w.ts).getFullYear()) === year);
  const it = topItem && state.items[topItem[0]];
  const typeName = topType ? (topType[0] === 'sport' ? 'le sport' : TYPES[topType[0]] ? TYPES[topType[0]].plural.toLowerCase() : topType[0]) : '';
  let h = `<div class="row"><a class="icon-btn" href="#histo" aria-label="Retour">${svgIcon('back', 20)}</a></div>
    <section class="rw-hero col" style="gap:10px"><span class="label accent">Ton année ${year}</span><span class="rw-big">REWIND<br><span class="gtext">${year}</span></span>
      <span style="font-size:15px;color:var(--soft)">${content.length ? `${plural(content.length, 'moment')}, ${fmtNum(minutes / 60)} h devant l’écran ou dans les pages, et ${fmtNum(xp)} XP gagnés.` : 'Rien cette année pour l’instant. Reviens en fin d’année !'}</span></section>`;
  if (content.length) {
    h += `<div class="grid2">${[[countCat(evs, 'episodes'), 'épisodes'], [countCat(evs, 'films'), 'films'], [countCat(evs, 'tomes'), 'tomes et livres'], [pages, 'pages lues'], [countCat(evs, 'matchs'), 'matchs'], [evs.filter((e) => e.kind === 'catch' || (e.kind === 'ep' && e.type === 'catch')).length, 'shows de catch'], [evs.filter((e) => e.kind === 'jeu').length, 'jeux terminés'], [finished.length, 'œuvres terminées']].map(([v, l]) => `<div class="rw-stat"><b>${fmtNum(v)}</b><span class="label">${l}</span></div>`).join('')}</div>`;
    if (it) h += `<section class="card pad row" style="gap:14px">${itemPoster(it, 'md')}<div class="col grow"><span class="label amber">Œuvre de l’année</span><span class="h3">${esc(it.title)}</span><span class="small muted">${plural(topItem[1], 'moment')} passé${topItem[1] > 1 ? 's' : ''} avec elle</span></div></section>`;
    h += `<div class="grid2">${topMonth ? `<div class="rw-stat"><span class="label">Mois le plus actif</span><b style="font-size:26px">${esc(MONTHS[topMonth[0]])}</b></div>` : ''}${topType ? `<div class="rw-stat"><span class="label">Ta passion</span><b style="font-size:26px">${esc(typeName)}</b></div>` : ''}
      <div class="rw-stat"><span class="label">Niveau</span><b>${levelInfo().lvl}</b></div><div class="rw-stat"><span class="label">Badges</span><b>${badges.length}</b></div></div>`;
    if (badges.length) h += `<section class="section"><h2 class="h2">Badges de l’année</h2><div class="grid4">${badges.map((w) => `<div class="badge-cell">${medalHtml(wonIcon(w), wonTier(w), 56)}${esc(wonName(w))}</div>`).join('')}</div></section>`;
  }
  return page(h, 'histo');
}

/* ---------- Profil (ouvert depuis l'avatar) ---------- */
/* ---------- Gamification : médailles, cadres, profil, collection ---------- */
function medalHtml(icon, tier, size, label) {
  size = size || 56;
  return `<span class="mdl ${tier ? 't-' + tier : 'off'}" style="width:${size}px;height:${size}px"${label ? ` role="img" aria-label="${esc(label)}"` : ' aria-hidden="true"'}>${svgIcon(icon, Math.round(size * 0.46))}</span>`;
}
// cadre d'avatar aux couleurs du rang (anneau de progression si pct est donné)
function frameHtml(size, rank, pct, id, inner) {
  const w = Math.max(3.5, Math.round(size * 0.07)); const r = (size - w) / 2; const c = 2 * Math.PI * r; const cx = size / 2;
  const stops = rank.c.map((col, i) => `<stop offset="${(i / (rank.c.length - 1)).toFixed(2)}" stop-color="${col}"/>`).join('');
  const arc = pct == null ? `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="url(#${id})" stroke-width="${w}"/>`
    : `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${w}"/><circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="url(#${id})" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${(c * clamp(pct, 0, 100) / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${cx} ${cx})"/>`;
  let stars = '';
  for (let k = 0; k < (rank.stars || 0); k++) {
    const a = -Math.PI / 2 + (k - ((rank.stars - 1) / 2)) * 0.42; const s = size * 0.075;
    stars += `<path transform="translate(${(cx + r * Math.cos(a) - s).toFixed(1)} ${(cx + r * Math.sin(a) - s).toFixed(1)}) scale(${(s / 12).toFixed(3)})" d="${ICONS.star}" fill="#FFF1C9" stroke="#8A5A12" stroke-width="1.2"/>`;
  }
  return `<span class="frame${rank.glow ? ' glow' : ''}" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient></defs>${arc}${stars}</svg><span class="face" style="inset:${Math.round(w * 1.6)}px">${inner}</span></span>`;
}
const pipsHtml = (n) => `<span class="pips" aria-label="${n} palier${n > 1 ? 's' : ''} sur 4">${TIERS.map((t, i) => `<i class="${i < n ? 't-' + t : ''}"></i>`).join('')}</span>`;
function famInfo(f) {
  const v = badgeData().val[f.id]; const n = famTier(f.id); const nextT = f.tiers[n];
  return { v, n, best: n ? TIERS[n - 1] : null, next: nextT, sub: nextT == null ? 'Platine ✓' : fmtNum(Math.min(v, nextT)) + ' / ' + fmtNum(nextT) };
}
const famsShown = () => FAMS.filter((f) => f.group !== 'perso' || Object.values(state.items).some((i) => ['livre', 'bd', 'manga', 'jeu'].includes(i.type)) || Object.keys(state.matches).length || state.catchLog.length);
// le palier le plus proche, pour le « presque ! » du profil
function nearestTier() {
  let best = null;
  for (const f of famsShown()) {
    const x = famInfo(f); if (x.next == null || !x.v) continue;
    const prev = x.n ? f.tiers[x.n - 1] : 0; const r = (x.v - prev) / (x.next - prev);
    if (!best || r > best.r) best = { f, x, r };
  }
  return best;
}
function wonList() {
  const out = [];
  FAMS.forEach((f) => (state.tiers[f.id] || []).forEach((h, i) => { if (h) out.push({ fam: f.id, i, ts: h.ts, item: h.item }); }));
  Object.entries(state.secrets || {}).forEach(([id, h]) => out.push({ secret: id, ts: h.ts, item: h.item }));
  return out.sort((a, b) => b.ts - a.ts);
}
const wonIcon = (w) => (w.secret ? SECRET[w.secret].icon : FAM[w.fam].icon);
const wonTier = (w) => (w.secret ? 'or' : TIERS[w.i]);
const wonName = (w) => (w.secret ? SECRET[w.secret].label : FAM[w.fam].label + ' · ' + TIER_LABEL[TIERS[w.i]].toLowerCase());
const unlockedTitles = () => FAMS.filter((f) => famTier(f.id) >= 3 && f.title).map((f) => f.title);
function profileTitle() { const t = state.settings.title; return t && unlockedTitles().includes(t) ? t : ''; }
function bannerImg() { const it = state.items[state.settings.banner]; return it && it.status === 'termine' ? it.backdrop || it.poster : ''; }

function viewProfil() {
  const L = levelInfo(); const R = rankOf(L.lvl); const NR = nextRank(L.lvl); const mk = monthKey(now()); const goals = goalResults(mk);
  const s = state.settings; const cnt = badgeCount(); const won = wonList(); const near = nearestTier(); const title = profileTitle(); const ban = bannerImg();
  const evs = eventsByMonth()[mk] || [];
  const seriesN = new Set(evs.filter((e) => e.kind === 'ep' && e.type !== 'catch').map((e) => e.item)).size;
  const GI = { episodes: 'tv', films: 'reel', tomes: 'volume', matchs: 'ball' };
  const stat = (ic, n, one, many) => `<div class="card stat">${svgIcon(ic, 22)}<b>${n}</b><span>${n > 1 ? many : one}</span></div>`;
  const vit = (s.vitrine || []).map((k) => (k.startsWith('s:') ? state.secrets[k.slice(2)] && { secret: k.slice(2) } : famTier(k) && { fam: k, i: famTier(k) - 1 })).filter(Boolean).slice(0, 3);
  const h = (ban ? `<div class="pf-banner" aria-hidden="true"><img src="${esc(ban)}" alt=""></div>` : '') + head('Profil', `<button class="icon-btn sq" data-a="goto-settings" aria-label="Réglages">${svgIcon('gear', 21)}</button>`) + `
  <section class="rank-card" aria-label="${esc(R.name)}, niveau ${L.lvl}">
    <button class="ring-btn" data-a="profile-edit" aria-label="Modifier le profil (pseudo et photo)">${frameHtml(128, R, L.pct, 'rgp', faceInner(40))}<span class="face-edit" aria-hidden="true">${svgIcon('edit', 14)}</span></button>
    ${s.pseudo ? `<span class="pseudo">${esc(s.pseudo)}</span>` : `<button class="link" data-a="profile-edit">${svgIcon('plus', 15)}Choisir un pseudo</button>`}
    ${title ? `<span class="title-chip">${svgIcon(FAMS.find((f) => f.title === title).icon, 14)}${esc(title)}</span>` : ''}
    <span class="rank-line"><b class="rank-name" style="color:${R.c[R.c.length > 2 ? 1 : 0]}">${esc(R.name)}</b><span>· niveau ${L.lvl}</span></span>
    <div class="col" style="gap:6px;width:100%;margin-top:4px">${L.max ? '' : bar(L.pct, 'thick gold')}
      <span class="rank-sub"><span>${L.max ? 'Niveau maximum atteint' : `<b>${fmtNum(L.into)}</b> / ${fmtNum(L.need)} XP`}</span><span>${NR ? `${esc(NR.name)} au niveau ${NR.lvl}` : 'Rang suprême'}</span></span></div>
    <button class="btn block act-row" data-a="perso-open">${svgIcon('edit', 18)}Personnaliser</button>
  </section>
  ${vit.length ? `<section class="section">${secHead('Ma vitrine')}<div class="shelf">${vit.map((w) => `<button class="shelf-it" data-a="${w.secret ? 'secret-open' : 'badge-open'}" data-v="${w.secret || w.fam}">${medalHtml(wonIcon(w), wonTier(w), 64)}<span>${esc(w.secret ? SECRET[w.secret].label : FAM[w.fam].label)}</span></button>`).join('')}</div></section>` : ''}
  <section class="section" aria-label="Badges"><div class="sec-head"><h2 class="h2">Badges</h2><a href="#badges">${cnt.won} / ${cnt.total} · Voir la collection${svgIcon('chevR', 15)}</a></div>
    ${won.length ? `<span class="field-lab">Derniers obtenus</span><div class="recent">${won.slice(0, 3).map((w) => `<button class="shelf-it" data-a="${w.secret ? 'secret-open' : 'badge-open'}" data-v="${w.secret || w.fam}">${medalHtml(wonIcon(w), wonTier(w), 56)}<span>${esc(wonName(w))}</span></button>`).join('')}</div>` : '<span class="small muted" style="padding:0 4px">Ton premier badge t’attend : 50 épisodes, 5 films ou ta première saison terminée.</span>'}
    ${near ? `<button class="near" data-a="badge-open" data-v="${near.f.id}">${medalHtml(near.f.icon, null, 44)}<span class="grow col" style="gap:6px;text-align:left"><span class="row between" style="font-size:14px"><b>${esc(near.f.label)} · ${TIER_LABEL[TIERS[near.x.n]].toLowerCase()}</b><span class="muted">${near.r >= 0.8 ? 'presque !' : Math.round(near.r * 100) + ' %'}</span></span><span class="small soft">${esc(near.x.sub)} ${esc(near.f.unit)}</span>${bar(Math.round(near.r * 100), 'thin')}</span></button>` : ''}
  </section>
  <section class="section">${secHead('Ce mois-ci')}<div class="stats">
    ${stat('reel', countCat(evs, 'films'), 'Film terminé', 'Films terminés')}${stat('tv', seriesN, 'Série suivie', 'Séries suivies')}
    ${stat('bookOpen', countCat(evs, 'tomes'), 'Livre ou tome', 'Livres et tomes')}${stat('ball', countCat(evs, 'matchs'), 'Match vu', 'Matchs vus')}</div></section>
  <section class="section" aria-label="Objectifs du mois"><div class="sec-head"><h2 class="h2">Objectifs de ${esc(MONTHS[new Date().getMonth()])}</h2><button class="link" data-a="edit-goals">Modifier</button></div>
    <div class="card pad col" style="gap:16px">${goals.length ? goals.map((g) => `<div class="goal-line"><div class="top">${svgIcon(GI[g.key] || 'target', 18)}<span class="grow">${esc(g.label)}</span><b class="${g.met ? 'met' : ''}">${g.count} <span>/ ${g.target}</span></b></div>${bar(Math.round((g.count / g.target) * 100), 'thick' + (g.met ? ' amber' : ''))}</div>`).join('') : '<span class="muted small">Aucun objectif ce mois-ci.</span>'}
    <span class="small muted">Chaque objectif atteint rapporte ${XP.goal} XP.</span></div></section>
  <section class="card pad col" style="gap:12px" id="reglages" aria-label="Réglages">
    <h2 class="h2">Réglages</h2>
    <form class="col" style="gap:12px" data-form="keys">
      <label class="field"><span>Clé TMDB (films, séries, docus)</span><input class="input" name="tmdb" value="${esc(s.tmdbKey)}" autocomplete="off" spellcheck="false" placeholder="Clé API ou jeton d’accès"></label>
      <label class="field"><span>Clé RAWG (jeux vidéo, facultatif)</span><input class="input" name="rawg" value="${esc(s.rawgKey)}" autocomplete="off" spellcheck="false" placeholder="Clé API RAWG"></label>
      <span class="small muted">Tes clés restent sur ce téléphone. La clé TMDB sert aussi aux badges Voyageur, Décennies et Sagas. AniList (manga), Google Books et Open Library (livres) et TheSportsDB (sport) n’en demandent pas.</span>
      <div class="row"><button class="btn prim grow" type="submit">Enregistrer</button><button class="btn" type="button" data-a="test-tmdb">Tester TMDB</button></div>
    </form>
  </section>
  <section class="card pad col" style="gap:12px" aria-label="Sauvegarde">
    <h2 class="h2">Sauvegarde</h2>
    <span class="small muted">Tes données sont uniquement sur ce téléphone. Exporte-les régulièrement. Tes clés TMDB et RAWG ne sont pas incluses dans la sauvegarde.${state.lastExport ? ' Dernier export : ' + esc(fmtDate(state.lastExport)) + '.' : ' Aucun export pour l’instant.'}</span>
    <div class="grid2"><button class="btn" data-a="export">${svgIcon('download', 18)}Exporter</button>
      <label class="btn">${svgIcon('upload', 18)}Importer<input type="file" accept="application/json,.json" data-change="import" class="sr"></label></div>
    <button class="link" data-a="copy-data" style="align-self:center">Copier les données (si l’export ne marche pas)</button>
  </section>
  <section class="col" style="gap:8px">
    ${!state.demo && !Object.values(state.items).some((i) => i.type !== 'catch') ? `<button class="btn block" data-a="load-demo">Charger des données de démo</button>` : ''}
    <button class="btn danger block" data-a="wipe">${svgIcon('trash', 18)}Tout effacer</button>
    <span class="small muted" style="text-align:center;line-height:1.6">Rewind ${APP_VERSION} · Films et séries : TMDB (ce produit utilise l’API TMDB mais n’est ni approuvé ni certifié par TMDB) · Manga : AniList · Livres : Google Books, Open Library · Jeux : RAWG · Sport : TheSportsDB</span>
  </section>`;
  return page(h, 'profil', null, ban ? 'has-banner' : '');
}

/* ---------- Collection de badges ---------- */
const BDG_FILTERS = [['tout', 'Tout'], ['series', 'Séries'], ['films', 'Films'], ['habits', 'Habitudes'], ['sagas', 'Sagas'], ['secrets', 'Secrets'], ['perso', 'Ma version']];
function viewBadges() {
  const f = ui.bdgF || 'tout'; const cnt = badgeCount(); const fams = famsShown();
  const byTier = TIERS.map((t, i) => fams.reduce((a, x) => a + ((state.tiers[x.id] || [])[i] ? 1 : 0), 0));
  const cell = (x) => { const fi = famInfo(x); return `<button class="bcell" data-a="badge-open" data-v="${x.id}">${medalHtml(x.icon, fi.best, 64, x.label + (fi.best ? ', ' + fi.best : ''))}<span class="bl">${esc(x.label)}</span>${pipsHtml(fi.n)}<span class="bs">${esc(fi.sub)}</span></button>`; };
  let h = `<header class="head"><button class="icon-btn" data-a="back" aria-label="Retour">${svgIcon('back', 20)}</button><h1 class="h1 grow">Badges</h1></header>
    <div class="col" style="gap:8px"><span class="row between" style="font-size:14px"><span><b style="font-size:20px">${cnt.won}</b> / ${cnt.total} badges</span><span class="muted small">${byTier.slice().reverse().map((n, k) => n + ' ' + TIERS[3 - k]).join(' · ')}</span></span>${bar(Math.round((cnt.won / cnt.total) * 100), 'thick')}</div>
    ${chipsHtml(BDG_FILTERS.filter(([k]) => k !== 'perso' || fams.some((x) => x.group === 'perso')), f, 'bdg-type', 'Familles')}`;
  for (const [g, label] of GROUPS) {
    if (!(f === 'tout' || f === g)) continue; const list = fams.filter((x) => x.group === g); if (!list.length) continue;
    h += `<section class="section"><span class="field-lab">${esc(label)}</span><div class="bgrid">${list.map(cell).join('')}</div></section>`;
  }
  if (f === 'tout' || f === 'sagas') {
    const sagas = Object.keys(state.colls || {}).map((id) => Object.assign({ id }, sagaState(id))).filter((x) => x.parts && x.parts.length > 1).sort((a, b) => (b.done - a.done) || b.seen.length / b.parts.length - a.seen.length / a.parts.length);
    h += `<section class="section"><span class="field-lab">Sagas (collections TMDB)</span>${sagas.length ? `<div class="list">${sagas.map((x) => `<div class="lrow saga-row"><span class="saga-po">${x.parts.slice(0, 4).map((p) => `<i style="background:${grad(p.title)}">${p.poster ? `<img src="${esc(p.poster)}" alt="" loading="lazy">` : ''}</i>`).join('')}</span><div class="tx" style="gap:6px"><span class="row between"><b>${esc(x.name.replace(/\s*[-–]\s*(Saga|Collection)$|\s+(Saga|Collection)$/i, ''))}</b><span class="small ${x.done ? 'gold-t' : 'soft'}">${x.seen.length} / ${x.parts.length}${x.done ? ' ✓' : ''}</span></span>${bar(Math.round((x.seen.length / x.parts.length) * 100), 'thin' + (x.done ? ' amber' : ''))}</div></div>`).join('')}</div>` : '<span class="small muted" style="padding:0 4px">Les sagas apparaissent quand tu ajoutes un film qui en fait partie (Star Wars, Harry Potter…). Il faut ta clé TMDB.</span>'}</section>`;
  }
  if (f === 'tout' || f === 'secrets') {
    h += `<section class="section"><span class="field-lab">Secrets · ${cnt.sec} trouvé${cnt.sec > 1 ? 's' : ''} sur ${SECRETS.length}</span><div class="bgrid">${SECRETS.map((x) => state.secrets[x.id]
      ? `<button class="bcell" data-a="secret-open" data-v="${x.id}">${medalHtml(x.icon, 'or', 64, x.label)}<span class="bl">${esc(x.label)}</span></button>`
      : `<span class="bcell">${medalHtml('q', null, 64, 'Badge secret')}<span class="bl muted">Secret</span></span>`).join('')}</div></section>`;
  }
  return page(h, '');
}
// détail d'un badge : ses 4 paliers, quand et avec quoi ils ont été obtenus, la suite
function badgeSheet(fid) {
  const f = FAM[fid]; const fi = famInfo(f); const have = state.tiers[fid] || [];
  const rows = f.tiers.map((t, i) => {
    const h = have[i]; const it = h && state.items[h.item];
    return `<div class="tier-row">${medalHtml(f.icon, h ? TIERS[i] : null, 36)}<span class="grow col" style="gap:2px"><b>${TIER_LABEL[TIERS[i]]} · ${fmtNum(t)} ${esc(f.unit)}</b><span class="small muted">${h ? 'Obtenu le ' + esc(fmtDate(h.ts)) + (it ? ' · ' + esc(it.title) : '') : '+' + TIER_XP[i] + ' XP'}</span></span>${h ? `<span class="ok">${svgIcon('check', 18)}</span>` : ''}</div>`;
  }).join('');
  const nx = fi.next; const prev = fi.n ? f.tiers[fi.n - 1] : 0;
  openModal('', `<div class="col" style="gap:10px;align-items:center;text-align:center"><span class="grip" aria-hidden="true"></span>
    ${medalHtml(f.icon, fi.best, 112, f.label)}<span class="field-lab" style="padding:0">${fi.best ? 'Palier ' + TIER_LABEL[fi.best].toLowerCase() : 'Pas encore obtenu'}</span>
    <h2 class="sheet-sub" style="padding:0">${esc(f.label)}</h2><p class="small soft" style="margin:0;line-height:1.5">${esc(f.desc)}</p>
    <div class="col" style="gap:0;width:100%;text-align:left">${rows}</div>
    ${nx != null ? `<div class="col" style="gap:6px;width:100%;text-align:left"><span class="row between small"><b>Vers ${TIER_LABEL[TIERS[fi.n]].toLowerCase()}</b><span class="muted">${fmtNum(Math.min(fi.v, nx))} / ${fmtNum(nx)}</span></span>${bar(Math.round(((Math.min(fi.v, nx) - prev) / (nx - prev)) * 100), 'thick gold')}</div>` : ''}
    ${fi.best === 'platine' ? `<button class="btn block" data-a="share" data-k="fam" data-v="${fid}">${svgIcon('upload', 18)}Partager la carte</button>` : ''}</div>`, { sheet: true });
}
function secretSheet(id) {
  const x = SECRET[id]; const h = state.secrets[id]; const it = h && state.items[h.item];
  openModal('', `<div class="col" style="gap:10px;align-items:center;text-align:center"><span class="grip" aria-hidden="true"></span>${medalHtml(x.icon, 'or', 112, x.label)}
    <span class="field-lab" style="padding:0">Badge secret · +${SECRET_XP} XP</span><h2 class="sheet-sub" style="padding:0">${esc(x.label)}</h2><p class="small soft" style="margin:0">${esc(x.desc)}</p>
    ${h ? `<span class="small muted">Obtenu le ${esc(fmtDate(h.ts))}${it ? ' · ' + esc(it.title) : ''}</span>` : ''}
    <button class="btn block" data-a="share" data-k="secret" data-v="${id}">${svgIcon('upload', 18)}Partager la carte</button></div>`, { sheet: true });
}
// personnaliser : titre (débloqué par l'or d'une famille), vitrine de 3 badges, bannière (série terminée)
function persoSheet() {
  const s = state.settings; const titles = unlockedTitles(); const cur = profileTitle(); const vit = s.vitrine || [];
  const won = FAMS.filter((f) => famTier(f.id)).map((f) => ({ k: f.id, icon: f.icon, tier: TIERS[famTier(f.id) - 1], label: f.label })).concat(SECRETS.filter((x) => state.secrets[x.id]).map((x) => ({ k: 's:' + x.id, icon: x.icon, tier: 'or', label: x.label })));
  const bans = Object.values(state.items).filter((i) => i.status === 'termine' && i.seasons && i.type !== 'catch' && (i.backdrop || i.poster));
  const lockedTitles = FAMS.filter((f) => f.title && famTier(f.id) < 3 && famsShown().includes(f)).slice(0, 6);
  openModal('', `<div class="col" style="gap:12px"><span class="grip" aria-hidden="true"></span><h2 class="sheet-sub" style="padding:0">Personnaliser mon profil</h2>
    <span class="field-lab" style="padding:0">Titre sous ton pseudo</span><div class="chips" style="margin:0;padding:0;flex-wrap:wrap">
      <button class="chip ${cur ? '' : 'on'}" data-a="pick-title" data-v="">Aucun</button>${titles.map((t) => `<button class="chip ${t === cur ? 'on' : ''}" data-a="pick-title" data-v="${esc(t)}">${esc(t)}</button>`).join('')}${lockedTitles.map((f) => `<span class="chip locked" title="${esc(f.label)} or">${esc(f.title)}</span>`).join('')}</div>
    <span class="small muted">Un titre se débloque avec l’or de son badge.</span>
    <span class="field-lab" style="padding:0">Vitrine · 3 badges au plus</span>${won.length ? `<div class="pick-grid">${won.map((w) => `<button class="pick ${vit.includes(w.k) ? 'on' : ''}" data-a="pick-vit" data-v="${w.k}" aria-pressed="${vit.includes(w.k)}">${medalHtml(w.icon, w.tier, 48)}<span>${esc(w.label)}</span></button>`).join('')}</div>` : '<span class="small muted">Gagne ton premier badge pour remplir ta vitrine.</span>'}
    <span class="field-lab" style="padding:0">Bannière</span>${bans.length ? `<div class="ban-grid"><button class="ban ${s.banner ? '' : 'on'}" data-a="pick-banner" data-v="">Aucune</button>${bans.map((i) => `<button class="ban ${s.banner === i.id ? 'on' : ''}" data-a="pick-banner" data-v="${i.id}" aria-label="${esc(i.title)}"><img src="${esc(i.backdrop || i.poster)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
    <span class="small muted">Chaque série terminée débloque son image comme bannière.</span>
    <button class="btn prim block" data-a="modal-close">Terminé</button></div>`, { sheet: true });
}

/* ---------- Célébrations : carte du bas (bronze, argent, or), écran plein (rang, platine, secret), récap ---------- */
function celebrate(fresh, rankUp) {
  ui.fs = ui.fs || [];
  if (rankUp) ui.fs.push({ t: 'rank', id: rankUp.id });
  const big = fresh.filter((x) => x.secret || x.i === 3); const small = fresh.filter((x) => !x.secret && x.i < 3);
  big.forEach((x) => ui.fs.push(Object.assign({ t: 'tier' }, x)));
  // la carte du bas attend la fin d'un écran plein, sinon elle passerait dessous sans être vue
  if (small.length) { if (ui.fs.length) ui.cardsLater = (ui.cardsLater || []).concat(small); else badgeCard(small); }
  if (big.length || rankUp) buzz(30);
}
function badgeCard(list) {
  let box = document.getElementById('toasts-act');
  if (!box) { box = document.createElement('div'); box.id = 'toasts-act'; document.body.appendChild(box); }
  const gold = list.length === 1 && list[0].i === 2; const xp = list.reduce((a, x) => a + TIER_XP[x.i], 0);
  const el = document.createElement('div'); el.className = 'toast bcard' + (gold ? ' gold' : ''); el.setAttribute('role', 'status');
  const one = list[0]; const f = FAM[one.fam];
  el.innerHTML = list.length === 1
    ? `${medalHtml(f.icon, TIERS[one.i], gold ? 76 : 60)}<span class="grow col" style="gap:3px"><span class="field-lab" style="padding:0;color:${gold ? 'var(--amber)' : ''}">Badge débloqué · ${TIER_LABEL[TIERS[one.i]].toLowerCase()}</span><b class="bc-t">${esc(f.label)}</b><span class="small soft">${fmtNum(f.tiers[one.i])} ${esc(f.unit)}</span></span><span class="col" style="gap:8px;align-items:flex-end"><span class="xp-chip">+${xp} XP</span><button class="toast-act" data-a="badge-open" data-v="${f.id}">Voir</button></span>`
    : `<span class="grow col" style="gap:8px"><span class="row between"><span class="field-lab" style="padding:0">${list.length} badges débloqués</span><span class="xp-chip">+${xp} XP</span></span><span class="row" style="gap:6px">${list.map((x) => medalHtml(FAM[x.fam].icon, TIERS[x.i], 44)).join('')}<span class="small soft grow">${list.map((x) => `<b>${esc(FAM[x.fam].label)}</b> ${TIER_LABEL[TIERS[x.i]].toLowerCase()}`).join(', ')}</span></span><a class="toast-act" href="#badges">Voir les badges</a></span>`;
  el.addEventListener('click', () => el.remove());
  box.appendChild(el); if (gold) buzz(20);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, gold ? 6000 : 4500);
}
// l'écran plein vit hors de #app : il n'est redessiné (et ses animations relancées) que s'il change
let fsLast = '';
function renderFs() {
  const html = fsHtml(); if (html === fsLast) return; fsLast = html;
  let box = document.getElementById('fs-box'); if (!box) { box = document.createElement('div'); box.id = 'fs-box'; document.body.appendChild(box); }
  box.innerHTML = html;
}
function fsHtml() {
  const x = ui.fs && ui.fs[0]; if (!x) return '';
  const L = levelInfo(); const R = rankOf(L.lvl); const conf = '<span class="confetti" aria-hidden="true">' + Array.from({ length: 14 }, (_, i) => `<i style="left:${(i * 37) % 100}%;animation-delay:${(i % 7) * 0.12}s"></i>`).join('') + '</span>';
  if (x.t === 'rank') {
    const r = RANKS.find((k) => k.id === x.id);
    return `<div class="fs fs-rank" role="dialog" aria-label="Nouveau rang : ${esc(r.name)}">${conf}<span class="field-lab" style="color:var(--amber)">Nouveau rang</span>${frameHtml(176, r, null, 'rgu', faceInner(56))}
      <h2 class="fs-t gold-grad">${esc(r.name)}</h2><p class="fs-p">Niveau ${L.lvl} atteint. <b>${esc(r.frame)}</b> débloqué pour ton avatar.</p>
      <div class="fs-acts"><button class="btn prim block" data-a="fs-next">Continuer</button><button class="btn block" data-a="share" data-k="rank" data-v="${r.id}">${svgIcon('upload', 18)}Partager la carte</button></div>${nextRank(L.lvl) ? `<span class="small muted">Prochain rang : ${esc(nextRank(L.lvl).name)}, au niveau ${nextRank(L.lvl).lvl}</span>` : ''}</div>`;
  }
  if (x.t === 'tier') {
    const sec = x.secret && SECRET[x.secret]; const f = x.fam && FAM[x.fam]; const h = sec ? state.secrets[x.secret] : (state.tiers[x.fam] || [])[x.i]; const it = h && state.items[h.item];
    const name = sec ? sec.label : fmtNum(f.tiers[3]) + ' ' + f.unit; const ft = f && f.title;
    return `<div class="fs fs-plat" role="dialog" aria-label="Badge ${esc(sec ? sec.label : f.label)}">${conf}<span class="field-lab" style="color:#B8ACFF">${sec ? 'Badge secret' : 'Badge platine'}</span>${medalHtml(sec ? sec.icon : f.icon, sec ? 'or' : 'platine', 168)}
      <h2 class="fs-t ${sec ? 'gold-grad' : 'plat-grad'}">${esc(sec ? sec.label : f.label)}</h2><p class="fs-p">${esc(sec ? sec.desc : name)}${it ? `<br>avec <b>${esc(it.title)}</b>` : ''}</p>
      <span class="xp-chip">+${sec ? SECRET_XP : TIER_XP[3]} XP</span>${ft && !sec ? `<span class="small muted">Titre « ${esc(ft)} » déjà disponible pour ton profil</span>` : ''}
      <div class="fs-acts"><button class="btn prim block" data-a="fs-next">Continuer</button><button class="btn block" data-a="share" data-k="${sec ? 'secret' : 'fam'}" data-v="${x.secret || x.fam}">${svgIcon('upload', 18)}Partager la carte</button></div></div>`;
  }
  if (x.t === 'recap') {
    const won = wonList();
    return `<div class="fs" role="dialog" aria-label="Ta collection est prête"><span class="field-lab" style="color:#7FB2FF">Nouveau dans Rewind</span>${frameHtml(120, R, null, 'rgr', faceInner(40))}
      <h2 class="fs-t">Ta collection est prête</h2><p class="fs-p">Tout ce que tu as déjà regardé compte : tu démarres au rang <b>${esc(R.name)}</b> (niveau ${L.lvl}), avec <b>${won.length} badge${won.length > 1 ? 's' : ''}</b> déjà gagné${won.length > 1 ? 's' : ''}.</p>
      ${won.length ? `<div class="recap-grid">${won.slice(0, 10).map((w) => medalHtml(wonIcon(w), wonTier(w), 46)).join('')}</div>` : ''}
      <span class="small muted">Les badges déjà gagnés n’ajoutent pas d’XP : la suite est à conquérir.</span>
      <div class="fs-acts"><button class="btn prim block" data-a="fs-next" data-v="#badges">Voir ma collection</button><button class="btn block" data-a="fs-next">Plus tard</button></div></div>`;
  }
  return '';
}

/* ---------- Carte à partager (image 1080 × 1920, format story) ---------- */
const TIER_RGB = { bronze: ['#E9B48A', '#9A5F35', '#3A1E0A'], argent: ['#F7FAFC', '#9AA7B6', '#22303D'], or: ['#FFE8B0', '#D39A3A', '#4A2B05'], platine: ['#E4ECFF', '#8C7BFF', '#1A1550'] };
async function shareCard(kind, id) {
  try { await Promise.all(['italic 800 132px "Barlow Condensed"', '800 64px "Barlow Condensed"', '700 48px Manrope'].map((f) => document.fonts.load(f))); } catch (e) { /* polices de secours */ }
  const W = 1080, H = 1920; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const L = levelInfo(); const R = rankOf(L.lvl); const s = state.settings;
  let big, sub, icon, tier, accent = '#B8ACFF';
  if (kind === 'rank') { const r = RANKS.find((k) => k.id === id) || R; big = r.name; sub = 'Nouveau rang · niveau ' + L.lvl; accent = r.c[0]; }
  else if (kind === 'secret') { const x = SECRET[id]; big = x.label; sub = 'Badge secret'; icon = x.icon; tier = 'or'; accent = '#EDB965'; }
  else { const f = FAM[id]; const n = famTier(id); tier = TIERS[Math.max(0, n - 1)]; big = fmtNum(f.tiers[Math.max(0, n - 1)]) + ' ' + f.unit; sub = 'Badge ' + tier + ' · ' + f.label; icon = f.icon; accent = TIER_RGB[tier][0]; }
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#141A2E'); bg.addColorStop(1, '#0A0D11'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W / 2, 700, 40, W / 2, 700, 700); glow.addColorStop(0, accent + '66'); glow.addColorStop(1, 'transparent'); g.fillStyle = glow; g.fillRect(0, 0, W, H);
  g.textAlign = 'center'; g.fillStyle = '#E6ECF2'; g.font = '800 64px "Barlow Condensed", sans-serif'; g.fillText('R E W I N D', W / 2, 170);
  const cx = W / 2, cy = 700, rad = 280;
  if (icon) {
    const t = TIER_RGB[tier]; const mg = g.createRadialGradient(cx - 90, cy - 110, 20, cx, cy, rad * 1.2); mg.addColorStop(0, t[0]); mg.addColorStop(0.62, t[1]); mg.addColorStop(1, t[2]);
    g.beginPath(); g.arc(cx, cy, rad, 0, 7); g.fillStyle = mg; g.fill();
    g.save(); g.translate(cx - 129, cy - 129); g.scale(10.75, 10.75); g.strokeStyle = t[2]; g.lineWidth = 2; g.lineCap = g.lineJoin = 'round'; g.stroke(new Path2D(ICONS[icon])); g.restore();
  } else {
    const rk = RANKS.find((k) => k.id === id) || R; const rg = g.createLinearGradient(cx - rad, cy - rad, cx + rad, cy + rad); rk.c.forEach((col, i) => rg.addColorStop(i / (rk.c.length - 1), col));
    g.beginPath(); g.arc(cx, cy, rad, 0, 7); g.lineWidth = 34; g.strokeStyle = rg; g.stroke();
    g.save(); g.beginPath(); g.arc(cx, cy, rad - 40, 0, 7); g.clip(); g.fillStyle = '#1A2430'; g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    if (s.avatar) { try { const im = await loadImage(s.avatar); g.drawImage(im, cx - rad + 40, cy - rad + 40, (rad - 40) * 2, (rad - 40) * 2); } catch (e) { /* */ } }
    else { g.fillStyle = '#E6ECF2'; g.font = '800 240px "Barlow Condensed", sans-serif'; g.fillText((s.pseudo || '?').trim()[0].toUpperCase(), cx, cy + 85); }
    g.restore();
  }
  g.fillStyle = accent; g.font = '800 44px Manrope, sans-serif'; g.fillText(sub.toUpperCase(), W / 2, 1110);
  g.fillStyle = '#FFFFFF'; g.font = 'italic 800 132px "Barlow Condensed", sans-serif';
  const words = big.toUpperCase().split(' '); const lines = []; let line = '';
  words.forEach((w) => { const tst = line ? line + ' ' + w : w; if (g.measureText(tst).width > 900 && line) { lines.push(line); line = w; } else line = tst; }); lines.push(line);
  lines.slice(0, 3).forEach((l, i) => g.fillText(l, W / 2, 1270 + i * 130));
  g.fillStyle = '#D9E1EA'; g.font = '700 48px Manrope, sans-serif'; g.fillText((s.pseudo ? s.pseudo + ' · ' : '') + R.name + (profileTitle() ? ' · ' + profileTitle() : ''), W / 2, 1720);
  g.fillStyle = '#98A6B5'; g.font = '600 38px Manrope, sans-serif'; g.fillText(fmtDate(now()), W / 2, 1790);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png')); const file = new File([blob], 'rewind-' + (id || kind) + '.png', { type: 'image/png' });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Rewind' }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Carte enregistrée dans tes téléchargements');
}

/* ---------- Ajouter ---------- */
const ADD_MENU = [['film', 'Film', 'TMDB'], ['serie', 'Série', 'Séries et anime'], ['doc', 'Docu', 'Film ou série'], ['livre', 'Livre', 'Google Books'], ['manga', 'Manga', 'AniList'], ['bd', 'BD', 'Tomes'], ['jeu', 'Jeu vidéo', 'RAWG'], ['sport', 'Match', 'NBA, Milan'], ['catch', 'Catch', 'Show, PPV']];
const addLabel = (t) => t === 'sport' ? 'Match' : TYPES[t].label;
function viewAjouter(arg) {
  const a = ui.add;
  if (arg && ADD_TYPES.includes(arg) && a.type !== arg) { Object.assign(a, { type: arg, results: null, picked: null, manual: false, error: '' }); }
  let h = `<header class="head"><button class="icon-btn" data-a="back" aria-label="Retour">${svgIcon('back', 20)}</button><h1 class="h1 grow">Ajouter</h1></header>
    ${chipsHtml(ADD_TYPES.map((t) => [t, addLabel(t)]), a.type, 'add-type', 'Type')}`;
  if (a.type === 'sport') {
    const nb = a.sportMode !== 'autre';
    return `<main class="view">${h}<div class="seg"><button class="${nb ? 'on' : ''}" data-a="sport-mode" data-v="nba">NBA</button><button class="${nb ? '' : 'on'}" data-a="sport-mode" data-v="autre">Autre match</button></div>${nb ? nbaForm() : matchForm()}</main>`;
  }
  if (a.type === 'catch') {
    if (!a.cplan && CATCH_LEAGUES[a.fed || 'AEW']) setTimeout(() => syncCatch(a.fed || 'AEW').catch(() => {}), 0);
    return `<main class="view">${h}${catchTmdbBlock()}${catchForm()}</main>`;
  }
  if (a.picked) return `<main class="view">${h}${pickedPanel()}</main>`;
  if (a.manual) return `<main class="view">${h}${manualForm()}</main>`;
  h += `<form class="search" data-form="search"><label class="grow"><span class="sr">Rechercher</span>${svgIcon('search', 18)}<input class="input" name="q" value="${esc(a.q)}" placeholder="${a.type === 'serie' ? 'Série ou anime à rechercher…' : 'Titre à rechercher…'}" autocomplete="off" enterkeyhint="search"></label><button class="icon-btn sq" type="submit" aria-label="Rechercher">${svgIcon('search', 20)}</button></form>`;
  if (a.loading) h += `<div class="empty">Recherche…</div>`;
  if (a.error) h += `<div class="banner warn">${esc(a.error)}</div>`;
  if (a.results) {
    if (!a.results.length) h += `<div class="empty">Aucun résultat.</div>`;
    a.results.forEach((r, i) => { h += `<button class="result" data-a="pick" data-i="${i}">${posterHtml(r.title, r.poster, 'sm')}<div class="col grow" style="gap:3px"><span class="ti">${esc(r.title)}</span><span class="small muted">${esc([r.year, r.sub].filter(Boolean).join(' · '))}</span></div></button>`; });
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
  const needsTomes = t === 'bd' || t === 'livre' || t === 'manga';
  return `<form class="col" style="gap:14px" data-form="confirm-add">
    <div class="card pad row" style="gap:14px">${posterHtml(r.title, r.poster, 'md')}<div class="col grow" style="gap:6px">${catBadge(t)}<span class="h3">${esc(r.title)}</span><span class="small muted">${esc([r.year, r.sub].filter(Boolean).join(' · '))}</span></div></div>
    ${statusPicker()}
    ${needsTomes ? `<label class="field"><span>Nombre de tomes${t === 'livre' ? ' (1 pour un livre seul)' : ''}</span><input class="input" name="tomes" type="number" min="1" max="300" inputmode="numeric" value="${esc(a.tomes || r.volumes || 1)}"></label>` : ''}
    ${t === 'livre' ? `<label class="field"><span>Pages par tome</span><input class="input" name="pages" type="number" min="1" inputmode="numeric" value="${esc(a.pages || r.pages || '')}" placeholder="Ex. 350"></label><span class="small muted">Les pages servent à calculer l’XP : environ 1 XP pour 2 pages, 100 XP minimum.</span>` : ''}
    <button class="btn prim block" type="submit" ${a.loading ? 'disabled' : ''}>${a.loading ? 'Ajout…' : 'Ajouter'}</button>
    ${a.error ? `<div class="banner warn">${esc(a.error)}</div>` : ''}
    <button class="btn block" type="button" data-a="unpick">Changer de titre</button></form>`;
}
function manualForm() {
  const t = ui.add.type;
  const eps = t === 'serie' || t === 'doc';
  return `<form class="col" style="gap:14px" data-form="manual-add">
    <label class="field"><span>Titre</span><input class="input" name="title" required autocomplete="off"></label>
    <label class="field"><span>Année (facultatif)</span><input class="input" name="year" inputmode="numeric" maxlength="4"></label>
    ${eps ? `<label class="field"><span>Épisodes par saison</span><input class="input" name="seasons" placeholder="Ex. 10, 8, 12 (vide pour un docu unique)" ${t === 'doc' ? '' : 'required'}></label>
      <label class="toggle"><input type="checkbox" name="ended" checked><span class="sw"></span><span class="grow"><b style="font-size:14px">Série terminée</b><br><span class="small muted">Décoche si de nouveaux épisodes vont sortir.</span></span></label>` : ''}
    ${t === 'bd' || t === 'manga' || t === 'livre' ? `<label class="field"><span>Nombre de tomes</span><input class="input" name="tomes" type="number" min="1" max="300" value="1" inputmode="numeric"></label>` : ''}
    ${t === 'livre' ? `<label class="field"><span>Pages par tome</span><input class="input" name="pages" type="number" min="1" inputmode="numeric" placeholder="Ex. 350"></label>` : ''}
    ${t === 'film' || t === 'doc' ? `<label class="field"><span>Durée en minutes (facultatif)</span><input class="input" name="runtime" type="number" min="1" inputmode="numeric"></label>` : ''}
    ${statusPicker()}
    <button class="btn prim block" type="submit">Ajouter</button>
    <button class="btn block" type="button" data-a="add-search">Revenir à la recherche</button></form>`;
}
function matchForm() {
  const local = isoDay(new Date()) + 'T' + pad2(new Date().getHours()) + ':00';
  return `<div class="banner info">${svgIcon('sync', 18)}<span class="grow">Les matchs des Sixers et du Milan arrivent tout seuls.</span><button class="link" data-a="sport-sync">Actualiser</button></div>
  <form class="col" style="gap:14px" data-form="match-add">
    <label class="field"><span>Sport</span><select class="input" name="sport"><option value="nba">Basket</option><option value="foot">Football</option><option value="autre">Autre</option></select></label>
    <label class="field"><span>Compétition</span><input class="input" name="league" placeholder="Ex. NBA, Serie A, Ligue des champions"></label>
    <div class="grid2"><label class="field"><span>Domicile</span><input class="input" name="home" required></label><label class="field"><span>Extérieur</span><input class="input" name="away" required></label></div>
    <label class="field"><span>Date et heure</span><input class="input" name="date" type="datetime-local" value="${local}" required></label>
    <div class="grid2"><label class="field"><span>Score dom. (facult.)</span><input class="input" name="hs" type="number" min="0" inputmode="numeric"></label><label class="field"><span>Score ext.</span><input class="input" name="as" type="number" min="0" inputmode="numeric"></label></div>
    <label class="field"><span>Vu en</span><select class="input" name="mode"><option value="direct">Direct</option><option value="differe" selected>Différé</option><option value="resume">Résumé</option><option value="">Pas encore vu</option></select></label>
    <button class="btn prim block" type="submit">Ajouter le match</button></form>`;
}
function posterField(cur, f, label) {
  f = f || 'poster'; const wide = f === 'backdrop';
  return `<div class="field"><span>${label || (wide ? 'Bannière' : 'Affiche') + ' (facultatif)'}</span>
    <div class="row" style="gap:12px;align-items:center"><div class="poster ${wide ? 'wide' : 'sm'}" data-preview="${f}" style="background:${grad(wide ? 'banniere' : 'affiche')}">${cur ? `<img src="${esc(cur)}" alt="">` : `<span class="ph">${svgIcon('upload', 18)}</span>`}</div>
      <div class="col grow" style="gap:8px"><label class="btn">${svgIcon('upload', 18)}Choisir une image<input type="file" accept="image/*" data-change="poster-file" data-field="${f}" class="sr"></label>
      <input class="input" name="${f}Url" value="${cur && !cur.startsWith('data:') && ui.route === 'ajouter' ? esc(cur) : ''}" placeholder="ou colle un lien d’image" autocomplete="off" inputmode="url"></div></div>
    <input type="hidden" name="${f}Data" value="${cur && cur.startsWith('data:') ? esc(cur) : ''}"></div>`;
}
function catchForm() {
  const a = ui.add; const cf = a.cf || (a.cf = {});
  if (!a.fed || !state.feds.some((f) => f.name === a.fed)) a.fed = state.feds[0] ? state.feds[0].name : 'AEW';
  const major = fedKind(a.fed) === 'major';
  const kind = major ? (a.ckind === 'ppv' ? 'ppv' : 'hebdo') : 'show';
  const plan = !!a.cplan;
  const today = isoDay(new Date());
  return `<form class="col" style="gap:14px" data-form="catch-add">
    <div class="seg"><button type="button" class="${plan ? '' : 'on'}" data-a="catch-plan" data-v="0">Déjà vu</button><button type="button" class="${plan ? 'on' : ''}" data-a="catch-plan" data-v="1">À venir</button></div>
    <div class="field"><span>Fédération</span><div class="chips">${state.feds.map((f) => `<button type="button" class="chip ${a.fed === f.name ? 'on' : ''}" data-a="catch-fed" data-v="${esc(f.name)}">${esc(f.name)}</button>`).join('')}<button type="button" class="chip" data-a="feds-open">+ Fédération</button></div></div>
    ${!plan && CATCH_LEAGUES[a.fed] ? feedPicker(a.fed) : ''}
    <div class="field"><span>Type</span>${major
      ? `<div class="seg"><button type="button" class="${kind === 'hebdo' ? 'on' : ''}" data-a="catch-kind" data-v="hebdo">Hebdo (+${XP.catchHebdo} XP)</button><button type="button" class="${kind === 'ppv' ? 'on' : ''}" data-a="catch-kind" data-v="ppv">PPV (+${XP.catchPPV} XP)</button></div>`
      : `<div class="pill" style="align-self:flex-start">Show (+${XP.catchShow} XP)</div>`}</div>
    <label class="field"><span>Nom</span><input class="input" name="show" data-keep="show" value="${esc(cf.show || '')}" placeholder="${major ? 'Ex. Collision, Full Gear…' : 'Ex. Anarchie, Doomsday…'}" ${plan ? 'required' : ''} autocomplete="off"></label>
    <div class="grid2"><label class="field"><span>Date</span><input class="input" name="date" data-keep="date" type="date" value="${esc(cf.date || today)}" required></label>
      <label class="field"><span>Heure</span><input class="input" name="time" data-keep="time" type="time" value="${esc(cf.time || (major ? '02:00' : '19:00'))}"></label></div>
    ${plan ? '' : `<label class="field"><span>Vu en</span><select class="input" name="mode" data-keep="mode">${Object.keys(MODES).map((k) => `<option value="${k}" ${(cf.mode || 'differe') === k ? 'selected' : ''}>${MODES[k]}${k === 'resume' ? ` (+${XP.catchResume} XP)` : ''}</option>`).join('')}</select></label>`}
    ${posterField(a.cposter)}
    <button class="btn prim block" type="submit">${plan ? 'Programmer le show' : 'Ajouter au journal'}</button>
    <span class="small muted">${plan ? 'Le jour J, le show apparaît dans En cours. Une fois passé, Rewind te demande si tu l’as vu.' : 'Pour AEW Dynamite, utilise plutôt sa fiche dans Biblio › Catch : chaque épisode s’y coche comme une série.'}</span></form>`;
}
function catchTmdbBlock() {
  const a = ui.add; const t = a.ctm || {};
  let h = `<form class="search" data-form="catch-tmdb"><label class="grow"><span class="sr">Rechercher sur TMDB</span>${svgIcon('search', 18)}<input class="input" name="q" value="${esc(t.q || '')}" placeholder="Rechercher sur TMDB (PPV, Raw, Dynamite…)" autocomplete="off" enterkeyhint="search"></label><button class="icon-btn sq" type="submit" aria-label="Rechercher">${svgIcon('search', 20)}</button></form>`;
  if (t.loading) h += `<div class="empty" style="padding:14px">Recherche…</div>`;
  if (t.error) h += `<div class="banner warn">${esc(t.error)}</div>`;
  if (t.tv) {
    const tv = t.tv;
    h += `<div class="card pad col" style="gap:12px"><div class="row between"><span class="ti">${esc(cleanShowName(tv.name))}</span><button class="icon-btn" data-a="ctm-clear" aria-label="Fermer">${svgIcon('x', 16)}</button></div>
      <div class="chips" style="margin:0;padding:0">${tv.seasons.map((x) => `<button class="chip ${t.season === x.n ? 'on' : ''}" data-a="ctm-season" data-v="${x.n}">${esc(x.label)}</button>`).join('')}</div>
      ${t.eps ? (t.eps.length ? `<div class="list" style="max-height:340px;overflow-y:auto">${t.eps.map((e, i) => `<button class="lrow ctm-ep" data-a="ctm-ep" data-i="${i}">${e.still ? `<span class="poster th"><img src="${esc(e.still)}" alt="" loading="lazy"></span>` : fedVignette(cleanShowName(tv.name))}<div class="tx"><b>${esc(fmtLong(e.air))}</b><span>Ép. ${e.n}${e.name && !/^(É|E)pisode \d+$/i.test(e.name) ? ' · ' + esc(e.name) : ''}</span></div></button>`).join('')}</div>` : `<div class="empty" style="padding:14px">Aucun épisode diffusé dans cette saison.</div>`) : `<div class="empty" style="padding:14px">Chargement des épisodes…</div>`}</div>`;
  } else if (t.results) {
    h += t.results.length ? `<div class="col" style="gap:8px">${t.results.map((r, i) => `<button class="result" data-a="ctm-pick" data-i="${i}">${posterHtml(r.title, r.poster, 'sm')}<div class="col grow" style="gap:3px"><span class="ti">${esc(r.title)}</span><span class="small muted">${r.mt === 'tv' ? 'Hebdo · choisir un épisode' : 'Événement'}${r.date ? ' · ' + esc(r.mt === 'tv' ? r.date.slice(0, 4) : fmtLong(r.date)) : ''}</span></div></button>`).join('')}
      <button class="link" data-a="ctm-clear" style="align-self:center">Fermer la recherche</button></div>` : `<div class="empty" style="padding:14px">Aucun résultat sur TMDB. Tu peux remplir le formulaire à la main.</div>`;
  }
  if (a.ctmdb && !t.results && !t.tv) h += `<div class="banner info">${svgIcon('check', 18)}<span class="grow">Rempli depuis TMDB${a.cair ? ' · diffusé le ' + esc(fmtLong(a.cair)) : ''}.</span><button class="link" data-a="ctm-reset">Retirer</button></div>`;
  return h;
}
function feedPicker(fed) {
  const feed = (state.catchFeed[fed] || []).filter((x) => x.ts < now() + 3 * 3600000 && x.ts > now() - 30 * DAY);
  const seen = new Set(state.catchLog.map((c) => c.tsdbId).filter(Boolean));
  const loading = now() - (state.catchSync[fed] || 0) < 8000 && !feed.length;
  let h = `<div class="field"><div class="row between"><span>Shows récents ${esc(fed)}</span><button type="button" class="link" data-a="catch-feed-sync" data-v="${esc(fed)}">${svgIcon('sync', 14)} Actualiser</button></div>`;
  if (!feed.length) h += `<div class="empty" style="padding:14px">${loading ? 'Recherche des derniers shows…' : 'Aucun show récupéré pour l’instant. Touche « Actualiser », ou remplis à la main ci-dessous.'}</div>`;
  else h += `<div class="feed">${feed.slice(0, 14).map((x) => `<button type="button" class="feed-it ${ui.add.cpick === x.id ? 'on' : ''}" data-a="catch-pick" data-id="${x.id}" ${seen.has(x.id) ? 'disabled' : ''}>
      ${x.poster ? `<img src="${esc(x.poster)}" alt="" loading="lazy">` : ''}<span class="label ${x.kind === 'ppv' ? 'amber' : 'accent'}">${esc(CKINDS[x.kind])}${seen.has(x.id) ? ' · déjà vu' : ''}</span><b>${esc(x.name)}</b><span class="small muted">${esc(fmtDay(x.ts))}</span></button>`).join('')}</div>`;
  return h + `</div>`;
}
function fedsModal() {
  openModal('Fédérations', `<div class="col" style="gap:10px">${state.feds.map((f, i) => `<div class="card-row" style="padding:8px 10px"><b class="grow">${esc(f.name)}</b>
      <div class="seg" style="width:auto"><button class="${f.kind === 'major' ? 'on' : ''}" data-a="fed-kind" data-i="${i}" data-v="major">Major</button><button class="${f.kind === 'inde' ? 'on' : ''}" data-a="fed-kind" data-i="${i}" data-v="inde">Indé</button></div>
      <button class="icon-btn" data-a="fed-del" data-i="${i}" aria-label="Retirer ${esc(f.name)}">${svgIcon('trash', 16)}</button></div>`).join('')}
    <span class="small muted">Major : Hebdo et PPV. Indé : Show.</span>
    <form class="row" style="gap:8px" data-form="fed-add"><input class="input grow" name="name" placeholder="Ex. GCW" required autocomplete="off"><select class="input" name="kind" style="width:auto"><option value="inde">Indé</option><option value="major">Major</option></select><button class="btn prim" type="submit">Ajouter</button></form>
    <button class="btn block" data-a="modal-close">Fermer</button></div>`);
}
function showModal(s) {
  const past = s.ts < now();
  openModal(s.name, `<div class="col" style="gap:12px">${s.poster ? `<img src="${esc(s.poster)}" alt="Affiche de ${esc(s.name)}" class="show-poster">` : ''}
    <span class="label accent">${esc(s.fed)} · ${esc(CKINDS[s.kind] || 'Show')} · ${esc(fmtMatch(s.ts))}</span>
    ${past && !s.seen ? `<span class="small muted">Tu l’as regardé ? Choisis comment :</span><div class="seg">${Object.keys(MODES).map((k) => `<button data-a="show-seen" data-id="${s.id}" data-mode="${k}">${modeCap(k)}</button>`).join('')}</div>` : ''}
    <div class="grid2"><button class="btn danger" data-a="show-del" data-id="${s.id}">${svgIcon('trash', 16)}Supprimer</button><button class="btn" data-a="modal-close">Fermer</button></div></div>`);
}

/* ---------- Fiche œuvre ---------- */
function viewItem(id) {
  const it = state.items[id];
  if (!it) return page(`<div class="empty">Cette œuvre n’existe plus.<br><a href="#biblio">Retour à la bibliothèque</a></div>`, '');
  const sh = shape(it); const pass = curPass(it); const nx = nextUnit(it);
  const bg = it.backdrop || it.poster;
  if (needsTmdbLink(it) && !it.tmdbTried) setTimeout(() => autoLinkTmdb(it), 0);
  const total = sh === 'episodes' ? it.seasons.reduce((a, x) => a + x.count, 0) : 0;
  const meta = [it.year, it.subtitle && (it.type === 'livre' || it.type === 'bd' || it.type === 'jeu') ? it.subtitle : '',
    sh === 'episodes' && it.type !== 'catch' ? plural(it.seasons.length, 'saison') + ' · ' + plural(total, 'épisode') : '',
    (sh === 'tomes' || sh === 'livre') && it.volumes.length > 1 ? plural(it.volumes.length, 'tome') : '',
    (sh === 'film') && it.runtime ? fmtRt(it.runtime) : ''].filter(Boolean).join(' · ');
  let h = `<section class="fhero" aria-label="${esc(it.title)}"><div class="bg" style="background:${grad(it.title)}">${bg ? `<img src="${esc(bg)}" alt="" fetchpriority="high">` : ''}</div>
    <div class="top"><button class="icon-btn glassy" data-a="back" aria-label="Retour">${svgIcon('back', 20)}</button><button class="icon-btn glassy" data-a="item-menu" data-id="${it.id}" aria-label="Options : statut, rattrapage, modifier">${svgIcon('dots', 22)}</button></div>
    <div class="info">${catBadge(it.type)}<h1 class="ftitle">${esc(it.title)}</h1>${meta ? `<span class="fmeta">${esc(meta)}</span>` : ''}</div></section>`;
  let b = '';
  if (it.catchup) b += `<div class="banner warn">${svgIcon('clock', 18)}<span class="grow">Mode rattrapage : tes coches ne donnent pas d’XP.</span><button class="link" data-a="catchup-set" data-id="${it.id}" data-v="0">Désactiver</button></div>`;
  if (pass.n > 1) b += `<div class="banner info">${svgIcon('redo', 18)}<span class="grow">Passage ${pass.n} (revisionnage) : moitié des XP.</span></div>`;
  // progression + action principale
  // progression : « Prochain : S1 · Ép. 3 » à gauche, « 2 / 10 vus » à droite ; l'XP n'apparaît qu'après validation
  const ptext = progressText(it); const ctext = countText(it);
  const lead = ptext.startsWith('Prochain : ') ? `Prochain : <b>${esc(ptext.slice(11))}</b>` : esc(ptext);
  const hint = it.catchup ? `<span class="xp">Rattrapage · sans XP</span>` : ctext ? `<span class="cnt">${esc(ctext)}</span>` : '';
  const showBar = (sh === 'episodes' && it.type !== 'catch') || sh === 'tomes' || sh === 'livre';
  const prog = `<div class="prog"><div class="line"><span>${lead}</span>${hint}</div>${showBar ? bar(curPct(it)) : ''}${it.catchup && ctext ? `<span class="small muted">${esc(ctext)}</span>` : ''}</div>`;
  let main = '';
  if (it.status === 'envie') { const v = envieVerb(it); main = `<button class="btn prim block big" data-a="${v.a}" data-id="${it.id}">${v.a === 'envie-seen' ? v.icon : ''}${esc(v.label)}${v.a === 'envie-seen' ? '' : v.icon}</button>`; }
  else if (nextOrRewatch(it) || (ui.justDone && ui.justDone.id === it.id)) main = mainBtn(it, nextOrRewatch(it), 'block big');
  const cine = sh === 'film' && it.status !== 'envie' && main ? `<label class="toggle"><input type="checkbox" data-change="cine" data-id="${it.id}" ${ui.cine && ui.cine[it.id] ? 'checked' : ''}><span class="sw"></span><span class="grow"><b style="font-size:14px">Vu au cinéma</b><br><span class="small muted">+${CINE_XP} XP, même pour un film ancien ou revu</span></span>${svgIcon('ticket', 20)}</label>` : '';
  b += `<section class="col" style="gap:14px">${prog}${cine}${main}
    <button class="btn block act-row" data-a="item-history" data-id="${it.id}">${svgIcon('clock', 19)}Mon activité sur ${esc((TYPE_OF[it.type] || TYPE_OF.serie)[0])}</button></section>`;
  b += itemTrophies(it);
  if (it.overview) {
    // résumé replié sur 3 lignes : celui qui veut juste cocher un épisode y arrive plus vite
    const long = it.overview.length > 170; const open = ui.ovOpen && ui.ovOpen[it.id];
    b += `<div class="col" style="gap:2px"><p class="overview${long && !open ? ' clamp' : ''}">${esc(it.overview)}</p>${long ? `<button class="link" data-a="ov-toggle" data-id="${it.id}" style="align-self:flex-start">${open ? 'Réduire' : 'Lire la suite'}</button>` : ''}</div>`;
  }
  if (sh === 'episodes') b += episodesBlock(it);
  else if (sh === 'tomes') b += tomesBlock(it);
  else if (sh === 'livre') b += livreBlock(it);
  else if (sh === 'jeu') b += jeuBlock(it);
  else b += filmBlock(it);
  return page(h + `<div class="fbody">${b}</div>`, '', null, 'no-pad-top');
}
function episodesBlock(it) {
  const pass = curPass(it); const nx = nextUnit(it);
  let sn = ui.season[it.id];
  if (!it.seasons.find((s) => s.n === sn)) sn = nx ? nx.s : it.seasons.length ? it.seasons[it.seasons.length - 1].n : 1;
  ui.season[it.id] = sn;
  const s = it.seasons.find((x) => x.n === sn);
  const multi = it.seasons.length > 1;
  const sname = (x) => x.name && !/^Saison \d+$/.test(x.name) && x.name !== 'Épisodes' ? x.name : 'Saison ' + x.n;
  let h = '';
  if (needsTmdbLink(it) && it.tmdbTried && (state.settings.tmdbKey || '').trim()) {
    h += `<div class="banner info">${svgIcon('tv', 18)}<span class="grow">Titres et miniatures des épisodes disponibles via TMDB.</span><button class="link" data-a="tmdb-link" data-id="${it.id}">Choisir</button></div>`;
  }
  h += `<section class="section"><div class="sec-head"><h2 class="h2">${it.type === 'catch' ? 'Shows' : 'Épisodes'}</h2>${multi ? `<div class="dropdown ${ui.ddOpen ? 'open' : ''}"><button class="pill-btn" data-a="dd" aria-haspopup="listbox" aria-expanded="${ui.ddOpen}">${esc(sname(s))}${svgIcon('chevD', 16)}</button>
      ${ui.ddOpen ? `<div class="dd-list" role="listbox" aria-label="Choisir une saison">${it.seasons.map((x) => `<button role="option" aria-selected="${x.n === sn}" class="${x.n === sn ? 'on' : ''}" data-a="pick-season" data-id="${it.id}" data-v="${x.n}"><span class="grow">${esc(sname(x))}</span>${seasonDone(it, x) ? `<span style="color:var(--amber)">${svgIcon('star', 14, true)}</span>` : ''}<span class="label">${epCountDone(it, x)} / ${x.count}</span></button>`).join('')}</div>` : ''}</div>` : ''}</div>`;
  if (multi && it.type !== 'catch') {
    const done = seasonDone(it, s);
    h += `<div class="badge-strip ${done ? 'won' : 'locked'}"><span class="medal ${done ? '' : 'locked'}">${svgIcon(done ? 'star' : 'lock', 16, done)}</span><div class="col grow" style="gap:1px"><span class="label ${done ? 'amber' : ''}">${done ? 'Badge débloqué' : 'Badge à débloquer'}</span><b style="font-size:14px">${done ? 'Saison ' + s.n + ' terminée' : 'Encore ' + (s.count - epCountDone(it, s)) + ' ép. pour la saison ' + s.n}</b></div>
      <button class="link" data-a="season-all" data-id="${it.id}" data-v="${s.n}">${done ? 'Tout décocher' : 'Tout cocher'}</button></div>`;
  } else if (s && s.count) {
    h += `<div class="row between" style="padding:0 4px"><span class="small muted">Appui long : cocher jusqu’ici</span><button class="link" data-a="season-all" data-id="${it.id}" data-v="${s.n}">${seasonDone(it, s) ? 'Tout décocher' : 'Tout cocher'}</button></div>`;
  }
  if (s && s.count) {
    h += `<div class="list eplist">`;
    for (let e = 1; e <= s.count; e++) {
      const k = 's' + s.n + 'e' + e; const on = !!pass.done[k]; const ep = s.eps && s.eps[e - 1];
      const isNext = nx && nx.key === k;
      const title = ep && ep.t ? ep.t : (it.type === 'catch' && ep && ep.date ? 'Épisode du ' + fmtDay(ep.date) : 'Épisode ' + e);
      const rt = (ep && ep.rt) || it.runtime;
      h += `<button class="ep${on ? ' done' : ' spoil'}${isNext ? ' next' : ''}" data-a="ep" data-lp="ep-upto" data-id="${it.id}" data-k="${k}" aria-pressed="${on}">
        <span class="thumb" aria-hidden="true"><span class="grad" style="background:${grad(it.title + e)}"></span>${ep && ep.still ? `<img src="${esc(ep.still)}" alt="" loading="lazy">` : ''}${on ? '' : `<span class="eye">${svgIcon('eyeOff', 16)}</span>`}</span>
        <span class="tx">${isNext ? '<span class="nx">À voir ensuite</span>' : ''}<b>${e}. ${esc(title)}</b>${rt ? `<span>${esc(fmtRt(rt))}</span>` : ''}</span>
        <span class="check ${on ? 'on' : ''}">${on ? svgIcon('check', 18) : ''}</span></button>`;
    }
    h += `</div>`;
  }
  if (!it.ended || it.type === 'catch' || (s && !s.count)) {
    h += `<button class="btn block" data-a="add-ep" data-id="${it.id}" data-v="${s ? s.n : 1}">${svgIcon('plus', 18)}${it.type === 'catch' ? 'Ajouter l’épisode de cette semaine' : 'Ajouter un épisode'}</button>`;
  }
  if (it.src && it.src.api === 'tmdb' && s && !s.eps && seasonLoading[it.id + ':' + s.n] !== 'fail') setTimeout(() => loadSeason(it, s.n), 0);
  return h + `</section>`;
}
function epCountDone(it, s) { const pass = curPass(it); let n = 0; for (let e = 1; e <= s.count; e++) if (pass.done['s' + s.n + 'e' + e]) n++; return n; }
function sagaStrip(it) {
  if (it.volumes.length < 2 || !it.ended) return '';
  const p = progress(it); const done = p.done >= p.total;
  return `<div class="badge-strip ${done ? 'won' : 'locked'}"><span class="medal ${done ? '' : 'locked'}">${svgIcon(done ? 'star' : 'lock', 16, done)}</span><div class="col grow" style="gap:1px"><span class="label ${done ? 'amber' : ''}">${done ? 'Badge débloqué' : 'Badge à débloquer'}</span><b style="font-size:14px">${done ? 'Saga terminée' : 'Encore ' + Math.ceil(p.total - p.done) + ' tome' + (p.total - p.done > 1 ? 's' : '') + ' pour finir la saga'}</b></div></div>`;
}
function tomesBlock(it) {
  const pass = curPass(it);
  let h = `<section class="section"><div class="sec-head"><h2 class="h2">Tomes</h2><button class="link" data-a="vol-all" data-id="${it.id}">${progress(it).done >= it.volumes.length ? 'Tout décocher' : 'Tout cocher'}</button></div>${sagaStrip(it)}<span class="small muted" style="padding:0 4px">Appui long : cocher jusqu’ici</span><div class="tomes">`;
  it.volumes.forEach((v) => { const on = !!pass.done['t' + v.n]; h += `<button class="tome ${on ? 'on' : ''}" data-a="vol" data-lp="vol-upto" data-id="${it.id}" data-k="t${v.n}" aria-pressed="${on}" aria-label="Tome ${v.n}">${v.n}<small>${on ? 'LU' : 'TOME'}</small></button>`; });
  return h + `</div><button class="btn block" data-a="add-vol" data-id="${it.id}">${svgIcon('plus', 18)}Ajouter un tome</button></section>`;
}
function livreBlock(it) {
  const pass = curPass(it);
  let h = `<section class="section"><div class="sec-head"><h2 class="h2">${it.volumes.length > 1 ? 'Tomes' : 'Lecture'}</h2></div>${sagaStrip(it)}<div class="list">`;
  it.volumes.forEach((v) => {
    const fin = !!pass.done['t' + v.n]; const mid = !!pass.done['t' + v.n + 'm'];
    const total = bookXp(v.pages);
    h += `<div class="lrow book-row"><span class="tome ${fin ? 'on' : mid ? 'half' : ''}" aria-hidden="true">${v.n}<small>${fin ? 'LU' : mid ? '½' : 'TOME'}</small></span>
      <div class="tx"><b>${it.volumes.length > 1 ? 'Tome ' + v.n : 'Le livre'}</b><span>${v.pages ? v.pages + ' pages · ' : ''}${total + XP.livreFin} XP${pass.n > 1 ? ' (÷2)' : ''}</span></div>
      <button class="btn small ${mid ? 'on' : ''}" data-a="book" data-id="${it.id}" data-k="t${v.n}m" aria-pressed="${mid}" ${fin && !mid ? 'disabled' : ''}>Moitié</button>
      <button class="btn small ${fin ? 'on' : ''}" data-a="book" data-id="${it.id}" data-k="t${v.n}" aria-pressed="${fin}">Fini</button></div>`;
  });
  h += `</div><span class="small muted" style="padding:0 4px">« Moitié » te donne 40 % des XP tout de suite, le reste et +${XP.livreFin} XP à la fin.</span>`;
  if (it.volumes.length > 1 || it.type === 'livre') h += `<button class="btn block" data-a="add-vol" data-id="${it.id}">${svgIcon('plus', 18)}Ajouter un tome</button>`;
  return h + `</section>`;
}
function formatField(it) {
  const auto = fmtOfRuntime(it.runtime);
  return `<label class="field"><span>Format des épisodes (XP)</span><select class="input" name="format"><option value="">Automatique · ${auto ? esc(FORMATS[auto].label) + ' · ' + FORMATS[auto].xp + ' XP' : 'durée inconnue · 10 XP'}</option>${Object.entries(FORMATS).map(([k, f]) => `<option value="${k}" ${it.format === k ? 'selected' : ''}>${esc(f.label)} · ${f.xp} XP</option>`).join('')}</select></label>`;
}
const filmEvent = (it, n) => state.events.find((e) => e.item === it.id && e.pass === n && e.kind === 'film');
function cineBtn(it, n) {
  const ev = filmEvent(it, n); if (!ev || ev.legacy) return '';
  return `<button class="cine-btn${ev.cine ? ' on' : ''}" data-a="film-cine" data-id="${it.id}" data-v="${n}" aria-pressed="${!!ev.cine}" aria-label="Vu au cinéma">${svgIcon('ticket', 18)}<span>${ev.cine ? 'Cinéma' : 'Ciné ?'}</span></button>`;
}
// bonus cinéma : +20 XP, 4 séances par jour au plus avec bonus ; jamais pour le rattrapage ou le surplus du plafond
function setCine(ev, on) {
  if (!ev || !!ev.cine === !!on) return;
  if (on) {
    ev.cine = true; ev.cineXp = 0;
    const day = dayOf(ev.ts); const n = state.events.filter((e) => e !== ev && e.cine && e.cineXp && dayOf(e.ts) === day).length;
    if (!ev.legacy && !ev.capped && n < CINE_MAX_DAY) { ev.cineXp = CINE_XP; ev.xp += CINE_XP; }
  } else { ev.xp -= ev.cineXp || 0; delete ev.cine; delete ev.cineXp; }
}
// « Cette série t'a valu » : bandeau de fin et badges obtenus grâce à cette œuvre
function itemTrophies(it) {
  const fin = state.events.find((e) => e.item === it.id && e.kind === 'bonus_serie' && e.pass === curPass(it).n);
  const won = wonList().filter((w) => w.item === it.id);
  let h = '';
  if (fin) h += `<div class="fin-strip">${svgIcon('trophy', 22)}<b class="grow">Série terminée le ${esc(fmtDate(fin.ts))}</b>${fin.xp ? `<span class="gold-t">+${fin.xp} XP</span>` : ''}</div>`;
  if (won.length) h += `<section class="section">${secHead('Cette ' + (it.type === 'film' ? 'œuvre' : 'série') + ' t’a valu')}<div class="recent">${won.slice(0, 6).map((w) => `<button class="shelf-it" data-a="${w.secret ? 'secret-open' : 'badge-open'}" data-v="${w.secret || w.fam}">${medalHtml(wonIcon(w), wonTier(w), 56)}<span>${esc(wonName(w))}</span><small>${esc(fmtDay(w.ts))}</small></button>`).join('')}</div></section>`;
  return h;
}
function filmBlock(it) {
  const views = it.passes.filter((p) => p.done.v);
  if (!views.length) return '';
  return `<section class="section">${secHead('Visionnages')}<div class="list">${views.map((p, i) => `<div class="lrow"><div class="tx"><b>${i === 0 ? 'Premier visionnage' : 'Revisionnage ' + i}</b><span>${it.catchup && i === 0 ? 'Avant Rewind' : esc(fmtDate(p.done.v))}</span></div>
      ${cineBtn(it, p.n)}
      <button class="icon-btn" data-a="film-unsee" data-id="${it.id}" data-v="${p.n}" aria-label="Retirer ce visionnage">${svgIcon('x', 18)}</button></div>`).join('')}</div></section>`;
}
function jeuBlock(it) {
  const done = !!curPass(it).done.fin;
  return done
    ? `<div class="badge-strip won"><span class="medal">${svgIcon('game', 16)}</span><b class="grow">Terminé le ${esc(fmtDate(curPass(it).done.fin))}</b><button class="link" data-a="jeu-undo" data-id="${it.id}">Annuler</button></div>`
    : '';
}

/* ---------- Fiche match ---------- */
function viewMatch(id) {
  const m = state.matches[id];
  if (!m) return page(`<div class="empty">Match introuvable.<br><a href="#biblio">Retour</a></div>`, '');
  const side = favTeamSide(m); const t = TEAMS[m.team];
  const show = m.seen || ui.reveal[id];
  const hasScore = m.hs != null && m.as != null;
  const fut = m.ts > now();
  const mode = ui.matchMode[id] || 'differe';
  const homeColor = side === 'home' && t ? t.c1 : `hsl(${hashHue(m.home)},45%,32%)`;
  const awayColor = side === 'away' && t ? t.c1 : `hsl(${hashHue(m.away)},45%,32%)`;
  let res = '';
  if (hasScore && side && show) { const mine = side === 'home' ? m.hs : m.as; const other = side === 'home' ? m.as : m.hs; res = mine > other ? 'Victoire' : mine < other ? 'Défaite' : 'Nul'; }
  let h = `<section class="match-hero${m.cover ? ' has-cover' : ''}" style="background:linear-gradient(115deg,${homeColor}99 0%,rgba(10,13,17,.2) 50%,${awayColor}99 100%)">
    ${m.cover ? `<img class="mcover" src="${esc(m.cover)}" alt="">` : ''}
    <button class="icon-btn glassy back" data-a="back" aria-label="Retour">${svgIcon('back', 20)}</button>
    <span class="comp label">${esc(m.league || (m.sport === 'nba' ? 'Basket' : 'Football'))}</span>
    <div class="teams"><div class="team">${teamDisc(m.home, side === 'home' ? m.team : null, '', m.homeId)}<span class="nm">${esc(m.home)}</span><span class="small muted">Domicile</span></div>
      <div class="score">${hasScore ? (show ? `<span class="num">${m.hs} – ${m.as}</span>${res ? `<span class="label accent">${res}</span>` : ''}` : `<div class="masked"><span class="num" aria-hidden="true">${m.hs} – ${m.as}</span><span class="pill">${svgIcon('eyeOff', 14)}Score masqué</span></div>`) : `<span class="num" style="font-size:34px">${fut ? 'À venir' : '– : –'}</span>`}
        <span class="small soft">${esc(fmtMatch(m.ts))}</span></div>
      <div class="team">${teamDisc(m.away, side === 'away' ? m.team : null, '', m.awayId)}<span class="nm">${esc(m.away)}</span><span class="small muted">Extérieur</span></div></div></section>`;
  if (m.seen) {
    h += `<section class="card pad col" style="gap:12px"><h2 class="h3">Match regardé</h2><div class="badge-strip won"><span class="medal">${svgIcon('star', 15, true)}</span><b class="grow">Regardé ${esc(MODE_PHRASE[m.seen.mode] || '')} · +${m.seen.mode === 'resume' ? XP.matchResume : XP.match} XP</b><button class="link" data-a="match-unsee" data-id="${id}">Annuler</button></div></section>`;
  } else if (!fut) {
    h += `<section class="card pad col" style="gap:12px"><h2 class="h3">Tu as regardé ce match ?</h2>
      <div class="seg" role="radiogroup" aria-label="Façon de regarder">${Object.keys(MODES).map((k) => `<button role="radio" aria-checked="${mode === k}" class="${mode === k ? 'on' : ''} tall" data-a="match-mode" data-id="${id}" data-v="${k}">${modeCap(k)}<span class="label amber">+${k === 'resume' ? XP.matchResume : XP.match} XP</span></button>`).join('')}</div>
      <button class="btn prim block" data-a="match-seen" data-id="${id}" data-mode="${mode}">${RING}J’ai regardé ce match</button>
      <div class="row between">${hasScore && !show ? `<button class="link" data-a="reveal" data-id="${id}">${svgIcon('eye', 16)}Voir le score</button>` : '<span></span>'}${m.dismissed ? '<span class="label">Marqué « pas vu »</span>' : `<button class="link" data-a="match-dismiss" data-id="${id}">Je ne l’ai pas vu</button>`}</div></section>`;
  }
  if (!fut) {
    h += `<section class="card pad col" style="gap:12px" aria-label="Couverture"><div class="row between"><h2 class="h2">Couverture</h2>${m.cover ? `<button class="link" data-a="match-cover" data-id="${id}">Changer</button>` : ''}</div>
      ${m.cover ? `<img src="${esc(m.cover)}" alt="Couverture du match" class="cover-prev">` : `<span class="small muted">Ajoute une photo du match : elle s’affichera en haut de cette page et dans ton historique.</span><button class="btn block" data-a="match-cover" data-id="${id}">${svgIcon('upload', 18)}Ajouter une couverture</button>`}</section>`;
  }
  if (t) {
    const season = seasonOf(m.ts);
    const list = Object.values(state.matches).filter((x) => x.team === m.team && seasonOf(x.ts) === season && x.ts < now()).sort((a, b) => b.ts - a.ts);
    const seenN = list.filter((x) => x.seen).length;
    h += `<section class="card pad col" style="gap:10px"><div class="row between"><h2 class="h2">${esc(t.short)} ${season}</h2><span class="label">${plural(seenN, 'match regardé', 'matchs regardés')}</span></div>
      ${list.slice(0, 6).map((x) => { const sd = favTeamSide(x); const opp = sd === 'home' ? 'vs ' + x.away : '@ ' + x.home; return `<a class="mrow-line" href="#match-${x.id}"><span class="small muted" style="width:56px">${esc(fmtDay(x.ts))}</span><span class="grow ellipsis">${esc(opp)}</span><span class="pill ${x.seen ? 'ac' : ''}">${x.seen ? esc(modeCap(x.seen.mode)) : 'Non vu'}</span></a>`; }).join('')}</section>`;
  }
  if (!m.ext) h += `<button class="btn danger block" data-a="match-del" data-id="${id}">${svgIcon('trash', 18)}Supprimer ce match</button>`;
  return page(h, '', null, 'no-pad-top');
}

/* =========================================================
   10. Modales
   ========================================================= */
function modalHtml() {
  if (!ui.modal) return '';
  return `<div class="modal-bg${ui.modal.sheet ? ' bottom' : ''}" data-a="modal-bg"><div class="modal${ui.modal.sheet ? ' sheet' : ''}" role="dialog" aria-modal="true" aria-label="${esc(ui.modal.title || '')}">${ui.modal.title ? `<h2 class="h3">${esc(ui.modal.title)}</h2>` : ''}${ui.modal.html}</div></div>`;
}
// ligne de feuille (menu ⋯) : pictogramme, libellé, explication facultative
function sheetRow(icon, label, sub, attrs, extra, cls) {
  return `<button class="sheet-row ${cls || ''}" ${attrs}>${svgIcon(icon, 22)}<span class="grow col" style="gap:2px"><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${extra || ''}</button>`;
}
function openModal(title, html, extra) { ui.modal = Object.assign({ title, html }, extra || {}); render(); }
function closeModal() { ui.modal = null; render(); }
function confirmBox(title, text, yesLabel, onYes, danger) {
  openModal(title, `<p class="modal-text">${text}</p><div class="grid2"><button class="btn" data-a="modal-close">Annuler</button><button class="btn ${danger ? 'danger' : 'prim'}" data-a="modal-yes">${esc(yesLabel)}</button></div>`, { onYes });
}

/* =========================================================
   11. Actions
   ========================================================= */
// opts.quiet : pas de petit « +XP » (le message « Annuler » l'affiche déjà) ; renvoie l'XP gagnée
function withXp(fn, opts) {
  const before = totalXp(); fn(); memoClear(); const gained = totalXp() - before;
  checkUnlocks(); save(); render();
  if (gained > 0 && !(opts && opts.quiet)) toast(`<span class="xp-pop">+${gained} XP</span>`, '', 1600);
  return gained;
}
/* Annuler : on garde une copie de l'œuvre et de ses événements juste avant l'action */
function snapItem(id) {
  return { id, item: state.items[id] ? JSON.parse(JSON.stringify(state.items[id])) : null, events: state.events.filter((e) => e.item === id).map((e) => Object.assign({}, e)), lastLevel: state.lastLevel };
}
function restoreItem(s) {
  if (s.item) state.items[s.id] = s.item; else delete state.items[s.id];
  state.events = state.events.filter((e) => e.item !== s.id).concat(s.events);
  state.lastLevel = s.lastLevel;
  ui.justDone = null; memoClear(); checkUnlocks(true); save(); render();
}
function undoToast(text, snap, xp) {
  toast(`<span class="grow">${esc(text)}${xp > 0 ? ` · <span class="xp-pop">+${xp} XP</span>` : ''}</span>`, '', 5000, { label: 'Annuler', fn: () => { restoreItem(snap); toast('Annulé', '', 1400); } });
}
const buzz = (ms) => { if (navigator.vibrate) try { navigator.vibrate(ms); } catch (e) { /* */ } };
// film déjà vu : le bouton sert à enregistrer un revisionnage
const nextOrRewatch = (it) => nextUnit(it) || (shape(it) === 'film' && curPass(it).done.v ? { key: 'v' } : null);
function doNext(it) {
  const nx = nextOrRewatch(it); if (!nx) return;
  if (shape(it) === 'jeu') { askJeuDone(it); return; }
  const snap = snapItem(it.id); const label = doneShort(it, nx); const long = doneShort(it, nx, true);
  const from = curPct(it);
  const xp = withXp(() => {
    if (shape(it) === 'film' && curPass(it).done.v) newPass(it); setDone(it, nx.key, true);
    if (shape(it) === 'film' && ui.cine && ui.cine[it.id]) { setCine(filmEvent(it, curPass(it).n), true); ui.cine[it.id] = false; }
    touched(it);
  }, { quiet: true });
  // pendant ~1 s : le bouton montre la confirmation (coche, « Ép. 3 vu », +10 XP), la barre avance depuis l'ancienne valeur
  if (ui.route === 'encours' || ui.route === 'item') {
    ui.justDone = { id: it.id, from, label, xp }; clearTimeout(ui.justT); render();
    ui.justT = setTimeout(() => { ui.justDone = null; if (ui.route === 'encours' || ui.route === 'item') render(); }, 1000);
    buzz(12);
  }
  undoToast(long, snap, xp);
}
function askJeuDone(it) {
  confirmBox('Jeu terminé ?', `Marquer <b>${esc(it.title)}</b> comme terminé ${it.catchup ? '(rattrapage, sans XP)' : `(+${XP.jeu} XP)`} ?`, 'J’ai fini le jeu', () => {
    const snap = snapItem(it.id); const xp = withXp(() => { setDone(it, 'fin', true); touched(it); }, { quiet: true }); undoToast('Jeu terminé', snap, xp);
  });
}
// coche groupée (appui long, « Tout cocher ») : appliquée tout de suite, avec « Annuler » pendant 5 s
function bulk(it, fn, text) {
  const snap = snapItem(it.id); const before = progress(it).done;
  const xp = withXp(() => { fn(); touched(it); }, { quiet: true });
  const n = Math.abs(progress(it).done - before);
  undoToast(text(n), snap, xp);
}
function upTo(it, key) {
  const sh = shape(it); const keys = sh === 'episodes' ? epKeys(it) : volKeys(it);
  const idx = keys.indexOf(key); if (idx < 0) return;
  buzz(20);
  bulk(it, () => keys.slice(0, idx + 1).forEach((k) => setDone(it, k, true)), (n) => (n ? plural(n, sh === 'episodes' ? 'épisode coché' : 'tome coché', sh === 'episodes' ? 'épisodes cochés' : 'tomes cochés') : 'Déjà coché') + ' jusqu’ici');
}
function toggleUnit(d) { const it = state.items[d.id]; const on = !curPass(it).done[d.k]; withXp(() => { setDone(it, d.k, on); touched(it); }); }
const ACT = {
  back() { if (history.length > 1) history.back(); else location.hash = '#encours'; },
  next(d) { const it = state.items[d.id]; if (!it || (ui.justDone && ui.justDone.id === it.id)) return; doNext(it); },
  ep(d) { toggleUnit(d); },
  vol(d) { toggleUnit(d); },
  book(d) { toggleUnit(d); },
  'ep-upto'(d) { upTo(state.items[d.id], d.k); },
  'vol-upto'(d) { upTo(state.items[d.id], d.k); },
  'vol-all'(d) {
    const it = state.items[d.id]; const all = progress(it).done >= it.volumes.length;
    bulk(it, () => volKeys(it).forEach((k) => setDone(it, k, !all)), (n) => all ? 'Tomes décochés' : plural(n, 'tome coché', 'tomes cochés'));
  },
  'season-all'(d) {
    const it = state.items[d.id]; const s = it.seasons.find((x) => x.n === +d.v); if (!s) return; const all = seasonDone(it, s);
    bulk(it, () => { for (let e = 1; e <= s.count; e++) setDone(it, 's' + s.n + 'e' + e, !all); }, (n) => all ? 'Saison ' + s.n + ' décochée' : plural(n, 'épisode coché', 'épisodes cochés'));
  },
  'ov-toggle'(d) { ui.ovOpen = ui.ovOpen || {}; ui.ovOpen[d.id] = !ui.ovOpen[d.id]; render(); },
  // Envies : « J'ai vu le film » enregistre directement le visionnage
  'envie-seen'(d) { const it = state.items[d.id]; if (!it) return; ui.modal = null; doNext(it); },
  'envie-start'(d) {
    const it = state.items[d.id]; if (!it) return; const snap = snapItem(it.id); ui.modal = null;
    it.status = 'encours'; it.updatedAt = now(); save(); render();
    undoToast(it.title + ' est dans En cours', snap, 0);
  },
  'envie-menu'(d) {
    const it = state.items[d.id]; if (!it) return; const v = envieVerb(it);
    openModal(it.title, `<div class="col" style="gap:4px">${sheetRow(v.a === 'envie-seen' ? 'check' : 'play', v.label, v.a === 'envie-seen' ? 'Enregistre le visionnage' : 'Passe dans En cours', `data-a="${v.a}" data-id="${it.id}"`)}
      ${sheetRow('x', 'Retirer des envies', '', `data-a="envie-remove" data-id="${it.id}"`)}</div>`, { sheet: true });
  },
  'envie-remove'(d) {
    const it = state.items[d.id]; if (!it) return; const snap = snapItem(it.id); ui.modal = null;
    deleteItem(it.id); checkUnlocks(true); save(); render();
    undoToast(it.title + ' retiré des envies', snap, 0);
  },
  'empty-add'(d) {
    ui.add.status = d.st || 'encours'; ui.add.catchup = null;
    if (d.v === 'menu') ACT['add-menu'](); else ACT['add-go']({ v: d.v });
  },
  // recherche locale sans résultat → recherche en ligne pour l'ajouter
  'search-add'(d) {
    const t = d.v === 'mangabd' ? 'manga' : ADD_TYPES.includes(d.v) && d.v !== 'sport' && d.v !== 'catch' ? d.v : 'serie';
    Object.assign(ui.add, { type: t, status: d.st || 'encours', catchup: null, results: null, picked: null, manual: false, error: '', q: d.q || '' });
    location.hash = '#ajouter-' + t;
    if (d.q) { const fd = new FormData(); fd.set('q', d.q); FORMS.search(fd); }
  },
  'goto-envies'(d) { if (FILTERS.some(([k]) => k === d.v)) ui.envies = d.v; location.hash = '#envies'; },
  'nba-reveal'(d) { ui.reveal[d.id] = true; render(); },
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
      sagaBonus(it);
    });
  },
  'jeu-undo'(d) { const it = state.items[d.id]; withXp(() => { setDone(it, 'fin', false); it.status = 'encours'; }); },
  rewatch(d) {
    const it = state.items[d.id];
    confirmBox('Nouveau passage ?', `Tu repars de zéro sur <b>${esc(it.title)}</b>. Ton premier passage reste dans l’historique, et ce nouveau passage rapporte la moitié des XP.`, 'C’est parti', () => { newPass(it); it.status = 'encours'; it.updatedAt = now(); save(); closeModal(); });
  },
  'item-status'(d) {
    const it = state.items[d.id]; ui.modal = null;
    if (d.v === 'termine' && progress(it).done < progress(it).total && shape(it) !== 'film' && shape(it) !== 'jeu') {
      confirmBox('Marquer comme terminé ?', 'Veux-tu aussi cocher tout ce qui reste ?' + (it.catchup ? ' (rattrapage : sans XP)' : ''), 'Tout cocher', () => { withXp(() => { markAll(it); touched(it); it.status = 'termine'; }); closeModal(); });
      ui.modal.html = ui.modal.html.replace('<div class="grid2">', `<button class="btn block" data-a="status-only" data-id="${it.id}">Changer seulement le statut</button><div class="grid2">`); render();
      return;
    }
    if (d.v === 'termine' && (shape(it) === 'film' || shape(it) === 'jeu') && !progress(it).done) { if (shape(it) === 'jeu') askJeuDone(it); else ACT['film-seen'](d); return; }
    it.status = d.v; it.updatedAt = now(); save(); render();
  },
  'status-only'(d) { const it = state.items[d.id]; it.status = 'termine'; it.updatedAt = now(); save(); closeModal(); },
  // menu ⋯ de la fiche : une feuille qui monte du bas, actions explicites, suppression à part en rouge
  'item-menu'(d) {
    const it = state.items[d.id]; const sh = shape(it);
    const reading = it.type === 'livre' || it.type === 'bd' || it.type === 'manga';
    const canRewatch = (sh === 'episodes' || sh === 'tomes' || sh === 'livre') && progress(it).done > 0;
    const sw = `<span class="sw-mini${it.catchup ? ' on' : ''}" aria-hidden="true"></span>`;
    openModal('', `<div class="col" style="gap:4px"><span class="grip" aria-hidden="true"></span><span class="sheet-sub">${esc(it.title)}</span>
      <span class="field-lab">Statut</span><div class="seg" role="group" aria-label="Statut" style="margin-bottom:8px">${[['envie', 'Envie'], ['encours', 'En cours'], ['termine', 'Terminé']].map(([k, l]) => `<button class="${it.status === k ? 'on' : ''}" data-a="item-status" data-id="${it.id}" data-v="${k}" aria-pressed="${it.status === k}">${l}</button>`).join('')}</div>
      ${sheetRow('image', 'Changer l’affiche', 'Affiche et bannière', `data-a="item-cover" data-id="${it.id}"`)}
      ${canRewatch ? sheetRow('redo', reading ? 'Relire depuis le début' : 'Revoir depuis le début', 'Nouveau passage, moitié des XP', `data-a="rewatch" data-id="${it.id}"`) : ''}
      ${sheetRow('check', 'Mode rattrapage', 'Cocher ce que tu as déjà vu, sans XP ni historique', `data-a="catchup-set" data-id="${it.id}" data-v="${it.catchup ? 0 : 1}" role="switch" aria-checked="${!!it.catchup}"`, sw)}
      ${sheetRow('edit', 'Modifier les infos', '', `data-a="item-edit" data-id="${it.id}"`)}
      ${it.src && it.src.api === 'tmdb' && it.seasons ? sheetRow('sync', 'Actualiser depuis TMDB', 'Nouveaux épisodes et saisons', `data-a="item-refresh" data-id="${it.id}"`) : ''}
      <i class="sheet-sep" aria-hidden="true"></i>
      ${sheetRow('trash', 'Supprimer ' + (TYPE_OF[it.type] || TYPE_OF.serie)[1], '', `data-a="item-del" data-id="${it.id}"`, '', 'danger')}</div>`, { sheet: true });
  },
  async 'item-refresh'(d) {
    const it = state.items[d.id]; closeModal();
    try { await refreshTv(it); touched(it); save(); render(); toast('Épisodes à jour'); } catch (e) { toast(esc(errText(e)), '', 3500); }
  },
  'item-edit'(d) {
    const it = state.items[d.id]; const sh = shape(it);
    openModal('Modifier', `<form class="col" style="gap:12px" data-form="item-edit" data-id="${it.id}">
      <label class="field"><span>Titre</span><input class="input" name="title" value="${esc(it.title)}" required></label>
      ${sh === 'episodes' && it.type !== 'catch' ? formatField(it) : ''}
      ${sh === 'episodes' && !(it.src && it.src.api === 'tmdb') ? `<label class="field"><span>Épisodes par saison</span><input class="input" name="seasons" value="${esc(it.seasons.map((s) => s.count).join(', '))}"></label>` : ''}
      ${sh === 'tomes' || sh === 'livre' ? `<label class="field"><span>Nombre de tomes</span><input class="input" name="tomes" type="number" min="1" max="300" value="${it.volumes.length}"></label>` : ''}
      ${sh === 'livre' ? `<label class="field"><span>Pages par tome</span><input class="input" name="pages" type="number" min="0" value="${esc(it.volumes[0] ? it.volumes[0].pages || '' : '')}"></label>` : ''}
      ${sh === 'episodes' || sh === 'tomes' || sh === 'livre' ? `<label class="toggle"><input type="checkbox" name="ended" ${it.ended ? 'checked' : ''}><span class="sw"></span><span class="grow"><b style="font-size:14px">Terminée (plus de suite prévue)</b></span></label>` : ''}
      <div class="grid2"><button class="btn" type="button" data-a="modal-close">Annuler</button><button class="btn prim" type="submit">Enregistrer</button></div></form>`);
  },
  'item-cover'(d) {
    const it = state.items[d.id];
    openModal('Couverture', `<form class="col" style="gap:14px" data-form="item-cover" data-id="${it.id}">${posterField(it.poster)}${posterField(it.backdrop, 'backdrop')}
      ${it.backdrop ? `<label class="toggle"><input type="checkbox" name="noBackdrop"><span class="sw"></span><span class="grow"><b style="font-size:14px">Retirer la bannière</b><br><span class="small muted">L’affiche sera utilisée à la place.</span></span></label>` : ''}
      <div class="grid2"><button class="btn" type="button" data-a="modal-close">Annuler</button><button class="btn prim" type="submit">Enregistrer</button></div></form>`);
  },
  'item-history'(d) {
    const it = state.items[d.id];
    const rows = histoRows(realEvents().filter((e) => e.item === it.id && !isBonus(e)));
    openModal('Historique', `${rows.length ? `<div class="list">${rows.map((r) => histoRowHtml(Object.assign({}, r, { href: '' }), fmtDay(r.ts))).join('')}</div>` : `<div class="empty">Rien pour l’instant${it.catchup ? ' : le mode rattrapage ne garde pas d’historique' : ''}.</div>`}
      <button class="btn block" data-a="modal-close">Fermer</button>`);
  },
  'catchup-set'(d) {
    const it = state.items[d.id]; it.catchup = d.v === '1'; ui.modal = null; save(); render();
    toast(it.catchup ? 'Rattrapage activé : sans XP' : 'Rattrapage terminé : l’XP compte à nouveau', '', 2400);
  },
  'profile-edit'() {
    const s = state.settings;
    openModal('Mon profil', `<form class="col" style="gap:14px" data-form="profile"><div class="crop-host"></div>
      <div class="field"><span>Photo de profil</span><div class="row" style="gap:14px"><span class="pf-prev" data-preview="avatar">${s.avatar ? `<img src="${esc(s.avatar)}" alt="">` : svgIcon('user', 30)}</span>
        <div class="col grow" style="gap:8px"><label class="btn">${svgIcon('image', 18)}${s.avatar ? 'Changer de photo' : 'Choisir une photo'}<input type="file" accept="image/*" data-change="poster-file" data-field="avatar" class="sr"></label>
        <button type="button" class="btn" data-a="avatar-recrop" ${s.avatar ? '' : 'hidden'}>${svgIcon('edit', 18)}Recadrer</button>
        ${s.avatar ? `<label class="toggle" style="padding:8px 10px"><input type="checkbox" name="noAvatar"><span class="sw"></span><span class="grow small">Retirer la photo</span></label>` : ''}</div></div>
        <input type="hidden" name="avatarData" value=""><input type="hidden" name="avatarSrcData" value=""></div>
      <label class="field"><span>Pseudo</span><input class="input" name="pseudo" value="${esc(s.pseudo || '')}" maxlength="24" autocomplete="nickname" placeholder="Ex. Alex"></label>
      <span class="small muted">Ton pseudo et ta photo restent sur ce téléphone, et partent dans tes sauvegardes (Exporter).</span>
      <div class="grid2"><button class="btn" type="button" data-a="modal-close">Annuler</button><button class="btn prim" type="submit">Enregistrer</button></div></form>`);
  },
  // recadrer : depuis la photo choisie à l'instant, sinon l'original gardé, sinon la photo actuelle
  'avatar-recrop'() {
    const form = document.querySelector('form[data-form="profile"]'); if (!form) return;
    openCrop(form, form.elements.avatarSrcData.value || state.settings.avatarSrc || state.settings.avatar);
  },
  'goto-settings'() { const el = document.getElementById('reglages'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  'item-del'(d) {
    const it = state.items[d.id];
    // on ne revient en arrière que depuis la fiche (depuis Envies, history.back() quittait la page)
    confirmBox('Supprimer ?', `<b>${esc(it.title)}</b> et tout son historique (et l’XP associée) seront supprimés. C’est définitif.`, 'Supprimer', () => { const fromItem = ui.route === 'item'; deleteItem(it.id); checkUnlocks(true); save(); ui.modal = null; if (fromItem) ACT.back(); else render(); }, true);
  },
  'goto-catch'() { ui.biblio.type = 'catch'; location.hash = '#biblio'; },
  'match-seen'(d) { const m = state.matches[d.id]; ui.modal = null; withXp(() => matchSee(m, d.mode)); },
  'match-unsee'(d) { withXp(() => matchUnsee(state.matches[d.id])); },
  'match-dismiss'(d) { const m = state.matches[d.id]; m.dismissed = true; ui.modal = null; save(); render(); },
  'match-mode'(d) { ui.matchMode[d.id] = d.v; render(); },
  'match-cover'(d) {
    const m = state.matches[d.id];
    openModal('Couverture du match', `<form class="col" style="gap:14px" data-form="match-cover" data-id="${m.id}">${posterField(m.cover, 'backdrop', 'Image du match')}
      ${m.cover ? `<label class="toggle"><input type="checkbox" name="noCover"><span class="sw"></span><span class="grow"><b style="font-size:14px">Retirer la couverture</b></span></label>` : ''}
      <div class="grid2"><button class="btn" type="button" data-a="modal-close">Annuler</button><button class="btn prim" type="submit">Enregistrer</button></div></form>`);
  },
  'match-del'(d) { confirmBox('Supprimer ce match ?', 'Le match et l’XP associée seront supprimés.', 'Supprimer', () => { matchUnsee(state.matches[d.id]); delete state.matches[d.id]; checkUnlocks(true); save(); ui.modal = null; history.back(); }, true); },
  reveal(d) { ui.reveal[d.id] = true; render(); },
  'sport-mode'(d) { ui.add.sportMode = d.v; render(); },
  'nba-pick'(d) {
    const n = ui.add.nba || (ui.add.nba = {}); const f = document.querySelector('form[data-form="nba-add"]'); if (f) n.night = f.elements.night.value;
    if (!n.h || (n.h && n.a)) { n.h = d.v; n.a = null; } else if (d.v !== n.h) n.a = d.v;
    render();
  },
  'nba-pick-reset'() { ui.add.nba = { night: (ui.add.nba || {}).night }; render(); },
  'nba-night'(d) { ui.nbaNight = +d.v; render(); },
  async 'nba-sync'() { if (nbaRun) return; toast('Récupération des matchs NBA (environ une minute)…', '', 2200); const n = await syncNba(true); toast(n ? plural(n, 'nouveau match') : 'Rien de nouveau pour le moment', n ? 'gold' : '', 2400); },
  'nba-ask'(d) {
    const f = state.nba.feed[d.id];
    openModal('Comment l’as-tu regardé ?', `<div class="col" style="gap:14px"><div class="row" style="gap:12px;justify-content:center">${nbaLogo(f.h, 52)}<span class="vs">vs</span>${nbaLogo(f.a, 52)}</div>
      <span style="text-align:center;font-weight:700">${esc(f.home)} – ${esc(f.away)}</span><span class="small muted" style="text-align:center">${esc(nightLabel(f.night))}</span>
      <div class="seg">${Object.keys(MODES).map((k) => `<button data-a="nba-see" data-id="${f.id}" data-mode="${k}">${modeCap(k)}</button>`).join('')}</div><button class="btn block" data-a="modal-close">Annuler</button></div>`);
  },
  'nba-see'(d) { const f = state.nba.feed[d.id]; ui.modal = null; withXp(() => nbaSee(f, d.mode)); },
  async 'sport-sync'() { toast('Récupération des matchs…', '', 1400); const ok = await syncSport(true); toast(ok ? 'Matchs à jour' : 'Impossible de joindre TheSportsDB pour le moment.', '', 2600); },
  'catch-del'(d) { confirmBox('Supprimer cette entrée ?', 'L’entrée et son XP seront retirées du journal.', 'Supprimer', () => { catchRemove(d.id); checkUnlocks(true); save(); closeModal(); }, true); },
  'catch-fed'(d) { ui.add.fed = d.v; ui.add.cpick = null; render(); if (CATCH_LEAGUES[d.v]) syncCatch(d.v); },
  'catch-kind'(d) { ui.add.ckind = d.v; render(); },
  async 'tmdb-link'(d) {
    const it = state.items[d.id]; toast('Recherche sur TMDB…', '', 1200);
    try {
      const c = (await tmdbTvCandidates([it.title].concat(it.altTitles || []), it.year)).slice(0, 6);
      if (!c.length) { toast('Aucun résultat sur TMDB.', '', 2600); return; }
      openModal('Quelle série sur TMDB ?', `<div class="col" style="gap:8px">${c.map(({ x }) => `<button class="result" data-a="tmdb-link-pick" data-id="${it.id}" data-tv="${x.id}">${posterHtml(x.name, x.poster_path ? IMG.poster + x.poster_path : '', 'sm')}<div class="col grow" style="gap:3px"><span class="ti">${esc(x.name)}</span><span class="small muted">${esc((x.first_air_date || '').slice(0, 4))}${x.original_name && x.original_name !== x.name ? ' · ' + esc(x.original_name) : ''}</span></div></button>`).join('')}
        <span class="small muted">Ta progression est conservée : les épisodes cochés sont répartis dans les saisons TMDB.</span><button class="btn block" data-a="modal-close">Annuler</button></div>`);
    } catch (e) { toast(esc(errText(e)), '', 3000); }
  },
  async 'tmdb-link-pick'(d) {
    const it = state.items[d.id]; closeModal();
    try { await linkTmdb(it, +d.tv); touched(it); save(); render(); toast('Épisodes mis à jour', 'gold', 2200); } catch (e) { toast(esc(errText(e)), '', 3000); }
  },
  'catch-plan'(d) { ui.add.cplan = d.v === '1'; render(); },
  'ctm-clear'() { ui.add.ctm = null; render(); },
  'ctm-reset'() { Object.assign(ui.add, { ctmdb: null, cair: '', cposter: '', cf: {} }); render(); },
  async 'ctm-pick'(d) {
    const t = ui.add.ctm; const r = t && t.results && t.results[+d.i]; if (!r) return;
    if (r.mt === 'movie') { catchFillFromTmdb({ name: r.title, air: r.date, poster: r.poster, kind: 'ppv', ref: 'movie:' + r.id }); return; }
    t.loading = true; render();
    try {
      const tv = await tmdb('/tv/' + r.id);
      const seasons = (tv.seasons || []).filter((x) => x.season_number > 0 && x.episode_count > 0).map((x) => ({ n: x.season_number, label: x.air_date ? x.air_date.slice(0, 4) : x.name }));
      Object.assign(t, { loading: false, results: null, tv: { id: r.id, name: tv.name || r.title, poster: r.poster, seasons }, season: null, eps: null });
      const last = seasons.filter((x) => !/^\d{4}$/.test(x.label) || x.label <= String(new Date().getFullYear())).pop() || seasons[seasons.length - 1];
      if (last) await ACT['ctm-season']({ v: String(last.n) }); else render();
    } catch (e) { t.loading = false; t.error = errText(e); render(); }
  },
  async 'ctm-season'(d) {
    const t = ui.add.ctm; if (!t || !t.tv) return;
    t.season = +d.v; t.eps = null; render();
    try {
      const s0 = await tmdb('/tv/' + t.tv.id + '/season/' + d.v);
      const today = isoDay(new Date());
      if (t.season !== +d.v) return;
      t.eps = (s0.episodes || []).filter((e) => e.air_date && e.air_date <= today).sort((a, b) => b.air_date.localeCompare(a.air_date))
        .map((e) => ({ n: e.episode_number, name: e.name, air: e.air_date, still: e.still_path ? IMG.backdrop + e.still_path : '' }));
    } catch (e) { t.eps = []; t.error = errText(e); }
    render();
  },
  'ctm-ep'(d) {
    const t = ui.add.ctm; const e = t && t.eps && t.eps[+d.i]; if (!e) return;
    const base = cleanShowName(t.tv.name);
    catchFillFromTmdb({ name: base + ' · ' + fmtLong(e.air), fedHint: t.tv.name, air: e.air, poster: e.still || t.tv.poster, kind: 'hebdo', ref: 'tv:' + t.tv.id + ':' + t.season + ':' + e.n });
  },
  'catch-feed-sync'(d) { toast('Recherche des shows ' + esc(d.v) + '…', '', 1400); syncCatch(d.v, true).then((n) => { if (!n) toast('TheSportsDB n’a rien renvoyé pour le moment.', '', 2800); render(); }); render(); },
  'catch-pick'(d) {
    const a = ui.add; const x = (state.catchFeed[a.fed] || []).find((y) => y.id === d.id); if (!x) return;
    const dt = new Date(x.ts);
    a.cpick = x.id; a.ckind = x.kind; a.cposter = x.poster || '';
    a.cf = Object.assign(a.cf || {}, { show: x.name, date: isoDay(dt), time: hhmm(x.ts) });
    render();
  },
  'feds-open'() { fedsModal(); },
  'fed-kind'(d) { state.feds[+d.i].kind = d.v; save(); fedsModal(); },
  'fed-del'(d) { if (state.feds.length <= 1) return; state.feds.splice(+d.i, 1); save(); fedsModal(); },
  'show-open'(d) { const s0 = state.shows[d.id]; if (s0) showModal(s0); },
  'show-seen'(d) { const s0 = state.shows[d.id]; ui.modal = null; withXp(() => showSee(s0, d.mode)); },
  'show-dismiss'(d) { state.shows[d.id].dismissed = true; ui.modal = null; save(); render(); },
  'show-del'(d) { confirmBox('Supprimer ce show ?', 'Il sera retiré des shows programmés.', 'Supprimer', () => { delete state.shows[d.id]; save(); closeModal(); }, true); },
  'catch-new-show'() {
    openModal('Nouveau show suivi', `<form class="col" style="gap:12px" data-form="catch-show"><label class="field"><span>Nom du show</span><input class="input" name="title" placeholder="Ex. AEW Collision" required></label><div class="grid2"><button class="btn" type="button" data-a="modal-close">Annuler</button><button class="btn prim" type="submit">Ajouter</button></div></form>`);
  },
  'add-menu'() {
    openModal('', `<div class="col" style="gap:18px"><span class="grip" aria-hidden="true"></span><div class="row between"><h2 class="sheet-title">Ajouter</h2><button class="icon-btn" data-a="modal-close" aria-label="Fermer">${svgIcon('x', 18)}</button></div>
      <div class="add-grid">${ADD_MENU.map(([t, l, sub]) => `<button class="add-opt" data-a="add-go" data-v="${t}">${svgIcon(catIcon(t), 24)}<span class="col" style="gap:3px"><b>${l}</b><span>${sub}</span></span></button>`).join('')}</div></div>`, { sheet: true });
  },
  'add-go'(d) { ui.modal = null; ui.add.type = d.v; location.hash = '#ajouter-' + d.v; render(); },
  'env-type'(d) { ui.envies = d.v; render(); },
  'histo-type'(d) { ui.histoF = d.v; render(); },
  'histo-more'() { ui.histoN = (ui.histoN || 14) + 12; render(); },
  'match-confirm'(d) { const m = state.matches[d.id]; openModal('Comment l’as-tu regardé ?', `<div class="col" style="gap:12px"><span style="font-weight:700">${esc(m.home)} – ${esc(m.away)}</span><span class="small muted">${esc(fmtMatch(m.ts))}</span><div class="seg">${Object.keys(MODES).map((k) => `<button data-a="match-seen" data-id="${m.id}" data-mode="${k}">${modeCap(k)}</button>`).join('')}</div><button class="btn block" data-a="match-dismiss" data-id="${m.id}">Je ne l’ai pas vu</button></div>`); },
  'show-confirm'(d) { const x = state.shows[d.id]; openModal('Comment l’as-tu regardé ?', `<div class="col" style="gap:12px"><span style="font-weight:700">${esc(x.name)}</span><span class="small muted">${esc(x.fed)} · ${esc(fmtMatch(x.ts))}</span><div class="seg">${Object.keys(MODES).map((k) => `<button data-a="show-seen" data-id="${x.id}" data-mode="${k}">${modeCap(k)}</button>`).join('')}</div><button class="btn block" data-a="show-dismiss" data-id="${x.id}">Je ne l’ai pas vu</button></div>`); },
  'bib-type'(d) { ui.biblio.type = d.v; render(); if (d.v === 'sport') syncSport(); },
  'bib-status'(d) { ui.biblio.status = d.v; render(); },
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
      <div class="grid2"><button class="btn" type="button" data-a="modal-close">Annuler</button><button class="btn prim" type="submit">Enregistrer</button></div></form>`);
  },
  async 'test-tmdb'() {
    const inp = document.querySelector('input[name=tmdb]'); if (inp) state.settings.tmdbKey = inp.value.trim();
    try { await tmdb('/configuration'); toast('Clé TMDB valide', 'gold'); save(); } catch (e) { toast(esc(errText(e)), '', 3500); }
  },
  export() {
    try {
      const blob = new Blob([exportJson(1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = 'rewind-sauvegarde-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      state.lastExport = now(); save(); render(); toast('Sauvegarde exportée');
    } catch (e) { toast('Export impossible ici. Utilise « Copier les données ».', '', 3500); }
  },
  async 'copy-data'() {
    try { await navigator.clipboard.writeText(exportJson()); state.lastExport = now(); save(); toast('Données copiées dans le presse-papiers'); render(); }
    catch (e) { toast('Copie impossible ici.', '', 2600); }
  },
  'load-demo'() { loadDemo(); toast('Données de démo chargées'); },
  'clear-demo'() { confirmBox('Effacer la démo ?', 'Toutes les données de démonstration seront supprimées. Tes clés sont conservées.', 'Effacer', () => { resetState(true); closeModal(); }, true); },
  wipe() { confirmBox('Tout effacer ?', 'Toutes tes données (œuvres, historique, XP, badges) seront supprimées de ce téléphone. Exporte une sauvegarde avant si besoin. C’est définitif.', 'Tout effacer', () => { resetState(); closeModal(); }, true); },
  'modal-close'() { closeModal(); },
  'badge-open'(d) { if (FAM[d.v]) badgeSheet(d.v); },
  'secret-open'(d) { if (SECRET[d.v]) secretSheet(d.v); },
  'bdg-type'(d) { ui.bdgF = d.v; render(); },
  'perso-open'() { persoSheet(); },
  'pick-title'(d) { state.settings.title = d.v; save(); persoSheet(); },
  'pick-vit'(d) {
    const v = state.settings.vitrine || (state.settings.vitrine = []); const i = v.indexOf(d.v);
    if (i >= 0) v.splice(i, 1); else { if (v.length >= 3) v.shift(); v.push(d.v); }
    save(); persoSheet();
  },
  'pick-banner'(d) { state.settings.banner = d.v; save(); persoSheet(); },
  'fs-next'(d) {
    const x = ui.fs && ui.fs.shift(); if (x && x.t === 'recap') { state.recapPending = false; save(); }
    if (d.v) location.hash = d.v; render();
    if (!ui.fs.length && ui.cardsLater && ui.cardsLater.length) { badgeCard(ui.cardsLater); ui.cardsLater = null; }
  },
  share(d) { shareCard(d.k, d.v).catch(() => toast('Partage impossible ici.', '', 2600)); },
  'film-cine'(d) {
    const it = state.items[d.id]; const ev = it && filmEvent(it, +d.v); if (!ev) return;
    const on = !ev.cine; withXp(() => setCine(ev, on));
    if (on && !ev.cineXp && !ev.legacy) toast('Déjà 4 séances avec bonus ce jour-là : celle-ci compte pour le badge, sans les +20 XP.', '', 4000);
  },
  'modal-yes'() { const f = ui.modal && ui.modal.onYes; ui.modal = null; if (f) f(); render(); },
  'modal-bg'(d, el, e) { if (e.target === el) closeModal(); }
};
// keepProfile : effacer la démo garde ton pseudo et ta photo ; « Tout effacer » les supprime aussi
// sauvegarde (Exporter, Copier) : tout sauf les clés TMDB et RAWG, qui restent sur ce téléphone
function exportJson(indent) {
  return JSON.stringify(state, (k, v) => (k === 'tmdbKey' || k === 'rawgKey' ? undefined : v), indent);
}
function resetState(keepProfile) {
  const s0 = state.settings; const keep = { tmdbKey: s0.tmdbKey, rawgKey: s0.rawgKey };
  if (keepProfile) Object.assign(keep, { pseudo: s0.pseudo || '', avatar: s0.avatar || '', avatarSrc: s0.avatarSrc || '' });
  state = freshState(); Object.assign(state.settings, keep); seedState(); save(); location.hash = '#encours'; render();
}
const FORMS = {
  'match-cover'(fd, form) {
    const m = state.matches[form.dataset.id]; if (!m) return;
    const img = String(fd.get('backdropData') || '').trim() || String(fd.get('backdropUrl') || '').trim();
    if (fd.get('noCover')) delete m.cover; else if (img) m.cover = img;
    ui.modal = null; save(); render(); toast(fd.get('noCover') ? 'Couverture retirée' : img ? 'Couverture ajoutée' : 'Rien de changé', '', 1800);
  },
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
    if (t === 'serie' || (t === 'doc' && seasons.length)) { data.seasons = (seasons.length ? seasons : [1]).map((c, i) => ({ n: i + 1, name: 'Saison ' + (i + 1), count: c, eps: null })); data.ended = !!fd.get('ended'); }
    if (t === 'bd' || t === 'manga' || t === 'livre') { const n = clamp(+fd.get('tomes') || 1, 1, 300); const pages = +fd.get('pages') || 0; data.volumes = Array.from({ length: n }, (_, i) => ({ n: i + 1, pages })); }
    if (fd.get('runtime')) data.runtime = +fd.get('runtime');
    finishAdd(data);
  },
  'match-add'(fd) {
    const id = uid(); const ts = Date.parse(fd.get('date')) || now();
    const m = { id, ext: false, team: null, sport: fd.get('sport'), league: String(fd.get('league') || '').trim(), home: String(fd.get('home')).trim(), away: String(fd.get('away')).trim(), ts,
      hs: fd.get('hs') !== '' ? +fd.get('hs') : null, as: fd.get('as') !== '' ? +fd.get('as') : null, seen: null, dismissed: false };
    // équipe suivie reconnue par son nom (« Inter Milan » n'est pas le Milan AC)
    const fav = { sixers: /\b(76ers|sixers)\b/i, milan: /^(ac )?milan( ac)?$/i };
    for (const t of Object.values(TEAMS)) {
      const isT = (n) => fav[t.key].test(n.trim()) || n.trim().toLowerCase() === t.name.toLowerCase();
      if (isT(m.home) || isT(m.away)) { m.team = t.key; m.homeId = isT(m.home) ? t.id : ''; m.awayId = isT(m.away) ? t.id : ''; }
    }
    state.matches[id] = m;
    const mode = fd.get('mode');
    withXp(() => { if (mode) matchSee(m, mode); });
    location.hash = '#match-' + id;
  },
  'nba-add'(fd) {
    const n = ui.add.nba || {}; if (!n.h || !n.a) return;
    const night = String(fd.get('night') || ''); const mode = fd.get('mode');
    const hs = fd.get('hs') !== '' ? +fd.get('hs') : null, as = fd.get('as') !== '' ? +fd.get('as') : null;
    let f = Object.values(state.nba.feed).find((x) => x.night === night && ((x.h === n.h && x.a === n.a) || (x.h === n.a && x.a === n.h)));
    if (!f) {
      const ts = Date.parse(night + 'T19:30:00-05:00') || now();
      f = { id: 'nba' + uid(), h: n.h, a: n.a, home: NBA_BY[n.h].name, away: NBA_BY[n.a].name, homeId: state.nba.ids[n.h] || '', awayId: state.nba.ids[n.a] || '', ts, hs, as, night };
      const dup = Object.values(state.matches).find((m) => m.sport === 'nba' && nightKey(m.ts) === night && [nbaAbbr(m.home), nbaAbbr(m.away)].sort().join() === [n.h, n.a].sort().join());
      if (dup) f.id = dup.id;
    } else if (hs != null && f.hs == null) { f.hs = hs; f.as = as; }
    withXp(() => nbaSee(f, mode));
    ui.add.nba = { night }; ui.biblio.type = 'sport'; location.hash = '#match-' + f.id;
  },
  async 'catch-tmdb'(fd) {
    const q = String(fd.get('q') || '').trim(); if (!q) return;
    const t = ui.add.ctm = { q, loading: true }; render();
    try { t.results = await catchTmdbSearch(q); } catch (e) { t.error = errText(e); }
    t.loading = false; render();
  },
  'catch-add'(fd) {
    const a = ui.add; const fed = a.fed || 'AEW';
    const kind = fedKind(fed) === 'major' ? (a.ckind === 'ppv' ? 'ppv' : 'hebdo') : 'show';
    const ts = Date.parse(fd.get('date') + 'T' + (fd.get('time') || '20:00') + ':00') || now();
    const poster = String(fd.get('posterData') || '').trim() || String(fd.get('posterUrl') || '').trim();
    const name = String(fd.get('show') || '').trim();
    if (a.cplan) {
      const id = uid(); state.shows[id] = { id, fed, name, kind, ts, poster, seen: null, dismissed: false, createdAt: now(), tmdb: a.ctmdb || undefined };
      save(); toast(esc(name) + ' programmé', '', 2200);
    } else {
      const pick = a.cpick && (state.catchFeed[fed] || []).find((y) => y.id === a.cpick && y.name === name);
      withXp(() => catchAdd({ fed, show: name, kind, mode: fd.get('mode'), ts, poster: poster || (pick ? pick.poster : ''), tsdbId: pick ? pick.id : undefined, air: a.cair || undefined, tmdb: a.ctmdb || undefined }));
    }
    a.cf = {}; a.cposter = ''; a.cplan = false; a.cpick = null; a.cair = ''; a.ctmdb = null; a.ctm = null;
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
  profile(fd) {
    const s = state.settings;
    s.pseudo = String(fd.get('pseudo') || '').trim().slice(0, 24);
    const img = String(fd.get('avatarData') || '').trim(); const src = String(fd.get('avatarSrcData') || '').trim();
    if (fd.get('noAvatar')) { s.avatar = ''; s.avatarSrc = ''; } else if (img) { s.avatar = img; if (src) s.avatarSrc = src; }
    ui.modal = null; save(); render(); toast('Profil enregistré');
  },
  keys(fd) { state.settings.tmdbKey = String(fd.get('tmdb') || '').trim(); state.settings.rawgKey = String(fd.get('rawg') || '').trim(); save(); toast('Réglages enregistrés'); },
  goals(fd) {
    const g = {}; for (const k of Object.keys(GOAL_LABELS)) g[k] = clamp(+fd.get(k) || 0, 0, 999);
    // fige les objectifs des mois passés avant de changer la valeur par défaut
    activeMonths().forEach((mk) => { if (mk < monthKey(now()) && !state.goalsByMonth[mk]) state.goalsByMonth[mk] = Object.assign({}, state.settings.goals); });
    state.settings.goals = g; state.goalsByMonth[monthKey(now())] = Object.assign({}, g);
    checkUnlocks(); save(); closeModal();
  },
  'item-cover'(fd, form) {
    const it = state.items[form.dataset.id]; if (!it) return;
    const poster = String(fd.get('posterData') || '').trim() || String(fd.get('posterUrl') || '').trim();
    const banner = String(fd.get('backdropData') || '').trim() || String(fd.get('backdropUrl') || '').trim();
    if (poster) it.poster = poster;
    if (fd.get('noBackdrop')) it.backdrop = ''; else if (banner) it.backdrop = banner;
    ui.modal = null; save(); render(); toast(poster || banner || fd.get('noBackdrop') ? 'Couverture mise à jour' : 'Rien de changé', '', 1800);
  },
  'item-edit'(fd, form) {
    const it = state.items[form.dataset.id]; const sh = shape(it);
    it.title = String(fd.get('title')).trim() || it.title;
    if (fd.has('seasons')) { const c = String(fd.get('seasons')).split(/[,;\s]+/).map(Number).filter((n) => n > 0); if (c.length) it.seasons = c.map((n, i) => Object.assign(it.seasons[i] || { n: i + 1, name: 'Saison ' + (i + 1), eps: null }, { count: n })); }
    if (fd.has('tomes')) { const n = clamp(+fd.get('tomes') || 1, 1, 300); const pages = fd.has('pages') ? +fd.get('pages') || 0 : 0; it.volumes = Array.from({ length: n }, (_, i) => Object.assign({ n: i + 1, pages }, it.volumes[i] || {}, sh === 'livre' && fd.has('pages') ? { pages } : {})); }
    if (sh === 'episodes' || sh === 'tomes' || sh === 'livre') it.ended = !!fd.get('ended');
    if (fd.has('format')) { if (FORMATS[fd.get('format')]) it.format = fd.get('format'); else delete it.format; }
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
  if (it.coll) setTimeout(() => enrichTmdb().catch(() => {}), 500); // charge la saga du film
}

/* =========================================================
   12. Rendu, routes, événements
   ========================================================= */
let lastRouteKey = '';
function render() {
  memoClear();
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
    case 'badges': html = viewBadges(); break;
    default: html = viewEncours();
  }
  const app = document.getElementById('app');
  app.innerHTML = html + modalHtml();
  renderFs();
  if (sameRoute) window.scrollTo(0, y); else { window.scrollTo(0, 0); ui.ddOpen = false; }
  lastRouteKey = key;
  const chipOn = app.querySelector('.chips .chip.on');
  if (chipOn && chipOn.parentElement.scrollWidth > chipOn.parentElement.clientWidth) chipOn.parentElement.scrollLeft = chipOn.offsetLeft - chipOn.parentElement.clientWidth / 2 + chipOn.clientWidth / 2;
  const titles = { badges: 'Badges', encours: 'En cours', biblio: 'Biblio', envies: 'Envies', histo: 'Historique', profil: 'Profil', ajouter: 'Ajouter', rewind: 'Rewind ' + (r.arg || '') };
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
  if (a === 'add-catchup') { ui.add.catchup = el.checked; }
  if (a === 'cine') { ui.cine = ui.cine || {}; ui.cine[el.dataset.id] = el.checked; }
  if (a === 'poster-file') {
    const file = el.files && el.files[0]; if (!file) return;
    const form = el.closest('form'); const f = el.dataset.field || 'poster';
    // photo de profil : on ouvre le recadrage sur l'original réduit à 1024 px
    if (f === 'avatar') { imageToDataUrl(file, 1024, 1024).then((src) => openCrop(form, src)).catch(() => toast('Image illisible.', '', 2600)); el.value = ''; return; }
    imageToDataUrl(file, f === 'backdrop' ? 960 : 480, f === 'backdrop' ? 600 : 4000).then((data) => {
      if (form && form.elements[f + 'Data']) form.elements[f + 'Data'].value = data;
      const pv = form && form.querySelector(`[data-preview="${f}"]`); if (pv) pv.innerHTML = `<img src="${data}" alt="">`;
      if (form && form.dataset.form === 'catch-add' && f === 'poster') ui.add.cposter = data;
    }).catch(() => toast('Image illisible.', '', 2600));
    el.value = '';
  }
  if (a === 'import') {
    const file = el.files && el.files[0]; if (!file) return;
    file.text().then((txt) => {
      let data; try { data = JSON.parse(txt); } catch (err) { toast('Fichier illisible.', '', 3000); return; }
      if (data && data.rewindPack) { const n = importPack(data); toast(n ? plural(n, 'show') + ' ajouté' + (n > 1 ? 's' : '') : 'Rien de nouveau dans ce fichier', n ? 'gold' : '', 2600); return; }
      if (!data || !data.items || !data.events) { toast('Ce fichier n’est pas une sauvegarde Rewind.', '', 3000); return; }
      confirmBox('Importer cette sauvegarde ?', `Elle contient ${plural(Object.keys(data.items).length, 'œuvre')} et ${plural(data.events.length, 'événement')}. Tes données actuelles seront remplacées.`, 'Importer', () => {
        // les sauvegardes ne contiennent plus les clés : on garde celles de ce téléphone
        const keys = { tmdbKey: state.settings.tmdbKey, rawgKey: state.settings.rawgKey };
        state = migrate(data); for (const k in keys) if (!state.settings[k]) state.settings[k] = keys[k];
        checkUnlocks(true); save(); toast('Sauvegarde importée', 'gold'); location.hash = '#encours'; render(); });
    });
    el.value = '';
  }
});
// saisie : garde le formulaire catch quand on change de type, et filtre local de la bibliothèque (sans re-rendu)
function keepCatchField(e) { const k = e.target.dataset && e.target.dataset.keep; if (k && e.target.closest('form[data-form="catch-add"]')) { ui.add.cf = ui.add.cf || {}; ui.add.cf[k] = e.target.value; } }
document.addEventListener('change', keepCatchField);
document.addEventListener('input', (e) => {
  keepCatchField(e);
  if (e.target.dataset.filter !== 'bib') return;
  const raw = e.target.value.trim(); const q = raw.toLowerCase(); let shown = 0;
  document.querySelectorAll('.mcard[data-title]').forEach((t) => { const ok = !q || t.dataset.title.includes(q); t.style.display = ok ? '' : 'none'; if (ok) shown++; });
  const slot = document.querySelector('.es-search');
  if (slot) { const none = !!q && !shown; slot.hidden = !none; slot.innerHTML = none ? searchEmptyHtml(raw, slot.dataset.type, slot.dataset.st) : ''; }
});
// images qui ne chargent pas : on garde le dégradé
document.addEventListener('error', (e) => {
  const img = e.target; if (!img || img.tagName !== 'IMG') return;
  const p = img.parentNode; if (p && p.classList && p.classList.contains('has-logo')) p.classList.remove('has-logo');
  img.remove();
}, true);
window.addEventListener('hashchange', () => { if (ui.modal) ui.modal = null; render(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.modal) closeModal(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
window.addEventListener('pagehide', () => { flush(); });

/* =========================================================
   13. Données de démonstration
   ========================================================= */
function seedState() {
  if (!Object.values(state.items).some((i) => i.type === 'catch')) {
    createItem({ type: 'catch', title: 'AEW Dynamite', status: 'encours', ended: false, src: { api: 'manuel' }, seasons: [{ n: 1, name: 'Épisodes', count: 0, eps: [] }], createdAt: now() - 1000, updatedAt: now() - 1000 });
  }
}
function loadDemo() {
  const s0 = state.settings; const keep = { tmdbKey: s0.tmdbKey, rawgKey: s0.rawgKey, pseudo: s0.pseudo || '', avatar: s0.avatar || '', avatarSrc: s0.avatarSrc || '' };
  state = freshState(); Object.assign(state.settings, keep); state.demo = true;
  const T = now(); const d = (days, h) => T - days * DAY + (h || 0) * 3600000;
  const serie = createItem({ type: 'serie', title: 'Station Zéro', year: '2025', status: 'encours', runtime: 44, overview: 'Exemple de série (données de démonstration).',
    seasons: [{ n: 1, name: 'Saison 1', count: 8, eps: ['Signal perdu', 'Quai 9', 'Les Invités', 'Pression', 'Zone froide', 'La Passerelle', 'Dernier relais', 'Cap sur Zéro'].map((t) => ({ t })) },
      { n: 2, name: 'Saison 2', count: 9, eps: ['Retour d’écho', 'Sas', 'Fréquence 12', 'Nuit blanche', 'Le Couloir', 'Bruit blanc', 'Les Registres', 'Contact', 'Station Zéro'].map((t) => ({ t })) }] });
  for (let e = 1; e <= 8; e++) setDone(serie, 's1e' + e, true, d(40 - e * 3));
  checkBonuses(serie, d(17));
  for (let e = 1; e <= 4; e++) setDone(serie, 's2e' + e, true, d(10 - e * 2));
  touched(serie, d(2)); serie.updatedAt = d(1);
  const kokai = createItem({ type: 'serie', title: 'Kōkai Ryū', year: '2024', status: 'encours', ended: false, runtime: 24, seasons: [{ n: 1, name: 'Épisodes', count: 64, eps: null }] });
  kokai.catchup = true; for (let e = 1; e <= 30; e++) setDone(kokai, 's1e' + e, true, d(60));
  kokai.catchup = false; for (let e = 31; e <= 41; e++) setDone(kokai, 's1e' + e, true, d(45 - e));
  touched(kokai); kokai.updatedAt = d(3);
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
  catchAdd({ fed: 'APC', show: 'Gala APC', kind: 'show', mode: 'direct', ts: d(16) });
  state.shows.demoS = { id: 'demoS', fed: 'KHAO', name: 'Show KHAO (démo)', kind: 'show', ts: now() + 5 * DAY, poster: '', seen: null, dismissed: false, createdAt: now() };
  catchAdd({ fed: 'Stardom', show: 'Stardom World', kind: 'hebdo', mode: 'differe', ts: d(5) });
  state.settings.catchTrialStart = d(9);
  checkUnlocks(true); save(); location.hash = '#encours'; render();
}

/* =========================================================
   14. Démarrage
   ========================================================= */
async function init() {
  try { await store.open(); } catch (e) { /* repli localStorage */ }
  const saved = await store.get('state');
  if (saved) {
    state = migrate(await rehydrate(saved));
  } else seedState();
  delete state.imgStore;
  checkUnlocks(true);
  if (state.recapPending) ui.fs = [{ t: 'recap' }];
  render();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* */ }
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    const hadSw = !!navigator.serviceWorker.controller; let reloading = false;
    // nouvelle version installée : on recharge une fois, après avoir sauvegardé
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!hadSw || reloading) return; reloading = true; Promise.resolve(flush()).finally(() => location.reload()); });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {});
  }
  setTimeout(() => enrichTmdb().catch(() => {}), 4000);
  if (navigator.onLine !== false) syncSport().catch(() => {}).then(() => setTimeout(() => syncNba().catch(() => {}), 20000));
  save();
}
init();
