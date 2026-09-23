// Sala de Ignara — servidor autoritativo.
//
// Cada conexão WebSocket troca mensagens JSON simples: { type: "...", ...dados }.
// O cliente NUNCA manda posição, dano ou XP prontos — só intenção
// (direção de movimento, "usar habilidade"). Quem calcula o resultado é
// sempre este arquivo.
//
// v1.1 (2026-09-23): o Dom de Fogo virou PROJÉTIL autoritativo (a bola de
// fogo existe no servidor, viaja no tick e colide aqui), o custo subiu para
// 25 de energia, o snapshot passou a carregar kills/dir dos jogadores e a
// lista de projéteis vivos. Detalhes no docs/PROTOCOL.md.

const MOVE_SPEED = 4; // unidades de mundo por segundo
const TICK_RATE = 20; // ticks por segundo

// Limites da ilha (em unidades de mundo) — o servidor CLAMPA a posição;
// o cliente usa os mesmos valores (recebidos no welcome) para desenhar o mapa.
const WORLD = { minX: -16, maxX: 16, minY: -12, maxY: 12 };

// --- Dom de Fogo (parâmetros decididos e validados no servidor) ---
const FOGO_ENERGY_COST = 25;
const FOGO_COOLDOWN_MS = 700;
const FOGO_DAMAGE = 25;
const FOGO_SPEED = 9; // velocidade do projétil (unidades de mundo/s)
const FOGO_RANGE = 7; // alcance máximo do projétil (unidades de mundo)
const FOGO_HIT_RADIUS = 0.55; // raio de colisão projétil ↔ jogador
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
    this.projectiles = new Map(); // projectileId -> projétil
    this._msgWindows = new Map(); // sessionId -> { start, count }  (rate-limit)
    this._strikes = new Map(); // sessionId -> strikes consecutivos de flood
    this._nextId = 1;
    this._nextProjectileId = 1;

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
    this.projectiles.clear();
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
      dirX: 1, // última direção de olhar (non-zero) — mira do Dom de Fogo
      dirY: 0,
      hp: 100,
      maxHp: 100,
      energy: 100,
      maxEnergy: 100,
      alive: true,
      kills: 0,
      // trim antes do fallback: "   " (truthy) não pode virar o nome exibido.
      displayName: cleanName,
      lastFogoAt: 0,
    };
    // TODO: carregar posição/HP salvos do Supabase pelo player_id autenticado
    this.players.set(sessionId, player);
    this.inputs.set(sessionId, { dx: 0, dy: 0 });
    this._send(ws, {
      type: "welcome",
      sessionId,
      world: WORLD,
      tickRate: TICK_RATE,
      moveSpeed: MOVE_SPEED,
      dom: {
        cost: FOGO_ENERGY_COST,
        cooldownMs: FOGO_COOLDOWN_MS,
        damage: FOGO_DAMAGE,
        speed: FOGO_SPEED,
        range: FOGO_RANGE,
      },
    });
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
      // Mira do Dom de Fogo: última direção de intenção NÃO nula. Assim o
      // jogador anda, para e atira para onde olhava por último.
      if (mag > 0.01) {
        player.dirX = dx / (mag > 1 ? mag : 1);
        player.dirY = dy / (mag > 1 ? mag : 1);
      }
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

    // O projétil nasce no servidor e viaja no tick autoritativo — o cliente
    // só desenha. Direção = última direção de olhar do atirador.
    const id = `b${this._nextProjectileId++}`;
    const spawnOffset = 0.6; // nasce um pouco à frente do atirador
    this.projectiles.set(id, {
      id,
      ownerId: sessionId,
      x: player.x + player.dirX * spawnOffset,
      y: player.y + player.dirY * spawnOffset,
      dx: player.dirX,
      dy: player.dirY,
      traveled: 0,
    });

    this._broadcast({
      type: "event",
      name: "dom_fogo_cast",
      sessionId,
      x: player.x,
      y: player.y,
      dirX: player.dirX,
      dirY: player.dirY,
      speed: FOGO_SPEED,
      range: FOGO_RANGE,
      cost: FOGO_ENERGY_COST,
      projectileId: id,
      hitSessionIds: [], // dano agora acontece quando o projétil colide
    });
  }

  _killPlayer(sessionId, killerId) {
    const player = this.players.get(sessionId);
    if (!player || !player.alive) return;

    player.alive = false;
    this.inputs.set(sessionId, { dx: 0, dy: 0 });

    // Kill credita ao assassino (para o HUD e para o futuro placar/quests).
    const killer = this.players.get(killerId);
    if (killer) killer.kills += 1;

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

      // Limites da ilha — autoridade do servidor, cliente só espelha.
      player.x = Math.max(WORLD.minX, Math.min(WORLD.maxX, player.x));
      player.y = Math.max(WORLD.minY, Math.min(WORLD.maxY, player.y));

      // Dom de Fogo (Sangue Quente): regen de energia acelerada com HP < 50%
      const regenRate = player.hp < player.maxHp * 0.5 ? 12 : 5;
      player.energy = Math.min(player.maxEnergy, player.energy + regenRate * deltaSeconds);
    }

    this._stepProjectiles(deltaSeconds);
    this._broadcastState();
  }

  _stepProjectiles(deltaSeconds) {
    if (this.projectiles.size === 0) return;

    for (const projectile of this.projectiles.values()) {
      const step = FOGO_SPEED * deltaSeconds;
      projectile.x += projectile.dx * step;
      projectile.y += projectile.dy * step;
      projectile.traveled += step;

      // Colisão com jogadores (nunca com o dono; mortos são intangíveis).
      let hitPlayerId = null;
      for (const [otherId, other] of this.players) {
        if (otherId === projectile.ownerId || !other.alive) continue;
        const dist = Math.hypot(other.x - projectile.x, other.y - projectile.y);
        if (dist <= FOGO_HIT_RADIUS) {
          hitPlayerId = otherId;
          break;
        }
      }

      if (hitPlayerId) {
        const target = this.players.get(hitPlayerId);
        target.hp = Math.max(0, target.hp - FOGO_DAMAGE);
        this._broadcast({
          type: "event",
          name: "projectile_hit",
          projectileId: projectile.id,
          byId: projectile.ownerId,
          sessionId: hitPlayerId,
          x: projectile.x,
          y: projectile.y,
          damage: FOGO_DAMAGE,
        });
        if (target.hp === 0) {
          this._killPlayer(hitPlayerId, projectile.ownerId);
        }
        this.projectiles.delete(projectile.id);
        continue;
      }

      // Expirou no alcance máximo (o cliente remove ao sumir do snapshot).
      if (projectile.traveled >= FOGO_RANGE) {
        this.projectiles.delete(projectile.id);
      }
    }
  }

  _broadcastState() {
    const snapshot = {};
    for (const [sessionId, player] of this.players.entries()) {
      snapshot[sessionId] = {
        x: player.x,
        y: player.y,
        dirX: player.dirX,
        dirY: player.dirY,
        hp: player.hp,
        maxHp: player.maxHp,
        energy: player.energy,
        maxEnergy: player.maxEnergy,
        alive: player.alive,
        kills: player.kills,
        displayName: player.displayName,
      };
    }

    const projectiles = [];
    for (const p of this.projectiles.values()) {
      projectiles.push({
        id: p.id,
        ownerId: p.ownerId,
        x: Math.round(p.x * 1000) / 1000,
        y: Math.round(p.y * 1000) / 1000,
        dx: p.dx,
        dy: p.dy,
      });
    }

    this._broadcast({ type: "state", players: snapshot, projectiles });
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
