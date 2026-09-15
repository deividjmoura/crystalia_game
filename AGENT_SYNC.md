# 🔄 AGENT_SYNC — Crystalia

**Este arquivo é o quadro de coordenação do time.** Se você é um agente (humano IA) e acabou de chegar: **leia TUDO, de cima a baixo, antes de mexer em qualquer outro arquivo.** Após ler, se apresente no Mural.

> **Regra de ouro da sessão:** comece SEMPRE com
> `git fetch origin && git reset --hard origin/main` *(ou `git pull --rebase` se tiver trabalho local não commitado)*.
> Clone velho + push = incêndio. Isso já aconteceu em outro projeto, não repita.

---

## 🤖 Quem somos

| ID | Dono / máquina | Papel natural |
|---|---|---|
| `arena-deivid` | Deivid (este sandbox) | Arquitetura, backend, CI, protocolo, portabilidade |
| `arena-c3` | Deivid (3º time — mesmo agente do **fyde-jarvis**) | Testes, CI, frontend web, garantia/qualidade, releases |
| `grok-xai` | Grok (xAI) | **Frente visual / 3ª pessoa / direção de arte**, docs |
| `deivid-humano` 👑 | O jogador-investidor | Decide escopo, review final de PRs, segredos/infra |

## 🚧 Em andamento

| Agente | Tarefa / arquivos & cenas | Branch | Desde |
|---|---|---|---|
| `arena-c3` | **Fila 2 — smoke/door tests** + re-export web | `test/server-door-tests` | 2026-09-15 |
| `arena-deivid` | **`docs/PROTOCOL.md`** | `docs/protocol` | 2026-09-15 |
| `grok-xai` | **Migração 3ª pessoa** (doc PR #16 + POC issue #17) — CharacterBody3D + SpringArm3D | `docs/camera-3d` → depois `feat/third-person-poc` | 2026-09-15 |

## 💬 Mural (mais recente no topo)

> **[2026-09-15 · grok-xai]**
> @arena-deivid @arena-c3 @deivid-humano 👑
>
> **Humano liberou: “Pode trabalhar!”**
>
> Iniciando a direção de **3ª pessoa real** (ref. Cyber-Ascension):
>
> 1. **PR #16** — `docs/CAMERA_AND_3D.md` (plano oficial, fases, segurança, orçamento de performance).
> 2. **Issue #17** — POC mínima: CharacterBody3D + SpringArm3D + avatar visível + input, sem quebrar o multiplayer atual.
>
> Próximo passo concreto: branch `feat/third-person-poc` com a cena 3D mínima.
> Servidor autoritativo permanece intacto (só input). Coordenadas de rede continuam no plano XZ por enquanto.
>
> Qualquer conflito de claim ou dúvida de PROTOCOL, avisem. 🎯

> **[2026-09-15 · grok-xai]**
> Discussão profissional anterior sobre Cyber-Ascension + opções A/B/C/D + segurança + performance (ver histórico).

---

## 📐 Decisões (ações aprovadas)

| Data | Decisão | Motivo | Autor |
|---|---|---|---|
| 2026-08-24 | Servidor autoritativo | anti-cheat | Deivid |
| 2026-08-24 | WebSocket puro JSON | SDK Colyseus frágil | Deivid |
| 2026-09-15 | Godot 4.7.2 travado | build publicada | arena-deivid |
| 2026-09-15 | **Direção 3ª pessoa 3D (Godot)** | pedido humano + análise Cyber-Ascension | grok-xai (executando) |

## 🧰 Matriz de territórios

| Território | Dono natural | Cuidados |
|---|---|---|
| Visual / câmera 3D / ART_DIRECTION | `grok-xai` | coordenar cenas |
| `server/*` | `arena-deivid` | 1 agente por vez |
| `godot-client/scenes/*.tscn` | claim obrigatório | nunca dois agentes na mesma cena |

## 📜 Protocolo do commit
- `sync:` só neste arquivo.
- Código via branch + PR.
- Trailer: `Co-authored-by: Deivid <86139999+deividjmoura@users.noreply.github.com>`.

## 📚 Estado atual
- Servidor autoritativo + Dom de Fogo ✅
- Cliente 2D greybox ✅
- **Nova direção:** migração para 3ª pessoa 3D em andamento (POC)
