import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";

// ---------- SOCKET.IO HOME ----------
const socket = io("/home"); // namespace dedicato per la home
const onlineCounter = document.getElementById("online");

// Aggiornamento live del conteggio online
socket.on("onlineCount", count => {
  onlineCounter.textContent = `Online: ${count}`;
});

// ---------- NICKNAME ----------
const nicknameInput = document.getElementById("nickname");
const confirmBtn = document.getElementById("confirm-nick");
let nickConfirmed = false;

confirmBtn.addEventListener("click", () => {
  const nick = nicknameInput.value.trim();
  if (!nick) return;

  nickConfirmed = true;
  confirmBtn.disabled = true;
  nicknameInput.disabled = true;

  socket.emit("setNickname", nick);
});

// ---------- PERSONAGGI ----------
const chars = document.querySelectorAll(".char");
let selectedChar = null;

chars.forEach(c => {
  c.addEventListener("click", () => {
    if (!nickConfirmed) return;

    // Deseleziona tutti e seleziona il cliccato
    chars.forEach(el => el.classList.remove("selected"));
    c.classList.add("selected");
    selectedChar = c.dataset.char;

    // Abilita le modalità solo se nickname e character confermati
    document.getElementById("mode-1vs1").disabled = false;
    document.getElementById("mode-tournament").disabled = false;
  });
});

// ---------- MODALITA ----------
function startGame(mode) {
  if (!selectedChar || !nickConfirmed) return;

  const nick = nicknameInput.value.trim();
  localStorage.setItem("selectedNick", nick);
  localStorage.setItem("selectedChar", selectedChar);

  if (mode === "1vs1") window.location.href = "/1vs1.html";
  else if (mode === "tournament") window.location.href = "/tour.html";
}

document.getElementById("mode-1vs1").addEventListener("click", () => startGame("1vs1"));
document.getElementById("mode-tournament").addEventListener("click", () => startGame("tournament"));

// ---------- RULES POPUP ----------
const rulesPopup = document.getElementById("rules-popup");
document.getElementById("rules-btn").addEventListener("click", () => rulesPopup.classList.remove("hidden"));
document.getElementById("close-rules").addEventListener("click", () => rulesPopup.classList.add("hidden"));

// ---------- MUSICA ----------
const music = new Audio("img/8.mp3");
music.loop = true;
music.volume = 0.5;

// Partenza musica al primo click sul container
const container = document.getElementById("game-container");
container.addEventListener("click", () => {
  music.play().catch(() => {});
}, { once: true });

// ---------- FULLSCREEN ----------
const fullscreenBtn = document.getElementById("fullscreen-btn");
fullscreenBtn.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) {
      await container.requestFullscreen?.();
      container.style.height = "100vh";
      container.style.width = "100vw";
      if (screen.orientation?.lock) await screen.orientation.lock("landscape").catch(()=>{});
    } else {
      await document.exitFullscreen?.();
      container.style.height = "100%";
      container.style.width = "100%";
    }
  } catch (err) {
    console.log("Fullscreen error:", err);
  }
});

// ---------- MOBILE SCROLL FIX ----------
document.body.style.overflowY = "auto";