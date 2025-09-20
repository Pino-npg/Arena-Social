// --- WebSocket ---
wss.on("connection", (ws) => {
  const clientId = randomUUID();
  clients.set(clientId, { ws, nickname: "Anon", roomId: null, champion: "Beast" });

  // Invio benvenuto e stanze
  send(ws, { type: "welcome", clientId });
  send(ws, { type: "rooms", rooms: Array.from(rooms.values()).map(r => ({
    id: r.id, type: r.type, playersCount: r.players.length, status: r.status, target: r.target
  })) });
  broadcastOnline();

  ws.on("message", (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch (e) { send(ws, { type: "error", message: "invalid json" }); return; }

    const clientEntry = clientByWs(ws);
    if (!clientEntry) return;
    const { id: clientId } = clientEntry;
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
          if (c.ws?.readyState === 1) send(c.ws, { type: "chat", sender: data.sender, text: data.text });
        }
        break;

      case "ping":
        send(ws, { type: "pong" });
        break;
    }
  });

  ws.on("close", () => {
    const clientEntry = clientByWs(ws);
    if (!clientEntry) return;
    const clientId = clientEntry.id;
    // Non cancelliamo subito, manteniamo lo stato fight per riconnessione
    client.ws = null; // indica che è offline
    broadcastOnline();
    broadcastRooms();
  });
});