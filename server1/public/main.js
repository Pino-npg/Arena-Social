import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";

const socket = io();

// PLAYER ELEMENTS
const p1Nick = document.getElementById("p1-nick");
const p2Nick = document.getElementById("p2-nick");
const p1Hp = document.getElementById("p1-hp");
const p2Hp = document.getElementById("p2-hp");
const p1Img = document.getElementById("p1-img");
const p2Img = document.getElementById("p2-img");
const logP1 = document.getElementById("log-player1");
const logP2 = document.getElementById("log-player2");

// MUSICA BATTAGLIA
const music = new Audio("img/9.mp3");
music.loop = true;
music.volume = 0.5;
window.addEventListener("click", () => { if (music.paused) music.play(); }, { once:true });

// FULLSCREEN MOBILE/PC
const container = document.getElementById("game-container");
window.enterFullscreen = async () => {
  if (!document.fullscreenElement) {
    if (container.requestFullscreen) await container.requestFullscreen();
    else if (container.webkitRequestFullscreen) await container.webkitRequestFullscreen();
    if (screen.orientation?.lock) await screen.orientation.lock("landscape").catch(()=>{});
  } else {
    if (document.exitFullscreen) await document.exitFullscreen();
  }
};

// EVENTI SOCKET.IO
socket.on("1vs1Start", (data) => {
  p1Nick.textContent = data.player1.nick;
  p2Nick.textContent = data.player2.nick;
  p1Img.src = `img/${data.player1.char}100.png`;
  p2Img.src = `img/${data.player2.char}100.png`;
  p1Hp.style.width = "100%";
  p2Hp.style.width = "100%";
  logP1.innerHTML = "";
  logP2.innerHTML = "";
});

socket.on("1vs1Update", (data) => {
  p1Hp.style.width = `${data.player1.hp}%`;
  p2Hp.style.width = `${data.player2.hp}%`;
  p1Img.src = `img/${data.player1.char}${data.player1.hp}.png`;
  p2Img.src = `img/${data.player2.char}${data.player2.hp}.png`;
  if (data.logP1) logP1.innerHTML += data.logP1 + "<br>";
  if (data.logP2) logP2.innerHTML += data.logP2 + "<br>";
  logP1.scrollTop = logP1.scrollHeight;
  logP2.scrollTop = logP2.scrollHeight;
});

socket.on("1vs1End", (winnerData) => {
  music.pause();
  const winMusic = new Audio(`img/${winnerData.char}.mp3`);
  winMusic.play();
  alert(`${winnerData.nick} Wins!`);
});