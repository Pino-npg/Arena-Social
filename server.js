// --- WebSocket ---
wss.on("connection", (ws) => {
  // Genera nuovo clientId solo se non esiste
  let clientId = randomUUID();
  clients.set(clientId, { ws, nickname: "Anon", roomId: null, champion: "Beast" });

  // Invia benvenuto e stanze disponibili
  send(ws, { type: "welcome", clientId });
  send(ws, {
    type: "rooms",
    rooms: Array.from(rooms.values()).map(r => ({
      id: r.id,
      type: r.type,
      playersCount: r.players.length,
      status: r.status,
      target: r.target
    }))
  });
  broadcastOnline();

  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      send(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    const clientEntry = clientByWs(ws);
    if (!clientEntry) return;
    clientId = clientEntry.id;
    const client = clients.get(clientId);

    switch (data.type) {
      case "setNickname":
        client.nickname = String(data.nickname || "").slice(0, 32);
        broadcastRooms();
        break;

      case "setChampion":
        client.champion = String(data.champion || "Beast");
        break;

      case "joinRoom":
        joinRoom(clientId, data.roomId);
        break;

      case "leaveRoom":
        leaveRoom(clientId);
        break;

      case "rejoinRoom":
        if (client.roomId) {
          const room = rooms.get(client.roomId);
          if (room?.fightState) {
            // Invio stato fight al client riconnesso
            const myState = room.fightState.players.find(p => p.id === clientId);
            const enemy = room.fightState.players.find(p => p.id !== clientId);
            send(ws, {
              type: "init",
              players: room.fightState.players,
              myState,
              enemy
            });
          }
        }
        break;

      case "chat":
        for (const c of clients.values()) {
          if (c.ws?.readyState === 1) {
            send(c.ws, { type: "chat", sender: data.sender, text: data.text });
          }
        }
        break;

      case "ping":
        send(ws, { type: "pong" });
        break;

      default:
        send(ws, { type: "error", message: "Unknown message type" });
    }
  });

  ws.on("close", () => {
    const clientEntry = clientByWs(ws);
    if (!clientEntry) return;
    const clientId = clientEntry.id;

    // Manteniamo lo stato fight per riconnessione futura
    const client = clients.get(clientId);
    if (client) client.ws = null; // offline

    broadcastOnline();
    broadcastRooms();
  });

  ws.on("error", (err) => {
    console.error("WebSocket error for client", clientId, err);
  });
});