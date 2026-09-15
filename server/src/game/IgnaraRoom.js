// Sala de Ignara — servidor autoritativo.
//
// Cada conexão WebSocket troca mensagens JSON simples: { type: "...", ...dados }.
// O cliente NUNCA manda posição, dano ou XP prontos — só intenção
// (direção de movimento, "usar habilidade"). Quem calcula o resultado é
// sempre este arquivo.

const MOVE_SPEED = 4; // unidades de mundo por segundo
const TICK_RATE = 20; // ticks por segundo

// --- Dom de Fogo (parâmetros decididos e validados no servidor) ---
const FOGO_ENERGY_COST = 20;
const FOGO_COOLDOWN_MS = 700;
const FOGO_RANGE = 2.6; // unidades de mundo (cada unidade = 32px no cliente)
const FOGO_DAMAGE = 25;
const RESPAWN_MS = 3000;

// --- Guard rails anti-abuso (validados no servidor, nunca pelo cliente) ---
const MSG_RATE_LIMIT = 60; // mensagens por segundo por conexão
const STRIKE_LIMIT = 3; // janelas consecutivas de excesso até kick (close 1008)

class IgnaraRoom {
  // `options` existe para os testes (node:test) — em produção o construtor
  // é chamado sem argumentos e usa os valores/relógio reais. A autoridade
  // continua 100% no servidor; só trocamos COMO lemos o relógio.
  constructor(options = {}) {
    this.players = new Map(); // sessionId -> player
    this.inputs = new Map(); // sessionId -> { dx, dy }
    this._msgWindows = new Map(); // sessionId -> { start, count }  (rate-limit)
    this._strikes = new Map(); // sessionId -> strikes consecutivos de flood
    this._nextId = 1;

    this._now = options.now || Date.now;
    this._respawnMs = options.respawnMs ?? RESPAWN_MS;
    this._respawnTimers = new Set();
    const tickRate = options.tickRate ?? TICK_RATE;
    this._autoTick = options.autoTick !== false;

    if (this._autoTick) {
      this.tickInterval = setInterval(
        () => this._fixedTick(1 / tickRate),
        1000 / tickRate
      );
    }
  }

  /** Para o tick periódico e respawns pendentes (shutdown / fim de teste). */
  destroy() {
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.tickInterval = null;
    for (const timer of this._respawnTimers) clearTimeout(timer);
    this._respawnTimers.clear();
  }

  join(ws, displayName) {
    const cleanName =
      String(displayName ?? "").trim().slice(0, 20) || "Aventureiro";

    // Guard rail 0 (anti-fantasma): o mesmo nome em duas sessões ativas é
    // prova quase certa de reconexão (reload / segunda aba). A nova assume —
    // a velha é desconectada e sai do mundo (issue #18).
    const ghostIds = [];
    for (const [oldId, old] of this.players) {
      if (old.displayName.toLowerCase() === cleanName.toLowerCase()) {
        this._send(old.ws, { type: "kicked", reason: "reconnected_elsewhere" });
        try { old.ws.close(1000, "reconnected_elsewhere"); } catch { /* fake ws */ }
        this.players.delete(oldId);
        this.inputs.delete(oldId);
        this._msgWindows.delete(oldId);
        this._strikes.delete(oldId);
        ghostIds.push(oldId);
      }
    }

    const sessionId = `p${this._nextId++}`;
    const player = {
      ws,
      x: 0,
      y: 0,
      hp: 100,
      maxHp: 100,
      energy: 100,
      maxEnergy: 100,
      alive: true,
      // trim antes do fallback: "   " (truthy) não pode virar o nome exibido.
      displayName: cleanName,
      lastFogoAt: 0,
    };
    // TODO: carregar posição/HP salvos do Supabase pelo player_id autenticado
    this.players.set(sessionId, player);
    this.inputs.set(sessionId, { dx: 0, dy: 0 });
    this._send(ws, { type: "welcome", sessionId });
    // player_left do fantasma trafega DEPOIS do welcome — até o próprio
    // novo recebe (killer guard: remove o sprite antigo se a aba velha ainda
    // estiver renderizando ele por algum motivo de cache/arrival order).
    for (const ghostId of ghostIds) {
      this._broadcast({ type: "player_left", sessionId: ghostId });
    }
    return sessionId;
  }

  leave(sessionId) {
    if (!this.players.has(sessionId)) return;
    this.players.delete(sessionId);
    this.inputs.delete(sessionId);
    this._msgWindows.delete(sessionId);
    this._strikes.delete(sessionId);
    this._broadcast({ type: "player_left", sessionId });
    // TODO: persistir estado final do jogador no Supabase
  }

  handleMessage(sessionId, raw) {
    // Guard rail 1 (rate-limit): janela de 1s. Passou limpo → strikes zeram.
    // Flood repetido → 3 janelas seguidas = kick (protocol-level, sem mute).
    const now = this._now();
    let win = this._msgWindows.get(sessionId);
    if (!win || now - win.start >= 1000) {
      // Zera strikes só se a janela ANTERIOR respeitou o limite — 3 floods
      // seguidos não se perdoam (pegado pelos testes em guardrails.test.js).
      if (win && win.count <= MSG_RATE_LIMIT) this._strikes.set(sessionId, 0);
      win = { start: now, count: 0 };
      this._msgWindows.set(sessionId, win);
    }
    win.count++;
    if (win.count > MSG_RATE_LIMIT) {
      const strikes = (this._strikes.get(sessionId) || 0) + 1;
      this._strikes.set(sessionId, strikes);
      const name = this.players.get(sessionId)?.displayName ?? sessionId;
      console.warn(
        `[guard-rail] rate-limit: ${sessionId} (${name}) mandou ${win.count} msg/s ` +
        `(limite ${MSG_RATE_LIMIT}) — strike ${strikes}/${STRIKE_LIMIT}`
      );
      if (strikes >= STRIKE_LIMIT && this.players.has(sessionId)) {
        const p = this.players.get(sessionId);
        this._send(p.ws, { type: "kicked", reason: "message_flood" });
        try { p.ws.close(1008, "message_flood"); } catch { /* fake ws */ }
        this.leave(sessionId);
      }
      return;
    }

    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return; // mensagem malformada, ignora
    }

    const player = this.players.get(sessionId);
    if (!player) return;

    if (msg.type === "move_input") {
      let dx = Math.max(-1, Math.min(1, Number(msg.dx) || 0));
      let dy = Math.max(-1, Math.min(1, Number(msg.dy) || 0));
      // Normaliza a diagonal — senão o jogador anda ~41% mais rápido.
      const mag = Math.hypot(dx, dy);
      if (mag > 1) {
        dx /= mag;
        dy /= mag;
      }
      this.inputs.set(sessionId, { dx, dy });
    } else if (msg.type === "use_dom_fogo") {
      this._handleDomFogo(sessionId, player);
    }
  }

  _handleDomFogo(sessionId, player) {
    const now = this._now();

    // Toda validação usa o relógio do servidor — nunca timestamp do cliente.
    if (!player.alive) return;
    if (now - player.lastFogoAt < FOGO_COOLDOWN_MS) return;
    if (player.energy < FOGO_ENERGY_COST) return;

    player.lastFogoAt = now;
    player.energy -= FOGO_ENERGY_COST;

    const hitSessionIds = [];
    for (const [otherId, other] of this.players) {
      if (otherId === sessionId || !other.alive) continue;
      const dist = Math.hypot(other.x - player.x, other.y - player.y);
      if (dist <= FOGO_RANGE) {
        other.hp = Math.max(0, other.hp - FOGO_DAMAGE);
        hitSessionIds.push(otherId);
        if (other.hp === 0) {
          this._killPlayer(otherId, sessionId);
        }
      }
    }

    this._broadcast({
      type: "event",
      name: "dom_fogo_cast",
      sessionId,
      x: player.x,
      y: player.y,
      range: FOGO_RANGE,
      hitSessionIds,
    });
  }

  _killPlayer(sessionId, killerId) {
    const player = this.players.get(sessionId);
    if (!player || !player.alive) return;

    player.alive = false;
    this.inputs.set(sessionId, { dx: 0, dy: 0 });
    this._broadcast({ type: "event", name: "player_died", sessionId, killerId });

    const timer = setTimeout(() => {
      this._respawnTimers.delete(timer);
      const p = this.players.get(sessionId);
      if (!p) return;
      p.alive = true;
      p.hp = p.maxHp;
      p.energy = p.maxEnergy;
      p.x = 0;
      p.y = 0;
      this._broadcast({ type: "event", name: "player_respawned", sessionId });
    }, this._respawnMs);
    this._respawnTimers.add(timer);
  }

  _fixedTick(deltaSeconds) {
    for (const [sessionId, input] of this.inputs.entries()) {
      const player = this.players.get(sessionId);
      if (!player || !player.alive) continue;

      player.x += input.dx * MOVE_SPEED * deltaSeconds;
      player.y += input.dy * MOVE_SPEED * deltaSeconds;

      // Dom de Fogo (Sangue Quente): regen de energia acelerada com HP < 50%
      const regenRate = player.hp < player.maxHp * 0.5 ? 12 : 5;
      player.energy = Math.min(player.maxEnergy, player.energy + regenRate * deltaSeconds);
    }

    this._broadcastState();
  }

  _broadcastState() {
    const snapshot = {};
    for (const [sessionId, player] of this.players.entries()) {
      snapshot[sessionId] = {
        x: player.x,
        y: player.y,
        hp: player.hp,
        maxHp: player.maxHp,
        energy: player.energy,
        maxEnergy: player.maxEnergy,
        alive: player.alive,
        displayName: player.displayName,
      };
    }
    this._broadcast({ type: "state", players: snapshot });
  }

  _broadcast(obj) {
    const payload = JSON.stringify(obj);
    for (const player of this.players.values()) {
      this._send(player.ws, payload);
    }
  }

  _send(ws, obj) {
    const data = typeof obj === "string" ? obj : JSON.stringify(obj);
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  }
}

module.exports = { IgnaraRoom };
