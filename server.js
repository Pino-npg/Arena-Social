import express from "express";
import { WebSocketServer } from "ws";
import http from "http";

const app = express();
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

// Crea server HTTP base
const server = http.createServer(app);

// Attacca WebSocket al server
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("✅ Nuovo client connesso");

  ws.on("message", (message) => {
    console.log("Messaggio:", message.toString());

    // Inoltra il messaggio a tutti gli altri client
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === 1) {
        client.send(message.toString());
      }
    });
  });

  ws.on("close", () => {
    console.log("❌ Client disconnesso");
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server attivo su porta ${PORT}`);
});