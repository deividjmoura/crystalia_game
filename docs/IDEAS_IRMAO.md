# Ideias do Irmão — Crystalia

> Documento vivo das ideias do irmão do Deivid (10 anos).
> Cada ideia é registrada com: descrição original, análise de viabilidade,
> encaixe no ROADMAP/arquitetura e status (discutir → aprovar → issue → implementar).
>
> **Regra do time:** respeitar o espírito da ideia, adaptar ao servidor autoritativo
> e ao escopo de cada fase. Nada é “bobo” — ideias de criança muitas vezes
> viram as mecânicas mais memoráveis.

**Mantenedor do doc:** `grok-xai` (com discussão no Mural).

---

## Ideia #1 — O Mercador Contador de Histórias + Sorteio de Fragmento

### Descrição original (irmão)
> “Quero que haja uma espécie de mercador em algum ponto que ele conta a história,
> onde o player tem acesso quando quiser. A ideia é que quanto maior o tier do
> player mais cara pra ele sortear um fragmento de cristal aleatório de classe
> e poder aleatório (claro temos que pensar em não dar um fragmento de base para
> alguém de level alto, tem que ser algo meio proporcional).”

### Interpretação amigável
- Um **NPC mercador** fixo (ou em ponto conhecido da ilha) que:
  1. Conta trechos da história / lore quando o jogador fala com ele.
  2. Oferece um **sorteio pago** de fragmento de cristal.
- O custo sobe com o tier/nível do jogador.
- O fragmento sorteado é **proporcional** ao nível: jogador alto não recebe lixo de tier 1; jogador baixo não recebe lendário cedo demais.

### Análise de viabilidade

| Aspecto | Viável? | Notas |
|---------|---------|-------|
| NPC fixo com diálogo | ✅ Sim | Já está no ROADMAP (Tomrik). Podemos ter o Mercador como segundo NPC ou o próprio Tomrik evolui para isso. |
| Acesso “quando quiser” | ✅ Sim | NPC estático na ilha + botão de interação. |
| Contar história | ✅ Sim | Diálogo por etapas (já planejado para quests). Pode desbloquear capítulos conforme progresso. |
| Sorteio de fragmento | ✅ Sim | Servidor autoritativo decide o resultado (anti-cheat). Cliente só pede “quero sortear”. |
| Custo sobe com tier | ✅ Sim | Fórmula simples no servidor: `custo = base * (1 + level * fator)`. Moeda ainda não existe → usar energia, cristais comuns ou criar “moeda de cinzas”. |
| Fragmento proporcional | ✅ Sim | Tabela de loot por faixa de nível (ou weighted random). Nunca dropa item muito abaixo/acima do tier. |
| Inventário | ✅ Já existe | `inventory_items` no schema Supabase. |
| Escopo Fase 1 | ⚠️ Parcial | Cristais comuns já estão no ROADMAP item 3. O mercador + sorteio pode ser extensão natural depois de “cristais comuns: drop, inventário, equipar”. |

### Proposta de design (rascunho)

**NPC:** “O Mercador das Cinzas” (ou nome que o irmão escolher).
- Local: perto do spawn de Ignara ou num marco da ilha.
- Diálogo: lore curta + opção “Sortear fragmento”.

**Economia do sorteio (exemplo):**
```
custo = 50 + (level * 15)   // energia ou “cinzas”
```

**Tabela de peso por faixa de nível (exemplo):**

| Nível do player | Fragmentos possíveis | Peso maior em |
|-----------------|----------------------|---------------|
| 1–5 | comuns de Ignara | comuns |
| 6–10 | comuns + incomuns | incomuns |
| 11–20 | incomuns + raros | raros |
| 21+ | raros + lendários (baixa chance) | raros |

**Tipos de fragmento (encaixa na ART_DIRECTION):**
- Elemento: Ignara / Maren / Terrunha / Zéfira
- Classe/poder: ex. “Fragmento de Força”, “Fragmento de Cura”, “Fragmento de Visão”…
- Raridade: comum → incomum → raro → lendário

O servidor rola, grava no inventário e devolve o resultado. Cliente só anima.

### Status
- [x] Registrada
- [ ] Discussão no Mural (aberta)
- [ ] Aprovação do humano
- [ ] Issue de implementação
- [ ] Implementada

---

## Próximas ideias

_(espaço para o irmão / Deivid adicionarem)_

---

*Criado por `grok-xai` a pedido do `deivid-humano`, em homenagem às ideias do irmão.*
