# Encerramento de etapa — A1 UX mobile + A2 gameplay (20/10/2026)

## Objetivo
Validar a integração entre PR #33 (UX/UI mobile) e PR #32 (gameplay Canvas) antes de avançar para missões e persistência, mantendo browser-first e sem instalação.

## Escopo efetivamente testado
- Teste executado por GitHub Actions em **Chromium headless real**, com toque **emulado**, servidor Node/WebSocket local real e merge **apenas temporário** dos dois PRs no checkout do CI, sem alterar a main.
- A suíte `tests/browser/smoke.cjs` verifica:
  - Mobile 390 × 844: landing, entrada em demo, HUD/controles visíveis, botões acionáveis, toque dispara Dom, energia reduz, saída.
  - Mobile 844 × 390: mesmas validações em orientação paisagem.
  - Desktop 1366 × 768 e 800 × 600: teclado e disparo, joystick touch oculto em ponteiro fino.
  - Multiplayer: dois usuários distintos conectados ao mesmo servidor, espelhamento do estado, movimento e disparo, saída e remoção da sessão remota.
  - Limpeza básica de timers de gameplay, ausência de erros JavaScript não tratados, rolagem bloqueada no jogo e viewport permitindo zoom na landing.
- Execução **verde**: [Browser integration smoke — run 39461824479](https://github.com/deividjmoura/crystalia_game/actions/runs/39461824479). Cinco cenários passaram.
- CI Node 20/22: verificações de servidor independentes aprovadas nos PRs #32/#33.

## Ajustes feitos na revisão
1. **Acessibilidade:** `webapp/index.html` remove `maximum-scale=1` e `user-scalable=no`. O jogo continua prevenindo toques/gestos involuntários via CSS `touch-action: none` na área do jogo; a landing permite zoom.
2. **Controles touch:** a visibilidade de joystick e Dom depende de entrada touch/sem hover, não mais de largura ≤ 900px isoladamente. Desktop estreito continua responsivo, mas sem controles touch falsos.
3. **Movimento reduzido:** a dica de orientação não fica permanentemente visível para usuários com `prefers-reduced-motion`.
4. **Primeiro disparo imediato (A2):** teste identificou bloqueio indevido do primeiro Dom de Fogo no demo logo após entrar (uso de timestamp inicial zero com cooldown). Corrigido no PR #32 com timestamp inicial `-Infinity`; o teste passou na execução integrada.
5. **Regressão contínua:** adicionados `tests/browser/smoke.cjs` e workflow `.github/workflows/browser-smoke.yml` que rodam automação de navegador para alterações webapp e verificam a combinação dos PRs durante a revisão.

## Limitações — não interpretar como garantia universal
- **Não executado em Android Chrome ou iOS Safari físicos.** Touch emulado em Chromium não valida gestos específicos, teclado virtual, notch real, travamentos de GPU, consumo de bateria ou restrições de memória desses aparelhos.
- O benchmark FPS do Agente 02 não foi reproduzido nesta etapa; esta CI verifica funcionalidade, não desempenho sustentado sob carga real.
- Sem testes cross-browser Firefox/WebKit nativos ainda; a próxima rodada de QA deve adicioná-los.
- Persistência, contas reais, NPC/quests e inventário continuam fora do escopo desta entrega.

## Pontos para retomar
- Jogar em Android Chrome e iPhone Safari físicos (quando houver), especialmente paisagem/retrato, multitouch, suspensão/retomada e desempenho.
- Adicionar testes de robustez de reconexão em navegador e cross-browser em CI.
- Planejar a Onda 2: Tomrik, primeira missão, persistência/autenticação e inventário; novos contratos são definidos antes de frontend/backend.
- **Não mudar protocolos ou trocar engine como parte deste encerramento**.

## Referências
- PR #32: https://github.com/deividjmoura/crystalia_game/pull/32
- PR #33: https://github.com/deividjmoura/crystalia_game/pull/33
- Plano base: docs/CRYSTALIA_BROWSER_FIRST_MULTIAGENT_PLAN.md
