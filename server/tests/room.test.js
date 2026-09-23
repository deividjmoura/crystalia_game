'use strict';

// Door/smoke tests da sala autoritativa (IgnaraRoom).
// Runner nativo do Node (node:test) — zero dependências novas.
// A lógica inteira roda com sockets falsos, sem rede e sem timers
// imprevisíveis: relógio e timings são injetados via construtor
// (em produção a sala usa Date.now e os intervalos reais).

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { IgnaraRoom } = require('../src/game/IgnaraRoom');

const WS_OPEN = 1;

class FakeSocket {
  constructor() {
    this.OPEN = WS_OPEN;
    this.readyState = WS_OPEN;
    this.sent = [];
    this.closed = false;
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
    this.readyState = 3;
  }
  events(name) {
    return this.sent.filter(
      (m) => m.type === 'event' && m.name === name
    );
  }
  lastState() {
    const states = this.sent.filter((m) => m.type === 'state');
    return states.length ? states[states.length - 1].players : null;
  }
}

function fakeClock(start = 1000) {
  let t = start;
  return {
    now: () => t,
    advance(ms) {
      t += ms;
    },
  };
}

function makeRoom(options = {}) {
  const room = new IgnaraRoom({ autoTick: false, ...options });
  const sockets = new Map();

  function join(name) {
    const ws = new FakeSocket();
    const id = room.join(ws, name);
    sockets.set(id, ws);
    return id;
  }

  return { room, sockets, join };
}

describe('IgnaraRoom — entrada e estado', () => {
  let env;
  beforeEach(() => {
    env = makeRoom();
  });
  afterEach(() => env.room.destroy());

  it('join envia welcome com sessionId e registra o jogador', () => {
    const { room, sockets, join } = env;
    const id = join('Crystal');
    const ws = sockets.get(id);
    const welcome = ws.sent.find((m) => m.type === 'welcome');
    assert.ok(welcome, 'welcome não foi enviado');
    assert.equal(welcome.sessionId, id);
    assert.ok(room.players.has(id));
  });

  it('snapshot inclui hp, energia e flag alive', () => {
    const { room, sockets, join } = env;
    const id = join('Crystal');
    room._fixedTick(0.05);
    const me = sockets.get(id).lastState()[id];
    assert.equal(me.hp, 100);
    assert.equal(me.energy, 100);
    assert.equal(me.alive, true);
    assert.equal(me.displayName, 'Crystal');
  });

  it('nome é truncado em 20 caracteres e vira "Aventureiro" se vazio', () => {
    const { room, sockets, join } = env;
    const longo = join('a'.repeat(40));
    const anon = join('   ');
    room._fixedTick(0.01);
    assert.equal(sockets.get(longo).lastState()[longo].displayName, 'a'.repeat(20));
    assert.equal(sockets.get(anon).lastState()[anon].displayName, 'Aventureiro');
  });

  it('mensagem malformada é ignorada sem lançar exceção', () => {
    const { room, join } = env;
    const id = join('Crystal');
    assert.doesNotThrow(() => room.handleMessage(id, '{não é json'));
    assert.doesNotThrow(() => room.handleMessage(id, '[1,2,3]'));
  });

  it('handleMessage de sessão inexistente não quebra', () => {
    const { room } = env;
    assert.doesNotThrow(() =>
      room.handleMessage('ninguem', JSON.stringify({ type: 'use_dom_fogo' }))
    );
  });
});

describe('IgnaraRoom — movimento autoritativo', () => {
  let env;
  beforeEach(() => {
    env = makeRoom();
  });
  afterEach(() => env.room.destroy());

  it('move apenas por input (intenção), nunca por posição enviada', () => {
    const { room, join } = env;
    const id = join('Crystal');
    room.handleMessage(id, JSON.stringify({ type: 'move_input', dx: 1, dy: 0 }));
    room._fixedTick(0.25); // 4 unidades/s * 0.25s = 1 unidade
    assert.equal(room.players.get(id).x, 1);
  });

  it('diagonal é normalizada (sem velocidade extra de ~41%)', () => {
    const { room, join } = env;
    const id = join('Crystal');
    room.handleMessage(id, JSON.stringify({ type: 'move_input', dx: 1, dy: 1 }));
    room._fixedTick(1); // 1 segundo
    const p = room.players.get(id);
    const deslocamento = Math.hypot(p.x, p.y);
    assert.ok(
      Math.abs(deslocamento - 4) < 0.001,
      `diagonal andou ${deslocamento}, esperado 4 (velocidade base)`
    );
  });

  it('input fora de [-1,1] é clampado', () => {
    const { room, join } = env;
    const id = join('Crystal');
    // Eixo único: 99 vira 1 → 4 unidades em 1 segundo (a diagonal aqui
    // seria normalizada depois do clamp, ver o teste dedicado).
    room.handleMessage(id, JSON.stringify({ type: 'move_input', dx: 99, dy: 0 }));
    room._fixedTick(1);
    const p = room.players.get(id);
    assert.equal(p.x, 4);
    assert.equal(p.y, 0);
  });

  it('jogador morto não se move', () => {
    const { room, sockets, join } = env;
    const id = join('Fantasma');
    const p = room.players.get(id);
    p.alive = false;
    room.handleMessage(id, JSON.stringify({ type: 'move_input', dx: 1, dy: 0 }));
    room._fixedTick(1);
    assert.equal(p.x, 0);
  });

  it('posição é clampeada aos limites da ilha (autoridade do servidor)', () => {
    const { room, join } = env;
    const id = join('Corredor');
    room.handleMessage(id, JSON.stringify({ type: 'move_input', dx: 1, dy: 0 }));
    room._fixedTick(100); // andaria 400 unidades sem limite
    const p = room.players.get(id);
    assert.equal(p.x, 16, 'limite leste do mundo');
    assert.equal(p.y, 0);
  });
});

describe('IgnaraRoom — Dom de Fogo (projétil autoritativo)', () => {
  it('consome 25 de energia, cria projétil no servidor e avisa a sala', () => {
    const clock = fakeClock();
    const { room, sockets, join } = makeRoom({ now: clock.now });
    const a = join('Kael');
    join('Bragmar');
    const ws = sockets.get(a);

    room.handleMessage(a, JSON.stringify({ type: 'move_input', dx: 1, dy: 0 }));
    room.handleMessage(a, JSON.stringify({ type: 'move_input', dx: 0, dy: 0 }));
    room.handleMessage(a, JSON.stringify({ type: 'use_dom_fogo' }));

    const cast = ws.events('dom_fogo_cast')[0];
    assert.ok(cast, 'dom_fogo_cast não foi emitido');
    assert.equal(cast.sessionId, a);
    assert.equal(cast.cost, 25);
    assert.equal(room.players.get(a).energy, 100 - 25);
    assert.equal(room.projectiles.size, 1, 'projétil deveria existir no servidor');

    room._fixedTick(0.01);
    const snap = ws.lastState()[a];
    assert.equal(snap.kills, 0);
    const ultimoState = ws.sent.filter((m) => m.type === 'state').pop();
    assert.ok(Array.isArray(ultimoState.projectiles), 'snapshot deveria listar projéteis');
    assert.equal(ultimoState.projectiles.length, 1);
    room.destroy();
  });

  it('projétil viaja no tick, colide e causa dano autoritativo (projectile_hit)', () => {
    const clock = fakeClock();
    const { room, sockets, join } = makeRoom({ now: clock.now });
    const a = join('Kael');
    const b = join('Bragmar');
    room.players.get(b).x = 2; // alvo a 2 unidades à direita

    // Atirador olha para a direita e dispara.
    room.handleMessage(a, JSON.stringify({ type: 'move_input', dx: 1, dy: 0 }));
    room.handleMessage(a, JSON.stringify({ type: 'move_input', dx: 0, dy: 0 }));
    room.handleMessage(a, JSON.stringify({ type: 'use_dom_fogo' }));

    // 9 un/s * 0.05s = 0.45 por tick — acerta em poucos ticks.
    for (let i = 0; i < 20 && room.projectiles.size > 0; i++) {
      room._fixedTick(0.05);
    }

    const alvo = room.players.get(b);
    assert.equal(alvo.hp, 75, 'dano de 25 deveria ser aplicado pelo servidor');
    assert.equal(room.projectiles.size, 0, 'projétil deveria sumir ao colidir');

    const hit = sockets.get(a).events('projectile_hit')[0];
    assert.ok(hit, 'projectile_hit não foi emitido');
    assert.equal(hit.sessionId, b);
    assert.equal(hit.byId, a);
    assert.equal(hit.damage, 25);
    room.destroy();
  });

  it('projétil não acerta o próprio dono', () => {
    const clock = fakeClock();
    const { room, join } = makeRoom({ now: clock.now });
    const a = join('Kael');
    join('Bragmar');

    room.handleMessage(a, JSON.stringify({ type: 'use_dom_fogo' }));
    for (let i = 0; i < 40 && room.projectiles.size > 0; i++) {
      room._fixedTick(0.05);
    }

    assert.equal(room.players.get(a).hp, 100, 'dono não pode tomar o próprio Dom');
    assert.equal(room.projectiles.size, 0, 'projétil deveria expirar no alcance');
    room.destroy();
  });

  it('4 acertos derrubam (morte autoritativa) e creditam o kill', () => {
    const clock = fakeClock();
    const { room, sockets, join } = makeRoom({ now: clock.now, respawnMs: 60000 });

    const atirador = join('Kael');
    const alvo = join('Bragmar');
    const sAtirador = sockets.get(atirador);

    room.players.get(alvo).x = 2; // alvo parado a 2 unidades
    room.handleMessage(atirador, JSON.stringify({ type: 'move_input', dx: 1, dy: 0 }));
    room.handleMessage(atirador, JSON.stringify({ type: 'move_input', dx: 0, dy: 0 }));

    for (let i = 0; i < 4; i++) {
      room.handleMessage(atirador, JSON.stringify({ type: 'use_dom_fogo' }));
      clock.advance(800); // respeita o cooldown de 700ms
      for (let t = 0; t < 40 && room.projectiles.size > 0; t++) {
        room._fixedTick(0.05);
      }
    }

    const alvoState = room.players.get(alvo);
    assert.equal(alvoState.hp, 0, 'HP deveria zerar');
    assert.equal(alvoState.alive, false);
    assert.equal(sAtirador.events('player_died').length, 1);
    const morte = sAtirador.events('player_died')[0];
    assert.equal(morte.sessionId, alvo);
    assert.equal(morte.killerId, atirador);
    assert.equal(room.players.get(atirador).kills, 1, 'kill deveria ser creditado');

    // 4 disparos * 25 de energia (regen de tick roda junto — fica bem abaixo
    // da energia cheia, provando o custo do combo).
    assert.ok(room.players.get(atirador).energy < 21);
    room.destroy();
  });

  it('respeita o cooldown do servidor (relógio do cliente não importa)', () => {
    const clock = fakeClock();
    const { room, sockets, join } = makeRoom({ now: clock.now });
    const a = join('A');
    join('B');
    const ws = sockets.get(a);

    room.handleMessage(a, JSON.stringify({ type: 'use_dom_fogo' })); // t=1000 ok
    clock.advance(100);
    room.handleMessage(a, JSON.stringify({ type: 'use_dom_fogo' })); // cedo demais
    clock.advance(800);
    room.handleMessage(a, JSON.stringify({ type: 'use_dom_fogo' })); // t=1900 ok

    assert.equal(ws.events('dom_fogo_cast').length, 2);
    room.destroy();
  });

  it('não dispara sem energia suficiente', () => {
    const clock = fakeClock();
    const { room, sockets, join } = makeRoom({ now: clock.now });
    const a = join('A');
    join('B');
    room.players.get(a).energy = 5;

    room.handleMessage(a, JSON.stringify({ type: 'use_dom_fogo' }));
    assert.equal(sockets.get(a).events('dom_fogo_cast').length, 0);
    room.destroy();
  });

  it('alvo fora do alcance não toma dano (projétil expira no range)', () => {
    const clock = fakeClock();
    const { room, sockets, join } = makeRoom({ now: clock.now });
    const a = join('A');
    const b = join('B');
    room.players.get(b).x = 10; // além do alcance de 7 unidades

    room.handleMessage(a, JSON.stringify({ type: 'move_input', dx: 1, dy: 0 }));
    room.handleMessage(a, JSON.stringify({ type: 'move_input', dx: 0, dy: 0 }));
    room.handleMessage(a, JSON.stringify({ type: 'use_dom_fogo' }));
    for (let i = 0; i < 40 && room.projectiles.size > 0; i++) {
      room._fixedTick(0.05);
    }

    assert.equal(room.projectiles.size, 0, 'projétil deveria expirar');
    assert.equal(room.players.get(b).hp, 100);
    assert.equal(sockets.get(a).events('projectile_hit').length, 0);
    room.destroy();
  });

  it('atirador morto não dispara', () => {
    const clock = fakeClock();
    const { room, sockets, join } = makeRoom({ now: clock.now });
    const a = join('A');
    join('B');
    room.players.get(a).alive = false;

    room.handleMessage(a, JSON.stringify({ type: 'use_dom_fogo' }));
    assert.equal(sockets.get(a).events('dom_fogo_cast').length, 0);
    room.destroy();
  });

  it('respawn restaura HP, energia e posição após o tempo do servidor', async () => {
    const { room, join } = makeRoom({ respawnMs: 30 });
    const a = join('A');
    const b = join('B');
    room.players.get(b).x = 2;
    room.players.get(b).hp = 0;
    room.players.get(b).energy = 0;
    room._killPlayer(b, a);
    assert.equal(room.players.get(b).alive, false);

    await new Promise((r) => setTimeout(r, 90));

    const renascido = room.players.get(b);
    assert.equal(renascido.alive, true);
    assert.equal(renascido.hp, 100);
    assert.equal(renascido.energy, 100);
    assert.equal(renascido.x, 0);
    room.destroy();
  });
});

describe('IgnaraRoom — saída e ciclo de vida', () => {
  it('leave remove o jogador e avisa a sala (player_left)', () => {
    const { room, sockets, join } = makeRoom();
    const a = join('A');
    const b = join('B');
    room._fixedTick(0.01);

    room.leave(b);
    const saidas = sockets.get(a).sent.filter((m) => m.type === 'player_left');
    assert.equal(saidas.length, 1);
    assert.equal(saidas[0].sessionId, b);
    assert.ok(!room.players.has(b));
    room.destroy();
  });

  it('leave de id desconhecido não quebra', () => {
    const { room } = makeRoom();
    assert.doesNotThrow(() => room.leave('ghost'));
    room.destroy();
  });

  it('destroy() limpa o intervalo sem erro', () => {
    const room = new IgnaraRoom();
    assert.doesNotThrow(() => room.destroy());
    assert.equal(room.tickInterval, null);
  });
});
