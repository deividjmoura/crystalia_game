// Configuração do Crystalia webapp — pode ser editada na hospedagem sem
// tocar no jogo. Por padrão o cliente conecta no MESMO domínio que serve
// esta página (o servidor autoritativo entrega o webapp junto).
//
// Para apontar para outro servidor (ex.: Render em produção):
//   window.CRYSTALIA_WS_URL = "wss://crystalia-server.onrender.com";
// Ou em tempo de teste: ?server=wss://seu-servidor (sobrepõe tudo).
window.CRYSTALIA_WS_URL = window.CRYSTALIA_WS_URL || "";
