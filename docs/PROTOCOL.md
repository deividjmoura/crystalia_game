# 📡 PROTOCOL — Crystalia (versão 1.1)

**Contrato vivo das mensagens cliente ↔ servidor.** Se você vai tocar o shape
de qualquer mensagem, lê isso INTEIRO primeiro — e muda num PR com aviso no
mural (regra ⛔ conjunta: protocolo é firma, nosso chat depende dele).

- **Fonte de verdade executável:** `server/src/game/IgnaraRoom.js` + cliente
  web `webapp/game.js` (e o espelho legado `godot-client/scripts/NetworkManager.gd`)
- **Transporte:** WebSocket, JSON por mensagem (um objeto por envelope)
- **Versão ativa:** `1.1` (back-compat: campos novos são opcionais e o
  cliente antigo ignora o que não conhece — o cliente Godot v16 segue
  funcionando sem alterações)
- **Autoridade:** 100% no servidor — o cliente **NUNCA** decide posição,
  HP, energia, dano, cooldown ou morte. Ele manda *intenções*.

### 🆕 v1.1 (2026-09-23) — Dom de Fogo vira projétil autoritativo

- `use_dom_fogo` não causa dano em área imediatamente: cria um **projétil**
  no servidor (`FOGO_SPEED 9 un/s`, alcance `FOGO_RANGE 7`, raio de acerto
  `FOGO_HIT_RADIUS 0.55`), que viaja e colide **no tick autoritativo**.
- Custo do Dom subiu de 20 → **25** de energia (cooldown de 700ms mantido).
- `welcome` agora traz `{ sessionId, world, tickRate, moveSpeed, dom }` —
  cliente usa para desenhar a ilha e o HUD sem hardcode.
- `state` passou a carregar, além de `players`, `projectiles[]`
  (`{ id, ownerId, x, y, dx, dy }`) e por jogador `dirX/dirY` (mira) e
  `kills` (placar p/ HUD).
- Novo evento **`projectile_hit`** `{ projectileId, byId, sessionId, x, y, damage }`.
- Movimento é clampeado aos limites `world` no servidor (anti-voar-do-mapa).
- `event/dom_fogo_cast` ganhou `dirX/dirY/cost/projectileId`;
  `hitSessionIds` ficou obsoleto (vazio, mantido por compat).

---

## 🔄 Ciclo de vida da conexão

```
cliente (browser/desktop)                servidor (IgnaraRoom)
─────────────────────────                ──────────────────────
1. GET ws(s)://host/?name=MeuNome  ──►   (aceita, gera sessionId)
2.                       ◄──  { type: "welcome", sessionId }
3. { type:"move_input", dx, dy }   ──►   valida/sanea o input
4.                       ◄──  { type: "state", players: {…} }  (20×/s)
5. { type:"use_dom_fogo" }         ──►   verifica cooldown/custo/range,
1.                                   aplica dano AUTORITATIVO
6.                       ◄──  { type:"event", name:"dom_fogo_cast", … }
                ◄──      { type:"event", name:"player_died", … }   (se houver hit)
                ◄──      { type:"event", name:"player_respawned",… } (3s depois)
                ◄──      { type: "player_left", sessionId }        (saída)
```

O **display_name é enviado na querystring da conexão** (`?name=Crystal`) — é
sanitizado no servidor (fallback `"Aventureiro"` para nome vazio / só espaços).
Não existe mensagem `join`.

---

## 📨 Mensagens — catálogo canônico

### Cliente → Servidor

| `type` | Campos | Regras |
|---|---|---|
| `move_input` | `dx` (float −1..1), `dy` (float −1..1) | Sanitizado: clamp ±1 e **normalização de diagonal** (hipot>1 ⇒ divide — impede andar 41% rápido na diagonal). **Nunca** contém posição. A última intenção não nula define a mira (`dirX/dirY`) do projétil. |
| `use_dom_fogo` | — | Só uma intenção; validação completa no servidor: vivo? `now − lastFogoAt ≥ 700ms`? `energy ≥ 25`? Cria o projétil autoritativo. |
| *(v1.1 proposto)* `move_input.yaw` | float, radianos (opcional) | COMING SOON junto do 3D: direção do olhar (para validar alcance de skills dirigidas). Servidor **ignora se ausente** — compat quente. |
| *(v1.1 proposto)* `move_input.look_pitch` | float (opcional) | idem |

### Servidor → Cliente

| `type` | Campos-chave | Notas |
|---|---|---|
| `welcome` | `sessionId, world{minX,maxX,minY,maxY}, tickRate, moveSpeed, dom{cost,cooldownMs,damage,speed,range}` | novo em v1.1 — configuração da ilha para o cliente desenhar. |
| `state` | `players`: `{ id: { x, y, dirX, dirY, hp, maxHp, energy, maxEnergy, alive, kills, displayName } }`, `projectiles`: `[{ id, ownerId, x, y, dx, dy }]` | Emissão a 20 Hz (`TICK_RATE`). Cliente **interpola** a posição, não substitui input por posição. |
| `event/dom_fogo_cast` | `sessionId, x, y, dirX, dirY, speed, range, cost, projectileId, hitSessionIds[]` | efeito visual + shake; o dano acontece quando o projétil colide (`projectile_hit`). |
| `event/projectile_hit` | `projectileId, byId, sessionId, x, y, damage` | novo em v1.1 — dano autoritativo aplicado no tick da colisão. |
| `event/player_died` | `sessionId, killerId` | respawn automático em ~3s (`RESPAWN_MS`); `kills` do `killerId` sobe no snapshot. |
| `event/player_respawned` | `sessionId` | posição volta a (0,0) |
| `player_left` | `sessionId` | remove ator remoto |
| `kicked` | `reason` | enviado antes do close: `reconnected_elsewhere` (dedup por nome — anti-fantasma, #18) ou `message_flood` (rate-limit) |

**Snapshot (`state`)**: os valores numéricos são o estado CORRENTE autoritativo
naquele tick — sem sequência/delta encoding ainda (ok para o MVP; v2 opcional
com `seq` + LZ-string se crescer).

---

## 🧮 Balanceamento (referência — fonte final é o código)

| Const | Valor | Sentido de jogo |
|---|---|---|
| `TICK_RATE` | 20 Hz | frequência do tick autoritativo |
| `MOVE_SPEED` | 4.0 un/s | técnica do batimento do jogador |
| `FOGO_ENERGY_COST` | 25 (v1.1) | é o que torna combo careta |
| `FOGO_COOLDOWN_MS` | 700 ms | ritmo do combo |
| `FOGO_SPEED` | 9 un/s (v1.1) | velocidade do projétil autoritativo |
| `FOGO_RANGE` | 7 un (v1.1) | alcance máximo do projétil |
| `FOGO_HIT_RADIUS` | 0.55 un (v1.1) | raio de colisão projétil ↔ jogador |
| `FOGO_DAMAGE` | 25 | leva metade do HP em 4 ombros |
| `RESPAWN_MS` | 3000 ms | viagem a expensas de tempo |
| regen energy | 5/s (50% HP) / 12/s (<50% HP) | **Sangue Quente**: o Dom acende mais perto da derrota |

> ⚠️ Valores acima devem estar refletidos em `IgnaraRoom.js` (constantes
> no topo do arquivo). Qualquer mudança de tuning é válvola de balanceamento —
> warneia no mural antes (inclui impacto em testes).

---

## 🛡️ Guard rails do servidor (contrato de serviço)

Estes existem porque o protocolo diz ao cliente que ele manda "boas intenções",
mas o servidor defende:

1. **Sanitização de input**: clamp e normalização de `dx/dy` (já em função).
2. **Rate-limit de mensagens *(✅ implementado 2026-09-15)***: janela de 1s,
   máx. **60 msg/s** por conexão — o excesso é ignorado (e o cliente assume o
   strike). **3 janelas seguidas** de flood = `kicked` + close `1008` ("message_flood").
   Janela-limpa zera os strikes.
3. **Anti-speedhack / invariante de velocidade *(✅ implementado)***: por
   construção — posição só avança no tick autoritativo
   (`pos += input × MOVE_SPEED × dt`); teste de invariante no CI prova
   `Δpos ≤ MOVE_SPEED × Δt` para qualquer sequência de inputs. (Detecção ativa
   por reconciliação fica fora do MVP — já é impossível pela arquitetura.)
4. **Dedup por nome / anti-fantasma *(✅ implementado)***: no `join`, o mesmo
   `displayName` (trim + case-insensitive) marca reconexão — sessão velha leva
   `kicked` (`reconnected_elsewhere`) + close 1000, sai do mundo via
   `player_left` e a nova assume o nome.
5. **Validação de alcance de skills** (precisa do `yaw`): futura skill dirigida
   checa distância + cone de ângulo no servidor.
6. **Relógio único**: toda duração usa `_now()` do servidor — **nunca** um
   timestamp do cliente.

> Implemetação/owner: `arena-deivid` (server territory). Tests: `arena-c3`.

---

## ✍️ Como modificar este contrato (a regra ⛔)

1. Anuncia intenção no Mural *(antes*) — "vou adicionar X ao move_input".
2. Sempre **back-compat**: campos novos são OPCIONAIS — servidor ignora carrego
   que não conhece, cliente ignore idem. Quebra de compat exige `v: 2` e
   migration windowacido.
3. PR que deixa: (a) este doc editado primeiro (a verdade), (b) os dois códigos
   (server + cliente), (c) testes novos quando houver nome de campo novo.
4. Sinais vivem na memória do servidor — não há estado transpido em `state`
   para "efeito" (efeitos do Dom só via `event`!), mantém o tick barato.

**Versionamento:** v1.0.1 ativa 2026-09-15 — guard rails implementados + `kicked` documentado (issue #18). Mudanças na sessão
[v1.1 proposto] acima = aprovadas na decisão do mural (migração 3ª pessoa).
