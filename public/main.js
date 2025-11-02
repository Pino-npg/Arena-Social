// main.js
import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";

document.addEventListener("DOMContentLoaded", () => {
  const socket = io();

  // ---- Helper ----
  const $ = id => document.getElementById(id);
  const ensure = id => {
    const el = $(id);
    if (!el) console.warn(`[WARN] missing element #${id}`);
    return el;
  };

  // ---- Messaggio visivo ----
  const container = ensure("game-container");
  function showMessage(text, color = "gold", duration = 2000) {
    const msg = document.createElement("div");
    msg.textContent = text;
    Object.assign(msg.style, {
      position: "fixed",
      bottom: "60px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(0,0,0,0.8)",
      color,
      padding: "10px 20px",
      borderRadius: "12px",
      fontFamily: "Cinzel, serif",
      fontSize: "1.2rem",
      zIndex: 99999,
      opacity: 0,
      transition: "opacity 0.3s",
    });
    document.body.appendChild(msg);
    requestAnimationFrame(() => (msg.style.opacity = 1));
    setTimeout(() => {
      msg.style.opacity = 0;
      setTimeout(() => msg.remove(), 400);
    }, duration);
  }

  // ---- ONLINE COUNTER ----
  const onlineCounter = ensure("online");
  socket.on("onlineCount", count => {
    if (onlineCounter) onlineCounter.textContent = `Online: ${count}`;
  });

  // ---- NICKNAME ----
  const nicknameInput = ensure("nickname");
  const confirmBtn = ensure("confirm-nick");
  let nickConfirmed = false;

  if (confirmBtn && nicknameInput) {
    confirmBtn.addEventListener("click", () => {
      const nick = nicknameInput.value.trim();
      if (!nick) {
        showMessage("⚠️ Inserisci un nickname prima!", "crimson");
        return;
      }
      nickConfirmed = true;
      confirmBtn.disabled = true;
      nicknameInput.disabled = true;
      socket.emit("setNickname", nick);
      showMessage(`✅ Nickname confermato: ${nick}`, "lightgreen");
    });
  }

  socket.on("nickConfirmed", finalNick => {
    try { localStorage.setItem("selectedNick", finalNick); } catch {}
    console.log("✅ Nick confermato dal server:", finalNick);
  });

  // ---- CHAR SELECT ----
  const chars = document.querySelectorAll(".char");
  let selectedChar = null;
  if (chars.length) {
    chars.forEach(c => {
      c.addEventListener("click", () => {
        const nickOk = nickConfirmed || !!localStorage.getItem("selectedNick");
        if (!nickOk) {
          showMessage("⚠️ Conferma prima il nickname!", "crimson");
          return;
        }
        chars.forEach(el => el.classList.remove("selected"));
        c.classList.add("selected");
        selectedChar = c.dataset.char;
        localStorage.setItem("selectedChar", selectedChar);
        showMessage(`⭐ Hai scelto ${selectedChar}!`, "gold");
        const m1 = ensure("mode-1vs1");
        const mt = ensure("mode-tournament");
        if (m1) m1.disabled = false;
        if (mt) mt.disabled = false;
      });
    });
  }

  // ---- MODES ----
  const btn1 = ensure("mode-1vs1");
  const btnt = ensure("mode-tournament");
  const requireChar = () => {
    const hasChar = selectedChar || localStorage.getItem("selectedChar");
    if (!hasChar) {
      showMessage("⚠️ Seleziona un personaggio prima!", "crimson");
      return false;
    }
    return true;
  };

  if (btn1) btn1.addEventListener("click", () => {
    if (!requireChar()) return;
    window.location.href = "/1vs1.html";
  });

  if (btnt) btnt.addEventListener("click", () => {
    if (!requireChar()) return;
    window.location.href = "/tour.html";
  });

  // ---- COLLECTION BUTTONS ----
  const openseaBtn = ensure("opensea-btn");
  const raribleBtn = ensure("rarible-btn");
  if (openseaBtn) openseaBtn.addEventListener("click", () => {
    showMessage("🌐 Opening OpenSea...");
    window.open("https://opensea.io/collection/pino-lrxnl-429031234", "_blank");
  });
  if (raribleBtn) raribleBtn.addEventListener("click", () => {
    showMessage("🌐 Opening Rarible...");
    window.open("https://og.rarible.com/collection/base/0x4a37b1116df669abe9dbf51afa0ffb6623a188f7/items", "_blank");
  });

  // ---- RULES POPUP ----
  const rulesBtn = ensure("rules-btn");
  const closeRules = ensure("close-rules");
  const rulesPopup = ensure("rules-popup");
  if (rulesBtn && rulesPopup)
    rulesBtn.addEventListener("click", () => rulesPopup.classList.remove("hidden"));
  if (closeRules && rulesPopup)
    closeRules.addEventListener("click", () => rulesPopup.classList.add("hidden"));

  // ---- FULLSCREEN ----
  const fullscreenBtn = ensure("fullscreen-btn");
  if (fullscreenBtn && container) {
    fullscreenBtn.addEventListener("click", async () => {
      try {
        if (!document.fullscreenElement) await container.requestFullscreen?.();
        else await document.exitFullscreen?.();
      } catch (e) {
        console.error("Fullscreen error", e);
      }
    });
  }

  // ---- MUSIC ----
  const music = new Audio("img/8.mp3");
  music.loop = true;
  music.volume = 0.5;
  if (container)
    container.addEventListener("click", () => music.play().catch(() => {}), { once: true });

  // ---- Check missing ----
  const idsToCheck = [
    "online","nickname","confirm-nick","mode-1vs1","mode-tournament",
    "opensea-btn","rarible-btn","rules-btn","close-rules","rules-popup","game-container"
  ];
  const missing = idsToCheck.filter(id => !$(id));
  if (missing.length)
    console.info("[INFO] missing elements (ok if unused on some pages):", missing);
});