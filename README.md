# 🔥 Crystalia

**Um MMORPG-lite brasileiro em desenvolvimento aberto:** quatro ilhas-elemento,
poderes chamados **Dons**, quests com consequência — e um **servidor
autoritativo de verdade** desde a primeira linha de código (o cliente nunca
decide dano, cooldown nem posição; quem decide é o servidor, 20 vezes por
segundo).

> Estado atual: **Fase 1 — MVP "Ignara"** 🏗️ · fundação técnica e combate
> autoritativo ✅ · ver etapas completas em [`docs/ROADMAP.md`](docs/ROADMAP.md)

---

## 🧪 Demo ao vivo

- **Jogo (Web, Netlify):** _publicação em andamento — a pasta `web/` já tem o
  build Godot 4.7.2 pronto; ligue o site seguindo [`docs/DEPLOY.md`](docs/DEPLOY.md)_
- **Servidor (Render):** blueprint em [`render.yaml`](render.yaml), com
  health-check em `/health`.

> 🔁 O jogo **reconecta sozinho (12 tentativas)** contra o cold-start do plano
> free e, se o servidor não responder em ~1 min, cai no **MODO DEMO local** —
> dá pra demonstrar a ilha e o Dom de Fogo sem backend nenhum.

---

## ⚡ Rodando local em 5 minutos

### 1. Servidor autoritativo (Node 20+)

```bash
cd server
npm install
npm run dev        # sobe em ws://127.0.0.1:2567 com /health
```

### 2. Cliente (Godot **4.7.2** — versão travada em `godot-client/project.godot`)

1. Abra o Godot **4.7.2**, importe `godot-client/project.godot`
2. Play ▶ — o `NetworkManager` tenta ligar no servidor local e, sem ele, entra
   em modo demo.

Quer apontar para outro servidor? `WebBridge` lê em runtime: barra final
`?server=wss://seu-servidor` na URL do jogo, ou edite `web/config.js` no
deploy (sem precisar re-exportar o jogo!).

---

## 🏗️ Arquitetura

```
┌──────────────┐        WebSocket JSON          ┌───────────────┐
│  Cliente     │   { type: "move_input", ... }   │   Servidor    │
│  Godot 4.7.2 │ ───────────────────────────────►│  Node + `ws`  │
│  (render +   │                                 │  tick 20/s    │
│   previsão)  │ ◄───────────────────────────────│  IgnaraRoom   │
└──────────────┘   estado final (pos/HP/energia) └─┬─────────────┘
                                                   │ (Fase 1.6)
                                            ┌──────▼──────┐
                                            │  Supabase   │  auth + Postgres
                                            │  (conta)    │  schema pronto
                                            └─────────────┘
```

**Padrão de ouro:** o cliente manda *intenções* (`move_input`, `use_dom_fogo`);
o servidor calcula resultado, aplica **cooldown/custo/dano** e devolve o
estado confirmado — com reconciliação visual no cliente (`lerp`). Detalhes e
porquês em [`docs/STRUCTURE.md`](docs/STRUCTURE.md).

---

## 🗂️ Estrutura do repositório

```
crystalia_game/
├── godot-client/         # Jogo (Godot 4.7.2)
│   ├── scenes/           # World, Player (.tscn — 1 agente por cena, ver AGENT_SYNC)
│   └── scripts/          # NetworkManager, Player, World, FireEffect, web/WebBridge
├── server/               # Servidor autoritativo (Node + ws + express health)
│   └── src/game/IgnaraRoom.js
├── database/
│   └── supabase_schema.sql
├── web/                  # Build web exportado (Netlify) + config.js em runtime
├── docs/                 # ROADMAP · STRUCTURE · DEPLOY
├── AGENT_SYNC.md         # 🤖 quadro do time de agentes (ler antes de mexer!)
├── render.yaml           # Deploy blueprint (Render)
└── netlify.toml          # Headers do build web (wasm/pck com cache)
```

---

## 🛠️ Stack

| Camada | Tecnologia | Por quê |
|---|---|---|
| Cliente | **Godot 4.7.2** (GDScript) | exporta Web + Mobile da mesma base |
| Rede | WebSocket puro, JSON `{type}` | SDK Colyseus Godot 4 é experimental — fora do MVP (ver STRUCTURE) |
| Servidor | Node 20 + `ws` + Express (`/health`) | autoritativo desde o protótipo |
| Conta | **Supabase** (auth + Postgres) | plano gratuito hosteam, SQL aberto |
| Deploy | Netlify (web) + Render (server) | dois deploys, zero acoplamento |

---

## 👥 Quem constrói

- **Deivid** — direção de jogo, mundo, infra e tudo que é decisão humana.
- **Equipe de agentes** (coordenada por [`AGENT_SYNC.md`](AGENT_SYNC.md)) —
  engenharia, testes, CI, docs. Agentes: leiam o quadro **antes** de abrir
  qualquer editor; claims são a lei.

---

## 🗺️ O que vem agora

- NPC **Tomrik** com diálogo · 12 quests de Ignara · cristais comuns
- Supabase auth + persistência de quest no servidor
- **Bragmar, o Forjador Caído** (boss) e o barco que encerra a trilha 🔥

Trilha completa: [`docs/ROADMAP.md`](docs/ROADMAP.md) — e depois, o
_Fase 2 — Mundo Base_.
