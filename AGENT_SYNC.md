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
| _`(id do parceiro)`_ | _PC dele — se apresente no Mural e edite sua linha_ | _a definir pelo parceiro_ |
| `deivid-humano` 👑 | O jogador-investidor | Decide escopo, review final de PRs, segredos/infra |

Quando o parceiro aparecer: troque os placeholders, escolha o id no padrão `arena-algo` e confirme o leu o AGENT_SYNC.

## 🧠 Ciência compartilhada (vínculo dos dois projetos)

Este time replica a metodologia testada no **fyde-jarvis** (*voz + agentes*). Trazemos da experiência:

1. **Claims antes de código** — zero colisão por projeto pequeno; aqui é lei também.
2. **Mural PT-BR, mais recente no topo** — histórico vira memória institucional.
3. **CI cedo, não tarde** — no fyde só ativamos depois; aqui tentaremos desde cedo.
4. **Mensagem de merge sassá `chore(merge):`** — se houver commitlint depois, já nasce correto.
5. **Terreno com documento de argumentos** (`docs/STRUCTURE.md`) — antes de propor mudança arquitetural, lê ele inteiro e argumenta no Mural.

---

## 🚧 Em andamento

| Agente | Tarefa / arquivos & cenas | Branch | Desde |
|---|---|---|---|
| `arena-deivid` | **Contrato de rede** (`docs/PROTOCOL.md`) — formaliza as mensagens JSON cliente↔servidor (incl. mensagens novas das 16:51) | `docs/protocol` | 2026-09-15 |
| _`(parceiro)`_ | _(primeira tarefa livre — veja "Fila sugerida" no Mural)_ | — | — |

## ✅ Concluído (mais recente no topo)

| Data | Agente | Entrega |
|---|---|---|
| 2026-09-15 | `arena-deivid` | **AGENT_SYNC.md plantado**: regras de convivência, matriz de territórios, auditoria inicial e fila sugerida no Mural |

## 📌 Fila sugerida (ordem de valor — pega UMA, clama antes)

1. **`docs/PROTOCOL.md`** — contrato único das mensagens `{type}` (arena-deivid já clama, mas negociável)
2. **Smoke door tests do servidor** — `node --test`, zero dependências (ideal p/ parceiro começar: arquivos `server/tests/*.test.js`)
3. **CI básico (GitHub Actions)** — `npm install && npm test` + validação GDScript leve (arena-deivid ou parceiro)
3b. **LFS do wasm / cache de build** — 39MB por rebuild no git dói; ver Mural 💬
4. **Spawn/posição de jogador end-to-end** (endereça o roadmap item 2 — difficulty média, coordena os 3 territórios)
5. **`supabase auth` cadastro/login** — segue a doc oficial; cuidado, envolve segredos (só com o humano por perto)

---

## 💬 Mural (mais recente no topo)

> **[2026-09-15 · arena-deivid]** (reagindo ao push paralelo das 16:51)
> 🤩 **Time ativo e jogável!** Vi o Dom de Fogo autoritativo + jogadores remotos +
> deploy web Netlify. Parceiro: apresente-se aqui e clame algo — sugestões:
> testes de estresse do servidor (já cobrindo o Dom de Fogo novo). ⚠️ Primeiro
> débito técnico no radar: `web/index.wasm` 39MB commitado — funciona, mas cada
> rebuild vira +39MB de histórico; proponho LFS ou cache de build num PR de
> discussão (versar sozinho seria ⛔ — altera histórico e gera atrito). Quadro
> já ajustado: versão exata **Godot 4.7.2**.

> **[2026-09-15 · arena-deivid]**
> **AGENT_SYNC plantado. Auditoria do dia 1:**
> esqueleto íntegro — `server/` (44+114 linhas, Node+`ws`) e `godot-client/`
> (Godot **4.7.2** (build do deploy) — travada em `project.godot`) se completam; Supabase espera
> schema+auth. **Não há CI nem testes ainda** — é a primeira alavanca de
> confiança. Parceiro: apresente-se aqui e clame um item da Fila sugerida! 🎮

---

## 📐 Decisões (ações aprovadas — mexer só com o humano)

| Data | Decisão | Motivo | Autor |
|---|---|---|---|
| 2026-08-24 | **Servidor autoritativo** p/ posição/HP/energia | anti-cheat; cliente só manda input | Deivid |
| 2026-08-24 | **WebSocket puro** (JSON `{type}`) — não Colyseus | SDK Godot 4 experimental; dependência frágil (ver `docs/STRUCTURE.md`) | Deivid |
| 2026-08-24 | **Uma Room por ilha** | MVP só Ignara; escalável na Fase 2 | Deivid |
| 2026-09-15 | **Godot 4.7.2 travado** — a build publicada é 4.7.2; abrir projeto exige a mesma versão | evitar reimportando divergências | `arena-deivid` (ratifica o `project.godot`) |
| 2026-09-15 | Mensagens de merge automatica começam por **`chore(merge):`** | commitlint-ready | `arena-deivid` |

---

## 🧰 Matriz de territórios (dono padrão ≠ exclusivo)

| Território | Dono natural | Cuidados ALARME |
|---|---|---|
| `server/src/game/*Room.js` | backend (`arena-deivid`) | ⚠️ Dom de Fogo autoritativo novo: **cobertura de testes via PR**; 1 agente por vez no arquivo |
| `server/src/index.js` | backend | arranque/rede — fila de mudanças via claims |
| `godot-client/scenes/*.tscn` | cliente (parceiro geralmente) | **🚫 NUNCA dois agentes numa mesma `.tscn`** — cena inteira no claim |
| `godot-client/scripts/*.gd` | cliente | GDScript roda no editor 4.7 exato |
| `database/*.sql` | backend+humano | =prod Supabase; mudança pede plano de migração |
| `docs/*` | quem documenta | mural/quadro go-drive sem entraves |

**Arquivos-sensíveis Godot:** `.import` **COMMITA** (Godot precisa), mas `.godot/`, `export_presets.cfg`, `.translation` **nunca** (`.gitignore` já cobre). Se abrir o projeto no editor e ver mudanças fantasmas, provavelmente faltou o fetch+reset da regra de ouro.

## 📜 Protocolo do commit

- **`sync:`** só para este arquivo (`AGENT_SYNC.md`) — commit direto na main, sem review.
- **Código/cenas/docs via branch + PR** (ex.: `feat/ignara-movement`, `fix/tick-energy`), merge normalmente por fast-forward ou `chore(merge): descrição`.
- Conventional commits desde já: `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `ci:`, `refactor:`.
- Trailer obrigatório em código: `Co-authored-by: Deivid <86139999+deividjmoura@users.noreply.github.com>`.
- ⛔ **Tarefas conjuntas** (marcadas na fila que ambos os agentes assinam) não se toca a solo — como migração de protocolo de rede: se um muda as mensagens `{type}` sem o outro, o cliente desconecta do servidor e o MVP morre. Mudança de contrato == PR + aviso no mural **antes** de mergear.

## 🔐 Segredos e infra

- `.env` **nunca** sobe (exceptions: `.env.example` com chaves vazias).
- Chaves Supabase, tokens e arquivos de conta do Play Store: **só o humano mexe**.
- Deploy do servidor (Fly.io / Oracle Free Tier — roadmap item 1.5): a decisão final é do humano; agentes preparam `Dockerfile`/`fly.toml` mas não executam deploy em produção.

---

## 📚 Estado atual do projeto (2026-09-15)

- `server/` — WS puro up; **16:51 UTC** ganhou **Dom de Fogo autoritativo** (dano/cooldown/custo) + morte/respawn ✅; ainda **sem testes/CI/estresse**.
- `godot-client/` — Godot **4.7.2**, World/Player com interpolação; **16:51 UTC** ganhou **jogadores remotos visíveis + modo demo** (push paralelo) — conexão local end-to-end ✅ em verificação.
- `database/` — `supabase_schema.sql` escrito; **Supabase não configurado** (roadmap 1.6 ❌).
- **Deploy web**: `web/` já gera build Netlify (16:51 UTC) ⚠️ `index.wasm` 39MB commitado no git — funciona, mas cada rebuild engorda o histórico; proposta p/ o Mural: Git LFS ou CI-hosting, **discutir antes** de mexer (mexe com histórico).
- Roadmap Fase 1: **~9/20 itens** — avanços de hoje no combate/visão multiplayer.

O futuro próximo: fechar "servidor + cliente conectados localmente" (roadmap 1.3–1.4) e nascer cigarra-correção da Fila 2 (testes) + Fila 3 (CI).
