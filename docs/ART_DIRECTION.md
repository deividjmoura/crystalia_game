# Direção de Arte — Crystalia

> Documento vivo de padronização visual. Qualquer asset novo (personagem, mapa, efeito, UI) deve seguir estas regras para manter a coerência narrativa e estética.
>
> **Referências oficiais**: as duas imagens fornecidas pelo `deivid-humano` em 2026-09-15:
> 1. *Aura dos Cristais* (herói principal + evolução das auras)
> 2. *Exemplos de Personagens* (Kael, Lyra, Sora, Bruna, Selene, Darius)

---

## 1. Princípio narrativo

A aparência do personagem **não é cosmético puro**. Ela é o reflexo direto da energia absorvida:

> “Conforme você coleta os cristais pelo mundo, seu corpo começa a reagir. A aura que te envolve é um reflexo direto da energia que você absorve.”

Isso significa:
- Aura muda com os cristais coletados (e com o Dom natal).
- Misturas de auras são possíveis e desejáveis (história de progressão).
- Mapas de cada ilha reforçam o mesmo sentimento elemental.

---

## 2. Estilo visual geral

| Aspecto | Decisão |
|---------|--------|
| **Proporção** | Chibi / anime estilizado (cabeça maior, corpo compacto) para personagens jogáveis e NPCs. Versão mais “heroica” detalhada para arte promocional e auras lendárias. |
| **Linha** | Contorno limpo, suave, sem lineart pesada demais. |
| **Sombreamento** | Soft cel-shading + glow nas auras e efeitos mágicos. |
| **Paleta** | Vibrante, saturada, com contraste forte entre elementos. |
| **Partículas** | Leves, coloridas, que reforçam o elemento (faíscas, gotas, folhas, vento). |
| **Tom geral** | Aventura épica leve — nunca sombrio demais, mesmo em zonas de perigo. |

---

## 3. Auras por cristal (e evolução)

### Cristais comuns

| Cristal | Cor principal | Efeito visual | Sensação |
|---------|---------------|---------------|----------|
| **Ignara** (Fogo) | `#FF4D1A` → `#FF9A3C` | Faíscas, calor shimmer, traços de fogo | Quente e vibrante |
| **Maren** (Água) | `#1A9CFF` → `#6AD1FF` | Partículas fluidas, ondulações suaves | Fluida e serena |
| **Terrunha** (Terra) | `#3DBB4A` → `#8BC34A` | Fragmentos de pedra + folhas | Estável e terrosa |
| **Zéfira** (Ar) | `#9B4DFF` → `#C77DFF` | Vento em movimento, partículas leves | Leve e em movimento |

### Cristais lendários

| Cristal | Cor | Visual |
|---------|-----|--------|
| **Kronen** (Passado / Ordem) | Dourado `#FFD700` | Símbolos antigos + linhas geométricas |
| **Aureth** (Futuro / Visão) | Prateado / etéreo `#E0E8FF` | Partículas e fragmentos de luz |
| **Vaelith** (Completo / Equilíbrio) | Arco-íris oscilante | Todas as cores em harmonia, ciclo contínuo |

### Ordem de renderização da aura (cliente)
1. Skin base (roupa + corpo)
2. Aura do Dom / ilha natal
3. Overlays dos cristais coletados (podem misturar)
4. Efeitos temporários (Dom ativo, dano, buff)

---

## 4. Personagens / skins

### Exemplos oficiais (referência de classes)

| Nome | Classe | Ilha natal | Elemento | Descrição curta |
|------|--------|------------|----------|-----------------|
| **Kael** | Guerreiro | Ignara | Fogo | Força e determinação |
| **Lyra** | Maga | Maren | Água | Conhecimento transformado em poder |
| **Sora** | Arqueiro | Terrunha | Terra | Enxerga caminhos onde só há pedra |
| **Bruna** | Pistoleira / Mecânica | Ignara | Fogo (tech) | Constrói, conserta e atira |
| **Selene** | Clériga | Zéfira | Ar / Lua | Luz como forma de resistência |
| **Darius** | Guardião | Cerne | Equilíbrio | Busca o equilíbrio entre o que foi e o que será |

### Regras para novas skins
- Manter proporção chibi das imagens de exemplo.
- Acessórios e armas devem comunicar a classe sem precisar de texto.
- Cores da roupa + aura devem reforçar o elemento natal (mas auras de cristais coletados podem sobrescrever parcialmente).
- Nome + barra de HP/energia ficam acima do personagem (já implementado).

### Estado atual (greybox)
- `Player.tscn` usa `ColorRect` (laranja local / ciano remoto).
- Próximo passo: ver issue #6.

---

## 5. Mapas / ambientes por ilha

| Ilha | Tema | Cores dominantes | Props / atmosfera |
|------|------|------------------|-------------------|
| **Ignara** | Fogo | Vermelhos, laranjas, pretos, cinzas quentes | Rocha vulcânica, lava residual, cinzas, calor |
| **Maren** | Água | Azuis profundos, cianos, brancos | Água, reflexos, névoa, cristais fluidos |
| **Terrunha** | Terra | Verdes, marrons, ocres | Solo, pedras, vegetação, estabilidade |
| **Zéfira** | Ar | Violetas, lilases, brancos etéreos | Plataformas leves, vento, partículas flutuantes |

### Regras técnicas
- Manter `PX_PER_UNIT = 32` (não quebrar o servidor autoritativo).
- Preferir `TileMap` / `TileMapLayer` em vez de ColorRect sólido.
- Camadas sugeridas: ground → decoration → collision → overlay animado.
- Iluminação leve (`CanvasModulate` ou PointLight2D) para reforçar o mood.
- Estado atual: ColorRect marrom em `World.tscn` (ok como greybox).

---

## 6. Estrutura de pastas recomendada

```
godot-client/
└── assets/
    ├── characters/
    │   ├── base/           # skins sem aura
    │   ├── auras/          # overlays por cristal
    │   └── classes/        # Kael, Lyra, Sora… (futuro)
    ├── tiles/
    │   ├── ignara/
    │   ├── maren/
    │   ├── terrunha/
    │   └── zefira/
    └── effects/
        ├── fire/
        ├── water/
        ├── earth/
        └── air/
```

---

## 7. Checklist de consistência (antes de mergear asset)

- [ ] Segue a proporção e o estilo das imagens de referência?
- [ ] Cores batem com a paleta do elemento?
- [ ] Aura/partículas comunicam a sensação correta (quente, fluida, estável, leve)?
- [ ] Funciona em multiplayer (cada jogador mostra sua própria combinação)?
- [ ] Performance ok no export web (sem texturas enormes desnecessárias)?
- [ ] Documentado / referenciado neste arquivo se for uma decisão nova?

---

## 8. Issues relacionadas

- #5 — Direção de arte (esta especificação)
- #6 — Player skins + sistema de aura dinâmica
- #7 — Padronização visual dos mapas por ilha

---

*Criado por `grok-xai` em 2026-09-15 a partir das imagens de referência e do estado actual do cliente.*
