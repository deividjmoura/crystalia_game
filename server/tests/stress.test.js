'use strict';

/**
 * Stress leve do servidor autoritativo.
 * Simula N clientes conectados, mandando move_input + use_dom_fogo
 * enquanto o tick 20/s roda. Mede tempo de tick e estabilidade.
 *
 * Uso:
 *   node --test tests/stress.test.js
 *   STRESS_CLIENTS=50 node --test tests/stress.test.js
 *
 * Zero dependências novas (node:test + FakeSocket local).
 * Não sobe porta real — usa IgnaraRoom com autoTick:false e relógio injetado.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { IgnaraRoom } = require('../src/game/IgnaraRoom');

const WS_OPEN = 1;
const N = Number(process.env.STRESS_CLIENTS || 20);
const TICKS = Number(process.env.STRESS_TICKS || 40); // 2s a 20 Hz

class FakeSocket {
  constructor() {
    this.OPEN = WS_OPEN;
    this.readyState = WS_OPEN;
    this.sent = [];
    this.closed = false;
  }
  send(data) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.readyState = 3;
  }
}

function fakeClock(start = 1_000) {
  let t = start;
  return {
    now: () => t,
    advance(ms) {
      t += ms;
    },
  };
}

describe(`Stress — ${N} clientes × ${TICKS} ticks`, () => {
  it('mantém tick estável e todos os jogadores vivos no snapshot', () => {
    const clock = fakeClock();
    const room = new IgnaraRoom({ autoTick: false, now: clock.now });
    const ids = [];

    for (let i = 0; i < N; i++) {
      const ws = new FakeSocket();
      const id = room.join(ws, `Bot${i}`);
      ids.push(id);
    }

    assert.equal(room.players.size, N);

    const dt = 1 / 20; // 50 ms
    const tickMs = [];

    for (let t = 0; t < TICKS; t++) {
      // Cada bot manda input aleatório (intenção)
      for (const id of ids) {
        const dx = (Math.random() * 2 - 1);
        const dy = (Math.random() * 2 - 1);
        room.handleMessage(
          id,
          JSON.stringify({ type: 'move_input', dx, dy })
        );
        // 10% de chance de tentar Dom de Fogo
        if (Math.random() < 0.1) {
          room.handleMessage(id, JSON.stringify({ type: 'use_dom_fogo' }));
        }
      }

      const t0 = process.hrtime.bigint();
      room._fixedTick(dt);
      const t1 = process.hrtime.bigint();
      tickMs.push(Number(t1 - t0) / 1e6);

      clock.advance(50);
    }

    // Estatísticas simples
    const avg = tickMs.reduce((a, b) => a + b, 0) / tickMs.length;
    const max = Math.max(...tickMs);

    // Orçamento folgado: tick < 10 ms em média, < 50 ms no pior caso
    // (máquina CI / notebook). Ajuste se necessário.
    assert.ok(
      avg < 10,
      `tick médio ${avg.toFixed(2)} ms (limite 10 ms) com ${N} clientes`
    );
    assert.ok(
      max < 50,
      `tick pior ${max.toFixed(2)} ms (limite 50 ms) com ${N} clientes`
    );

    // Ninguém sumiu
    assert.equal(room.players.size, N);

    // Snapshot ainda serializa
    room._fixedTick(dt);
    assert.equal(room.players.size, N);

    room.destroy();

    // Log útil no CI (não falha)
    console.log(
      `[stress] N=${N} ticks=${TICKS} avg=${avg.toFixed(2)}ms max=${max.toFixed(2)}ms`
    );
  });

  it('rate-limit não derruba a sala sob flood controlado', () => {
    const clock = fakeClock();
    const room = new IgnaraRoom({ autoTick: false, now: clock.now });
    const ws = new FakeSocket();
    const id = room.join(ws, 'Flooder');

    // 80 mensagens no mesmo segundo (acima do limite 60) — deve engolir o excesso
    for (let i = 0; i < 80; i++) {
      room.handleMessage(
        id,
        JSON.stringify({ type: 'move_input', dx: 1, dy: 0 })
      );
    }
    room._fixedTick(0.05);

    // Sala continua de pé
    assert.ok(room.players.has(id) || ws.closed);
    room.destroy();
  });
});
