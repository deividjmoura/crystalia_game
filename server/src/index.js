require("dotenv").config();
const http = require("http");
const express = require("express");
const { WebSocketServer } = require("ws");

const { IgnaraRoom } = require("./game/IgnaraRoom");

const port = Number(process.env.PORT || 2567);
const app = express();
app.use(express.json());

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

server.listen(port, () => {
  console.log(`[crystalia-server] rodando na porta ${port}`);
});
