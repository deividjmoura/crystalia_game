// Configuração do Crystalia no navegador — este arquivo é entregue junto
// com o build web e pode ser editado na hospedagem SEM precisar re-exportar
// o jogo no Godot.
//
// URL do servidor autoritativo (WebSocket). Use wss:// para páginas https://
// (Netlify) — ws:// é bloqueado por mixed content.
//
// Render (exemplo): crie um Web Service apontando para a pasta server/ e
// cole aqui a URL gerada, trocando https:// por wss://
window.CRYSTALIA_WS_URL = "wss://crystalia-server.onrender.com";

// Alternativa rápida para teste: abra o jogo com
//   https://seu-site.netlify.app/?server=wss://seu-servidor
// ou defina um nome: ?name=Crystal
