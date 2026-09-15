# Fase 1 — MVP: Checklist

> 📊 **Progresso: 11/21 itens principais** (fundamentação ✅ 5/6 · combate ✅ 5/5 ·
> Ignara 2/5 · conta 0/3 · boss 0/2) · + seção de Qualidade (5/6 ✅ + CI+protocolo!)

Escopo: só Ignara jogável, Dom de Fogo, cristais comuns, as 12 quests já escritas,
servidor autoritativo desde o protótipo.

## 1. Fundação técnica
- [x] Estrutura de pastas do cliente e servidor
- [x] Projeto Godot rodando localmente (import + play)
- [x] Servidor WebSocket autoritativo rodando localmente (`npm run dev`) — Colyseus foi trocado por `ws` puro (ver STRUCTURE.md)
- [x] Cliente conectando no servidor via WebSocket
- [x] Deploy de teste do servidor (**Render** — `render.yaml` pronto; **em produção:** `crystalia-server.onrender.com`) — ver `docs/DEPLOY.md`
- [ ] Supabase configurado (projeto + schema + auth)

## 2. Movimento e combate básico (autoritativo)
- [x] Servidor mantém a posição real de cada jogador (`GameRoom.js`)
- [x] Cliente envia apenas *input* (direção, ações), nunca posição final
- [x] Reconciliação client-side simples (previsão + correção do servidor)
- [x] Sistema de HP/dano calculado no servidor
- [x] Cooldown de habilidades controlado por relógio do servidor (nunca do cliente)

## 3. Ignara jogável
- [x] Cena base da ilha (bloqueada/greybox está ok pro MVP)
- [x] Spawn do jogador com Dom de Fogo (Sangue Quente: regen de energia com HP < 50%)
- [ ] NPC Tomrik com diálogo básico
- [ ] Sistema de quests (aceitar → progresso → completar) plugado nas 12 quests de Ignara
- [ ] Cristais comuns: drop, inventário, equipar

## 4. Conta e progressão
- [ ] Cadastro/login (Supabase Auth — e-mail ou magic link pro MVP)
- [ ] Tabela de perfil (ilha natal, nível, XP, inventário) — ver `database/supabase_schema.sql`
- [ ] Persistência: progresso de quest salvo no servidor, nunca no cliente

## 5. Boss e fechamento da trilha
- [ ] Bragmar, o Forjador Caído — moveset básico (mesmo que simplificado)
- [ ] Tela/fluxo de "fim de trilha" (Cinzas que Restam) liberando o barco (mock — próxima ilha ainda não existe no MVP)

## Fora de escopo na Fase 1 (fica pra Fase 2+)
- Outras 3 ilhas, Academia do Cerne, Ordens, mundos ocultos, PvP, clãs, evento de mundo.

---

## 🔧 Q. Qualidade & engenharia (loja paralela — time de agentes)

Roda em paralelo às features, desbloqueando velocidade com segurança. Cada item
precisa ser **clamado no [AGENT_SYNC.md](../AGENT_SYNC.md)** antes de mexer.

- [x] `docs/PROTOCOL.md` (**v1.0.1**, 2026-09-15) — contrato vivo das mensagens
  `{type}` cliente↔servidor (mudança de contrato = PR + aviso no mural, regra ⛔ conjunta)
- [x] **Testes do servidor** (23 testes ✅, zero novas dependências): conexão,
  spawn, tick, Dom de Fogo, morte/respawn + **guard rails** (`tests/guardrails.test.js`)
- [x] **CI no GitHub Actions** (verificando em verde desde 2026-09-15; `arena-c3`)
- [x] **Demo web ao vivo** — Netlify git-linked com deploy contínuo (2026-09-15)
- [x] **Guard rails do servidor**: dedup anti-fantasma, rate-limit 60 msg/s,
  invariante anti-speedhack testada (Closes #18)
- [x] **Graceful shutdown** do servidor (PR #4)
- [ ] Teste de estresse simples (N clientes simulados por WebSocket) — mede o
  tick 20/s sob carga antes do alpha com gente de verdade
- [ ] Débito: `web/index.wasm` de 39MB no git — Git LFS ou cache de build
  (discussão no mural; mexe com histórico, ⛔ conjunta)

## 📅 Log de valedez (por quem, quando)

- **2026-09-15 (16:51)**: fundação técnica parcial + combate autoritativo ✅
- **2026-09-15 (noite)**: produção ao vivo (Render + Netlify contínuo), PROTOCOL v1.0.1,
  23 testes, CI verde, guard rails SHIPADOS (issue #18), qualidade 5/6 + demonstrada ao vivo
  (pushes do time local; roadmap atualizado).
- **2026-09-15 (17:h)**: contador de progresso + seção Q dos agentes
  (`arena-deivid`, claim de docs).

---
Depois que esse checklist fechar, o próximo bloco natural é a Fase 2 (Mundo Base) no `ROADMAP` do documento principal.
