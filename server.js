import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (index.html, fight.html, img, style.css)
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(__dirname)); // per index.html e fight.html nella root

// HTTP server
const server = http.createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server });

// Stato dei giocatori in attesa
let waitingPlayers = [];

// Funzione per aggiornare contatore online
function broadcastOnline() {
  const msg = JSON.stringify({ type: "online", count: waitingPlayers.length });
  waitingPlayers.forEach(ws => {
    if(ws.readyState === 1) ws.send(msg);
  });
}

// Gestione connessione WebSocket
wss.on("connection", (ws) => {
  console.log("✅ Nuovo client connesso");

  // Aggiungi alla coda
  waitingPlayers.push(ws);
  broadcastOnline();

  // Invia messaggio ai client
  ws.on("message", (message) => {
    const msg = JSON.parse(message.toString());

    if(msg.type === "join"){
      // Se sono due giocatori pronti, assegna ruoli e avvia
      if(waitingPlayers.length >= 2){
        waitingPlayers[0].send(JSON.stringify({ type:"assign", index:0 }));
        waitingPlayers[1].send(JSON.stringify({ type:"assign", index:1 }));
        waitingPlayers.forEach(client => client.send(JSON.stringify({ type:"start" })));
      }
    } else if(msg.type === "update"){
      // inoltra aggiornamento a tutti gli altri
      waitingPlayers.forEach(client=>{
        if(client !== ws && client.readyState===1) client.send(JSON.stringify(msg));
      });
    }
  });

  ws.on("close", () => {
    console.log("❌ Client disconnesso");
    waitingPlayers = waitingPlayers.filter(p => p !== ws);
    broadcastOnline();
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server attivo su porta ${PORT}`);
});