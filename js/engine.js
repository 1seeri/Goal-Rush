// =============================================================
//  engine.js — the tournament brain.
//  Pure functions only (no DOM), so the exact same code runs in
//  the page, in the Monte Carlo Web Worker, and in Node tests.
// =============================================================

export const STAGES = {
  'Round of 32': 'R32', 'Round of 16': 'R16', 'Quarter-final': 'QF',
  'Semi-final': 'SF', 'Match for third place': '3P', 'Final': 'F'
};
export const STAGE_NAMES = { G: 'Group stage', R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarter-finals', SF: 'Semi-finals', '3P': 'Third place', F: 'Final' };

// ---- Round of 32 template (FIFA 2026 match schedule) ----------
// '1A' = winner of Group A, '2B' = runner-up of Group B,
// '3:ABCDF' = one of the best third-placed teams, from groups A/B/C/D/F.
export const R32 = [
  { num: 73, a: '2A', b: '2B' }, { num: 74, a: '1E', b: '3:ABCDF' },
  { num: 75, a: '1F', b: '2C' }, { num: 76, a: '1C', b: '2F' },
  { num: 77, a: '1I', b: '3:CDFGH' }, { num: 78, a: '2E', b: '2I' },
  { num: 79, a: '1A', b: '3:CEFHI' }, { num: 80, a: '1L', b: '3:EHIJK' },
  { num: 81, a: '1D', b: '3:BEFIJ' }, { num: 82, a: '1G', b: '3:AEHIJ' },
  { num: 83, a: '2K', b: '2L' }, { num: 84, a: '1H', b: '2J' },
  { num: 85, a: '1B', b: '3:EFGIJ' }, { num: 86, a: '1J', b: '2H' },
  { num: 87, a: '1K', b: '3:DEIJL' }, { num: 88, a: '2D', b: '2G' }
];

// ---- Later rounds: W = winner of match, L = loser of match ----
export const KO = [
  { num: 89, a: 'W74', b: 'W77' }, { num: 90, a: 'W73', b: 'W75' },
  { num: 91, a: 'W76', b: 'W78' }, { num: 92, a: 'W79', b: 'W80' },
  { num: 93, a: 'W83', b: 'W84' }, { num: 94, a: 'W81', b: 'W82' },
  { num: 95, a: 'W86', b: 'W88' }, { num: 96, a: 'W85', b: 'W87' },
  { num: 97, a: 'W89', b: 'W90' }, { num: 98, a: 'W93', b: 'W94' },
  { num: 99, a: 'W91', b: 'W92' }, { num: 100, a: 'W95', b: 'W96' },
  { num: 101, a: 'W97', b: 'W98' }, { num: 102, a: 'W99', b: 'W100' },
  { num: 103, a: 'L101', b: 'L102' }, { num: 104, a: 'W101', b: 'W102' }
];
export const BRACKET = [...R32, ...KO];
export const STAGE_OF = n => n <= 72 ? 'G' : n <= 88 ? 'R32' : n <= 96 ? 'R16' : n <= 100 ? 'QF' : n <= 102 ? 'SF' : n === 103 ? '3P' : 'F';

// ---- Normalise the raw open data into one clean match list ----
export function normalise(raw, groupsRaw) {
  const groups = {};
  for (const g of groupsRaw.groups) groups[g.name.replace('Group ', '')] = g.teams.slice();
  let n = 0;
  const matches = raw.matches.map(m => {
    const num = m.num ?? ++n;
    const s = m.score || {};
    return {
      num, stage: STAGE_OF(num),
      group: m.group ? m.group.replace('Group ', '') : null,
      date: m.date, time: m.time, ground: m.ground,
      t1: m.team1, t2: m.team2,
      ft: s.ft || null, ht: s.ht || null, et: s.et || null, p: s.p || null,
      goals1: m.goals1 || [], goals2: m.goals2 || []
    };
  });
  return { groups, matches };
}

// Final score shown on a scoreboard (after extra time if played)
export const finalScore = m => m.et || m.ft;

// Winner of a decided knockout match (handles ET + penalties)
export function winnerOf(m) {
  if (!m || !m.ft) return null;
  const s = finalScore(m);
  if (s[0] !== s[1]) return s[0] > s[1] ? m.t1 : m.t2;
  if (m.p) return m.p[0] > m.p[1] ? m.t1 : m.t2;
  return null;
}
export const loserOf = m => { const w = winnerOf(m); return w ? (w === m.t1 ? m.t2 : m.t1) : null; };

// ---- Group table with the FIFA 2026 tiebreakers ----------------
// 1) points  2) head-to-head points/GD/GF among the tied teams
// 3) overall GD  4) overall GF  5) drawing of lots (we fall back
// to a fixed seed order so results are deterministic).
function blankRow(team) { return { team, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: [] }; }

function accumulate(rows, games) {
  for (const m of games) {
    const [a, b] = m.ft;
    const r1 = rows[m.t1], r2 = rows[m.t2];
    if (!r1 || !r2) continue;
    r1.p++; r2.p++;
    r1.gf += a; r1.ga += b; r2.gf += b; r2.ga += a;
    if (a > b) { r1.w++; r2.l++; r1.pts += 3; r1.form.push('W'); r2.form.push('L'); }
    else if (b > a) { r2.w++; r1.l++; r2.pts += 3; r2.form.push('W'); r1.form.push('L'); }
    else { r1.d++; r2.d++; r1.pts++; r2.pts++; r1.form.push('D'); r2.form.push('D'); }
  }
  for (const r of Object.values(rows)) r.gd = r.gf - r.ga;
  return rows;
}

export function groupTable(teams, games) {
  const rows = {};
  teams.forEach(t => (rows[t] = blankRow(t)));
  accumulate(rows, games);
  const seed = Object.fromEntries(teams.map((t, i) => [t, i]));

  const sortTied = (tied) => {
    if (tied.length < 2) return tied;
    // head-to-head mini table among only the tied teams
    const names = new Set(tied.map(r => r.team));
    const h2h = {}; tied.forEach(r => (h2h[r.team] = blankRow(r.team)));
    accumulate(h2h, games.filter(m => names.has(m.t1) && names.has(m.t2)));
    const key = r => [h2h[r.team].pts, h2h[r.team].gd, h2h[r.team].gf, r.gd, r.gf, -seed[r.team]];
    return tied.slice().sort((x, y) => cmpKeys(key(y), key(x)));
  };

  const byPts = Object.values(rows).sort((x, y) => y.pts - x.pts);
  const out = [];
  for (let i = 0; i < byPts.length;) {
    let j = i; while (j < byPts.length && byPts[j].pts === byPts[i].pts) j++;
    out.push(...sortTied(byPts.slice(i, j)));
    i = j;
  }
  out.forEach((r, i) => (r.pos = i + 1));
  return out;
}

function cmpKeys(a, b) { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }

// Rank the 12 third-placed teams: points, GD, GF, then seed.
export function rankThirds(tables) {
  const thirds = Object.entries(tables).map(([g, t]) => ({ ...t[2], group: g }));
  return thirds.sort((x, y) => cmpKeys([y.pts, y.gd, y.gf, -y.group.charCodeAt(0)], [x.pts, x.gd, x.gf, -x.group.charCodeAt(0)]));
}

// ---- Constraint solver: place 8 third-placed teams in 8 slots ---
// Each slot only accepts teams from certain groups. This is a
// bipartite matching problem; we solve it with backtracking,
// trying the most constrained slot first (MRV heuristic).
// FIFA publishes a fixed lookup for all 495 combinations. We embed the
// official row for the combination that actually happened; any other
// (what-if) combination is solved by the constraint solver below.
export const OFFICIAL_THIRDS = {
  BDEFIJKL: { 74: 'D', 77: 'F', 79: 'E', 80: 'K', 81: 'B', 82: 'I', 85: 'J', 87: 'L' }
};
export function assignThirds(qualifiedGroups) {
  const key = qualifiedGroups.slice().sort().join('');
  if (OFFICIAL_THIRDS[key]) return { ok: true, map: { ...OFFICIAL_THIRDS[key] }, steps: 0, official: true };
  const slots = R32.filter(s => s.b.startsWith('3:')).map(s => ({ num: s.num, allowed: s.b.slice(2) }));
  const avail = new Set(qualifiedGroups);
  const result = {};
  let steps = 0;
  function solve(remaining) {
    if (!remaining.length) return true;
    // choose the slot with the fewest legal options
    remaining.sort((x, y) => opts(x).length - opts(y).length);
    const [slot, ...rest] = remaining;
    for (const g of opts(slot)) {
      steps++;
      avail.delete(g); result[slot.num] = g;
      if (solve(rest.slice())) return true;
      avail.add(g); delete result[slot.num];
    }
    return false;
  }
  const opts = s => [...s.allowed].filter(g => avail.has(g));
  const ok = solve(slots.slice());
  return { ok, map: result, steps };
}

// ---- Resolve the whole bracket from (possibly edited) results --
// `matches` is the full list. Returns per knockout match: who plays,
// and the winner (only if a real/edited result exists for THAT pairing,
// or the user picked a winner).
export function buildTournament(groups, matches, opts = {}) {
  const { upTo = null, picks = {} } = opts;
  const played = m => m.ft && (!upTo || m.date <= upTo);
  const byNum = Object.fromEntries(matches.map(m => [m.num, m]));

  const tables = {};
  let groupsDone = true;
  for (const [g, teams] of Object.entries(groups)) {
    const games = matches.filter(m => m.group === g && played(m));
    if (games.length < 6) groupsDone = false;
    tables[g] = groupTable(teams, games);
  }
  const thirds = rankThirds(tables);
  const bestThirds = thirds.slice(0, 8).map(t => t.group);
  const thirdMap = groupsDone ? assignThirds(bestThirds) : { ok: false, map: {} };

  const ko = {};
  const resolveCode = (code, num) => {
    if (code.startsWith('3:')) {
      const g = thirdMap.map[num]; return g && groupsDone ? tables[g][2].team : null;
    }
    if (code[0] === 'W' || code[0] === 'L') {
      const src = ko[+code.slice(1)]; if (!src) return null;
      return code[0] === 'W' ? src.winner : src.loser;
    }
    if (!groupsDone) return null;
    return tables[code[1]][+code[0] - 1].team;
  };

  for (const s of BRACKET) {
    const t1 = resolveCode(s.a, s.num), t2 = resolveCode(s.b, s.num);
    const real = byNum[s.num];
    let winner = null, result = null;
    if (t1 && t2) {
      if (real && played(real) && real.t1 === t1 && real.t2 === t2) { result = real; winner = winnerOf(real); }
      else if (picks[s.num] && (picks[s.num] === t1 || picks[s.num] === t2)) winner = picks[s.num];
    }
    ko[s.num] = { num: s.num, slotA: s.a, slotB: s.b, t1, t2, result, winner, loser: winner ? (winner === t1 ? t2 : t1) : null, stage: STAGE_OF(s.num) };
  }
  return { tables, thirds, bestThirds, thirdMap, ko, groupsDone, champion: ko[104].winner };
}

// ---- Stats ------------------------------------------------------
export function scorers(matches) {
  const map = {};
  for (const m of matches) {
    for (const [goals, team] of [[m.goals1, m.t1], [m.goals2, m.t2]]) {
      for (const g of goals) {
        if (g.owngoal) continue;
        const k = g.name + '|' + team;
        (map[k] ||= { name: g.name, team, goals: 0, pens: 0, matches: new Set() });
        map[k].goals++; if (g.penalty) map[k].pens++; map[k].matches.add(m.num);
      }
    }
  }
  return Object.values(map).map(s => ({ ...s, matches: s.matches.size })).sort((a, b) => b.goals - a.goals || a.pens - b.pens || a.name.localeCompare(b.name));
}

export function teamStats(team, matches) {
  const s = { team, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, cs: 0, comeback: 0, lateGoals: 0, pens: 0, furthest: 'G' };
  const order = ['G', 'R32', 'R16', 'QF', 'SF', '3P', 'F'];
  for (const m of matches) {
    if (!m.ft || (m.t1 !== team && m.t2 !== team)) continue;
    const home = m.t1 === team, sc = finalScore(m);
    const [f, a] = home ? sc : [sc[1], sc[0]];
    s.p++; s.gf += f; s.ga += a; if (a === 0) s.cs++;
    const w = m.stage === 'G' ? (f > a ? team : f < a ? 'x' : null) : winnerOf(m);
    if (w === team) s.w++; else if (w === null) s.d++; else s.l++;
    const ht = m.ht && (home ? m.ht : [m.ht[1], m.ht[0]]);
    if (ht && ht[0] < ht[1] && w === team) s.comeback++;
    for (const g of (home ? m.goals1 : m.goals2)) if (parseInt(g.minute) >= 80) s.lateGoals++;
    if (order.indexOf(m.stage) > order.indexOf(s.furthest)) s.furthest = m.stage;
  }
  return s;
}

// Fuzzy search: subsequence match with scoring, accent-insensitive
export const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function fuzzy(query, text) {
  const q = fold(query).replace(/\s+/g, ''), t = fold(text);
  if (!q) return 1;
  if (t.includes(fold(query))) return 100 - t.indexOf(fold(query));
  let ti = 0, score = 0, run = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return 0;
    run = found === ti ? run + 1 : 0; score += 1 + run * 2; ti = found + 1;
  }
  return score;
}
