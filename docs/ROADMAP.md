# Fase 1 — MVP: Checklist

Escopo: só Ignara jogável, Dom de Fogo, cristais comuns, as 12 quests já escritas,
servidor autoritativo desde o protótipo.

## 1. Fundação técnica
- [x] Estrutura de pastas do cliente e servidor
- [ ] Projeto Godot rodando localmente (import + play)
- [ ] Servidor Colyseus rodando localmente (`npm run dev`)
- [ ] Cliente conectando no servidor via WebSocket
- [ ] Deploy de teste do servidor (Fly.io ou Oracle Cloud Free Tier)
- [ ] Supabase configurado (projeto + schema + auth)

## 2. Movimento e combate básico (autoritativo)
- [ ] Servidor mantém a posição real de cada jogador (`GameRoom.js`)
- [ ] Cliente envia apenas *input* (direção, ações), nunca posição final
- [ ] Reconciliação client-side simples (previsão + correção do servidor)
- [ ] Sistema de HP/dano calculado no servidor
- [ ] Cooldown de habilidades controlado por relógio do servidor (nunca do cliente)

## 3. Ignara jogável
- [ ] Cena base da ilha (bloqueada/greybox está ok pro MVP)
- [ ] Spawn do jogador com Dom de Fogo (Sangue Quente: regen de energia com HP < 50%)
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
Depois que esse checklist fechar, o próximo bloco natural é a Fase 2 (Mundo Base) no `ROADMAP` do documento principal.
