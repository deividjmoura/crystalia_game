# CRYSTALIA — Direção browser-first e plano multiagente

**Decisão de 20/10/2026.** Proposta para aprovação em Pull Request. Não implementa mudanças de runtime.

## 1. Objetivo e estado atual

Crystalia é um RPG acessível por URL HTTPS no navegador de celular e computador, sem exigir download, APK, extensão, instalação, App Store ou Google Play. Eventual PWA/atalho é opcional.

- A versão web oficial mais recente está em **webapp/**: HTML, CSS, JavaScript e Canvas 2D, com landing, menu, Ignara, multiplayer WebSocket, Dom de Fogo e modo demo offline. Este é o comportamento e a experiência que **não podemos quebrar**.
- **godot-client/** contém a POC 3D em terceira pessoa, e **web/** conserva o export legado. Preservar ambos: não apagar o trabalho 3D, nem obrigar o app a migrar antes de benchmark mobile e decisão do humano.
- **server/** contém backend Node + WebSocket (ws) e estado autoritativo de Ignara a 20Hz. Protocolo v1.1 documentado em **docs/PROTOCOL.md**.
- **database/supabase_schema.sql** é modelagem inicial; não confundir schema versionado com autenticação/persistência funcionando.
- Referências obrigatórias: README.md, AGENT_SYNC.md, docs/ROADMAP.md, docs/PROTOCOL.md, docs/STRUCTURE.md, docs/ART_DIRECTION.md, docs/CAMERA_AND_3D.md, docs/IDEAS_IRMAO.md.

## 2. Decisões e regras de engenharia

1. **Web-first, sem instalação**. Um link para Android, iOS e navegadores desktop. Adaptar entrada e HUD, não criar regras de gameplay divergentes.
2. **Preservação da identidade**: estética Crystalia, seus personagens, auras, ilhas, paleta e experiência vigente. Melhorar sem redesenhar o universo ou inventar um jogo diferente.
3. **Não reescrever a stack por moda**. Manter HTML/CSS/Canvas no cliente atual, Node/ws no servidor. Godot, Babylon.js ou Three.js só serão substituição/integração após estudo comparativo, desempenho comprovado e aprovação humana.
4. **Servidor autoritativo**: cliente envia intenções; servidor define posição, HP, dano, cooldowns, XP, drops e progressão. Nenhum segredo de Supabase ou chave privilegiada chega ao browser.
5. **Congelar protocolo na Onda 1**. Qualquer alteração no contrato WebSocket exige RFC, exemplos, compatibilidade, testes, coordenação e aviso no mural; não mudar docs/PROTOCOL.md nem mensagens unilateralmente.
6. **HTTPS/WSS** na produção, proteção a spam e entradas inválidas; em fase posterior, identidade de conta por token validado no servidor, não apenas displayName.
7. **Modo demo tem identidade clara**: offline não equivale a multiplayer nem persiste progresso. Não esconder servidor indisponível.
8. Objetivos mensuráveis: medir FPS e carregamento no celular intermediário; mirar 30 FPS+ inicialmente, UI sem scroll horizontal ou toque acidental; landscape e portrait com orientação sugerida onde útil, sem bloqueio obrigatório. Performance real não pode ser afirmada sem medição.
9. **Jamais** push direto na main, force push, reset destrutivo sobre trabalho não salvo, merge automático, segredos no PR ou alterações em áreas alheias sem consentimento.
10. Um agente = um ownership de arquivos + uma branch + um PR de escopo delimitado; todos os PRs passam pela revisão de integração, com aprovação final humana para deploy/mudanças de produto.

## 3. Arquitetura pretendida

Navegador (webapp/, render atual) ↔ WSS ↔ Node.js (server/, única fonte de verdade) ↔ Supabase/PostgreSQL (futura persistência, somente via regras validadas). Godot continua como POC de render, não como fonte de autoridade. Netlify e Render mantidos até evidência justificar mudança.

## 4. Divisão e ownership — Onda 1

| Agente | Arquivos autorizados para alterar | Missão | Proibido sem negociação |
|---|---|---|---|
| 01 UX/UI | webapp/index.html; webapp/style.css | Responsividade, HUD, ergonomia mobile, áreas seguras, acessibilidade | webapp/game.js; protocolo |
| 02 Gameplay web | webapp/game.js | Render/feedback do Dom, fluidez, demo, estabilidade, recursos | HTML/CSS, servidor, protocolo |
| 03 Backend | server/src/**; server/tests/** | Segurança, resiliência WS e testes unitários | webapp/**; Supabase real; protocolo |
| 04 QA | tests/browser/**; .github/workflows/**; docs/QA_BROWSER.md | Smoke desktop/mobile, CI, relatório cross-browser | server/src/**; server/tests/**; webapp/** |
| 05 Conteúdo | game-content/ignara/**; docs/IGNARA_CONTENT_CONTRACT.md | Tomrik, diálogos e dados da questline de Ignara | Runtime, banco, contrato |
| 06 P&D 3D | docs/WEB_RENDERER_EVALUATION.md; experiments/browser-3d/** | Benchmark Godot Web vs cliente atual vs alternativas | Código 3D de produção, webapp, deploy |
| Coordenação | Revisão/roadmap/contratos | Arbitragem de conflitos, PRs e integração | Sobrescrever arquivos reivindicados |

**Importante:** antigas linhas de "Em andamento" do AGENT_SYNC podem estar desatualizadas. Antes de reivindicar, conferir PRs, branches e atividade recente. Registrar claim de cada agente no mural; se houver colisão, negociar antes de editar.

## 5. Execução em ondas

**Onda 0 — antes de começar:** todos leem AGENT_SYNC inteiro, roadmap, protocolo e direção de arte, verificam main/PRs/issues, publicam claim, criam branch própria atualizada. A1 e A2 combinam previamente IDs DOM, seletores e possíveis hooks. A3 e A4 combinam cenários E2E sem disputar server/tests.

**Onda 1 — entregas independentes:** seis missões acima; nenhuma integração de novos pacotes quest/Auth ao runtime enquanto contratos não forem acordados. Testes e evidências obrigatórios. Pequenas correções pontuais, não refatoração ampla.

**Onda 2 — integração RPG:** autenticação real Supabase, identidade permanente, persistência em servidor, Tomrik interativo, primeira missão, inventário/cristais comuns. Planejar PRs sequenciais com alterações de protocolo autorizadas, pois webapp/game.js e IgnaraRoom.js precisarão ser tocados por equipes diferentes.

**Onda 3 — MVP Ignara:** 12 missões, Bragmar, recompensa e fim de trilha, estabilidade multiplataforma. Só depois ampliar ilhas, Academia e mundos ocultos.

## 6. Critérios de aceitação transversais

- Navegador: entrar por URL, sem instalar; home, menu, spawn e retorno funcionando.
- Desktop Chrome/Firefox: WASD, Dom, duas abas/sessões com nomes distintos, sincronização, morte/respawn.
- Android Chrome real: joystick/toque/Dom, HUD legível, rotação, safe areas, sem scroll/zoom acidental; medir FPS/carga.
- iOS Safari real quando disponível: mesmos fluxos; emulador não prova funcionamento em dispositivo real.
- HTTPS/WSS sem mixed content; reconexão e fallback offline claros.
- npm ci e npm test no diretório server, CI sem regressões; QA agrega E2E executável com evidência de aparelhos/navegadores testados.
- Pull Request contém escopo, arquivos, testes e saídas, screenshots de mudanças visuais, como reproduzir, riscos, rollback e dependências. Não fazer merge sozinho.

## 7. Instrução compartilhada para TODOS os agentes

> Repositório: https://github.com/deividjmoura/crystalia_game. Leia AGENT_SYNC.md inteiro antes de editar qualquer arquivo, depois README.md, docs/ROADMAP.md, docs/PROTOCOL.md, docs/ART_DIRECTION.md e este plano. Confira main, PRs e claims atuais. Apresente-se no mural e faça claim de seus arquivos. Crie uma branch nova a partir da main atualizada; faça alterações somente dentro do ownership. Nunca faça push direto na main, force push, mudanças silenciosas do WebSocket, vazamento de segredos, migração de engine ou deploy automático. Preserve webapp atual, experiência mobile/desktop sem instalação e regras de autoridade no servidor. Se outro agente precisar mudar seu arquivo, acerte contrato antes. Envie PR contra main com testes e evidências, sem merge próprio.

## 8. Prompts específicos

### Agente 01 — UX/UI, branch feat/crystalia-mobile-ui
Você possui exclusivamente webapp/index.html e webapp/style.css. Faça auditoria da landing, menu e HUD atuais e melhore usabilidade no Chrome Android, Safari iOS e desktop. Priorize viewport responsiva (390x844, 844x390, 1366x768), botões de toque, safe-area, legibilidade, labels, foco, rolagem indevida, HUD e estados demo/online. Não mude IDs do DOM usados no game.js e não edite JS. Se precisar de novo evento/gancho, peça ao agente 02 antes. Não destrua estilo atual. Entregue PR com comparativo visual, critérios, testes e eventuais lacunas de hardware.

### Agente 02 — Gameplay web, branch feat/crystalia-web-gameplay
Você possui exclusivamente webapp/game.js. Melhore o loop Canvas, suavidade/interpolação, efeitos de hit/projétil, auras/partículas, limpeza de timers/listeners, consistência de joystick/teclado e bots do modo demo, sem mudar protocolo, regras online, servidor, HTML ou CSS. Não finja progresso persistente. Meça FPS/recursos em debug e documente baseline. Combine qualquer seletor novo com agente 01. Teste desktop e touch e abra PR incremental com evidências.

### Agente 03 — Backend, branch fix/crystalia-ws-resilience
Você possui server/src/** e server/tests/**. Audite WebSocket, parsing, limites, input malformado, colisões, tick, desconexão/reconexão, limpeza de jogadores/projéteis, logs e healthcheck. Corrija bugs reproduzíveis com testes, preservando PROTOCOL v1.1, dano e cooldown atuais; não invada cliente nem mude esquema de mensagens sem RFC e acordo. Não implementar login improvisado: descreva dependências de autenticação/persistência da Onda 2. Execute npm ci && npm test e abra PR com testes de regressão.

### Agente 04 — QA, branch test/crystalia-browser-matrix
Você possui tests/browser/**, .github/workflows/** e docs/QA_BROWSER.md. Faça smoke E2E de landing→menu→Ignara→Dom→sair→demo, em viewport desktop e mobile; valide CI e console errors, perdas de conexão, duas sessões WebSocket de nomes distintos quando possível. Documente matriz Chrome/Firefox desktop, Chrome Android e Safari iOS com distinção entre simulação e testes reais. Preserve pipeline Node, mantenha custo/dependências mínimos. Não edite app ou server. Abra PR com scripts reproduzíveis, resultados e issues para bugs.

### Agente 05 — Conteúdo, branch feat/crystalia-ignara-content
Você possui novos game-content/ignara/** e docs/IGNARA_CONTENT_CONTRACT.md. Especifique diálogo de Tomrik, IDs estáveis e conteúdo JSON para a trilha de Ignara: Primeira Chama; Fumaça no Horizonte; Marcas na Bigorna; O Rio de Lava Seca; Os Aprendizes Sumidos; Ecos na Forja Funda; O Diário Queimado; A Fornalha Proibida; Provação da Forja; Confronto: Bragmar; Cinzas que Restam; A Insígnia de Ignara (opcional). Separe diálogo, objetivo, pré-requisitos e recompensa proposta; inclua validação estática dos dados e indique o que o servidor deverá verificar. NÃO implemente fake quest client-side, nem edite app/server/protocolo. PR contendo conteúdo e contrato preparado para Onda 2.

### Agente 06 — P&D 3D, branch research/crystalia-web-3d
Você possui docs/WEB_RENDERER_EVALUATION.md e experiments/browser-3d/**; Godot e webapp são somente leitura. Estude manter Canvas 2D, exportar o Godot 3D existente em WebGL2/Compatibility (single-thread quando adequado) ou usar ferramenta browser 3D como Babylon.js/Three.js. Compare visual possível, FPS, carga, memória, custo, manutenção, touch, Android Chrome/iOS Safari reais quando possível e efeito sobre o servidor autoritativo. Não faça migração, não edite Godot ou produção e não publique deploy. PR de benchmark reproduzível + recomendação técnica com riscos e lacunas.

## 9. Templates de comunicação

**Antes do primeiro commit (postar no AGENT_SYNC):**

[CRYSTALIA CLAIM A#]
- Meu identificador/agente:
- SHA da main:
- Arquivos reivindicados:
- Objetivo deste PR:
- Arquivos que NÃO vou tocar:
- Dependências:
- Critérios de aceite:
- Branch:
- Riscos:

**Ao entregar:**

[CRYSTALIA ENTREGA A#]
- Branch e URL do PR:
- Arquivos alterados:
- Implementado:
- Testes e resultados:
- Como testar desktop/celular:
- Evidências:
- Problemas conhecidos:
- Dependências para outros agentes:
- Pronto para revisão (sim/não):

**Aprovação:** coordenador revisa contratos, riscos e CI; usuário aprova direção de produto e mudanças de produção.
