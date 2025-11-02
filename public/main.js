// main.js (sostituisci il contenuto con questo)
import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";

document.addEventListener("DOMContentLoaded", () => {
  // socket
  const socket = io();

  // helper per safe-get e log
  function $(id){ return document.getElementById(id); }
  function ensure(id){
    const el = $(id);
    if(!el) console.warn(`[WARN] missing element #${id} — event listener NOT attached`);
    return el;
  }

  // ---------- ONLINE ----------
  const onlineCounter = ensure("online");
  socket.on("onlineCount", (count) => {
    if (onlineCounter) onlineCounter.textContent = `Online: ${count}`;
  });

  // ---------- NICKNAME ----------
  const nicknameInput = ensure("nickname");
  const confirmBtn = ensure("confirm-nick");
  let nickConfirmed = false;

  if (confirmBtn && nicknameInput) {
    confirmBtn.addEventListener("click", () => {
      const nick = nicknameInput.value.trim();
      if (!nick) return;
      nickConfirmed = true;
      confirmBtn.disabled = true;
      nicknameInput.disabled = true;
      socket.emit("setNickname", nick);
    });
  }

  socket.on("nickConfirmed", finalNick => {
    try { localStorage.setItem("selectedNick", finalNick); } catch(e){}
    console.log("✅ Nick confermato dal server:", finalNick);
  });

  // ---------- REDDIT (popup) ----------
  const redditConnect = ensure("reddit-connect");
  if (redditConnect) {
    redditConnect.addEventListener("click", () => {
      const w = window.open("/reddit/login", "reddit_auth", "width=600,height=700");
      window.addEventListener("message", function onMsg(e) {
        if (e.data?.reddit) {
          const redditUser = e.data.user;
          console.log("Reddit user:", redditUser);
          alert(`Logged in as ${redditUser || "?"}`);
          window.removeEventListener("message", onMsg);
        }
      });
    });
  }

  // ---------- CHAR SELECT ----------
  const chars = document.querySelectorAll(".char");
  let selectedChar = null;
  if (chars && chars.length) {
    chars.forEach(c => {
      c.addEventListener("click", () => {
        const nickOk = nickConfirmed || !!localStorage.getItem("selectedNick");
        if (!nickOk) {
          alert("⚠️ No nickname selected!");
          return;
        }
        chars.forEach(el => el.classList.remove("selected"));
        c.classList.add("selected");
        selectedChar = c.dataset.char;
        localStorage.setItem("selectedChar", selectedChar);
        const m1 = ensure("mode-1vs1");
        const mt = ensure("mode-tournament");
        if (m1) m1.disabled = false;
        if (mt) mt.disabled = false;
      });
    });
  } else console.warn("[WARN] no .char elements found");
  // ---------- MODES ----------
  const btn1 = ensure("mode-1vs1");
  const btnt = ensure("mode-tournament");
  if (btn1) btn1.addEventListener("click", () => {
    if (!selectedChar && !localStorage.getItem("selectedChar")) return;
    localStorage.setItem("selectedChar", selectedChar || localStorage.getItem("selectedChar"));
    window.location.href = "/1vs1.html";
  });
  if (btnt) btnt.addEventListener("click", () => {
    if (!selectedChar && !localStorage.getItem("selectedChar")) return;
    localStorage.setItem("selectedChar", selectedChar || localStorage.getItem("selectedChar"));
    window.location.href = "/tour.html";
  });

  // ---------- COLLECTION BUTTONS ----------
  const openseaBtn = ensure("opensea-btn");
  const raribleBtn = ensure("rarible-btn");
  if (openseaBtn) openseaBtn.addEventListener("click", () => window.open("https://opensea.io/collection/pino-lrxnl-429031234", "_blank"));
  if (raribleBtn) raribleBtn.addEventListener("click", () => window.open("https://og.rarible.com/collection/base/0x4a37b1116df669abe9dbf51afa0ffb6623a188f7/items", "_blank"));

  // ---------- RULES POPUP ----------
  const rulesBtn = ensure("rules-btn");
  const closeRules = ensure("close-rules");
  const rulesPopup = ensure("rules-popup");
  if (rulesBtn && rulesPopup) rulesBtn.addEventListener("click", () => rulesPopup.classList.remove("hidden"));
  if (closeRules && rulesPopup) closeRules.addEventListener("click", () => rulesPopup.classList.add("hidden"));

  // ---------- FULLSCREEN ----------
  const fullscreenBtn = ensure("fullscreen-btn");
  const container = ensure("game-container");
  if (fullscreenBtn && container) {
    fullscreenBtn.addEventListener("click", async () => {
      try {
        if (!document.fullscreenElement) await container.requestFullscreen?.();
        else await document.exitFullscreen?.();
      } catch(e){ console.error("Fullscreen error", e); }
    });
  }

  // ---------- MUSIC (start on user gesture) ----------
  const music = new Audio("img/8.mp3");
  music.loop = true;
  music.volume = 0.5;
  if (container) container.addEventListener("click", () => music.play().catch(()=>{}), { once: true });

  // debug helper: list missing elements in console
  const idsToCheck = ["online","nickname","confirm-nick","reddit-connect","mode-1vs1","mode-tournament","opensea-btn","rarible-btn","rules-btn","close-rules","rules-popup","game-container"];
  const missing = idsToCheck.filter(id => !$(id));
  if (missing.length) console.info("[INFO] missing elements (ok if unused on some pages):", missing);
});