import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

// --- Configurazione server ---
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// Porta del server
const PORT = process.env.PORT || 10000;

// --- Cartella pubblica ---
app.use(express.static("public"));

// --- Rotta principale ---
app.get("/", (req, res) => {
  res.sendFile(new URL("public/index.html", import.meta.url).pathname);
});

// --- Socket.IO: contatore online ---
let onlineCount = 0;

io.on("connection", (socket) => {
  onlineCount++;
  io.emit("onlineCount", onlineCount);

  socket.on("disconnect", () => {
    onlineCount--;
    io.emit("onlineCount", onlineCount);
  });
});

// --- Avvio server ---
httpServer.listen(PORT, () => {
  console.log(`Server avviato su http://localhost:${PORT}`);
});