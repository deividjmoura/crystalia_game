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

class IgnaraRoom {
  constructor() {
    this.players = new Map(); // sessionId -> player
    this.inputs = new Map(); // sessionId -> { dx, dy }
    this._nextId = 1;

    this.tickInterval = setInterval(() => this._fixedTick(1 / TICK_RATE), 1000 / TICK_RATE);
  }

  join(ws, displayName) {
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
      displayName: String(displayName ?? "").trim().slice(0, 20) || "Aventureiro",
      lastFogoAt: 0,
    };
    // TODO: carregar posição/HP salvos do Supabase pelo player_id autenticado
    this.players.set(sessionId, player);
    this.inputs.set(sessionId, { dx: 0, dy: 0 });
    this._send(ws, { type: "welcome", sessionId });
    return sessionId;
  }

  leave(sessionId) {
    if (!this.players.has(sessionId)) return;
    this.players.delete(sessionId);
    this.inputs.delete(sessionId);
    this._broadcast({ type: "player_left", sessionId });
    // TODO: persistir estado final do jogador no Supabase
  }

  handleMessage(sessionId, raw) {
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
    const now = Date.now();

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

    setTimeout(() => {
      const p = this.players.get(sessionId);
      if (!p) return;
      p.alive = true;
      p.hp = p.maxHp;
      p.energy = p.maxEnergy;
      p.x = 0;
      p.y = 0;
      this._broadcast({ type: "event", name: "player_respawned", sessionId });
    }, RESPAWN_MS);
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
