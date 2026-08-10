// Sala de Ignara — a mesma ideia de "servidor autoritativo" de antes,
// só que sem depender do protocolo binário do Colyseus. Cada conexão
// WebSocket manda mensagens JSON simples: { type: "...", ...dados }.
//
// O cliente NUNCA manda posição, dano ou XP prontos — só intenção
// (direção de movimento, "usar habilidade X"). Quem calcula o resultado
// é sempre este arquivo.

const MOVE_SPEED = 4; // unidades de mundo por segundo
const TICK_RATE = 20; // ticks por segundo

class IgnaraRoom {
  constructor() {
    this.players = new Map(); // sessionId -> { ws, x, y, hp, maxHp, energy, maxEnergy, displayName }
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
      displayName: String(displayName || "Aventureiro").slice(0, 20),
    };
    // TODO: carregar posição/HP salvos do Supabase pelo player_id autenticado
    this.players.set(sessionId, player);
    this.inputs.set(sessionId, { dx: 0, dy: 0 });
    this._send(ws, { type: "welcome", sessionId });
    return sessionId;
  }

  leave(sessionId) {
    this.players.delete(sessionId);
    this.inputs.delete(sessionId);
    // TODO: persistir estado final do jogador no Supabase
  }

  handleMessage(sessionId, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return; // mensagem malformada, ignora
    }

    if (msg.type === "move_input") {
      const dx = Math.max(-1, Math.min(1, Number(msg.dx) || 0));
      const dy = Math.max(-1, Math.min(1, Number(msg.dy) || 0));
      this.inputs.set(sessionId, { dx, dy });
    } else if (msg.type === "use_dom_fogo") {
      this._handleDomFogo(sessionId);
    }
  }

  _handleDomFogo(sessionId) {
    const player = this.players.get(sessionId);
    if (!player) return;
    // placeholder da habilidade ativa do Dom — validar custo/cooldown aqui,
    // sempre usando o relógio do servidor, nunca um timestamp do cliente.
  }

  _fixedTick(deltaSeconds) {
    for (const [sessionId, input] of this.inputs.entries()) {
      const player = this.players.get(sessionId);
      if (!player) continue;

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
        displayName: player.displayName,
      };
    }
    const payload = JSON.stringify({ type: "state", players: snapshot });
    for (const player of this.players.values()) {
      if (player.ws.readyState === player.ws.OPEN) {
        player.ws.send(payload);
      }
    }
  }

  _send(ws, obj) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }
}

module.exports = { IgnaraRoom };
