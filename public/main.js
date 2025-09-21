import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";

// ---------- SOCKET.IO ----------
const socket = io(); // stesso server principale
const onlineCounter = document.getElementById("online");
socket.on("onlineCount", (count) => {
  onlineCounter.textContent = `Online: ${count}`;
});

// ---------- NICKNAME ----------
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
    socket.emit("setNickname", nick);
  }
};

// ---------- PERSONAGGI ----------
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

// ---------- MODALITA ----------
document.getElementById("mode-1vs1").onclick = () => {
  if (!selectedChar || !nickConfirmed) return;

  localStorage.setItem("selectedNick", nicknameInput.value.trim());
  localStorage.setItem("selectedChar", selectedChar);

  // Vai alla pagina 1vs1
  window.location.href = "1vs1.html";
};

document.getElementById("mode-tournament").onclick = () => {
  if (!selectedChar) return;
  socket.emit("startGame", { mode: "tournament", character: selectedChar });
};

// ---------- RULES POPUP ----------
document.getElementById("rules-btn").onclick = () => {
  document.getElementById("rules-popup").classList.remove("hidden");
};
document.getElementById("close-rules").onclick = () => {
  document.getElementById("rules-popup").classList.add("hidden");
};

// ---------- MUSICA ----------
const music = new Audio("img/8.mp3");
music.loop = true;
music.volume = 0.5;
window.addEventListener("click", () => { if (music.paused) music.play(); }, { once: true });

// ---------- FULLSCREEN ----------
const fullscreenBtn = document.getElementById("fullscreen-btn");
const container = document.getElementById("game-container");

fullscreenBtn.addEventListener("click", async () => {
  if (!document.fullscreenElement) {
    try {
      if (container.requestFullscreen) await container.requestFullscreen();
      else if (container.webkitRequestFullscreen) await container.webkitRequestFullscreen();
      if (screen.orientation?.lock) await screen.orientation.lock("landscape").catch(()=>{});
    } catch (err) { console.log("Fullscreen error:", err); }
  } else { if (document.exitFullscreen) await document.exitFullscreen(); }
});