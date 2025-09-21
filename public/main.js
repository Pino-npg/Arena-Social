// -------------------- SOCKET.IO --------------------
import { io } from "socket.io-client";
const socket = io();
const onlineSpan = document.getElementById("onlineCounter");

socket.on("updateOnline", (count) => {
  onlineSpan.textContent = count;
});

// -------------------- NICKNAME --------------------
const nicknameInput = document.getElementById("nickname");
const confirmBtn = document.getElementById("confirm-nick");
let nickConfirmed = false;

confirmBtn.onclick = () => {
  const nick = nicknameInput.value.trim();
  if (nick !== "") {
    nickConfirmed = true;
    confirmBtn.disabled = true;
    nicknameInput.disabled = true;
    alert(`Nickname confirmed: ${nick}`);
    // puoi inviare al server il nick
    socket.emit("setNickname", nick);
  }
};

// -------------------- PERSONAGGI --------------------
const chars = document.querySelectorAll(".char");
let selectedChar = null;

chars.forEach(c => {
  c.onclick = () => {
    if (!nickConfirmed) return;
    chars.forEach(el => el.classList.remove("selected"));
    c.classList.add("selected");
    selectedChar = c.dataset.char;
    document.getElementById("mode-1vs1").disabled = false;
    document.getElementById("mode-tournament").disabled = false;
  };
});

// -------------------- MODALITA --------------------
document.getElementById("mode-1vs1").onclick = () => {
  if (!selectedChar) return;
  socket.emit("startGame", { mode: "1vs1", character: selectedChar });
  alert("1vs1 selected!");
};

document.getElementById("mode-tournament").onclick = () => {
  if (!selectedChar) return;
  socket.emit("startGame", { mode: "tournament", character: selectedChar });
  alert("Tournament selected!");
};

// -------------------- RULES POPUP --------------------
document.getElementById("rules-btn").onclick = () => {
  document.getElementById("rules-popup").classList.remove("hidden");
};
document.getElementById("close-rules").onclick = () => {
  document.getElementById("rules-popup").classList.add("hidden");
};

// -------------------- MUSICA AUTOPLAY --------------------
const music = new Audio("img/8.mp3");
music.loop = true;
music.volume = 0.5;

const playMusic = async () => {
  try { await music.play(); } 
  catch(e) { console.log("Autoplay music blocked"); }
};
window.addEventListener("load", playMusic);

document.getElementById("music-toggle").onclick = () => {
  if (music.paused) music.play();
  else music.pause();
};

// -------------------- FULLSCREEN MOBILE/PC --------------------
const fullscreenBtn = document.getElementById("fullscreen-btn");
const container = document.getElementById("game-container");

fullscreenBtn.addEventListener("click", async () => {
  if (!document.fullscreenElement) {
    try {
      // Safari/Chrome mobile
      if (container.requestFullscreen) await container.requestFullscreen();
      else if (container.webkitRequestFullscreen) await container.webkitRequestFullscreen();
      else if (container.msRequestFullscreen) await container.msRequestFullscreen();

      // Blocca orientamento su landscape se supportato
      if (screen.orientation && screen.orientation.lock) {
        try { await screen.orientation.lock("landscape"); } 
        catch(e) { console.log("Orientation lock not supported"); }
      }

    } catch (err) {
      alert("Fullscreen non supportato su questo dispositivo.");
    }
  } else {
    if (document.exitFullscreen) await document.exitFullscreen();
    else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } 
    catch(e) {}
  }
});