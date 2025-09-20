document.addEventListener("DOMContentLoaded", () => {
  // === RULES OVERLAY ===
  const rulesBtn = document.getElementById("rules");
  const rulesOverlay = document.getElementById("rulesOverlay");

  rulesBtn.addEventListener("click", () => {
    rulesOverlay.classList.remove("hidden");
  });

  // chiudi cliccando fuori dal box
  rulesOverlay.addEventListener("click", (e) => {
    if (e.target === rulesOverlay) {
      rulesOverlay.classList.add("hidden");
    }
  });

  // === MUSICA DI SOTTOFONDO ===
  const bgMusic = document.createElement("audio");
  bgMusic.src = "img/1.mp3";
  bgMusic.loop = true;
  bgMusic.volume = 0.5;

  // autoplay con unlock su mobile
  bgMusic.play().catch(() => {
    document.body.addEventListener("click", () => {
      bgMusic.play();
    }, { once: true });
  });

  document.body.appendChild(bgMusic);

  // pulsante mute/unmute
const muteBtn = document.getElementById("muteBtn");
muteBtn.addEventListener("click", () => {
  if (bgMusic.paused) {
    bgMusic.play();
    muteBtn.textContent = "🔊";
  } else {
    bgMusic.pause();
    muteBtn.textContent = "🔇";
  }
});

  // === NICKNAME E SCELTA CAMPIONE ===
  const nicknameInput = document.getElementById("nicknameInput");
  const nicknameBtn = document.getElementById("nicknameBtn");
  const champs = document.querySelectorAll(".champ");
  const btn1v1 = document.getElementById("btn1v1");
  const btnTournament = document.getElementById("btnTournament");

  let selectedChampion = null;

  nicknameBtn.addEventListener("click", () => {
    const nick = nicknameInput.value.trim();
    if (!nick) return alert("Insert nickname!");
    localStorage.setItem("nickname", nick);
    alert(`Nickname saved: ${nick}`);
  });

  champs.forEach((champ) => {
    champ.addEventListener("click", () => {
      champs.forEach((c) => c.classList.remove("selected"));
      champ.classList.add("selected");
      selectedChampion = champ.dataset.name;
      localStorage.setItem("champion", selectedChampion);
    });
  });

  btn1v1.addEventListener("click", () => {
    const nick = localStorage.getItem("nickname");
    const champ = localStorage.getItem("champion");
    if (!nick) return alert("Insert a nickname!");
    if (!champ) return alert("Select a champion!");
    window.location.href = "fight.html"; // vai alla pagina fight
  });

  btnTournament.addEventListener("click", () => {
    alert("Qui si andrà al repo 2 (torneo)");
  });
});