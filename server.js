import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });
const PORT = process.env.PORT || 10000;

app.use(express.static("public"));
app.get("/1vs1.html", (req, res) => {
  res.sendFile(new URL("public/1vs1.html", import.meta.url).pathname);
});
app.get("/tour.html", (req, res) => {
  res.sendFile(new URL("public/tour.html", import.meta.url).pathname);
});

// ----------- 1VS1 ----------- //
const games1vs1 = {};
let waitingPlayer1vs1 = null;
const lastGames1vs1 = {};

function rollDice() { return Math.floor(Math.random() * 8) + 1; }

async function nextTurn1vs1(game, attackerIndex) {
  const defenderIndex = attackerIndex === 0 ? 1 : 0;
  const attacker = game.players[attackerIndex];
  const defender = game.players[defenderIndex];

  let damage = rollDice();
  if (attacker.stunned) { damage = Math.max(1, damage-1); attacker.stunned=false; }
  if (damage===8) defender.stunned=true;

  defender.hp = Math.max(0, defender.hp-damage);
  attacker.dice = damage; attacker.dmg = damage;
  defender.dice=0; defender.dmg=0;

  for(const p of game.players){
    const p1 = game.players.find(pl => pl.id===p.id);
    const p2 = game.players.find(pl => pl.id!==p.id);
    io.of("/1vs1").to(p.id).emit("1vs1Update",{player1:p1, player2:p2});
    io.of("/1vs1").to(p.id).emit("log",`${attacker.nick} rolls ${damage} and deals ${damage} damage!`);
  }

  if(defender.hp===0){
    for(const p of game.players){
      io.of("/1vs1").to(p.id).emit("gameOver",{winnerNick:attacker.nick,winnerChar:attacker.char});
      lastGames1vs1[p.id]=game;
    }
    delete games1vs1[game.id];
    return;
  }

  setTimeout(()=>nextTurn1vs1(game, defenderIndex),3000);
}

// 1vs1 namespace
const nsp1vs1 = io.of("/1vs1");
nsp1vs1.on("connection", socket=>{
  nsp1vs1.emit("onlineCount", nsp1vs1.sockets.size);

  socket.on("disconnect", ()=>{
    nsp1vs1.emit("onlineCount", nsp1vs1.sockets.size);
    if(waitingPlayer1vs1 && waitingPlayer1vs1.id===socket.id) waitingPlayer1vs1=null;

    for(const gameId in games1vs1){
      const game = games1vs1[gameId];
      const index = game.players.findIndex(p=>p.id===socket.id);
      if(index!==-1){
        const other = game.players.find(p=>p.id!==socket.id);
        nsp1vs1.to(other.id).emit("gameOver",{winnerNick:other.nick,winnerChar:other.char});
        lastGames1vs1[other.id]=game;
        delete games1vs1[gameId];
        break;
      }
    }
  });

  socket.on("join1vs1",({nick,char})=>{
    socket.nick=nick; socket.char=char;
    if(!waitingPlayer1vs1){ waitingPlayer1vs1=socket; socket.emit("waiting","Waiting for opponent..."); }
    else {
      const gameId=socket.id+"#"+waitingPlayer1vs1.id;
      const players=[
        {id:waitingPlayer1vs1.id, nick:waitingPlayer1vs1.nick, char:waitingPlayer1vs1.char, hp:80, stunned:false, dice:0, dmg:0},
        {id:socket.id, nick, char, hp:80, stunned:false, dice:0, dmg:0}
      ];
      games1vs1[gameId]={id:gameId, players};
      for(const p of players){
        const other = players.find(pl=>pl.id!==p.id);
        nsp1vs1.to(p.id).emit("gameStart",{player1:p, player2:other});
      }
      const first=Math.floor(Math.random()*2);
      setTimeout(()=>nextTurn1vs1(games1vs1[gameId],first),1000);
      waitingPlayer1vs1=null;
    }
  });

  socket.on("chatMessage", text=>{
    let game=Object.values(games1vs1).find(g=>g.players.some(p=>p.id===socket.id));
    if(!game) game=lastGames1vs1[socket.id];
    if(!game) return;
    for(const p of game.players) nsp1vs1.to(p.id).emit("chatMessage",{nick:socket.nick,text});
  });
});

// ----------- TOURNAMENT ----------- //
const tournament = {
  waiting: [], matches:{}, bracket:[], chat:[]
};

function nextTurnTournament(match, attackerIndex){
  const defenderIndex = attackerIndex===0?1:0;
  const attacker=match.players[attackerIndex];
  const defender=match.players[defenderIndex];

  let damage=rollDice();
  if(attacker.stunned){ damage=Math.max(1,damage-1); attacker.stunned=false; }
  if(damage===8) defender.stunned=true;

  defender.hp=Math.max(0,defender.hp-damage);
  attacker.dice=damage; attacker.dmg=damage;
  defender.dice=0; defender.dmg=0;

  for(const p of match.players){
    const p1=match.players.find(pl=>pl.id===p.id);
    const p2=match.players.find(pl=>pl.id!==p.id);
    io.of("/tournament").to(p.id).emit("updateMatch",{player1:p1,player2:p2});
    io.of("/tournament").to(p.id).emit("log",`${attacker.nick} rolls ${damage} and deals ${damage} damage!`);
  }

  if(defender.hp===0){
    const winner=attacker, loser=defender;
    io.of("/tournament").to(winner.id).emit("matchOver",{winner:winner.nick,stage:match.stage});
    io.of("/tournament").to(loser.id).emit("matchOver",{winner:winner.nick,stage:match.stage});
    tournament.bracket.push({winner:winner.nick, loser:loser.nick, stage:match.stage});
    delete tournament.matches[match.id];
    checkNextStageTournament();
    return;
  }

  setTimeout(()=>nextTurnTournament(match,defenderIndex),3000);
}

function startMatchTournament(player1,player2,stage){
  const matchId=player1.id+"#"+player2.id;
  const players=[
    {...player1,hp:80,stunned:false,dice:0,dmg:0},
    {...player2,hp:80,stunned:false,dice:0,dmg:0}
  ];
  tournament.matches[matchId]={id:matchId,players,stage};
  for(const p of players){
    const other=players.find(pl=>pl.id!==p.id);
    io.of("/tournament").to(p.id).emit("matchStart",{player1:p,player2:other,stage});
  }
  const first=Math.floor(Math.random()*2);
  setTimeout(()=>nextTurnTournament(tournament.matches[matchId],first),1000);
}

function checkNextStageTournament(){
  const stages=["quarti","semi","finale"];
  for(const stage of stages){
    const stageMatches=Object.values(tournament.matches).filter(m=>m.stage===stage);
    if(stageMatches.length===0 && stage!=="quarti"){
      const prevStage=stages[stages.indexOf(stage)-1];
      const winners=tournament.bracket.filter(b=>b.stage===prevStage).map(b=>b.winner);
      for(let i=0;i<winners.length;i+=2){
        const p1=tournament.waiting.find(p=>p.nick===winners[i]);
        const p2=tournament.waiting.find(p=>p.nick===winners[i+1]);
        if(p1 && p2) startMatchTournament(p1,p2,stage);
      }
    }
  }
}

// Tournament namespace
const nspTournament = io.of("/tournament");
nspTournament.on("connection",socket=>{
  nspTournament.emit("onlineCount", nspTournament.sockets.size);

  socket.on("joinTournament",({nick,char})=>{
    socket.nick=nick; socket.char=char;
    tournament.waiting.push({id:socket.id,nick,char});
    nspTournament.to(socket.id).emit("waiting","Waiting for tournament to fill 8 players...");
    if(tournament.waiting.length===8){
      for(let i=0;i<8;i+=2){
        startMatchTournament(tournament.waiting[i],tournament.waiting[i+1],"quarti");
      }
    }
  });

  socket.on("chatMessage",text=>{
    const msg={nick:socket.nick,text};
    tournament.chat.push(msg);
    for(const p of tournament.waiting) nspTournament.to(p.id).emit("chatMessage",msg);
    for(const match of Object.values(tournament.matches))
      for(const p of match.players) nspTournament.to(p.id).emit("chatMessage",msg);
  });

  socket.on("disconnect",()=>{
    nspTournament.emit("onlineCount", nspTournament.sockets.size);
    tournament.waiting=tournament.waiting.filter(p=>p.id!==socket.id);
    for(const matchId in tournament.matches){
      const match=tournament.matches[matchId];
      const index=match.players.findIndex(p=>p.id===socket.id);
      if(index!==-1){
        const other=match.players.find(p=>p.id!==socket.id);
        nspTournament.to(other.id).emit("matchOver",{winner:other.nick,stage:match.stage});
        delete tournament.matches[matchId];
      }
    }
  });
});

httpServer.listen(PORT,()=>console.log(`Server attivo su http://localhost:${PORT}`));