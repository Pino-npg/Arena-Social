import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve file statici (public/fight.html, img, style.css)
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(__dirname)); // per index.html nella root

// HTTP server
const server = http.createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server });

let playersQueue = []; // tiene traccia dei client connessi

wss.on("connection", (ws) => {
  console.log("✅ Nuovo client connesso");

  // Aggiungi alla coda dei giocatori
  playersQueue.push(ws);
  broadcastOnline();

  // Ricevi messaggi dai client e inoltra a tutti
  ws.on("message", (message) => {
    wss.clients.forEach((client) => {
      if (client.readyState === 1) client.send(message.toString());
    });
  });

  ws.on("close", () => {
    console.log("❌ Client disconnesso");
    playersQueue = playersQueue.filter(p => p !== ws);
    broadcastOnline();
  });
});

// Aggiorna contatore online
function broadcastOnline() {
  const msg = JSON.stringify({ type: "online", count: playersQueue.length });
  playersQueue.forEach(ws => {
    if (ws.readyState === 1) ws.send(msg);
  });
}

// Avvia server
server.listen(PORT, () => {
  console.log(`🚀 Server attivo su porta ${PORT}`);
});