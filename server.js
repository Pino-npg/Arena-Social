import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(__dirname));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let waitingPlayers = []; // client in attesa

function broadcastOnline() {
  const msg = JSON.stringify({ type: "online", count: wss.clients.size });
  wss.clients.forEach((c) => {
    if (c.readyState === 1) c.send(msg);
  });
}

wss.on("connection", (ws) => {
  console.log("✅ Nuovo client connesso");
  broadcastOnline();

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.type === "join") {
      ws.playerMode = data.mode;
      waitingPlayers.push(ws);
      broadcastOnline();

      if (waitingPlayers.length >= 2) {
        const p1 = waitingPlayers[0];
        const p2 = waitingPlayers[1];

        const startMsg = JSON.stringify({
          type: "startBattle",
          players: [
            { id: 1, mode: p1.playerMode },
            { id: 2, mode: p2.playerMode },
          ],
        });

        p1.send(startMsg);
        p2.send(startMsg);

        // rimuovi dalla coda
        waitingPlayers = waitingPlayers.slice(2);
      }
    }

    // inoltra altri messaggi a tutti (azioni in battaglia)
    if (data.type === "battleAction") {
      wss.clients.forEach((c) => {
        if (c !== ws && c.readyState === 1) c.send(msg);
      });
    }
  });

  ws.on("close", () => {
    console.log("❌ Client disconnesso");
    waitingPlayers = waitingPlayers.filter((p) => p !== ws);
    broadcastOnline();
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server attivo su porta ${PORT}`);
});