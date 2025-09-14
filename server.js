import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(__dirname));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let players = [];

wss.on("connection", (ws) => {
  console.log("✅ Nuovo client connesso");
  players.push(ws);
  broadcastOnline();

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      // Inoltra a tutti i client
      wss.clients.forEach(c => {
        if (c.readyState === 1) c.send(JSON.stringify(data));
      });
    } catch(e){ console.error(e); }
  });

  ws.on("close", () => {
    console.log("❌ Client disconnesso");
    players = players.filter(p => p !== ws);
    broadcastOnline();
  });
});

function broadcastOnline(){
  const msg = JSON.stringify({ type:"online", count: players.length });
  players.forEach(ws=>{
    if(ws.readyState===1) ws.send(msg);
  });
}

server.listen(PORT, () => console.log(`🚀 Server attivo su porta ${PORT}`));