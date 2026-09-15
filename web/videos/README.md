# Vídeos de intro — Crystalia

Estes dois vídeos substituem o splash padrão da engine Godot no loading web.
São tocados **em sequência, a 1.25×**, num overlay fullscreen
(`web/intro/intro.js` + `web/intro/intro.css`), injetado no `web/index.html`
por `tools/inject_web_intro.js`.

| Arquivo | Origem | Duração |
|---|---|---|
| `intro-1-generating.mp4` | branch antiga `videos` (`Generating_Crystalia_game_sequence_…mp4`) | ~10 s |
| `intro-2-loading.mp4` | branch antiga `videos` (`Crystalia_game_loading_video_ani…_…mp4`) | ~10 s |

- **Ordem/troca:** edite o array `PLAYLIST` no topo de `web/intro/intro.js`.
- **Velocidade:** constante `RATE` no mesmo arquivo.
- **Áudio:** ambos têm trilha AAC. O primeiro toque com som depende de gesto
  do usuário (política dos browsers) — por isso existe o botão "Entrar em
  Crystalia" quando o autoplay com som é bloqueado.
- Após cada **re-export Godot**, rode `node tools/inject_web_intro.js`
  (ver `docs/DEPLOY.md`) para re-injetar o overlay neste `index.html`.
