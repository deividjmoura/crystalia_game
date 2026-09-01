# Crystalia — Estrutura Inicial do Projeto

Este repositório contém o esqueleto inicial do MVP (Fase 1 do roadmap):
Ignara jogável, Dom de Fogo, cristais comuns, servidor autoritativo.

## Estrutura

```
crystalia/
├── godot-client/     # Cliente do jogo (Godot 4.x, exporta pra Web e Mobile)
│   ├── project.godot
│   ├── scenes/
│   ├── scripts/
│   └── assets/
├── server/           # Servidor autoritativo (Node.js + WebSocket puro)
│   ├── src/
│   │   ├── index.js
│   │   └── game/
│   └── package.json
├── database/          # Schema do Supabase (Postgres)
│   └── supabase_schema.sql
└── docs/
    ├── ROADMAP.md
    └── STRUCTURE.md
```

## Como rodar localmente

### 1. Servidor
```bash
cd server
npm install
cp .env.example .env   # preencher com suas credenciais do Supabase
npm run dev
```
Servidor sobe em `ws://localhost:2567`. Teste rápido: abra `http://localhost:2567/health` no navegador, deve responder `{"status":"ok"}`.

### 2. Cliente (Godot)
1. Baixe o [Godot 4.x](https://godotengine.org/download) (versão Standard, não precisa da .NET).
2. Abra a pasta `godot-client/` como projeto no Godot.
3. Rode a cena `scenes/World.tscn` (F5 ou o botão de play).
4. Não precisa instalar nenhum addon — `NetworkManager.gd` usa o `WebSocketPeer`
   nativo do Godot pra conversar com o servidor em JSON puro.

### 3. Banco (Supabase)
1. Crie um projeto grátis em [supabase.com](https://supabase.com).
2. Vá em SQL Editor e rode o conteúdo de `database/supabase_schema.sql`.
3. Copie a URL e a chave de serviço (service_role) pro `.env` do servidor.

## Próximo passo depois disso
Ver `docs/ROADMAP.md` pra checklist detalhado da Fase 1 (MVP).

## GitHub
Esse projeto já está pronto pra virar um repositório. Depois de baixar os arquivos:
```bash
git init
git add .
git commit -m "chore: estrutura inicial do projeto Crystalia"
git branch -M main
git remote add origin <sua-url-do-github>
git push -u origin main
```


---

<p align="center">
  <a href="https://wa.me/55SEUNUMERO?text=Ol%C3%A1%20Deivid!%20Quero%20falar%20sobre%20parceria%20/%20projeto.">
    <img src="https://raw.githubusercontent.com/deividjmoura/deividjmoura/main/assets/logo-deivid-moura-dev.svg" alt="Deivid Moura DEV" width="140"/>
  </a><br/>
  <sub><b>Deivid Moura DEV</b> · parcerias e sistemas sob medida</sub>
</p>

