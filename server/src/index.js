require("dotenv").config();
const http = require("http");
const express = require("express");
const { WebSocketServer } = require("ws");

const { IgnaraRoom } = require("./game/IgnaraRoom");

const port = Number(process.env.PORT || 2567);
// Em hospedagem (Render etc.) o bind precisa ser em todas as interfaces.
const host = process.env.HOST || "0.0.0.0";

const app = express();
app.use(express.json());

app.get("/", (_req, res) =>
  res.json({ service: "crystalia-server", status: "ok" })
);
app.get("/health", (_req, res) => res.json({ status: "ok" }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// No MVP só existe Ignara. Quando outras ilhas entrarem (Fase 2), a ideia é
// uma "room" por ilha, roteada pelo path da conexão (ex: /ignara, /maren).
const ignara = new IgnaraRoom();

wss.on("connection", (ws, req) => {
  console.log(`[DEBUG] nova conexão WebSocket de ${req.socket.remoteAddress}, url: ${req.url}`);

  // displayName vem por querystring por simplicidade no MVP:
  // ws://localhost:2567?name=Fulano
  const url = new URL(req.url, "http://localhost");
  const displayName = url.searchParams.get("name") || "Aventureiro";

  const sessionId = ignara.join(ws, displayName);
  console.log(`[DEBUG] jogador entrou: ${sessionId} (${displayName})`);

  ws.on("message", (raw) => ignara.handleMessage(sessionId, raw));
  ws.on("close", (code, reason) => {
    console.log(`[DEBUG] jogador saiu: ${sessionId}, código: ${code}, motivo: ${reason}`);
    ignara.leave(sessionId);
  });
  ws.on("error", (err) => console.error(`[DEBUG] erro no socket de ${sessionId}:`, err.message));
});

wss.on("error", (err) => console.error("[DEBUG] erro no WebSocketServer:", err.message));

server.listen(port, host, () => {
  console.log(`[crystalia-server] rodando em http://${host}:${port}`);
});

// Encerramento limpo: a Render/orquestrador mandam SIGTERM antes de matar o
// processo (redeploy, scale-down). Sem isso o tick de 20Hz e os timers de
// respawn morriam com o processo e as conexões eram cortadas de seco.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[crystalia-server] ${signal} recebido — encerrando...`);

  ignara.destroy();
  wss.clients.forEach((client) => client.close(1001, "server shutting down"));

  server.close(() => {
    console.log("[crystalia-server] HTTP/WS fechado, tchau.");
    process.exit(0);
  });

  // Não fica refém de conexão presa por mais de 3s.
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
