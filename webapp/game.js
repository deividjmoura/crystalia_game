/* ═══════════════════════════════════════════════════════════════════
   Crystalia — cliente web (landing → menu → ilha de Ignara)

   O cliente NUNCA decide posição, dano, cooldown ou morte: ele envia
   intenções (move_input / use_dom_fogo) e interpola o estado
   autoritativo que o servidor publica a 20 ticks/s (docs/PROTOCOL.md).

   Fluxo: Landing → Menu (nome) → WebSocket → HUD "Ao vivo".
   Sem servidor? Modo Demo local (visual, bots de treino).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/* ───────────────────────── Utilidades ───────────────────────── */
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);

// RNG com semente — decoração da ilha idêntica em todos os clientes.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toast(msg, ms = 3200) {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/* ───────────────────────── Estado global ───────────────────────── */
const UNIT = 44; // px por unidade de mundo (mistica do servidor: 32→44 visual)
const DEFAULT_WORLD = { minX: -16, maxX: 16, minY: -12, maxY: 12 };

const S = {
  screen: 'landing',          // landing | menu | game
  mode: 'offline',            // live | demo | connecting | dead-end
  myId: null,
  myName: 'Aventureiro',
  probedWsUrl: null,          // resolvido pela sonda /health do menu
  world: { ...DEFAULT_WORLD },
  dom: { cost: 25, cooldownMs: 700, damage: 25, speed: 9, range: 7 },
  me: null,                   // ator local (espelhado do servidor)
  remotes: new Map(),         // id → ator remoto
  projectiles: new Map(),     // id → projétil visual
  particles: [],              // partículas efêmeras
  demo: false,
  demoBots: [],
  demoProj: [],
  demoKills: 0,
  lastDomAt: 0,
  deathShownAt: 0,
  shake: 0,
};

/* ───────────────────── Navegação entre telas ───────────────────── */
const screens = { landing: $('landing'), menu: $('menu'), game: $('game') };
function show(name) {
  S.screen = name;
  for (const [k, el] of Object.entries(screens)) {
    el.classList.toggle('hidden', k !== name);
  }
  $('hud').classList.toggle('hidden', name !== 'game');
  if (name === 'menu') {
    probeServer();
    setTimeout(() => $('menuName').select(), 60);
  }
}

$('btnGuest').addEventListener('click', () => show('menu'));
$('navPlay').addEventListener('click', () => show('menu'));
$('btnPlayNow').addEventListener('click', () => show('menu'));
$('btnDemoQuick').addEventListener('click', () => startGame(true));
$('btnGoogle').addEventListener('click', () =>
  toast('Login Google chega em breve — entre como visitante 😉'));
$('btnExit').addEventListener('click', backToMenu);

function backToMenu() {
  leaveGame();
  show('menu');
}

/* ─────────────────── Endereço do servidor ─────────────────── */
// Servidor de produção (usado quando o site é estático, ex.: Netlify).
const FALLBACK_SERVER = 'wss://crystalia-server.onrender.com';

// Origens candidatas, em ordem: ?server= → config.js → mesma origem
// (quando o jogo é servido pelo próprio servidor autoritativo) → produção.
function candidateOrigins() {
  const override = new URLSearchParams(location.search).get('server');
  if (override) return [override];
  if (window.CRYSTALIA_WS_URL) return [window.CRYSTALIA_WS_URL];
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const sameOrigin = proto + '//' + location.host + '/';
  const list = [sameOrigin];
  const h = location.hostname;
  const isLocalGame = h === 'localhost' || h === '127.0.0.1' ||
    h.endsWith('.e2b.app') || h.endsWith('.onrender.com');
  if (!isLocalGame) list.push(FALLBACK_SERVER);
  return list;
}

function httpOriginOf(wsUrl) {
  try {
    const u = new URL(wsUrl);
    return `${u.protocol === 'wss:' ? 'https:' : 'http:'}//${u.host}`;
  } catch { return location.origin; }
}

// Nome via ?name= (deep-link) ou padrão do input do menu.
const qsName = new URLSearchParams(location.search).get('name');
if (qsName) $('menuName').value = qsName.slice(0, 20);

function chosenName() {
  const clean = $('menuName').value.trim().slice(0, 20);
  return clean || `Visitante${Math.floor(rand(100, 999))}`;
}

/* ─────────────────── Sonda de status (menu) ─────────────────── */
let probeTimer = null;
let probePromise = null;

async function probeServer() {
  const dot = document.querySelector('#srvPill .pill-dot');
  const txt = $('srvPillTxt');
  dot.className = 'pill-dot wait';
  txt.textContent = 'Verificando servidor…';
  clearTimeout(probeTimer);

  probePromise = (async () => {
    for (const base of candidateOrigins()) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1600);
        const r = await fetch(httpOriginOf(base) + '/health', { signal: ctrl.signal });
        clearTimeout(t);
        if (r.ok) {
          S.probedWsUrl = base;
          dot.className = 'pill-dot ok';
          txt.textContent = 'Servidor online — multiplayer real disponível';
          return base;
        }
      } catch { /* tenta a próxima origem */ }
    }
    S.probedWsUrl = null;
    dot.className = 'pill-dot down';
    txt.textContent = 'Servidor offline — Modo Demo disponível';
    return null;
  })();

  await probePromise;
  probeTimer = setTimeout(probeServer, 10000);
}

function wsBase() {
  const override = new URLSearchParams(location.search).get('server');
  if (override) return override;
  if (window.CRYSTALIA_WS_URL) return window.CRYSTALIA_WS_URL;
  if (S.probedWsUrl) return S.probedWsUrl;
  return candidateOrigins()[0];
}

/* ═══════════════════ CONEXÃO AUTORITATIVA ═══════════════════ */
let ws = null;
let wsAttempts = 0;
let wsWantClose = false;
let inputTimer = null;

function setNet(state, detail) {
  const txt = $('netTxt');
  const key = state + '|' + (detail || '');
  if (S._netKey === key) return;
  S._netKey = key;
  const dot = $('netDot');
  if (state === 'live') {
    dot.className = 'pill-dot ok';
    txt.textContent = detail || 'Ao vivo · 20 ticks/s';
  } else if (state === 'connecting') {
    dot.className = 'pill-dot wait';
    txt.textContent = detail || 'Conectando…';
  } else if (state === 'demo') {
    dot.className = 'pill-dot wait';
    txt.textContent = 'Modo demo (offline)';
  } else {
    dot.className = 'pill-dot down';
    txt.textContent = detail || 'Servidor indisponível';
  }
}

function connect() {
  const url = new URL(wsBase());
  url.searchParams.set('name', S.myName);
  setNet('connecting');
  try { ws = new WebSocket(url.toString()); }
  catch { return enterDemo('Não consegui abrir o WebSocket — demo local!'); }

  ws.onopen = () => {
    wsAttempts = 0;
    if (S.demo) stopDemo();
    S.mode = 'live';
    setNet('connecting', 'Conectado — esperando primeiro tick…');
    toast(`Bem-vindo à Ignara, ${S.myName}!`);
    inputTimer = setInterval(sendMoveInput, 66);
  };

  ws.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    handleServerMessage(m);
  };

  ws.onclose = () => {
    clearInterval(inputTimer);
    if (wsWantClose) return;
    wsAttempts++;
    if (wsAttempts > 12) {
      enterDemo('Servidor não respondeu após 12 tentativas — abrindo MODO DEMO.');
    } else {
      setNet('connecting', `Reconectando (${wsAttempts}/12)…`);
      setTimeout(connect, Math.min(800 * 1.3 ** wsAttempts, 3000));
    }
  };

  ws.onerror = () => { /* onclose vem junto */ };
}

function leaveGame() {
  wsWantClose = true;
  clearInterval(inputTimer);
  if (ws) { try { ws.close(1000, 'sair'); } catch {} ws = null; }
  stopDemo();
  S.remotes.clear(); S.projectiles.clear(); S.particles.length = 0;
  S.myId = null; S.me = null; S.demoKills = 0;
  $('deathOverlay').classList.add('hidden');
  $('hudKills').textContent = '0';
}

function sendMoveInput() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const dx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
             (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const dy = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) -
             (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  let jx = 0, jy = 0;
  if (joystick.active) { jx = joystick.dx; jy = joystick.dy; }
  const last = S._lastInput || {};
  const nx = clamp(dx + jx, -1, 1), ny = clamp(dy + jy, -1, 1);
  if (last.dx !== nx || last.dy !== ny || (nx === 0 && ny === 0 && !last.zeroSent)) {
    ws.send(JSON.stringify({ type: 'move_input', dx: nx, dy: ny }));
    S._lastInput = { dx: nx, dy: ny, zeroSent: nx === 0 && ny === 0 };
  }
}

function tryDom() {
  const now = performance.now();
  if (now - S.lastDomAt < 120) return; // debounce do botão/tecla
  S.lastDomAt = now;
  if (S.demo) { demoCast(); return; }
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'use_dom_fogo' }));
    pulseDomButton();
  }
}

function pulseDomButton() {
  const b = $('btnDom');
  b.classList.add('cooldown');
  setTimeout(() => b.classList.remove('cooldown'), S.dom.cooldownMs * 0.5);
}

/* ─────────────── Mensagens do servidor (protocolo v1.1) ─────────────── */
function handleServerMessage(m) {
  switch (m.type) {
    case 'welcome': {
      S.myId = m.sessionId;
      if (m.world) S.world = m.world;
      if (m.dom) S.dom = m.dom;
      buildDecor();
      break;
    }
    case 'state': {
      if (S.mode !== 'live') return;
      const seen = new Set();
      for (const [id, p] of Object.entries(m.players || {})) {
        seen.add(id);
        if (id === S.myId) {
          if (!S.me) S.me = makeActor(p.displayName || S.myName, true);
          updateActor(S.me, p);
        } else {
          let r = S.remotes.get(id);
          if (!r) {
            r = makeActor(p.displayName || 'Aventureiro', false);
            S.remotes.set(id, r);
            toast(`✨ ${r.name} entrou na ilha`, 2200);
          }
          updateActor(r, p);
        }
      }
      for (const id of [...S.remotes.keys()]) {
        if (!seen.has(id)) S.remotes.delete(id);
      }
      // Projéteis autoritativos → visuais interpolados
      const seenProj = new Set();
      for (const p of m.projectiles || []) {
        seenProj.add(p.id);
        let v = S.projectiles.get(p.id);
        if (!v) {
          v = { id: p.id, x: p.x, y: p.y, rx: p.x, ry: p.y, dx: p.dx, dy: p.dy };
          S.projectiles.set(p.id, v);
        }
        v.x = p.x; v.y = p.y; v.dx = p.dx; v.dy = p.dy;
      }
      for (const id of [...S.projectiles.keys()]) {
        if (!seenProj.has(id)) S.projectiles.delete(id);
      }
      if (S.me) setNet('live');
      break;
    }
    case 'event': handleEvent(m); break;
    case 'player_left': {
      const r = S.remotes.get(m.sessionId);
      if (r) {
        toast(`👋 ${r.name} saiu da ilha`, 2200);
        S.remotes.delete(m.sessionId);
      }
      break;
    }
    case 'kicked': {
      if (m.reason === 'reconnected_elsewhere') {
        toast('Você abriu o jogo em outro lugar — esta aba voltou ao menu.');
        backToMenu();
      } else if (m.reason === 'message_flood') {
        toast('Calma aí, ninja do spam 😅 — conexão reiniciada.');
      }
      break;
    }
  }
}

function makeActor(name, isLocal) {
  return {
    name, isLocal,
    x: 0, y: 0, rx: 0, ry: 0,          // alvo + render (interpolação)
    dirX: 1, dirY: 0, face: 1,
    hp: 100, maxHp: 100, energy: 100, maxEnergy: 100,
    alive: true, kills: 0,
    alpha: 0,                            // fade-in
  };
}

function updateActor(a, p) {
  const wasAlive = a.alive;
  a.x = p.x; a.y = p.y;
  a.dirX = p.dirX ?? a.dirX; a.dirY = p.dirY ?? a.dirY;
  if (p.dirX < -0.15) a.face = -1; else if (p.dirX > 0.15) a.face = 1;
  a.hp = p.hp; a.maxHp = p.maxHp ?? a.maxHp;
  a.energy = p.energy; a.maxEnergy = p.maxEnergy ?? a.maxEnergy;
  a.alive = p.alive; a.kills = p.kills ?? a.kills;
  if (wasAlive && !a.alive && a.isLocal) {
    $('deathOverlay').classList.remove('hidden');
  }
  if (!wasAlive && a.alive && a.isLocal) {
    $('deathOverlay').classList.add('hidden');
    toast('🔥 Renascido na forja da ilha — HP e energia cheios!');
  }
}

function handleEvent(m) {
  const name = m.name;
  if (name === 'dom_fogo_cast') {
    const caster = m.sessionId === S.myId ? S.me : S.remotes.get(m.sessionId);
    burst(m.x, m.y, 10, ['#ffd166', '#ff7a1a'], 2.4);
    ring(m.x, m.y, '#ffb14d');
    if (m.sessionId === S.myId) S.shake = Math.max(S.shake, 2);
    void caster;
  } else if (name === 'projectile_hit') {
    burst(m.x, m.y, 16, ['#fff3b0', '#ffb14d', '#ff5e1a'], 3.4);
    ring(m.x, m.y, '#ff7a1a');
    const victim = m.sessionId === S.myId;
    const near = S.me && Math.hypot(S.me.x - m.x, S.me.y - m.y) < 5;
    if (victim) S.shake = Math.max(S.shake, 5);
    else if (near) S.shake = Math.max(S.shake, 2.5);
  } else if (name === 'player_died') {
    const a = m.sessionId === S.myId ? S.me : S.remotes.get(m.sessionId);
    if (a) burst(a.x, a.y, 22, ['#9aa4b8', '#5b6478', '#3b4252'], 3);
    if (m.killerId === S.myId && m.sessionId !== S.myId) {
      toast('⚔️ Você derrotou um aventureiro!', 2400);
      S.shake = Math.max(S.shake, 4);
    }
  } else if (name === 'player_respawned') {
    ring(0, 0, '#ffd166');
    burst(0, 0, 14, ['#ffd166', '#ff9a3c'], 2.6);
  }
}

/* ═══════════════════ MODO DEMO (offline) ═══════════════════ */
let demoTimers = [];

function enterDemo(reason) {
  S.demo = true;
  S.mode = 'demo';
  wsWantClose = true;
  if (ws) { try { ws.close(1000, 'demo'); } catch {} ws = null; }
  clearInterval(inputTimer);

  if (reason) toast(reason, 4200);
  setNet('demo');
  $('hudMode').classList.remove('hidden');

  // Estado local espelhando o formato do servidor.
  S.world = { ...DEFAULT_WORLD };
  S.dom = { cost: 25, cooldownMs: 700, damage: 25, speed: 9, range: 7 };
  buildDecor();
  S.me = makeActor(S.myName, true);
  S.demoKills = 0;

  const names = ['Recruta Brasa', 'Cinzento', 'Faísca'];
  S.demoBots = names.map((n, i) => ({
    name: n, isLocal: false, bot: true,
    x: [4, -5, 2][i], y: [-3, 4, 6][i], rx: 0, ry: 0,
    hp: 100, maxHp: 100, alive: true, face: 1, alpha: 0,
    tx: 0, ty: 0, think: 0, respawnAt: 0,
  }));
  for (const b of S.demoBots) { b.rx = b.x; b.ry = b.y; pickBotTarget(b); }

  demoTimers.forEach(clearInterval);
  demoTimers = [
    setInterval(demoStep, 50),          // "tick" 20 Hz do demo
    setInterval(demoRegen, 250),
  ];
}

function stopDemo() {
  S.demo = false;
  demoTimers.forEach(clearInterval);
  demoTimers = [];
  S.demoBots = []; S.demoProj = [];
  S.demoKills = 0;
  $('hudMode').classList.add('hidden');
}

function pickBotTarget(b) {
  b.tx = rand(S.world.minX + 2, S.world.maxX - 2);
  b.ty = rand(S.world.minY + 2, S.world.maxY - 2);
  b.think = rand(2500, 5200);
}

function demoStep() {
  const dt = 0.05;

  // Movimento do herói local no demo (mesma física do servidor: 4 un/s,
  // diagonal normalizada, clamp aos limites da ilha).
  if (S.me) {
    const kd = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
               (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const ky = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) -
               (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
    const jx = joystick.active ? joystick.dx : 0;
    const jy = joystick.active ? joystick.dy : 0;
    let ix = clamp(kd + jx, -1, 1), iy = clamp(ky + jy, -1, 1);
    const m = Math.hypot(ix, iy);
    if (m > 1) { ix /= m; iy /= m; }
    S.me.x = clamp(S.me.x + ix * 4 * dt, S.world.minX, S.world.maxX);
    S.me.y = clamp(S.me.y + iy * 4 * dt, S.world.minY, S.world.maxY);
    if (m > 0.01) { S.me.dirX = ix / Math.max(m, 1); S.me.dirY = iy / Math.max(m, 1); }
    if (ix < -0.15) S.me.face = -1; else if (ix > 0.15) S.me.face = 1;
  }

  for (const b of S.demoBots) {
    if (!b.alive) {
      if (performance.now() >= b.respawnAt) {
        b.alive = true; b.hp = 100;
        b.x = rand(-6, 6); b.y = rand(-6, 6); b.rx = b.x; b.ry = b.y;
        ring(b.x, b.y, '#ffd166');
      }
      continue;
    }
    b.think -= dt * 1000;
    if (b.think <= 0) pickBotTarget(b);
    const dx = b.tx - b.x, dy = b.ty - b.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.3) {
      b.x += (dx / d) * 1.4 * dt;
      b.y += (dy / d) * 1.4 * dt;
      if (dx < -0.05) b.face = -1; else if (dx > 0.05) b.face = 1;
    }
  }

  // Projéteis locais do demo (simulação de exibição, 100% local).
  for (const p of [...S.demoProj]) {
    p.x += p.dx * S.dom.speed * dt;
    p.y += p.dy * S.dom.speed * dt;
    p.traveled += S.dom.speed * dt;
    if (Math.random() < 0.6) {
      S.particles.push(makeParticle(p.x, p.y, rand(-0.3, 0.3), rand(-0.8, -0.2), 0.35, rand(2, 4), '#ff9a3c'));
    }
    let hit = null;
    for (const b of S.demoBots) {
      if (!b.alive) continue;
      if (Math.hypot(b.x - p.x, b.y - p.y) <= 0.6) { hit = b; break; }
    }
    if (hit) {
      hit.hp -= S.dom.damage;
      burst(p.x, p.y, 14, ['#fff3b0', '#ffb14d', '#ff5e1a'], 3);
      ring(p.x, p.y, '#ff7a1a');
      S.shake = Math.max(S.shake, 2.5);
      if (hit.hp <= 0) {
        hit.alive = false; hit.hp = 0;
        hit.respawnAt = performance.now() + 3000;
        S.demoKills++;
        if (S.me) S.me.kills = S.demoKills;
        burst(hit.x, hit.y, 20, ['#9aa4b8', '#5b6478'], 3);
        toast('⚔️ Recruta de treino derrotado!', 1800);
      }
      S.demoProj.splice(S.demoProj.indexOf(p), 1);
    } else if (p.traveled >= S.dom.range) {
      burst(p.x, p.y, 6, ['#ff9a3c'], 1.8);
      S.demoProj.splice(S.demoProj.indexOf(p), 1);
    }
  }

  // HUD do demo
  if (S.me) {
    S.me.hp = clamp(S.me.hp, 0, 100);
    updateHudBars();
  }
}

function demoRegen() {
  if (!S.me) return;
  S.me.energy = clamp(S.me.energy + 5 * 0.25, 0, 100);
}

function demoCast() {
  const now = performance.now();
  if (!S.me || !S.me.alive) return;
  // Timestamp próprio (tryDom usa S.lastDomAt só como debounce de 120ms).
  if (now - (S._demoLastCast || 0) < S.dom.cooldownMs) return;
  if (S.me.energy < S.dom.cost) { toast('Energia insuficiente…', 1400); return; }
  S._demoLastCast = now;
  S.me.energy -= S.dom.cost;
  pulseDomButton();
  const dx = S.me.dirX, dy = S.me.dirY;
  S.demoProj.push({
    x: S.me.x + dx * 0.6, y: S.me.y + dy * 0.6,
    dx, dy, traveled: 0,
  });
  burst(S.me.x + dx * 0.6, S.me.y + dy * 0.6, 8, ['#ffd166', '#ff7a1a'], 2);
  ring(S.me.x + dx * 0.6, S.me.y + dy * 0.6, '#ffb14d');
  S.shake = Math.max(S.shake, 2);
}

/* ═══════════════════ INÍCIO DE PARTIDA ═══════════════════ */
function startGame(demo) {
  S.myName = chosenName();
  $('hudName').textContent = S.myName;
  $('hudKills').textContent = '0';
  $('deathOverlay').classList.add('hidden');
  wsWantClose = false;
  wsAttempts = 0;
  S.me = null;
  show('game');
  resize();
  if (demo) {
    enterDemo(null);
  } else {
    S.demo = false;
    connect();
  }
}

$('btnEnter').addEventListener('click', () => startGame(false));
$('btnMenuDemo').addEventListener('click', () => startGame(true));
$('menuName').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startGame(false);
});
$('menuName').addEventListener('input', () => {
  const v = $('menuName').value.trim();
  $('menuGreet').textContent = v ? `Bem-vindo, ${v}` : 'Bem-vindo, aventureiro';
});

/* ═══════════════════ INPUT (teclado + touch) ═══════════════════ */
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (S.screen !== 'game') return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'Space' || e.code === 'KeyE') tryDom();
  if (e.code === 'Escape') backToMenu();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

// Joystick virtual (metade esquerda da tela)
const joystick = { active: false, dx: 0, dy: 0, id: null, ox: 0, oy: 0 };
const stickEl = $('stick'), knobEl = $('stickKnob');

function stickFromTouch(t) {
  const R = 60;
  let dx = (t.clientX - joystick.ox) / R;
  let dy = (t.clientY - joystick.oy) / R;
  const m = Math.hypot(dx, dy);
  if (m > 1) { dx /= m; dy /= m; }
  joystick.dx = dx; joystick.dy = dy;
  knobEl.style.transform =
    `translate(calc(-50% + ${dx * R}px), calc(-50% + ${dy * R}px))`;
}
stickEl.addEventListener('touchstart', (e) => {
  const t = e.changedTouches[0];
  joystick.id = t.identifier;
  const r = stickEl.getBoundingClientRect();
  joystick.ox = r.left + r.width / 2; joystick.oy = r.top + r.height / 2;
  joystick.active = true;
  stickFromTouch(t);
  e.preventDefault();
}, { passive: false });
stickEl.addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === joystick.id) stickFromTouch(t);
  }
  e.preventDefault();
}, { passive: false });
function stickEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === joystick.id) {
      joystick.active = false; joystick.dx = 0; joystick.dy = 0; joystick.id = null;
      knobEl.style.transform = 'translate(-50%, -50%)';
    }
  }
}
stickEl.addEventListener('touchend', stickEnd);
stickEl.addEventListener('touchcancel', stickEnd);

// Botão do Dom (touch) — o toque na metade direita da tela é registrado
// junto do canvas (mais abaixo, após a declaração dele).
$('btnDom').addEventListener('touchstart', (e) => { e.preventDefault(); tryDom(); }, { passive: false });
$('btnDom').addEventListener('mousedown', (e) => { e.preventDefault(); tryDom(); });

/* ═══════════════════ CANVAS / RENDER ═══════════════════ */
const canvas = $('gameCanvas');
const ctx = canvas.getContext('2d');
let vw = 0, vh = 0, dpr = 1;
let groundPattern = null;
const charImg = new Image();
charImg.src = 'assets/char-kael.png';
const groundImg = new Image();
groundImg.src = 'assets/ground-ignara.png';
groundImg.onload = () => buildGroundPattern();

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  vw = window.innerWidth; vh = window.innerHeight;
  canvas.width = Math.floor(vw * dpr);
  canvas.height = Math.floor(vh * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);

// Toque na metade direita da ilha = Dom de Fogo (além do botão).
canvas.addEventListener('touchstart', (e) => {
  for (const t of e.changedTouches) {
    if (t.clientX > window.innerWidth * 0.55) { tryDom(); break; }
  }
}, { passive: true });

function buildGroundPattern() {
  if (groundImg.complete && groundImg.naturalWidth > 0) {
    groundPattern = ctx.createPattern(groundImg, 'repeat');
  }
}

/* ── Decoração da ilha (determinística por semente) ── */
let crystals = [], lavaPools = [], rocks = [];
function buildDecor() {
  const rng = mulberry32(20260923);
  const W = S.world;
  crystals = []; lavaPools = []; rocks = [];

  const inWorld = (x, y, m = 1) =>
    x > W.minX + m && x < W.maxX - m && y > W.minY + m && y < W.maxY - m;

  // Poças de lava (elipses com glow)
  let guard = 0;
  while (lavaPools.length < 7 && guard++ < 400) {
    const x = rand(W.minX + 3, W.maxX - 3), y = rand(W.minY + 3, W.maxY - 3);
    if (Math.hypot(x, y) < 4) continue;                       // longe do spawn
    if (lavaPools.some((l) => Math.hypot(l.x - x, l.y - y) < 5)) continue;
    lavaPools.push({ x, y, rx: rand(0.9, 1.9), ry: rand(0.6, 1.2), ph: rng() * 6.28 });
  }

  guard = 0;
  while (crystals.length < 26 && guard++ < 800) {
    const x = rand(W.minX + 1.2, W.maxX - 1.2), y = rand(W.minY + 1.2, W.maxY - 1.2);
    if (Math.hypot(x, y) < 3) continue;                       // círculo de spawn livre
    if (lavaPools.some((l) => Math.hypot(l.x - x, l.y - y) < l.rx + 1.2)) continue;
    if (crystals.some((c) => Math.hypot(c.x - x, c.y - y) < 1.4)) continue;
    crystals.push({
      x, y,
      h: rand(14, 30), w: rand(8, 14),
      rot: rand(-0.35, 0.35),
      pink: rng() > 0.35,                                     // rosa vs violeta
      ph: rng() * 6.28,
    });
  }

  guard = 0;
  while (rocks.length < 16 && guard++ < 400) {
    const x = rand(W.minX + 1, W.maxX - 1), y = rand(W.minY + 1, W.maxY - 1);
    if (Math.hypot(x, y) < 2.5) continue;
    if (lavaPools.some((l) => Math.hypot(l.x - x, l.y - y) < l.rx + 0.9)) continue;
    rocks.push({ x, y, r: rand(0.25, 0.7), seed: rng() * 10 });
  }
}

/* ── Partículas ── */
function makeParticle(x, y, vx, vy, life, size, color, glow = true) {
  return { x, y, vx, vy, life, maxLife: life, size, color, glow };
}
function burst(x, y, n, colors, speed) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(0.3, 1) * speed;
    S.particles.push(makeParticle(
      x, y, Math.cos(a) * sp, Math.sin(a) * sp - 0.6,
      rand(0.35, 0.8), rand(2.5, 5.5),
      colors[(Math.random() * colors.length) | 0]
    ));
  }
}
function ring(x, y, color) {
  S.particles.push({ ring: true, x, y, life: 0.45, maxLife: 0.45, size: 0.2, color });
}

let emberAcc = 0;
function ambient(dt) {
  emberAcc += dt;
  const W = S.world;
  while (emberAcc > 0.22) {
    emberAcc -= 0.22;
    S.particles.push(makeParticle(
      rand(W.minX, W.maxX), rand(W.minY, W.maxY),
      rand(-0.15, 0.15), rand(-0.55, -0.2),
      rand(2.5, 4.5), rand(1.5, 3), 'rgba(255,150,60,0.5)'
    ));
  }
}

/* ── Loop principal ── */
let cam = { x: 0, y: 0, init: false };
let lastT = performance.now();
let flameAcc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastT) / 1000, 0.1);
  lastT = now;
  if (S.screen !== 'game') return;

  // Interpolação (estado do servidor chega a 20 Hz; render a 60 fps)
  const k = Math.min(1, dt * 14);
  const actors = [];
  if (S.me) { actors.push(S.me); }
  for (const r of S.remotes.values()) actors.push(r);
  for (const b of S.demoBots) actors.push(b);
  for (const a of actors) {
    if (!a.rxInit) { a.rx = a.x; a.ry = a.y; a.rxInit = true; }
    if (Math.hypot(a.x - a.rx, a.y - a.ry) > 3) { a.rx = a.x; a.ry = a.y; }
    a.rx = lerp(a.rx, a.x, k);
    a.ry = lerp(a.ry, a.y, k);
    a.alpha = Math.min(1, a.alpha + dt * 2.5);
  }
  for (const p of S.projectiles.values()) {
    if (p.rxInit === undefined) { p.rx = p.x; p.ry = p.y; p.rxInit = true; }
    if (Math.hypot(p.x - p.rx, p.y - p.ry) > 2) { p.rx = p.x; p.ry = p.y; }
    p.rx = lerp(p.rx, p.x, Math.min(1, dt * 18));
    p.ry = lerp(p.ry, p.y, Math.min(1, dt * 18));
  }
  for (const p of S.demoProj) {
    p.rx = p.x; p.ry = p.y;
  }

  // Câmera
  const me = S.me;
  if (me) {
    const halfW = vw / 2 / UNIT, halfH = vh / 2 / UNIT, M = 1.5;
    let tx = me.rx, ty = me.ry;
    const W = S.world;
    tx = (W.maxX - W.minX) < 2 * halfW ? (W.minX + W.maxX) / 2 : clamp(tx, W.minX - M + halfW, W.maxX + M - halfW);
    ty = (W.maxY - W.minY) < 2 * halfH ? (W.minY + W.maxY) / 2 : clamp(ty, W.minY - M + halfH, W.maxY + M - halfH);
    if (!cam.init) { cam.x = tx; cam.y = ty; cam.init = true; }
    cam.x = lerp(cam.x, tx, Math.min(1, dt * 6));
    cam.y = lerp(cam.y, ty, Math.min(1, dt * 6));
  }

  // Partículas de aura (fogo) — mais fortes no herói local
  flameAcc += dt;
  const emit = { local: 0.06, remote: 0.14 };
  for (const a of actors) {
    if (!a.alive) continue;
    a._fAcc = (a._fAcc || 0) + dt;
    const every = a.isLocal || a.bot ? emit.local : emit.remote;
    while (a._fAcc > every) {
      a._fAcc -= every;
      S.particles.push(makeParticle(
        a.rx + rand(-0.35, 0.35), a.ry + rand(0.1, 0.9),
        rand(-0.1, 0.1), rand(-1.1, -0.5),
        rand(0.4, 0.8), rand(2.5, 5),
        Math.random() > 0.4 ? '#ff7a1a' : '#ffd166'
      ));
    }
  }

  ambient(dt);

  // Física simples das partículas
  for (let i = S.particles.length - 1; i >= 0; i--) {
    const p = S.particles[i];
    p.life -= dt;
    if (p.life <= 0) { S.particles.splice(i, 1); continue; }
    if (!p.ring) {
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }
  if (S.particles.length > 900) S.particles.splice(0, S.particles.length - 900);
  if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 14);

  render(now / 1000);
  updateHudBars();
}

function render(t) {
  ctx.clearRect(0, 0, vw, vh);
  const shx = S.shake > 0 ? rand(-S.shake, S.shake) : 0;
  const shy = S.shake > 0 ? rand(-S.shake, S.shake) : 0;
  const ox = vw / 2 - cam.x * UNIT + shx;
  const oy = vh / 2 - cam.y * UNIT + shy;

  ctx.save();
  ctx.translate(ox, oy);

  const W = S.world;
  const wx = W.minX * UNIT, wy = W.minY * UNIT;
  const ww = (W.maxX - W.minX) * UNIT, wh = (W.maxY - W.minY) * UNIT;

  // Vazio ao redor da ilha
  ctx.fillStyle = '#04060c';
  ctx.fillRect(wx - 4000, wy - 4000, ww + 8000, wh + 8000);

  // Chão vulcânico
  if (groundPattern) {
    ctx.fillStyle = groundPattern;
  } else {
    ctx.fillStyle = '#1c120d';
  }
  ctx.fillRect(wx, wy, ww, wh);

  // Borda da ilha
  ctx.strokeStyle = 'rgba(255, 122, 26, 0.16)';
  ctx.lineWidth = 3;
  ctx.strokeRect(wx + 1.5, wy + 1.5, ww - 3, wh - 3);
  ctx.strokeStyle = 'rgba(90, 60, 45, 0.9)';
  ctx.lineWidth = 10;
  ctx.strokeRect(wx - 5, wy - 5, ww + 10, wh + 10);

  // Rochas
  for (const r of rocks) {
    ctx.fillStyle = '#241813';
    ctx.beginPath();
    ctx.ellipse(r.x * UNIT, r.y * UNIT, r.r * UNIT, r.r * UNIT * 0.72, r.seed, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.beginPath();
    ctx.ellipse(r.x * UNIT - r.r * 8, r.y * UNIT - r.r * 8, r.r * UNIT * 0.55, r.r * UNIT * 0.4, r.seed, 0, Math.PI * 2);
    ctx.fill();
  }

  // Poças de lava (com pulso)
  for (const l of lavaPools) {
    const pulse = 0.75 + 0.25 * Math.sin(t * 1.7 + l.ph);
    const x = l.x * UNIT, y = l.y * UNIT, rx = l.rx * UNIT, ry = l.ry * UNIT;
    const g = ctx.createRadialGradient(x, y, 4, x, y, Math.max(rx, ry) * 1.9);
    g.addColorStop(0, `rgba(255, 120, 20, ${0.5 * pulse})`);
    g.addColorStop(1, 'rgba(255, 60, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rx * 1.9, ry * 1.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255, ${(120 + 60 * pulse) | 0}, 10, ${0.85})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 235, 140, 0.55)';
    ctx.beginPath();
    ctx.ellipse(x - rx * 0.2, y - ry * 0.25, rx * 0.45, ry * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cristais (rosa/violeta com brilho)
  for (const c of crystals) {
    const x = c.x * UNIT, y = c.y * UNIT;
    const glow = 0.5 + 0.5 * Math.sin(t * 2.2 + c.ph);
    const col = c.pink ? '255, 94, 168' : '155, 77, 255';
    const gg = ctx.createRadialGradient(x, y - 6, 2, x, y - 6, c.h * 1.7);
    gg.addColorStop(0, `rgba(${col}, ${0.34 * glow})`);
    gg.addColorStop(1, `rgba(${col}, 0)`);
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(x, y - 6, c.h * 1.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(c.rot);
    ctx.fillStyle = `rgb(${col})`;
    ctx.beginPath();
    ctx.moveTo(0, -c.h); ctx.lineTo(c.w * 0.55, -c.h * 0.28);
    ctx.lineTo(c.w * 0.34, 0); ctx.lineTo(-c.w * 0.34, 0);
    ctx.lineTo(-c.w * 0.55, -c.h * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(0, -c.h); ctx.lineTo(c.w * 0.2, -c.h * 0.3); ctx.lineTo(0, -c.h * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(${col}, 0.85)`;
    ctx.beginPath();
    ctx.moveTo(-c.w * 0.2, 0); ctx.lineTo(0, -c.h * 0.12); ctx.lineTo(c.w * 0.2, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Personagens ordenados por Y
  const actors = [];
  if (S.me) actors.push(S.me);
  for (const r of S.remotes.values()) actors.push(r);
  for (const b of S.demoBots) actors.push(b);
  actors.sort((a, b) => a.ry - b.ry);
  for (const a of actors) drawActor(a, t);

  // Projéteis (autoritativos + demo)
  ctx.globalCompositeOperation = 'lighter';
  const projs = [...S.projectiles.values(), ...S.demoProj];
  for (const p of projs) {
    const x = (p.rx ?? p.x) * UNIT, y = (p.ry ?? p.y) * UNIT;
    // rastro
    ctx.strokeStyle = 'rgba(255, 130, 30, 0.5)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - p.dx * 34, y - p.dy * 34);
    ctx.lineTo(x, y);
    ctx.stroke();
    // núcleo
    const g = ctx.createRadialGradient(x, y, 1, x, y, 16);
    g.addColorStop(0, 'rgba(255, 246, 180, 0.95)');
    g.addColorStop(0.35, 'rgba(255, 160, 40, 0.8)');
    g.addColorStop(1, 'rgba(255, 80, 10, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  // Partículas
  for (const p of S.particles) {
    const a = p.life / p.maxLife;
    if (p.ring) {
      const r = (1 - a) * 46 + 6;
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = a * 0.9;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x * UNIT, p.y * UNIT, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x * UNIT, p.y * UNIT, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  ctx.restore();

  // Vinheta de tela
  const vg = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.42, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(2, 3, 8, 0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, vw, vh);
}

function drawActor(a, t) {
  if (!a.alive) return;
  const x = a.rx * UNIT, y = a.ry * UNIT;
  const H = 150; // altura visual do herói
  const img = charImg.complete && charImg.naturalWidth ? charImg : null;
  const w = img ? H * (charImg.naturalWidth / charImg.naturalHeight) : 60;
  const bob = Math.sin(t * 2.6 + (a.rx + a.ry) * 3) * 2.4;

  ctx.save();
  ctx.globalAlpha = a.alpha ?? 1;

  // Aura de fogo (Dom natal de Ignara) — forte no herói local
  const auraR = a.isLocal || a.bot ? 62 : 46;
  const auraA = (a.isLocal || a.bot ? 0.42 : 0.25) + 0.1 * Math.sin(t * 3.1 + x * 0.01);
  const ag = ctx.createRadialGradient(x, y + 26, 6, x, y + 26, auraR);
  const auraCol = a.bot ? '80, 200, 255' : '255, 122, 26';
  ag.addColorStop(0, `rgba(${auraCol}, ${auraA})`);
  ag.addColorStop(1, `rgba(${auraCol}, 0)`);
  ctx.fillStyle = ag;
  ctx.beginPath();
  ctx.arc(x, y + 26, auraR, 0, Math.PI * 2);
  ctx.fill();

  // Sombra
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath();
  ctx.ellipse(x, y + 62, 30, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // Corpo
  ctx.translate(x, y + bob);
  if ((a.face ?? 1) < 0) ctx.scale(-1, 1);
  if (img) {
    if (a.bot) { try { ctx.filter = 'hue-rotate(155deg) saturate(0.85)'; } catch {} }
    ctx.drawImage(img, -w / 2, -H + 62, w, H);
    try { ctx.filter = 'none'; } catch {}
  } else {
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Nome + barras de HP/energia
  ctx.save();
  ctx.globalAlpha = a.alpha ?? 1;
  ctx.textAlign = 'center';
  ctx.font = '700 13px Sora, sans-serif';
  const label = a.name + (a.isLocal ? ' (você)' : '');
  const tw = ctx.measureText(label).width;
  const nx = x, ny = y - H + 40;
  ctx.fillStyle = 'rgba(6, 9, 16, 0.72)';
  roundRect(nx - tw / 2 - 9, ny - 14, tw + 18, 20, 7);
  ctx.fill();
  ctx.fillStyle = a.isLocal ? '#ffd9b8' : (a.bot ? '#9fe0ff' : '#bfe3ff');
  ctx.fillText(label, nx, ny);

  const bw = 64;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(nx - bw / 2, ny + 8, bw, 7, 3.5); ctx.fill();
  ctx.fillStyle = '#22c55e';
  roundRect(nx - bw / 2, ny + 8, bw * clamp((a.hp ?? 0) / (a.maxHp || 100), 0, 1), 7, 3.5); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(nx - bw / 2, ny + 17, bw, 4.5, 2.2); ctx.fill();
  ctx.fillStyle = '#fbbf24';
  roundRect(nx - bw / 2, ny + 17, bw * clamp((a.energy ?? 0) / (a.maxEnergy || 100), 0, 1), 4.5, 2.2); ctx.fill();
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ── HUD ── */
let _hudCache = '';
function updateHudBars() {
  const a = S.me;
  if (!a) return;
  const hp = Math.round(a.hp ?? 0), en = Math.round(a.energy ?? 0);
  const key = `${hp}|${en}|${a.kills}`;
  if (key === _hudCache) return;
  _hudCache = key;
  $('hudHp').style.width = clamp((hp / (a.maxHp || 100)) * 100, 0, 100) + '%';
  $('hudEn').style.width = clamp((en / (a.maxEnergy || 100)) * 100, 0, 100) + '%';
  $('hudHpTxt').textContent = `${hp}/${a.maxHp || 100}`;
  $('hudEnTxt').textContent = `${en}/${a.maxEnergy || 100}`;
  $('hudKills').textContent = String(a.kills || 0);
}

/* ── Boot ── */
resize();
requestAnimationFrame(frame);
