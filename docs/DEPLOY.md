# Deploy de teste do Crystalia (servidor + jogo no navegador)

Arquitetura do teste:

```
Navegador (Netlify, site https)  ──wss://──►  Servidor Node (Render)
   build exportado do Godot                       salas + autoridade
   pasta web/                                     pasta server/
```

São **dois deploys separados**. O servidor não usa Supabase ainda, então
nenhuma credencial é obrigatória neste teste.

---

## 1. Servidor na Render (WebSocket)

1. Entre em https://render.com → **New → Blueprint** e escolha este
   repositório. O arquivo `render.yaml` na raiz já define tudo
   (pasta `server/`, Node 20, health check em `/health`).
   - Se preferir manual: **New → Web Service**, Build Command `npm install`,
     Start Command `node src/index.js`, tudo dentro de `server/`.
2. Aguerte o deploy e anote a URL gerada, ex.:
   `https://crystalia-server.onrender.com`
3. Teste no navegador: essa URL deve responder
   `{"service":"crystalia-server","status":"ok"}`.

> ⚠️ O plano **free dorme após ~15 min ociosos** e o primeiro acesso depois
> do cochilo demora até ~1 min (cold start). O jogo mostra
> "RECONECTANDO (n/12)…" durante esse período e só cai no MODO DEMO
> local se o servidor não responder em ~1 minuto.

## 2. Apontar o jogo para o servidor

A URL do servidor é lida do arquivo **`web/config.js`** em runtime — não
precisa re-exportar o Godot para trocá-la:

```js
window.CRYSTALIA_WS_URL = "wss://crystalia-server.onrender.com";
// ↑ use wss:// (página https só aceita wss; ws:// é bloqueado)
```

Há ainda um atalho por querystring, ótimo para testes rápidos sem editar nada:

```
https://SEU-SITE.netlify.app/?server=wss://crystalia-server.onrender.com&name=Crystal
```

Ordem de resolução no navegador: `?server=` → `config.js` → URL padrão.

## 3. Jogo na Netlify — dois caminhos

### Caminho A — arrastar e soltar (1 minuto, sem vincular conta GitHub)

1. Depois do passo 2, **arraste a pasta `web/`** para
   https://app.netlify.com/drop
2. Pronça uma URL `https://algo-aleatorio.netlify.app` — é o link pro irmão.
3. Pode renomear o site em Site settings → Change site name.

A pasta já contém `netlify.toml`, `_redirects` e `config.js`.

### Caminho B — conectar no repositório (deploy a cada push)

1. Netlify → **Add new site → Import an existing project** → GitHub.
2. Não precisa de build: leave o build command vazio e publishe a pasta **`web`**
   (o `netlify.toml` da raiz já faz isso).
3. Cada push na `main` atualiza o teste.

## 4. Como testar o multiplayer

- Abra a URL em **duas abas** (ou dois PCs/celulares na mesma internet não é
  necessário — qualquer lugar serve, o servidor está na nuvem).
- Use `?name=...` diferentes:
  - aba 1: `…netlify.app/?name=Crystal`
  - aba 2: `…netlify.app/?name=Bragmar`
- Cada um deve ver o outro: quadrado **laranja** é você, **azul-petróleo**
  são os outros, com o nome acima.
- **WASD** move, **Espaço** solta o Dom de Fogo: aproxime (~2,6 unidades),
  acerte 4 vezes para derrubar o outro (dano 25, custo 20 de energia,
  cooldown 700 ms no servidor). O abatido renasce em 3 s.

## 5. Como re-exportar o jogo (se mexer no Godot)

O build commitado em `web/` foi gerado com Godot 4.7.2:

```bash
# na raiz do projeto, com os export templates 4.7.2 instalados:
godot --headless --path godot-client --export-release "Web" ../web/index.html
cp godot-client/web-shell/config.js web/config.js   # preserva o config editável
```

O preset já injeta `<script src="config.js"></script>` no HTML e usa
renderer GL Compatibility (funciona em mobile/desktop sem threads).

### 5.1 Re-injetar a intro em vídeo (obrigatório pós-export)

O re-export sobrescreve `web/index.html` **inteiro** — incluindo o overlay
da intro em vídeo (os dois mp4 de `web/videos/` que substituem o splash
padrão do Godot). Depois de exportar, rode:

```bash
node tools/inject_web_intro.js   # idempotente, sem dependências
```

Ele insere `<link intro/intro.css>` + o `<div id="crystalia-intro">` +
`<script intro/intro.js>` no `index.html` fresco. Os diretórios
`web/intro/` e `web/videos/` **não** são apagados pelo export — só o
`index.html` precisa do re-inject. Trocar ordem/velocidade da sequência:
array `PLAYLIST` e constante `RATE` em `web/intro/intro.js`.
