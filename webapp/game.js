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
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const rand = (a, b) => a + Math.random() * (b - a);
const round3 = (v) => Math.round(v * 1000) / 1000;

// RNG com semente — decoração da ilha idêntica em todos os clientes.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAX_TOASTS = 4;
const activeToastTimers = new Set();

function clearAllToasts() {
  for (const t of activeToastTimers) clearTimeout(t);
  activeToastTimers.clear();
  const box = $('toasts');
  if (box && typeof box.replaceChildren === 'function') box.replaceChildren();
}

function toast(msg, ms = 3200) {
  const box = $('toasts');
  if (!box) return;
  while (box.children && box.children.length >= MAX_TOASTS) {
    const oldest = box.firstElementChild;
    if (!oldest) break;
    if (oldest._tid !== undefined) {
      clearTimeout(oldest._tid);
      activeToastTimers.delete(oldest._tid);
    }
    oldest.remove();
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  box.appendChild(el);
  const tid = setTimeout(() => {
    activeToastTimers.delete(tid);
    el.remove();
  }, ms);
  el._tid = tid;
  activeToastTimers.add(tid);
}

/* ───────────────────────── Estado global ───────────────────────── */
const UNIT = 44; // px por unidade de mundo (métrica do servidor: 32→44 visual)
const DEFAULT_WORLD = { minX: -16, maxX: 16, minY: -12, maxY: 12 };
const DEFAULT_DOM = { cost: 25, cooldownMs: 700, damage: 25, speed: 9, range: 7, hitRadius: 0.55 };

const S = {
  screen: 'landing',          // landing | menu | game
  mode: 'offline',            // live | demo | connecting | dead-end
  myId: null,
  myName: 'Aventureiro',
  probedWsUrl: null,          // resolvido pela sonda /health do menu
  world: { ...DEFAULT_WORLD },
  tickRate: 20,
  moveSpeed: 4,
  dom: { ...DEFAULT_DOM },
  me: null,                   // ator local (espelhado do servidor)
  remotes: new Map(),         // id → ator remoto
  projectiles: new Map(),     // id → projétil visual
  particles: [],              // partículas efêmeras (swap-and-pop + pool)
  combatTexts: [],            // números flutuantes de impacto
  demo: false,
  demoBots: [],
  demoProj: [],
  demoKills: 0,
  lastDomAt: 0,
  shake: 0,
  debug: new URLSearchParams(location.search).get('debug') === '1',
};

/* ───────────────── Telemetria de FPS / Performance ───────────────── */
const PERF_WINDOW = 240;
const perf = {
  fps: 60,
  frameMs: 0,
  dtSamples: new Float32Array(PERF_WINDOW),
  workSamples: new Float32Array(PERF_WINDOW),
  sampleIdx: 0,
  sampleCount: 0,
  slowStreak: 0,
  fastStreak: 0,
  lowSpec: false,
};

function resetPerf() {
  perf.fps = 60;
  perf.frameMs = 0;
  perf.sampleIdx = 0;
  perf.sampleCount = 0;
  perf.slowStreak = 0;
  perf.fastStreak = 0;
}

function recordPerf(dtMs, workMs) {
  // Ignora pausas longas (troca de aba, janela minimizada ou transição de tela)
  if (dtMs <= 0 || dtMs > 200 || document.hidden) return;

  perf.dtSamples[perf.sampleIdx] = dtMs;
  perf.workSamples[perf.sampleIdx] = workMs;
  perf.sampleIdx = (perf.sampleIdx + 1) % PERF_WINDOW;
  if (perf.sampleCount < PERF_WINDOW) perf.sampleCount++;

  const instFps = 1000 / dtMs;
  perf.fps = perf.sampleCount === 1 ? clamp(instFps, 1, 144) : lerp(perf.fps, clamp(instFps, 1, 144), 0.08);
  perf.frameMs = perf.sampleCount === 1 ? workMs : lerp(perf.frameMs, workMs, 0.12);

  // Histerese para modo de economia em aparelhos de entrada (evita ativar por pico isolado)
  if (dtMs > 26 || workMs > 12) {
    perf.slowStreak++;
    perf.fastStreak = 0;
    if (perf.slowStreak >= 25) perf.lowSpec = true;
  } else if (dtMs < 20 && workMs < 7) {
    perf.fastStreak++;
    perf.slowStreak = Math.max(0, perf.slowStreak - 1);
    if (perf.fastStreak >= 45) perf.lowSpec = false;
  }
}

function computePerfMetrics() {
  const n = perf.sampleCount;
  if (n === 0) {
    return { avgFps: 60, low1Fps: 60, minFps: 60, avgWorkMs: 0, p95WorkMs: 0, p99WorkMs: 0 };
  }
  const dts = Array.from(perf.dtSamples.subarray(0, n)).sort((a, b) => a - b);
  const works = Array.from(perf.workSamples.subarray(0, n)).sort((a, b) => a - b);

  let sumDt = 0;
  let sumWork = 0;
  for (let i = 0; i < n; i++) {
    sumDt += dts[i];
    sumWork += works[i];
  }
  const avgDt = sumDt / n;
  const avgFps = avgDt > 0 ? Math.min(144, 1000 / avgDt) : 60;

  // 1% low FPS real: média dos 1% frames mais lentos (maiores dtMs na cauda superior)
  const slowCount = Math.max(1, Math.ceil(n * 0.01));
  let slowDtSum = 0;
  for (let i = n - slowCount; i < n; i++) slowDtSum += dts[i];
  const meanSlowDt = slowDtSum / slowCount;
  const low1Fps = meanSlowDt > 0 ? Math.min(144, 1000 / meanSlowDt) : 60;

  // Min FPS absoluto: baseado no maior dtMs observado na janela
  const maxDt = dts[n - 1];
  const minFps = maxDt > 0 ? Math.min(144, 1000 / maxDt) : 60;

  const p95WorkMs = works[Math.min(n - 1, Math.floor(n * 0.95))];
  const p99WorkMs = works[Math.min(n - 1, Math.floor(n * 0.99))];

  return {
    avgFps,
    low1Fps,
    minFps,
    avgWorkMs: sumWork / n,
    p95WorkMs,
    p99WorkMs,
  };
}

window.__CRYSTALIA_PERF__ = {
  getSnapshot() {
    const m = computePerfMetrics();
    return {
      fps: Math.round(m.avgFps * 10) / 10,
      low1Fps: Math.round(m.low1Fps * 10) / 10,
      minFps: Math.round(m.minFps * 10) / 10,
      frameWorkMs: Math.round(m.avgWorkMs * 1000) / 1000,
      p95WorkMs: Math.round(m.p95WorkMs * 1000) / 1000,
      p99WorkMs: Math.round(m.p99WorkMs * 1000) / 1000,
      samples: perf.sampleCount,
      particles: S.particles.length,
      combatTexts: S.combatTexts.length,
      actors: (S.me ? 1 : 0) + S.remotes.size + S.demoBots.length,
      projectiles: S.projectiles.size + S.demoProj.length,
      lowSpec: perf.lowSpec,
      mode: S.mode,
      screen: S.screen,
      activeTimers: {
        probe: probeTimer !== null,
        reconnect: reconnectTimer !== null,
        input: inputTimer !== null,
        demo: demoTimers.length,
        domCooldown: domCooldownTimer !== null,
        toasts: activeToastTimers.size,
      },
    };
  },
};

/* ───────────────────── Navegação entre telas ───────────────────── */
const screens = { landing: $('landing'), menu: $('menu'), game: $('game') };
let menuSelectTimer = null;

function show(name) {
  S.screen = name;
  for (const [k, el] of Object.entries(screens)) {
    if (el) el.classList.toggle('hidden', k !== name);
  }
  const hud = $('hud');
  if (hud) hud.classList.toggle('hidden', name !== 'game');

  clearTimeout(menuSelectTimer);
  menuSelectTimer = null;

  if (name === 'menu') {
    probeServer();
    menuSelectTimer = setTimeout(() => {
      menuSelectTimer = null;
      const isCoarse = typeof window.matchMedia === 'function' &&
        window.matchMedia('(pointer: coarse)').matches;
      if (S.screen === 'menu' && !isCoarse && $('menuName')) {
        $('menuName').select();
      }
    }, 60);
  } else {
    stopProbeServer();
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
if (qsName && $('menuName')) $('menuName').value = qsName.slice(0, 20);

function chosenName() {
  const raw = $('menuName') ? $('menuName').value : '';
  const clean = raw.trim().slice(0, 20);
  return clean || `Visitante${Math.floor(rand(100, 999))}`;
}

/* ─────────────────── Sonda de status (menu) ─────────────────── */
let probeTimer = null;
let probeAbortCtrl = null;
let probeGen = 0;

function stopProbeServer() {
  probeGen++;
  if (probeTimer !== null) {
    clearTimeout(probeTimer);
    probeTimer = null;
  }
  if (probeAbortCtrl) {
    try { probeAbortCtrl.abort(); } catch {}
    probeAbortCtrl = null;
  }
}

async function probeServer() {
  stopProbeServer();
  if (S.screen !== 'menu') return;
  const myGen = probeGen;

  const dot = document.querySelector('#srvPill .pill-dot');
  const txt = $('srvPillTxt');
  if (dot) dot.className = 'pill-dot wait';
  if (txt) txt.textContent = 'Verificando servidor…';

  for (const base of candidateOrigins()) {
    if (myGen !== probeGen || S.screen !== 'menu') return;
    let timeoutId = null;
    try {
      const ctrl = new AbortController();
      probeAbortCtrl = ctrl;
      timeoutId = setTimeout(() => ctrl.abort(), 1600);
      const r = await fetch(httpOriginOf(base) + '/health', { signal: ctrl.signal });
      clearTimeout(timeoutId);
      probeAbortCtrl = null;
      if (myGen !== probeGen || S.screen !== 'menu') return;
      if (r.ok) {
        S.probedWsUrl = base;
        if (dot) dot.className = 'pill-dot ok';
        if (txt) txt.textContent = 'Servidor online — multiplayer real disponível';
        probeTimer = setTimeout(probeServer, 10000);
        return;
      }
    } catch {
      if (timeoutId !== null) clearTimeout(timeoutId);
      probeAbortCtrl = null;
    }
  }

  if (myGen !== probeGen || S.screen !== 'menu') return;
  S.probedWsUrl = null;
  if (dot) dot.className = 'pill-dot down';
  if (txt) txt.textContent = 'Servidor offline — Modo Demo disponível';
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
let reconnectTimer = null;
let domCooldownTimer = null;
let lastInputSentAt = 0;

function clearConnectionTimers() {
  if (inputTimer !== null) {
    clearInterval(inputTimer);
    inputTimer = null;
  }
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function closeActiveWs(reason = 'cleanup') {
  if (!ws) return;
  const sock = ws;
  ws = null;
  sock.onopen = null;
  sock.onmessage = null;
  sock.onclose = null;
  sock.onerror = null;
  try { sock.close(1000, reason); } catch {}
}

function setNet(state, detail) {
  const txt = $('netTxt');
  const key = state + '|' + (detail || '');
  if (S._netKey === key) return;
  S._netKey = key;
  const dot = $('netDot');
  if (!dot || !txt) return;
  if (state === 'live') {
    dot.className = 'pill-dot ok';
    txt.textContent = detail || `Ao vivo · ${S.tickRate} ticks/s`;
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
  clearConnectionTimers();
  closeActiveWs('reconnect');
  if (wsWantClose || S.screen !== 'game') return;

  let url;
  try {
    url = new URL(wsBase());
    url.searchParams.set('name', S.myName);
  } catch {
    return enterDemo('Não consegui abrir o WebSocket — demo local!');
  }

  setNet('connecting');
  let sock;
  try { sock = new WebSocket(url.toString()); }
  catch { return enterDemo('Não consegui abrir o WebSocket — demo local!'); }
  ws = sock;

  sock.onopen = () => {
    if (ws !== sock || wsWantClose) return;
    wsAttempts = 0;
    if (S.demo) stopDemo();
    S.mode = 'live';
    S._lastInput = null;
    setNet('connecting', 'Conectado — esperando primeiro tick…');
    toast(`Bem-vindo à Ignara, ${S.myName}!`);
    clearInterval(inputTimer);
    inputTimer = setInterval(() => sendMoveInput(false), 50);
  };

  sock.onmessage = (ev) => {
    if (ws !== sock) return;
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    handleServerMessage(m);
  };

  sock.onclose = () => {
    if (ws === sock) ws = null;
    clearConnectionTimers();
    if (wsWantClose || S.screen !== 'game') return;
    wsAttempts++;
    if (wsAttempts > 12) {
      enterDemo('Servidor não respondeu após 12 tentativas — abrindo MODO DEMO.');
    } else {
      setNet('connecting', `Reconectando (${wsAttempts}/12)…`);
      const delay = Math.min(800 * 1.3 ** wsAttempts, 3000);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    }
  };

  sock.onerror = () => { /* onclose vem junto */ };
}

function leaveGame() {
  wsWantClose = true;
  clearConnectionTimers();
  closeActiveWs('sair');
  stopDemo();
  resetInputs();

  if (domCooldownTimer !== null) {
    clearTimeout(domCooldownTimer);
    domCooldownTimer = null;
  }
  const btnDom = $('btnDom');
  if (btnDom) btnDom.classList.remove('cooldown');

  S.remotes.clear();
  S.projectiles.clear();
  releaseAllParticles();
  S.combatTexts.length = 0;
  S.myId = null;
  S.me = null;
  S.demoKills = 0;
  S.shake = 0;
  S._lastInput = null;
  S._netKey = '';
  _hudCache = '';
  cam.init = false;

  const deathEl = $('deathOverlay');
  if (deathEl) deathEl.classList.add('hidden');
  const killsEl = $('hudKills');
  if (killsEl) killsEl.textContent = '0';
}

function computeInputVector() {
  const dx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
             (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const dy = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) -
             (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  const jx = joystick.active ? joystick.dx : 0;
  const jy = joystick.active ? joystick.dy : 0;
  let nx = clamp(dx + jx, -1, 1);
  let ny = clamp(dy + jy, -1, 1);
  const mag = Math.hypot(nx, ny);
  if (mag > 1) {
    nx /= mag;
    ny /= mag;
  }
  return { dx: round3(nx), dy: round3(ny), mag: Math.min(1, mag) };
}

function sendMoveInput(forceImmediate = false) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const now = performance.now();
  const { dx: nx, dy: ny, mag } = computeInputVector();
  const last = S._lastInput || {};
  const isZero = nx === 0 && ny === 0;
  const changed = last.dx !== nx || last.dy !== ny || (isZero && !last.zeroSent);
  if (!changed) return;

  // Respeita folga ampla abaixo do guard-rail do servidor (60 msg/s):
  // permite envio imediato na mudança de tecla/parada, limitando rajadas contínuas.
  if (!forceImmediate && !isZero && now - lastInputSentAt < 28) return;

  // Atualiza direção visual local de mira imediatamente para feedback responsivo
  if (S.me && S.me.alive && mag > 0.01) {
    S.me.dirX = nx / mag;
    S.me.dirY = ny / mag;
    if (nx < -0.15) S.me.face = -1;
    else if (nx > 0.15) S.me.face = 1;
  }

  ws.send(JSON.stringify({ type: 'move_input', dx: nx, dy: ny }));
  S._lastInput = { dx: nx, dy: ny, zeroSent: isZero };
  lastInputSentAt = now;
}

function tryDom() {
  const now = performance.now();
  if (now - S.lastDomAt < 120) return; // debounce do botão/tecla
  S.lastDomAt = now;
  if (S.demo) { demoCast(); return; }
  if (ws && ws.readyState === WebSocket.OPEN) {
    if (S.me && !S.me.alive) return;
    // Garante que uma mudança de direção recém-pressionada chegue antes do disparo
    sendMoveInput(true);
    ws.send(JSON.stringify({ type: 'use_dom_fogo' }));
    pulseDomButton();
  }
}

function pulseDomButton() {
  const b = $('btnDom');
  if (!b) return;
  b.classList.add('cooldown');
  if (domCooldownTimer !== null) clearTimeout(domCooldownTimer);
  const cd = Math.max(200, S.dom.cooldownMs || 700);
  domCooldownTimer = setTimeout(() => {
    domCooldownTimer = null;
    b.classList.remove('cooldown');
  }, cd);
}

/* ─────────────── Mensagens do servidor (protocolo v1.1) ─────────────── */
function handleServerMessage(m) {
  switch (m.type) {
    case 'welcome': {
      S.myId = m.sessionId;
      S.me = null;
      S.remotes.clear();
      S.projectiles.clear();
      const deathEl = $('deathOverlay');
      if (deathEl) deathEl.classList.add('hidden');
      if (m.world) S.world = { ...DEFAULT_WORLD, ...m.world };
      if (typeof m.tickRate === 'number' && m.tickRate > 0) S.tickRate = m.tickRate;
      if (typeof m.moveSpeed === 'number' && m.moveSpeed > 0) S.moveSpeed = m.moveSpeed;
      if (m.dom) S.dom = { ...DEFAULT_DOM, ...m.dom };
      buildDecor();
      break;
    }
    case 'state': {
      if (S.mode !== 'live') return;
      const now = performance.now();
      const seen = new Set();
      for (const [id, p] of Object.entries(m.players || {})) {
        seen.add(id);
        if (id === S.myId) {
          if (!S.me) S.me = makeActor(p.displayName || S.myName, true);
          updateActor(S.me, p, now);
        } else {
          let r = S.remotes.get(id);
          if (!r) {
            r = makeActor(p.displayName || 'Aventureiro', false);
            S.remotes.set(id, r);
            toast(`✨ ${r.name} entrou na ilha`, 2200);
          }
          updateActor(r, p, now);
        }
      }
      for (const id of [...S.remotes.keys()]) {
        if (!seen.has(id)) S.remotes.delete(id);
      }
      // Projéteis autoritativos → visuais interpolados com avanço vetorial suave
      const seenProj = new Set();
      for (const p of m.projectiles || []) {
        seenProj.add(p.id);
        let v = S.projectiles.get(p.id);
        if (!v) {
          v = {
            id: p.id, ownerId: p.ownerId,
            x: p.x, y: p.y, rx: p.x, ry: p.y,
            dx: p.dx, dy: p.dy, rxInit: true, trailAcc: 0,
          };
          S.projectiles.set(p.id, v);
        } else {
          v.x = p.x; v.y = p.y; v.dx = p.dx; v.dy = p.dy;
        }
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
    x: 0, y: 0, rx: 0, ry: 0,          // alvo autoritativo + posição de render
    vx: 0, vy: 0,                      // velocidade estimada entre snapshots (20Hz→60fps)
    lastSnapAt: 0,
    rxInit: false,
    dirX: 1, dirY: 0, face: 1,
    hp: 100, maxHp: 100, energy: 100, maxEnergy: 100,
    alive: true, kills: 0,
    alpha: 0,                          // fade-in
    moveBlend: 0,                      // 0 = idle, 1 = correndo
    stepAcc: 0,                        // acumulador de passos
    castAnim: 0,                       // flare de conjuração do Dom
    hitFlash: 0,                       // flash de impacto ao receber dano
    _fAcc: 0,
    _label: '',
    _labelW: 0,
  };
}

function updateActor(a, p, now) {
  const wasAlive = a.alive;
  const prevX = a.x, prevY = a.y;

  if (!a.rxInit) {
    a.x = p.x; a.y = p.y;
    a.rx = p.x; a.ry = p.y;
    a.rxInit = true;
    a.lastSnapAt = now;
  } else {
    const dtSnap = clamp((now - (a.lastSnapAt || now)) / 1000, 0.025, 0.25);
    const dx = p.x - prevX, dy = p.y - prevY;
    const dist = Math.hypot(dx, dy);
    if (dist > 3 || (!wasAlive && p.alive)) {
      // Teleporte ou respawn: alinha posição visual imediatamente
      a.rx = p.x; a.ry = p.y;
      a.vx = 0; a.vy = 0;
    } else {
      const maxSpd = (S.moveSpeed || 4) * 1.15;
      a.vx = clamp(dx / dtSnap, -maxSpd, maxSpd);
      a.vy = clamp(dy / dtSnap, -maxSpd, maxSpd);
    }
    a.x = p.x; a.y = p.y;
    a.lastSnapAt = now;
  }

  if (p.displayName && p.displayName !== a.name) {
    a.name = p.displayName;
    a._labelW = 0;
  }
  a.dirX = p.dirX ?? a.dirX;
  a.dirY = p.dirY ?? a.dirY;
  if (p.dirX < -0.15) a.face = -1;
  else if (p.dirX > 0.15) a.face = 1;

  if (typeof p.hp === 'number' && p.hp < a.hp && p.alive) {
    a.hitFlash = 1;
  }
  a.hp = p.hp; a.maxHp = p.maxHp ?? a.maxHp;
  a.energy = p.energy; a.maxEnergy = p.maxEnergy ?? a.maxEnergy;
  a.alive = p.alive; a.kills = p.kills ?? a.kills;

  if (wasAlive && !a.alive && a.isLocal) {
    $('deathOverlay').classList.remove('hidden');
    resetInputs();
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
    const dx = m.dirX ?? (caster ? caster.dirX : 1);
    const dy = m.dirY ?? (caster ? caster.dirY : 0);
    if (caster) {
      caster.castAnim = 1;
      caster.dirX = dx;
      caster.dirY = dy;
      if (dx < -0.15) caster.face = -1;
      else if (dx > 0.15) caster.face = 1;
    }
    const sx = m.x + dx * 0.45, sy = m.y + dy * 0.45;
    burst(sx, sy, 12, ['#fff3b0', '#ffd166', '#ff7a1a'], 2.6, dx * 1.2, dy * 1.2);
    ring(sx, sy, '#ffb14d', 0.38, 36);
    if (m.sessionId === S.myId) S.shake = Math.max(S.shake, 2.2);
  } else if (name === 'projectile_hit') {
    const target = m.sessionId === S.myId ? S.me : S.remotes.get(m.sessionId);
    if (target) target.hitFlash = 1;
    burst(m.x, m.y, 18, ['#fff3b0', '#ffb14d', '#ff5e1a', '#ff2a00'], 3.5);
    ring(m.x, m.y, '#fff3b0', 0.26, 28);
    ring(m.x, m.y, '#ff7a1a', 0.48, 52);
    const dmg = m.damage || S.dom.damage || 25;
    spawnCombatText(m.x, m.y - 0.8, `-${dmg}`, '#ffcf66');
    const victim = m.sessionId === S.myId;
    const near = S.me && Math.hypot(S.me.x - m.x, S.me.y - m.y) < 5;
    if (victim) S.shake = Math.max(S.shake, 5);
    else if (near) S.shake = Math.max(S.shake, 2.6);
  } else if (name === 'player_died') {
    const a = m.sessionId === S.myId ? S.me : S.remotes.get(m.sessionId);
    if (a) {
      burst(a.x, a.y, 24, ['#ffd166', '#ff7a1a', '#9aa4b8', '#5b6478'], 3.2);
      ring(a.x, a.y, '#ff5e1a', 0.55, 58);
    }
    if (m.killerId === S.myId && m.sessionId !== S.myId) {
      toast('⚔️ Você derrotou um aventureiro!', 2400);
      S.shake = Math.max(S.shake, 4);
    }
  } else if (name === 'player_respawned') {
    const a = m.sessionId === S.myId ? S.me : S.remotes.get(m.sessionId);
    if (a) { a.rx = 0; a.ry = 0; a.x = 0; a.y = 0; }
    ring(0, 0, '#ffd166', 0.5, 54);
    burst(0, 0, 16, ['#fff3b0', '#ffd166', '#ff9a3c'], 2.8);
  }
}

/* ═══════════════════ MODO DEMO (offline) ═══════════════════ */
let demoTimers = [];

function enterDemo(reason) {
  S.demo = true;
  S.mode = 'demo';
  wsWantClose = true;
  clearConnectionTimers();
  closeActiveWs('demo');

  if (reason) toast(reason, 4200);
  setNet('demo');
  const hudMode = $('hudMode');
  if (hudMode) hudMode.classList.remove('hidden');

  // Estado local espelhando exatamente as constantes do servidor autoritativo.
  S.world = { ...DEFAULT_WORLD };
  S.tickRate = 20;
  S.moveSpeed = 4;
  S.dom = { ...DEFAULT_DOM };
  buildDecor();

  S.me = makeActor(S.myName, true);
  S.me.rxInit = true;
  S.demoKills = 0;
  S._demoLastCast = 0;

  // Recruta Brasa nasce à frente da mira inicial (+X) como alvo de treino direto;
  // Cinzento e Faísca patrulham a ilha e fazem manobras evasivas ao receber impacto.
  const specs = [
    { name: 'Recruta Brasa', x: 3.6, y: 0, pause: 4500, trainer: true },
    { name: 'Cinzento', x: -5, y: 3.5, pause: 0, trainer: false },
    { name: 'Faísca', x: 2.2, y: -4.2, pause: 0, trainer: false },
  ];
  S.demoBots = specs.map((sp) => {
    const b = makeActor(sp.name, false);
    b.bot = true;
    b.trainer = sp.trainer;
    b.x = sp.x; b.y = sp.y;
    b.rx = sp.x; b.ry = sp.y;
    b.rxInit = true;
    b.face = sp.x >= 0 ? -1 : 1;
    b.dirX = b.face; b.dirY = 0;
    b.tx = sp.x; b.ty = sp.y;
    b.think = sp.pause;
    b.evadeTimer = 0;
    b.respawnAt = 0;
    if (sp.pause === 0) pickBotTarget(b);
    return b;
  });

  demoTimers.forEach(clearInterval);
  demoTimers = [
    setInterval(demoStep, 50), // "tick" 20 Hz unificado do demo (movimento + colisão + Sangue Quente)
  ];
}

function stopDemo() {
  S.demo = false;
  demoTimers.forEach(clearInterval);
  demoTimers = [];
  S.demoBots = [];
  S.demoProj = [];
  S.demoKills = 0;
  const hudMode = $('hudMode');
  if (hudMode) hudMode.classList.add('hidden');
}

function pickBotTarget(b, urgent = false) {
  const W = S.world;
  if (urgent && b.trainer) {
    // Recruta de treino frontal absorve o combo na linha de tiro (leve recuo no eixo)
    b.tx = clamp(b.x + 0.35, 2.6, 5.4);
    b.ty = b.y;
    b.think = 2400;
    b.evadeTimer = 0.25;
  } else if (urgent && S.me) {
    // Patrulheiros fazem manobra lateral (strafe) em relação ao jogador
    const ang = Math.atan2(b.y - S.me.y, b.x - S.me.x) + (Math.random() > 0.5 ? 1.15 : -1.15);
    const dist = rand(3.2, 6.2);
    b.tx = clamp(S.me.x + Math.cos(ang) * dist, W.minX + 2, W.maxX - 2);
    b.ty = clamp(S.me.y + Math.sin(ang) * dist, W.minY + 2, W.maxY - 2);
    b.think = rand(1100, 2000);
    b.evadeTimer = 0.7;
  } else {
    b.tx = rand(W.minX + 2.2, W.maxX - 2.2);
    b.ty = rand(W.minY + 2.2, W.maxY - 2.2);
    b.think = rand(2400, 4800);
  }
}

function demoStep() {
  if (!S.demo || document.hidden) return;
  const dt = 0.05;
  const now = performance.now();

  // Movimento e regeneração do herói local no demo (mesma física do IgnaraRoom.js:
  // 4 un/s, diagonal normalizada, clamp aos limites da ilha, Sangue Quente <50% HP).
  if (S.me && S.me.alive) {
    const { dx: ix, dy: iy, mag } = computeInputVector();
    const spd = S.moveSpeed || 4;
    S.me.vx = ix * spd;
    S.me.vy = iy * spd;
    S.me.x = clamp(S.me.x + S.me.vx * dt, S.world.minX, S.world.maxX);
    S.me.y = clamp(S.me.y + S.me.vy * dt, S.world.minY, S.world.maxY);
    if (mag > 0.01) {
      S.me.dirX = ix / mag;
      S.me.dirY = iy / mag;
    }
    if (ix < -0.15) S.me.face = -1;
    else if (ix > 0.15) S.me.face = 1;

    // Sangue Quente (PROTOCOL.md): 12/s com HP < 50%, 5/s normal
    const regenRate = S.me.hp < S.me.maxHp * 0.5 ? 12 : 5;
    S.me.energy = clamp(S.me.energy + regenRate * dt, 0, S.me.maxEnergy || 100);
  }

  for (const b of S.demoBots) {
    if (!b.alive) {
      if (now >= b.respawnAt) {
        b.alive = true;
        b.hp = b.maxHp;
        b.energy = b.maxEnergy;
        b.hitFlash = 0;
        // Renasce em distância segura do jogador
        let rx = rand(-7, 7), ry = rand(-5.5, 5.5);
        if (S.me && Math.hypot(rx - S.me.x, ry - S.me.y) < 3) {
          rx = clamp(rx + 4, S.world.minX + 2, S.world.maxX - 2);
        }
        b.x = rx; b.y = ry; b.rx = rx; b.ry = ry;
        b.vx = 0; b.vy = 0;
        pickBotTarget(b);
        ring(b.x, b.y, '#ffd166', 0.48, 48);
        burst(b.x, b.y, 12, ['#ffd166', '#ff9a3c'], 2.2);
      }
      continue;
    }

    if (b.evadeTimer > 0) b.evadeTimer = Math.max(0, b.evadeTimer - dt);
    b.think -= dt * 1000;
    if (b.think <= 0) pickBotTarget(b, false);

    const dx = b.tx - b.x, dy = b.ty - b.y;
    const d = Math.hypot(dx, dy);
    const botSpd = b.evadeTimer > 0 ? 2.4 : 1.5;
    if (d > 0.25) {
      b.vx = (dx / d) * botSpd;
      b.vy = (dy / d) * botSpd;
      b.x = clamp(b.x + b.vx * dt, S.world.minX + 1, S.world.maxX - 1);
      b.y = clamp(b.y + b.vy * dt, S.world.minY + 1, S.world.maxY - 1);
      b.dirX = dx / d;
      b.dirY = dy / d;
      if (dx < -0.05) b.face = -1;
      else if (dx > 0.05) b.face = 1;
    } else {
      b.vx = 0;
      b.vy = 0;
    }
    const botRegen = b.hp < b.maxHp * 0.5 ? 12 : 5;
    b.energy = clamp((b.energy ?? 100) + botRegen * dt, 0, b.maxEnergy || 100);
  }

  // Projéteis locais do demo (mesmo raio de acerto 0.55 e alcance 7 do servidor)
  const hitRadius = S.dom.hitRadius || 0.55;
  for (let i = S.demoProj.length - 1; i >= 0; i--) {
    const p = S.demoProj[i];
    const step = S.dom.speed * dt;
    p.x += p.dx * step;
    p.y += p.dy * step;
    p.traveled += step;

    let hit = null;
    for (const b of S.demoBots) {
      if (!b.alive) continue;
      if (Math.hypot(b.x - p.x, b.y - p.y) <= hitRadius) { hit = b; break; }
    }
    if (hit) {
      hit.hp = Math.max(0, hit.hp - S.dom.damage);
      hit.hitFlash = 1;
      pickBotTarget(hit, true);
      burst(p.x, p.y, 16, ['#fff3b0', '#ffb14d', '#ff5e1a', '#ff2a00'], 3.3);
      ring(p.x, p.y, '#fff3b0', 0.25, 26);
      ring(p.x, p.y, '#ff7a1a', 0.46, 50);
      spawnCombatText(p.x, p.y - 0.8, `-${S.dom.damage}`, '#ffcf66');
      S.shake = Math.max(S.shake, 2.6);
      if (hit.hp <= 0) {
        hit.alive = false;
        hit.hp = 0;
        hit.vx = 0;
        hit.vy = 0;
        hit.respawnAt = now + 3000;
        S.demoKills++;
        if (S.me) S.me.kills = S.demoKills;
        burst(hit.x, hit.y, 22, ['#ffd166', '#9aa4b8', '#5b6478'], 3.1);
        ring(hit.x, hit.y, '#ff5e1a', 0.52, 54);
        toast('⚔️ Recruta de treino derrotado!', 1800);
      }
      S.demoProj.splice(i, 1);
    } else if (p.traveled >= S.dom.range) {
      burst(p.x, p.y, 7, ['#ffd166', '#ff9a3c'], 1.8);
      S.demoProj.splice(i, 1);
    }
  }

  // HUD do demo
  if (S.me) {
    S.me.hp = clamp(S.me.hp, 0, S.me.maxHp || 100);
    updateHudBars();
  }
}

function demoCast() {
  const now = performance.now();
  if (!S.me || !S.me.alive) return;
  if (now - (S._demoLastCast || 0) < S.dom.cooldownMs) return;
  if (S.me.energy < S.dom.cost) { toast('Energia insuficiente…', 1400); return; }
  S._demoLastCast = now;
  S.me.energy -= S.dom.cost;
  S.me.castAnim = 1;
  pulseDomButton();
  const dx = S.me.dirX, dy = S.me.dirY;
  const sx = S.me.x + dx * 0.6, sy = S.me.y + dy * 0.6;
  S.demoProj.push({
    x: sx, y: sy, rx: sx, ry: sy,
    dx, dy, traveled: 0, trailAcc: 0,
  });
  burst(sx, sy, 10, ['#fff3b0', '#ffd166', '#ff7a1a'], 2.4, dx * 1.1, dy * 1.1);
  ring(sx, sy, '#ffb14d', 0.36, 34);
  S.shake = Math.max(S.shake, 2.2);
  updateHudBars();
}

/* ═══════════════════ INÍCIO DE PARTIDA ═══════════════════ */
function startGame(demo) {
  leaveGame();
  resetPerf();
  S.myName = chosenName();
  const hudName = $('hudName');
  if (hudName) hudName.textContent = S.myName;
  const hudKills = $('hudKills');
  if (hudKills) hudKills.textContent = '0';
  const deathEl = $('deathOverlay');
  if (deathEl) deathEl.classList.add('hidden');

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
  lastT = performance.now();
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
const MOVE_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

// Joystick virtual (metade esquerda da tela) com deadzone radial e raio dinâmico
const joystick = { active: false, dx: 0, dy: 0, id: null, ox: 0, oy: 0, radius: 60 };
const STICK_DEADZONE = 0.12;
const stickEl = $('stick'), knobEl = $('stickKnob');

function updateStickMetrics() {
  if (!stickEl || typeof stickEl.getBoundingClientRect !== 'function') return;
  const r = stickEl.getBoundingClientRect();
  if (r && r.width > 0 && r.height > 0) {
    joystick.ox = r.left + r.width / 2;
    joystick.oy = r.top + r.height / 2;
    joystick.radius = Math.max(24, r.width * 0.5);
  }
}

function resetInputs() {
  const hadInput = keys.size > 0 || joystick.active;
  keys.clear();
  joystick.active = false;
  joystick.dx = 0;
  joystick.dy = 0;
  joystick.id = null;
  if (knobEl) knobEl.style.transform = 'translate(-50%, -50%)';
  if (hadInput && S.mode === 'live') sendMoveInput(true);
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'F3') {
    e.preventDefault();
    S.debug = !S.debug;
    return;
  }
  if (S.screen === 'menu' && e.code === 'Escape') {
    show('landing');
    return;
  }
  if (S.screen !== 'game') return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (MOVE_KEYS.has(e.code) && S.mode === 'live') sendMoveInput(true);
  if (e.code === 'Space' || e.code === 'KeyE') tryDom();
  if (e.code === 'Escape') backToMenu();
});

window.addEventListener('keyup', (e) => {
  const deleted = keys.delete(e.code);
  if (deleted && MOVE_KEYS.has(e.code) && S.screen === 'game' && S.mode === 'live') {
    sendMoveInput(true);
  }
});

window.addEventListener('blur', resetInputs);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) resetInputs();
  else lastT = performance.now();
});

function stickFromTouch(t) {
  const R = joystick.radius || 60;
  const rawX = (t.clientX - joystick.ox) / R;
  const rawY = (t.clientY - joystick.oy) / R;
  const rawMag = Math.hypot(rawX, rawY);
  const clampedMag = Math.min(1, rawMag);
  const ux = rawMag > 0.0001 ? rawX / rawMag : 0;
  const uy = rawMag > 0.0001 ? rawY / rawMag : 0;

  if (clampedMag <= STICK_DEADZONE) {
    joystick.dx = 0;
    joystick.dy = 0;
  } else {
    const eff = (clampedMag - STICK_DEADZONE) / (1 - STICK_DEADZONE);
    joystick.dx = ux * eff;
    joystick.dy = uy * eff;
  }

  if (knobEl) {
    const kx = ux * clampedMag * R;
    const ky = uy * clampedMag * R;
    knobEl.style.transform =
      `translate(calc(-50% + ${kx.toFixed(1)}px), calc(-50% + ${ky.toFixed(1)}px))`;
  }
  if (S.mode === 'live') sendMoveInput(false);
}

stickEl.addEventListener('touchstart', (e) => {
  if (joystick.active) {
    e.preventDefault();
    return;
  }
  const t = e.changedTouches[0];
  if (!t) return;
  joystick.id = t.identifier;
  updateStickMetrics();
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
      joystick.active = false;
      joystick.dx = 0;
      joystick.dy = 0;
      joystick.id = null;
      if (knobEl) knobEl.style.transform = 'translate(-50%, -50%)';
      if (S.mode === 'live') sendMoveInput(true);
    }
  }
}
stickEl.addEventListener('touchend', stickEnd);
stickEl.addEventListener('touchcancel', stickEnd);

// Botão do Dom (touch + mouse)
$('btnDom').addEventListener('touchstart', (e) => { e.preventDefault(); tryDom(); }, { passive: false });
$('btnDom').addEventListener('mousedown', (e) => { e.preventDefault(); tryDom(); });

/* ═══════════════════ CANVAS / RENDER & CACHES ═══════════════════ */
const canvas = $('gameCanvas');
const ctx = canvas.getContext('2d');
let vw = 0, vh = 0, dpr = 1;
let groundPattern = null;
let vignetteGrad = null;
let islandCacheCanvas = null;
let crystals = [], lavaPools = [], rocks = [];
const ISLAND_PAD = 24;

// Sprites pré-processados do herói (evita ctx.filter por frame em mobile/desktop)
const charVariants = { base: null, bot: null, flash: null, ratio: 0.6 };

const charImg = new Image();
charImg.onload = () => buildCharVariants();
charImg.src = 'assets/char-kael.png';

const groundImg = new Image();
groundImg.onload = () => {
  buildGroundPattern();
  buildIslandCache();
};
groundImg.src = 'assets/ground-ignara.png';

function makeOffscreen(w, h) {
  try {
    const c = document.createElement('canvas');
    if (!c || typeof c.getContext !== 'function') return null;
    c.width = w;
    c.height = h;
    const cctx = c.getContext('2d');
    if (!cctx) return null;
    return { canvas: c, ctx: cctx };
  } catch {
    return null;
  }
}

function buildCharVariants() {
  if (!charImg.complete || !charImg.naturalWidth) return;
  const nw = charImg.naturalWidth;
  const nh = charImg.naturalHeight;
  charVariants.ratio = nw / nh;
  charVariants.base = charImg;

  // Sprite escalado para 2x altura de render (300px) para cache leve em VRAM
  const th = Math.min(nh, 300);
  const tw = Math.max(1, Math.round(th * charVariants.ratio));

  // Variante bot (ciano/azul de treino, gerada 1 única vez no carregamento)
  const botOff = makeOffscreen(tw, th);
  if (botOff) {
    const bctx = botOff.ctx;
    try { bctx.filter = 'hue-rotate(155deg) saturate(0.85)'; } catch {}
    bctx.drawImage(charImg, 0, 0, tw, th);
    try { bctx.filter = 'none'; } catch {}
    // Fallback para motores sem suporte a ctx.filter: aplica tint suave preservando alpha
    bctx.globalCompositeOperation = 'source-atop';
    bctx.fillStyle = 'rgba(70, 195, 255, 0.24)';
    bctx.fillRect(0, 0, tw, th);
    bctx.globalCompositeOperation = 'source-over';
    charVariants.bot = botOff.canvas;
  }

  // Variante hit-flash (silhueta quente dourada/branca para feedback de dano sem filter)
  const flashOff = makeOffscreen(tw, th);
  if (flashOff) {
    const fctx = flashOff.ctx;
    fctx.drawImage(charImg, 0, 0, tw, th);
    fctx.globalCompositeOperation = 'source-atop';
    fctx.fillStyle = 'rgba(255, 240, 195, 0.9)';
    fctx.fillRect(0, 0, tw, th);
    fctx.globalCompositeOperation = 'source-over';
    charVariants.flash = flashOff.canvas;
  }
}

// Sprites de brilho radial pré-renderizados (zera createRadialGradient por frame)
const glowSprites = {};
function buildGlowSprite(size, stops) {
  const off = makeOffscreen(size, size);
  if (!off) return null;
  const r = size / 2;
  const g = off.ctx.createRadialGradient(r, r, size * 0.04, r, r, r);
  for (const [offset, color] of stops) g.addColorStop(offset, color);
  off.ctx.fillStyle = g;
  off.ctx.beginPath();
  off.ctx.arc(r, r, r, 0, Math.PI * 2);
  off.ctx.fill();
  return off.canvas;
}

function initGlowSprites() {
  glowSprites.lava = buildGlowSprite(128, [
    [0, 'rgba(255, 130, 25, 0.62)'],
    [0.55, 'rgba(255, 85, 10, 0.22)'],
    [1, 'rgba(255, 60, 0, 0)'],
  ]);
  glowSprites.crystalPink = buildGlowSprite(96, [
    [0, 'rgba(255, 94, 168, 0.48)'],
    [0.55, 'rgba(255, 94, 168, 0.16)'],
    [1, 'rgba(255, 94, 168, 0)'],
  ]);
  glowSprites.crystalViolet = buildGlowSprite(96, [
    [0, 'rgba(155, 77, 255, 0.48)'],
    [0.55, 'rgba(155, 77, 255, 0.16)'],
    [1, 'rgba(155, 77, 255, 0)'],
  ]);
  glowSprites.auraFire = buildGlowSprite(128, [
    [0, 'rgba(255, 135, 35, 0.65)'],
    [0.5, 'rgba(255, 95, 18, 0.25)'],
    [1, 'rgba(255, 70, 10, 0)'],
  ]);
  glowSprites.auraHot = buildGlowSprite(128, [
    [0, 'rgba(255, 220, 95, 0.78)'],
    [0.45, 'rgba(255, 110, 20, 0.38)'],
    [1, 'rgba(255, 50, 0, 0)'],
  ]);
  glowSprites.auraBot = buildGlowSprite(128, [
    [0, 'rgba(80, 200, 255, 0.58)'],
    [0.5, 'rgba(55, 150, 235, 0.2)'],
    [1, 'rgba(80, 200, 255, 0)'],
  ]);
  glowSprites.fireball = buildGlowSprite(64, [
    [0, 'rgba(255, 250, 200, 0.98)'],
    [0.36, 'rgba(255, 165, 42, 0.84)'],
    [0.72, 'rgba(255, 80, 12, 0.32)'],
    [1, 'rgba(255, 60, 0, 0)'],
  ]);
}

function rebuildVignette() {
  if (vw <= 0 || vh <= 0) return;
  vignetteGrad = ctx.createRadialGradient(
    vw / 2, vh / 2, Math.min(vw, vh) * 0.42,
    vw / 2, vh / 2, Math.max(vw, vh) * 0.75
  );
  vignetteGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vignetteGrad.addColorStop(1, 'rgba(2, 3, 8, 0.55)');
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  vw = window.innerWidth;
  vh = window.innerHeight;
  canvas.width = Math.floor(vw * dpr);
  canvas.height = Math.floor(vh * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  rebuildVignette();
  updateStickMetrics();
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

/* ── Decoração da ilha (100% determinística por semente) ── */
function buildDecor() {
  const rng = mulberry32(20260923);
  const sRand = (a, b) => a + rng() * (b - a);
  const W = S.world;
  crystals = [];
  lavaPools = [];
  rocks = [];

  // Poças de lava (elipses com glow)
  let guard = 0;
  while (lavaPools.length < 7 && guard++ < 400) {
    const x = sRand(W.minX + 3, W.maxX - 3);
    const y = sRand(W.minY + 3, W.maxY - 3);
    if (Math.hypot(x, y) < 4) continue; // longe do spawn
    if (lavaPools.some((l) => Math.hypot(l.x - x, l.y - y) < 5)) continue;
    lavaPools.push({
      x, y,
      rx: sRand(0.9, 1.9),
      ry: sRand(0.6, 1.2),
      ph: rng() * 6.28,
    });
  }

  guard = 0;
  while (crystals.length < 26 && guard++ < 800) {
    const x = sRand(W.minX + 1.2, W.maxX - 1.2);
    const y = sRand(W.minY + 1.2, W.maxY - 1.2);
    if (Math.hypot(x, y) < 3) continue; // círculo de spawn livre
    if (lavaPools.some((l) => Math.hypot(l.x - x, l.y - y) < l.rx + 1.2)) continue;
    if (crystals.some((c) => Math.hypot(c.x - x, c.y - y) < 1.4)) continue;
    const h = sRand(14, 30);
    const w = sRand(8, 14);
    const rot = sRand(-0.35, 0.35);
    crystals.push({
      x, y, h, w, rot,
      pink: rng() > 0.35, // rosa vs violeta
      ph: rng() * 6.28,
    });
  }

  guard = 0;
  while (rocks.length < 16 && guard++ < 400) {
    const x = sRand(W.minX + 1, W.maxX - 1);
    const y = sRand(W.minY + 1, W.maxY - 1);
    if (Math.hypot(x, y) < 2.5) continue;
    if (lavaPools.some((l) => Math.hypot(l.x - x, l.y - y) < l.rx + 0.9)) continue;
    rocks.push({ x, y, r: sRand(0.25, 0.7), seed: rng() * 10 });
  }

  buildIslandCache();
}

function drawStaticIslandBase(targetCtx, wx, wy, ww, wh) {
  // Chão vulcânico
  targetCtx.fillStyle = groundPattern || '#1c120d';
  targetCtx.fillRect(wx, wy, ww, wh);

  // Borda da ilha
  targetCtx.strokeStyle = 'rgba(255, 122, 26, 0.16)';
  targetCtx.lineWidth = 3;
  targetCtx.strokeRect(wx + 1.5, wy + 1.5, ww - 3, wh - 3);
  targetCtx.strokeStyle = 'rgba(90, 60, 45, 0.9)';
  targetCtx.lineWidth = 10;
  targetCtx.strokeRect(wx - 5, wy - 5, ww + 10, wh + 10);

  // Rochas estáticas
  for (const r of rocks) {
    const rx = r.x * UNIT, ry = r.y * UNIT, rad = r.r * UNIT;
    targetCtx.fillStyle = '#241813';
    targetCtx.beginPath();
    targetCtx.ellipse(rx, ry, rad, rad * 0.72, r.seed, 0, Math.PI * 2);
    targetCtx.fill();
    targetCtx.fillStyle = 'rgba(255,255,255,0.04)';
    targetCtx.beginPath();
    targetCtx.ellipse(rx - r.r * 8, ry - r.r * 8, rad * 0.55, rad * 0.4, r.seed, 0, Math.PI * 2);
    targetCtx.fill();
  }
}

function buildIslandCache() {
  const W = S.world;
  const ww = Math.round((W.maxX - W.minX) * UNIT);
  const wh = Math.round((W.maxY - W.minY) * UNIT);
  const cw = ww + ISLAND_PAD * 2;
  const ch = wh + ISLAND_PAD * 2;
  const off = makeOffscreen(cw, ch);
  if (!off) {
    islandCacheCanvas = null;
    return;
  }
  const cctx = off.ctx;
  const wx = W.minX * UNIT;
  const wy = W.minY * UNIT;
  cctx.save();
  cctx.translate(-wx + ISLAND_PAD, -wy + ISLAND_PAD);
  drawStaticIslandBase(cctx, wx, wy, ww, wh);
  cctx.restore();
  islandCacheCanvas = off.canvas;
}

/* ── Pool de Partículas (zero GC churn em regime permanente) ── */
const particlePool = [];
const MAX_POOL = 600;

function acquireParticle(x, y, vx, vy, life, size, color, ringMode = false, maxRadius = 46) {
  const p = particlePool.length > 0 ? particlePool.pop() : {};
  p.ring = ringMode;
  p.x = x;
  p.y = y;
  p.vx = vx;
  p.vy = vy;
  p.life = life;
  p.maxLife = life;
  p.size = size;
  p.color = color;
  p.maxRadius = maxRadius;
  return p;
}

function releaseParticleAt(idx) {
  const p = S.particles[idx];
  const last = S.particles.length - 1;
  if (idx !== last) S.particles[idx] = S.particles[last];
  S.particles.pop();
  if (particlePool.length < MAX_POOL) particlePool.push(p);
}

function releaseAllParticles() {
  while (S.particles.length > 0) {
    const p = S.particles.pop();
    if (particlePool.length < MAX_POOL) particlePool.push(p);
  }
}

function makeParticle(x, y, vx, vy, life, size, color) {
  return acquireParticle(x, y, vx, vy, life, size, color, false, 0);
}

function burst(x, y, n, colors, speed, biasVx = 0, biasVy = 0) {
  const count = perf.lowSpec ? Math.max(4, (n * 0.6) | 0) : n;
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const sp = rand(0.3, 1) * speed;
    S.particles.push(acquireParticle(
      x, y,
      Math.cos(a) * sp + biasVx,
      Math.sin(a) * sp - 0.6 + biasVy,
      rand(0.35, 0.8),
      rand(2.5, 5.5),
      colors[(Math.random() * colors.length) | 0],
      false, 0
    ));
  }
}

function ring(x, y, color, duration = 0.45, maxRadius = 46) {
  S.particles.push(acquireParticle(x, y, 0, 0, duration, 0.2, color, true, maxRadius));
}

function spawnCombatText(x, y, text, color = '#ffcf66') {
  if (S.combatTexts.length >= 16) S.combatTexts.shift();
  S.combatTexts.push({ x, y, vy: -1.35, life: 0.75, maxLife: 0.75, text, color });
}

let emberAcc = 0;
function ambient(dt) {
  emberAcc += dt;
  const W = S.world;
  const interval = perf.lowSpec ? 0.38 : 0.22;
  while (emberAcc > interval) {
    emberAcc -= interval;
    S.particles.push(makeParticle(
      rand(W.minX, W.maxX), rand(W.minY, W.maxY),
      rand(-0.15, 0.15), rand(-0.55, -0.2),
      rand(2.5, 4.5), rand(1.5, 3), 'rgba(255,150,60,0.5)'
    ));
  }
}

function emitProjectileTrail(p, dt) {
  p.trailAcc = (p.trailAcc || 0) + dt;
  const trailEvery = perf.lowSpec ? 0.045 : 0.026;
  while (p.trailAcc >= trailEvery) {
    p.trailAcc -= trailEvery;
    S.particles.push(makeParticle(
      p.rx - p.dx * 0.2 + rand(-0.12, 0.12),
      p.ry - p.dy * 0.2 + rand(-0.12, 0.12),
      -p.dx * 0.8 + rand(-0.3, 0.3),
      -p.dy * 0.8 + rand(-0.6, -0.1),
      rand(0.22, 0.42), rand(2.2, 4.2),
      Math.random() > 0.35 ? '#ff9a3c' : '#ffd166'
    ));
  }
}

/* ── Loop principal ── */
let cam = { x: 0, y: 0, init: false };
let lastT = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const rawDtMs = now - lastT;
  const dt = Math.min(Math.max(rawDtMs / 1000, 0.001), 0.1);
  lastT = now;
  if (S.screen !== 'game') return;

  const frameStart = performance.now();

  // Interpolação suave (estado autoritativo a 20 Hz → render a 60+ fps)
  const actors = [];
  if (S.me) actors.push(S.me);
  for (const r of S.remotes.values()) actors.push(r);
  for (const b of S.demoBots) actors.push(b);

  const localInput = S.mode === 'live' ? computeInputVector() : null;

  for (const a of actors) {
    if (!a.rxInit) { a.rx = a.x; a.ry = a.y; a.rxInit = true; }
    const errDist = Math.hypot(a.x - a.rx, a.y - a.ry);
    if (errDist > 3) {
      a.rx = a.x;
      a.ry = a.y;
    } else if (S.mode === 'live' && a.alive) {
      const sinceSnap = (now - (a.lastSnapAt || now)) / 1000;
      if (a.isLocal && localInput && sinceSnap < 0.085) {
        // Suavização visual sub-tick limitada por coleira estrita ao servidor autoritativo
        const spd = S.moveSpeed || 4;
        const leadX = clamp(a.x + localInput.dx * spd * Math.min(sinceSnap, 0.05), S.world.minX, S.world.maxX);
        const leadY = clamp(a.y + localInput.dy * spd * Math.min(sinceSnap, 0.05), S.world.minY, S.world.maxY);
        a.rx = damp(a.rx, leadX, 18, dt);
        a.ry = damp(a.ry, leadY, 18, dt);
      } else if (!a.isLocal && sinceSnap < 0.075) {
        const predX = clamp(a.x + (a.vx || 0) * sinceSnap * 0.65, S.world.minX, S.world.maxX);
        const predY = clamp(a.y + (a.vy || 0) * sinceSnap * 0.65, S.world.minY, S.world.maxY);
        a.rx = damp(a.rx, predX, 15, dt);
        a.ry = damp(a.ry, predY, 15, dt);
      } else {
        a.rx = damp(a.rx, a.x, 15, dt);
        a.ry = damp(a.ry, a.y, 15, dt);
      }
    } else {
      a.rx = damp(a.rx, a.x, 16, dt);
      a.ry = damp(a.ry, a.y, 16, dt);
    }

    a.alpha = Math.min(1, a.alpha + dt * 2.8);
    if (a.castAnim > 0) a.castAnim = Math.max(0, a.castAnim - dt * 3.6);
    if (a.hitFlash > 0) a.hitFlash = Math.max(0, a.hitFlash - dt * 4.5);

    // Detecção de movimento para animação de passada e poeira vulcânica
    const spdMag = a.isLocal && localInput
      ? localInput.mag
      : Math.min(1, Math.hypot(a.vx || (a.x - a.rx) * 10, a.vy || (a.y - a.ry) * 10) / 2.2);
    const moving = a.alive && spdMag > 0.08 ? 1 : 0;
    a.moveBlend = damp(a.moveBlend || 0, moving, 12, dt);

    if (a.alive && a.moveBlend > 0.35 && !perf.lowSpec) {
      a.stepAcc = (a.stepAcc || 0) + dt * (1 + a.moveBlend);
      if (a.stepAcc > 0.24) {
        a.stepAcc = 0;
        S.particles.push(makeParticle(
          a.rx + rand(-0.22, 0.22), a.ry + 1.25,
          rand(-0.25, 0.25), rand(-0.45, -0.15),
          rand(0.25, 0.45), rand(2, 3.6),
          'rgba(255, 175, 95, 0.42)'
        ));
      }
    }
  }

  // Avanço fluido dos projéteis (multiplayer + demo) com emissão de trilha de brasas
  const projSpeed = S.dom.speed || 9;
  for (const p of S.projectiles.values()) {
    if (!p.rxInit) { p.rx = p.x; p.ry = p.y; p.rxInit = true; }
    p.rx += p.dx * projSpeed * dt;
    p.ry += p.dy * projSpeed * dt;
    if (Math.hypot(p.x - p.rx, p.y - p.ry) > 1.8) {
      p.rx = p.x; p.ry = p.y;
    } else {
      p.rx = damp(p.rx, p.x, 14, dt);
      p.ry = damp(p.ry, p.y, 14, dt);
    }
    emitProjectileTrail(p, dt);
  }

  for (const p of S.demoProj) {
    if (p.rx === undefined) { p.rx = p.x; p.ry = p.y; }
    p.rx = damp(p.rx, p.x, 22, dt);
    p.ry = damp(p.ry, p.y, 22, dt);
    emitProjectileTrail(p, dt);
  }

  // Câmera com amortecimento exponencial independente de frame-rate
  const me = S.me;
  if (me) {
    const halfW = vw / 2 / UNIT, halfH = vh / 2 / UNIT, M = 1.5;
    let tx = me.rx, ty = me.ry;
    const W = S.world;
    tx = (W.maxX - W.minX) < 2 * halfW ? (W.minX + W.maxX) / 2 : clamp(tx, W.minX - M + halfW, W.maxX + M - halfW);
    ty = (W.maxY - W.minY) < 2 * halfH ? (W.minY + W.maxY) / 2 : clamp(ty, W.minY - M + halfH, W.maxY + M - halfH);
    if (!cam.init) { cam.x = tx; cam.y = ty; cam.init = true; }
    cam.x = damp(cam.x, tx, 7.5, dt);
    cam.y = damp(cam.y, ty, 7.5, dt);
  }

  // Partículas de aura (fogo de Ignara + Sangue Quente quando HP < 50%)
  const emitScale = perf.lowSpec ? 1.65 : 1;
  for (const a of actors) {
    if (!a.alive) continue;
    a._fAcc = (a._fAcc || 0) + dt;
    const hotBlood = (a.hp ?? 100) < (a.maxHp || 100) * 0.5;
    const baseEvery = a.isLocal || a.bot ? 0.065 : 0.14;
    const every = (hotBlood ? baseEvery * 0.68 : baseEvery) * emitScale;
    while (a._fAcc > every) {
      a._fAcc -= every;
      const col = a.bot
        ? (Math.random() > 0.4 ? '#39c6ff' : '#9fe0ff')
        : (hotBlood && Math.random() > 0.5 ? '#fff3b0' : (Math.random() > 0.4 ? '#ff7a1a' : '#ffd166'));
      S.particles.push(makeParticle(
        a.rx + rand(-0.35, 0.35), a.ry + rand(0.1, 0.9),
        rand(-0.12, 0.12), rand(hotBlood ? -1.45 : -1.1, -0.5),
        rand(0.4, 0.8), rand(2.5, 5), col
      ));
    }
  }

  ambient(dt);

  // Física de partículas com remoção O(1) swap-and-pop + pool
  const maxParticles = perf.lowSpec ? 360 : 750;
  for (let i = S.particles.length - 1; i >= 0; i--) {
    const p = S.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      releaseParticleAt(i);
      continue;
    }
    if (!p.ring) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }
  while (S.particles.length > maxParticles) {
    releaseParticleAt(S.particles.length - 1);
  }

  // Textos flutuantes de dano
  for (let i = S.combatTexts.length - 1; i >= 0; i--) {
    const ct = S.combatTexts[i];
    ct.life -= dt;
    if (ct.life <= 0) {
      S.combatTexts.splice(i, 1);
      continue;
    }
    ct.y += ct.vy * dt;
    ct.vy *= 0.94;
  }

  if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 14);

  render(now / 1000);
  updateHudBars();

  const workMs = performance.now() - frameStart;
  recordPerf(rawDtMs, workMs);
}

function render(t) {
  ctx.clearRect(0, 0, vw, vh);
  const shx = S.shake > 0 ? rand(-S.shake, S.shake) : 0;
  const shy = S.shake > 0 ? rand(-S.shake, S.shake) : 0;
  const ox = vw / 2 - cam.x * UNIT + shx;
  const oy = vh / 2 - cam.y * UNIT + shy;

  // Limites visíveis da câmera em coordenadas de mundo (frustum culling)
  const halfW = vw / (2 * UNIT) + 2.4;
  const halfH = vh / (2 * UNIT) + 3.2;
  const vMinX = cam.x - halfW, vMaxX = cam.x + halfW;
  const vMinY = cam.y - halfH, vMaxY = cam.y + halfH;

  ctx.save();
  ctx.translate(ox, oy);

  const W = S.world;
  const wx = W.minX * UNIT, wy = W.minY * UNIT;
  const ww = (W.maxX - W.minX) * UNIT, wh = (W.maxY - W.minY) * UNIT;

  // Vazio ao redor da ilha (restrito à viewport atual)
  ctx.fillStyle = '#04060c';
  ctx.fillRect(-ox, -oy, vw, vh);

  // Chão vulcânico + bordas + rochas (camada pré-renderizada única!)
  if (islandCacheCanvas) {
    ctx.drawImage(islandCacheCanvas, wx - ISLAND_PAD, wy - ISLAND_PAD);
  } else {
    drawStaticIslandBase(ctx, wx, wy, ww, wh);
  }

  // Poças de lava (com pulso e culling de viewport)
  for (const l of lavaPools) {
    if (l.x + l.rx * 2 < vMinX || l.x - l.rx * 2 > vMaxX ||
        l.y + l.ry * 2 < vMinY || l.y - l.ry * 2 > vMaxY) continue;
    const pulse = 0.75 + 0.25 * Math.sin(t * 1.7 + l.ph);
    const x = l.x * UNIT, y = l.y * UNIT, rx = l.rx * UNIT, ry = l.ry * UNIT;
    if (glowSprites.lava) {
      ctx.globalAlpha = pulse;
      ctx.drawImage(glowSprites.lava, x - rx * 1.9, y - ry * 1.9, rx * 3.8, ry * 3.8);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = `rgba(255, ${(120 + 60 * pulse) | 0}, 10, 0.85)`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 235, 140, 0.55)';
    ctx.beginPath();
    ctx.ellipse(x - rx * 0.2, y - ry * 0.25, rx * 0.45, ry * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cristais (rosa/violeta com brilho pré-renderizado + culling)
  for (const c of crystals) {
    if (c.x < vMinX || c.x > vMaxX || c.y < vMinY || c.y > vMaxY) continue;
    const x = c.x * UNIT, y = c.y * UNIT;
    const glow = 0.5 + 0.5 * Math.sin(t * 2.2 + c.ph);
    const glowImg = c.pink ? glowSprites.crystalPink : glowSprites.crystalViolet;
    const rad = c.h * 1.7;
    if (glowImg) {
      ctx.globalAlpha = glow;
      ctx.drawImage(glowImg, x - rad, y - 6 - rad, rad * 2, rad * 2);
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(c.rot);
    ctx.fillStyle = c.pink ? 'rgb(255, 94, 168)' : 'rgb(155, 77, 255)';
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
    ctx.fillStyle = c.pink ? 'rgba(255, 94, 168, 0.85)' : 'rgba(155, 77, 255, 0.85)';
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
  for (const a of actors) {
    if (a.rx < vMinX - 1 || a.rx > vMaxX + 1 || a.ry < vMinY - 1 || a.ry > vMaxY + 2) continue;
    drawActor(a, t);
  }

  // Projéteis (autoritativos + demo)
  ctx.globalCompositeOperation = 'lighter';
  for (const p of S.projectiles.values()) drawProjectile(p, t);
  for (const p of S.demoProj) drawProjectile(p, t);

  // Partículas (com culling de viewport)
  for (let i = 0; i < S.particles.length; i++) {
    const p = S.particles[i];
    if (p.x < vMinX || p.x > vMaxX || p.y < vMinY || p.y > vMaxY) continue;
    const a = p.life / p.maxLife;
    if (p.ring) {
      const r = (1 - a) * (p.maxRadius || 46) + 6;
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = a * 0.9;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x * UNIT, p.y * UNIT, r, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x * UNIT, p.y * UNIT, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // Textos flutuantes de dano (-25)
  if (S.combatTexts.length > 0) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '800 15px Sora, sans-serif';
    for (const ct of S.combatTexts) {
      const a = clamp(ct.life / ct.maxLife, 0, 1);
      const sx = ct.x * UNIT, sy = ct.y * UNIT;
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillText(ct.text, sx + 1, sy + 1);
      ctx.fillStyle = ct.color;
      ctx.fillText(ct.text, sx, sy);
    }
    ctx.restore();
  }

  ctx.restore();

  // Vinheta de tela (gradiente em cache no resize)
  if (vignetteGrad) {
    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(0, 0, vw, vh);
  }

  if (S.debug) drawDebugOverlay();
}

function drawProjectile(p, t) {
  const x = (p.rx ?? p.x) * UNIT;
  const y = (p.ry ?? p.y) * UNIT;
  const flicker = 0.88 + 0.12 * Math.sin(t * 28 + x * 0.1);

  // Cauda externa de fogo
  ctx.strokeStyle = 'rgba(255, 95, 20, 0.42)';
  ctx.lineWidth = 10 * flicker;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - p.dx * 38, y - p.dy * 38);
  ctx.lineTo(x, y);
  ctx.stroke();

  // Rastro interno incandescente
  ctx.strokeStyle = 'rgba(255, 215, 110, 0.78)';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(x - p.dx * 22, y - p.dy * 22);
  ctx.lineTo(x, y);
  ctx.stroke();

  // Núcleo com glow sprite pré-renderizado
  const r = 18 * flicker;
  if (glowSprites.fireball) {
    ctx.drawImage(glowSprites.fireball, x - r, y - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = 'rgba(255, 240, 170, 0.95)';
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawActor(a, t) {
  if (!a.alive) return;
  const x = a.rx * UNIT, y = a.ry * UNIT;
  const H = 150; // altura visual do herói
  const hasImg = charImg.complete && charImg.naturalWidth > 0;
  const w = hasImg ? H * charVariants.ratio : 60;

  const moveBlend = a.moveBlend || 0;
  const walkFreq = 2.6 + moveBlend * 6.2;
  const walkAmp = 2.2 + moveBlend * 2.4;
  const bob = Math.sin(t * walkFreq + (a.rx + a.ry) * 2.5) * walkAmp;
  const hotBlood = (a.hp ?? 100) < (a.maxHp || 100) * 0.5;
  const castBoost = a.castAnim || 0;

  ctx.save();
  ctx.globalAlpha = a.alpha ?? 1;

  // Aura de fogo (Dom natal de Ignara) — intensifica com Sangue Quente (<50% HP) ou conjuração
  const auraR = (a.isLocal || a.bot ? 62 : 48) + castBoost * 16 + (hotBlood ? 8 : 0);
  const pulse = 0.78 + 0.22 * Math.sin(t * (hotBlood ? 5.2 : 3.1) + x * 0.01);
  const auraSprite = a.bot
    ? glowSprites.auraBot
    : (hotBlood || castBoost > 0.2 ? glowSprites.auraHot : glowSprites.auraFire);
  if (auraSprite) {
    ctx.globalAlpha = (a.alpha ?? 1) * pulse * (a.isLocal || a.bot ? 0.95 : 0.72);
    ctx.drawImage(auraSprite, x - auraR, y + 26 - auraR, auraR * 2, auraR * 2);
    ctx.globalAlpha = a.alpha ?? 1;
  }

  // Indicador sutil de direção/mira sob o herói local
  if (a.isLocal) {
    const aimAng = Math.atan2(a.dirY || 0, a.dirX || 1);
    ctx.strokeStyle = hotBlood ? 'rgba(255, 220, 110, 0.65)' : 'rgba(255, 145, 50, 0.48)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y + 58, 34, aimAng - 0.42, aimAng + 0.42);
    ctx.stroke();
  }

  // Arco de conjuração quando lança o Dom de Fogo
  if (castBoost > 0.05) {
    const aimAng = Math.atan2(a.dirY || 0, a.dirX || 1);
    ctx.strokeStyle = `rgba(255, 215, 110, ${castBoost * 0.85})`;
    ctx.lineWidth = 4 * castBoost;
    ctx.beginPath();
    ctx.arc(x + (a.dirX || 1) * 14, y + 20 + (a.dirY || 0) * 14, 36 + (1 - castBoost) * 18, aimAng - 0.8, aimAng + 0.8);
    ctx.stroke();
  }

  // Sombra
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath();
  ctx.ellipse(x, y + 62, 30 - moveBlend * 2, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // Corpo (usa variante pré-renderizada para bots e hit-flash, zero ctx.filter por frame)
  ctx.save();
  ctx.translate(x, y + bob);
  const lean = (a.face ?? 1) * moveBlend * 0.045;
  if (lean !== 0) ctx.rotate(lean);
  if ((a.face ?? 1) < 0) ctx.scale(-1, 1);

  if (hasImg) {
    const sprite = (a.bot && charVariants.bot) ? charVariants.bot : charImg;
    ctx.drawImage(sprite, -w / 2, -H + 62, w, H);
    if (a.hitFlash > 0.05 && charVariants.flash) {
      ctx.globalAlpha = (a.alpha ?? 1) * a.hitFlash * 0.78;
      ctx.drawImage(charVariants.flash, -w / 2, -H + 62, w, H);
    }
  } else {
    ctx.fillStyle = a.hitFlash > 0.2 ? '#fff3b0' : (a.bot ? '#39c6ff' : '#ff7a1a');
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Nome + barras de HP/energia (largura do texto em cache por ator)
  ctx.textAlign = 'center';
  ctx.font = '700 13px Sora, sans-serif';
  const label = a.name + (a.isLocal ? ' (você)' : '');
  if (a._label !== label || !a._labelW) {
    a._label = label;
    a._labelW = ctx.measureText(label).width;
  }
  const tw = a._labelW;
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
  ctx.fillStyle = hotBlood ? '#ff9a3c' : '#fbbf24';
  roundRect(nx - bw / 2, ny + 17, bw * clamp((a.energy ?? 100) / (a.maxEnergy || 100), 0, 1), 4.5, 2.2); ctx.fill();
  ctx.restore();
}

function drawDebugOverlay() {
  const snap = window.__CRYSTALIA_PERF__.getSnapshot();
  ctx.save();
  ctx.font = '600 11px monospace';
  ctx.textAlign = 'left';
  const bx = 16, by = 148, bw = 244, bh = 68;
  ctx.fillStyle = 'rgba(6, 9, 16, 0.82)';
  roundRect(bx, by, bw, bh, 8);
  ctx.fill();
  ctx.fillStyle = snap.fps >= 50 ? '#2ee66b' : (snap.fps >= 30 ? '#fbbf24' : '#ff4d4d');
  ctx.fillText(`FPS: ${snap.fps.toFixed(1)} | 1%low: ${snap.low1Fps.toFixed(1)} | min: ${snap.minFps.toFixed(0)}`, bx + 10, by + 18);
  ctx.fillStyle = '#e9eefb';
  ctx.fillText(`CPU: ${snap.frameWorkMs.toFixed(2)}ms (P95: ${snap.p95WorkMs.toFixed(2)}ms) DPR:${dpr}`, bx + 10, by + 36);
  ctx.fillText(`Ptcl: ${snap.particles} | Act: ${snap.actors} | Prj: ${snap.projectiles}`, bx + 10, by + 54);
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
initGlowSprites();
buildCharVariants();
buildGroundPattern();
buildDecor();
resize();
requestAnimationFrame(frame);
