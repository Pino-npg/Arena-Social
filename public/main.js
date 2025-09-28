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

confirmBtn.addEventListener("click", () => {
  const nick = nicknameInput.value.trim();
  if (!nick) return;

  nickConfirmed = true;
  confirmBtn.disabled = true;
  nicknameInput.disabled = true;

  socket.emit("setNickname", nick);
  // niente alert così non interrompe fullscreen
});
socket.on("nickConfirmed", finalNick => {
  localStorage.setItem("selectedNick", finalNick);
  console.log("✅ Nick confermato dal server:", finalNick);
});

// ---------- PERSONAGGI ----------
const chars = document.querySelectorAll(".char");
let selectedChar = null;

chars.forEach(c => {
  c.addEventListener("click", () => {
    if (!nickConfirmed) return;
    chars.forEach(el => el.classList.remove("selected"));
    c.classList.add("selected");
    selectedChar = c.dataset.char;

    document.getElementById("mode-1vs1").disabled = false;
    document.getElementById("mode-tournament").disabled = false;
  });
});

// ---------- MODALITA ----------
document.getElementById("mode-1vs1").addEventListener("click", () => {
  if (!selectedChar || !nickConfirmed) return;

  // usa il nick confermato dal server
  // localStorage.setItem("selectedNick", nicknameInput.value.trim());
  localStorage.setItem("selectedChar", selectedChar);

  window.location.href = "/1vs1.html";
});

document.getElementById("mode-tournament").addEventListener("click", () => {
  if (!selectedChar || !nickConfirmed) return;

  // salva dati per tour.js
  // localStorage.setItem("selectedNick", nicknameInput.value.trim());
  localStorage.setItem("selectedChar", selectedChar);

  // apri la pagina torneo
  window.location.href = "/tour.html";
});

// ---------- RULES POPUP ----------
document.getElementById("rules-btn").addEventListener("click", () => {
  document.getElementById("rules-popup").classList.remove("hidden");
});
document.getElementById("close-rules").addEventListener("click", () => {
  document.getElementById("rules-popup").classList.add("hidden");
});

// ---------- MUSICA ----------
const music = new Audio("img/8.mp3");
music.loop = true;
music.volume = 0.5;

// partenza musica al primo click sul container
const container = document.getElementById("game-container");
container.addEventListener("click", () => {
  music.play().catch(() => {});
}, { once: true });

// ---------- FULLSCREEN ----------
const fullscreenBtn = document.getElementById("fullscreen-btn");

fullscreenBtn.addEventListener("click", async () => {
  if (!document.fullscreenElement) {
    try {
      await container.requestFullscreen?.();
      container.style.height = "100vh";
      container.style.width = "100vw";
      if (screen.orientation?.lock) await screen.orientation.lock("landscape").catch(()=>{});
    } catch (err) {
      console.log("Fullscreen error:", err);
    }
  } else {
    await document.exitFullscreen?.();
    container.style.height = "100%";
    container.style.width = "100%";
  }
});