# Assets — Crystalia

Estrutura oficial de assets visuais. Siga `docs/ART_DIRECTION.md`.

```
assets/
├── characters/
│   ├── base/           # skins base (sem aura) — spritesheets 4 direções preferencial
│   ├── auras/          # overlays / partículas por cristal
│   │   ├── ignara/
│   │   ├── maren/
│   │   ├── terrunha/
│   │   ├── zefira/
│   │   └── legendary/
│   └── classes/        # Kael, Lyra, Sora, Bruna, Selene, Darius (futuro)
├── tiles/
│   ├── ignara/         # tileset vulcânico (MVP)
│   ├── maren/
│   ├── terrunha/
│   └── zefira/
└── effects/
    ├── fire/           # Dom de Fogo e efeitos de calor
    ├── water/
    ├── earth/
    └── air/
```

## Regras rápidas
- Preferir sprites 32×32 ou múltiplos (alinhado com `PX_PER_UNIT = 32`).
- Auras devem ser transparentes e misturáveis (modulate + partículas).
- Nunca commit de `.import` gerado localmente se for diferente da versão do Godot 4.7.2.
- Novos assets → atualizar checklist em `docs/ART_DIRECTION.md`.

Estado atual: greybox temático (ColorRect + efeitos procedurais). Sprites reais entram quando disponíveis.
