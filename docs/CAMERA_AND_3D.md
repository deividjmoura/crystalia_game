# Câmera e Mundo em 3ª Pessoa — Crystalia

> Direção oficial a partir de 2026-09-15 (pedido do `deivid-humano` + análise do time).
> Referência principal: [Cyber-Ascension](https://github.com/gzuismoura-ops/Cyber-Ascension).
>
> **Responsável da frente:** `grok-xai`.

---

## 1. Objetivo

- Personagem **visível** e **andando** no mundo (não mais placeholder ColorRect / visão de cima).
- Câmera de **3ª pessoa real** (atrás / levemente acima do ombro), não top-down.
- Continuar 100% no **navegador** (Godot Web export), sem instalação.
- Manter **servidor autoritativo** (anti-cheat desde o dia 1).
- Performance aceitável em notebook médio no Chrome.

---

## 2. Decisão de arquitetura

| Escolha | Valor |
|---------|-------|
| Engine do client | Continuar **Godot 4.7.2** (não migrar para Three.js agora) |
| Dimensão | **3D** (CharacterBody3D + Camera3D + SpringArm3D) |
| Renderer | **Compatibility** (já usado — melhor suporte Web) |
| Coordenadas de rede | Manter plano XZ no servidor por enquanto; Y só visual/local até o PROTOCOL evoluir |
| Autoridade | Cliente **só** manda input (`move_input`, `look`, ações). Servidor continua dono de posição, HP, energia, cooldowns |

---

## 3. Referência Cyber-Ascension (o que copiamos em espírito)

- Avatar low-poly visível com walk-cycle simples.
- Câmera 3ª pessoa atrás da cabeça (~4–5 unidades), com recuo automático em obstáculos.
- Física leve.
- Presets de qualidade (baixa / média / alta).
- Tudo roda no browser sem downloads pesados de assets.

---

## 4. Plano de migração (etapas)

### Fase 0 — Documentação e claim (agora)
- [x] Este documento
- [ ] Issue de POC
- [ ] Claim no AGENT_SYNC

### Fase 1 — POC mínima (branch `feat/third-person-poc`)
Objetivo: provar que 3ª pessoa + personagem visível funciona no export Web **sem quebrar** o multiplayer atual.

1. Nova cena `World3D.tscn` (ou evoluir a atual) com:
   - `CharacterBody3D` (jogador local)
   - `SpringArm3D` + `Camera3D`
   - Chão simples + alguns obstáculos
   - Avatar placeholder (cápsula + membros ou mesh low-poly)
2. Input: WASD + mouse look (ou stick virtual depois)
3. Continuar enviando `move_input` para o servidor atual (plano XZ)
4. Interpolação visual da posição autoritativa
5. Testar no export Web (Netlify)

**Critério de sucesso da POC:** personagem visível andando, câmera 3ª pessoa, multiplayer ainda funciona, FPS estável em máquina média.

### Fase 2 — Integração com o jogo real
- Substituir o greybox 2D pelo 3D na main scene
- Auras e efeitos elementais em 3D (partículas / meshes)
- NPCs e interações (Mercador, Tomrik)
- Ajustar PROTOCOL se precisarmos de `look_yaw` / `look_pitch` para skills direcionais

### Fase 3 — Performance e “extensão”
- LOD / Visibility ranges
- Baked lighting onde possível
- Quality presets (pixel ratio, sombras, draw distance)
- Progressive loading de assets (CDN / chunks) — a “extensão” futura
- Avaliar threads (COOP/COEP) se necessário

---

## 5. Regras de segurança (não negociáveis)

Herdadas e reforçadas:

1. Cliente **nunca** decide posição final, dano, cooldown ou inventário.
2. Servidor valida velocidade máxima (anti-speedhack).
3. Rate-limit de input.
4. Skills só executam se o servidor confirmar alcance + custo + cooldown.
5. Em 3D: colisão autoritativa no servidor (mesmo que o cliente faça previsão visual).

Referências:
- [Gabriel Gambetta – Client-Server Game Architecture](https://gabrielgambetta.com/client-server-game-architecture.html)
- Godot Multiplayer Authoritative demos

---

## 6. Orçamento de performance (alvo inicial)

| Métrica | Alvo |
|---------|------|
| Triângulos por personagem | < 2 000 |
| Draw calls cena principal | < 300 |
| FPS mínimo (notebook médio, Chrome) | 30+ no preset Médio |
| Tamanho do .wasm + .pck | Monitorar; preferir progressive loading depois |

---

## 7. Estrutura de pastas sugerida (3D)

```
godot-client/
├── scenes/
│   ├── World.tscn          # (evolui ou vira World3D)
│   ├── Player.tscn         # CharacterBody3D
│   └── ...
├── assets/
│   ├── characters/
│   │   ├── base/
│   │   └── auras/
│   ├── meshes/
│   ├── textures/
│   └── effects/
└── scripts/
    ├── Player.gd           # CharacterBody3D + interpolação
    ├── CameraController.gd # SpringArm + look
    └── ...
```

---

## 8. Status

- [x] Análise do Cyber-Ascension
- [x] Discussão no Mural
- [x] Documento de direção
- [ ] POC mínima
- [ ] Aprovação final do humano para merge da POC na main

---

*Mantido por `grok-xai`. Qualquer mudança de direção arquitetural deve ser discutida no Mural antes de código.*
