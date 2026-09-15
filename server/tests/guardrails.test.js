'use strict';

// Guard rails do servidor (PROTOCOL.md): dedup anti-fantasma, rate-limit
// por conexão e invariante anti-speedhack. FakeSocket + relógio injetado —
// nada de rede nem timers reais.

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
    this.closeCode = null;
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  close(code) {
    this.closed = true;
    this.closeCode = code;
    this.readyState = 3;
  }
  types(t) {
    return this.sent.filter((m) => m.type === t);
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

describe('guard rails do servidor (IgnaraRoom)', () => {
  let room;
  let clock;

  beforeEach(() => {
    clock = fakeClock();
    room = new IgnaraRoom({ autoTick: false, now: clock.now });
  });

  afterEach(() => room.destroy());

  it('anti-fantasma: reconexão com o MESMO nome desconecta a sessão velha', () => {
    const ws1 = new FakeSocket();
    const ws2 = new FakeSocket();
    const id1 = room.join(ws1, 'Crystal');
    const id2 = room.join(ws2, 'Crystal'); // mesma pessoa, outra aba!

    // 1. sessão antiga: kick avisado + close com código "limpo" (1000)
    const kicked = ws1.types('kicked');
    assert.equal(kicked.length, 1);
    assert.equal(kicked[0].reason, 'reconnected_elsewhere');
    assert.equal(ws1.closed, true);
    assert.equal(ws1.closeCode, 1000);

    // 2. o mundo NÃO duplicou: players.size === 1, com a sessão nova
    assert.equal(room.players.size, 1);
    assert.ok(room.players.has(id2));
    assert.ok(!room.players.has(id1));

    // 3. fantasma saiu no ar: broadcast player_left com o ID antigo
    const lefts = ws2.sent.filter((m) => m.type === 'player_left');
    assert.ok(lefts.some((m) => m.sessionId === id1));

    // 4. dedup é case-insensitive e ignora whitespace sobrando
    const ws3 = new FakeSocket();
    const id3 = room.join(ws3, '  crystal   ');
    assert.equal(room.players.size, 1);
    assert.ok(room.players.has(id3));
    assert.equal(ws2.closeCode, 1000);
  });

  it('rate-limit: 61ª msg na mesma janela é IGNORADA (estado não muda)', () => {
    const ws = new FakeSocket();
    const id = room.join(ws, 'Flooder');
    room.inputs.set(id, { dx: 0, dy: 0 });

    const input = () => room.inputs.get(id);
    for (let i = 0; i < 60; i++) {
      room.handleMessage(id, JSON.stringify({ type: 'move_input', dx: 0, dy: 0 }));
    }
    assert.deepEqual(input(), { dx: 0, dy: 0 }); // dentro do limite

    // 61ª mensagem excede a janela → ignorada, dx não vira 1
    room.handleMessage(id, JSON.stringify({ type: 'move_input', dx: 1, dy: 0 }));
    assert.deepEqual(input(), { dx: 0, dy: 0 });
  });

  it('rate-limit: 3 janelas seguidas de flood = kick + close 1008 + remoção', () => {
    const ws = new FakeSocket();
    const id = room.join(ws, 'SuperFlooder');

    for (let window = 0; window < 3; window++) {
      for (let i = 0; i < 61; i++) {
        room.handleMessage(id, JSON.stringify({ type: 'use_dom_fogo' }));
      }
      clock.advance(1000); // fecha a janela
    }

    const kicked = ws.types('kicked');
    assert.equal(kicked.length, 1);
    assert.equal(kicked[0].reason, 'message_flood');
    assert.equal(ws.closed, true);
    assert.equal(ws.closeCode, 1008); // policy violation
    assert.equal(room.players.size, 0); // saiu do mundo
  });

  it('janela limpa zera strikes: 2 floods com uma janela boa no meio ≠ kick', () => {
    const ws = new FakeSocket();
    const id = room.join(ws, 'QuaseFlooder');

    for (let i = 0; i < 61; i++) room.handleMessage(id, '{"type":"use_dom_fogo"}'); // flood 1
    clock.advance(1000);
    room.handleMessage(id, JSON.stringify({ type: 'move_input', dx: 0, dy: 0 })); // janela OK
    clock.advance(1000);
    for (let i = 0; i < 61; i++) room.handleMessage(id, '{"type":"use_dom_fogo"}'); // flood 2

    assert.equal(ws.types('kicked').length, 0); // NÃO kickou — strikes resetaram
    assert.equal(room.players.size, 1);
  });

  it('anti-speedhack: 20s de input máximo ⇒ ≤ MOVE_SPEED × 20s + epsilon', () => {
    const ws = new FakeSocket();
    const id = room.join(ws, 'Veloz');
    room.handleMessage(id, JSON.stringify({ type: 'move_input', dx: 1, dy: 0 }));

    const DT = 0.05; // tick 20Hz
    for (let t = 0; t < 20; t += DT) room._fixedTick(DT);

    const player = room.players.get(id);
    const distance = Math.hypot(player.x, player.y);
    // MOVE_SPEED = 4 un/s; epsilon = 1 tick a mais no phi (defensivo)
    assert.ok(
      distance <= 4 * 20 + 4 * DT,
      `andou ${distance} un em 20s — mais que 4 un/s (cheat?)`
    );
    // e também não avança em Y (não há gravidade oculta ^^)
    assert.equal(player.y, 0);
  });
});
