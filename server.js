// server.js
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const PORT = 10000;

// Serve file statici dalla cartella "public"
app.use(express.static("public"));

// Lista utenti online
let onlineUsers = 0;

io.on("connection", (socket) => {
  onlineUsers++;
  io.emit("updateOnline", onlineUsers);

  console.log(`Nuovo utente connesso. Online: ${onlineUsers}`);

  // Riceve nickname
  socket.on("setNickname", (nick) => {
    console.log(`Nickname settato: ${nick}`);
    socket.data.nickname = nick;
  });

  // Riceve scelta personaggio e modalità
  socket.on("startGame", ({ mode, character }) => {
    console.log(`Gioco avviato! Mode: ${mode}, Character: ${character}, Nick: ${socket.data.nickname}`);
    // Qui puoi decidere di inviare al server2 o lanciare logica 1vs1/tournament
  });

  socket.on("disconnect", () => {
    onlineUsers--;
    io.emit("updateOnline", onlineUsers);
    console.log(`Utente disconnesso. Online: ${onlineUsers}`);
  });
});

// Avvia server sulla porta 10000
httpServer.listen(PORT, () => {
  console.log(`Server in ascolto sulla porta ${PORT}`);
});