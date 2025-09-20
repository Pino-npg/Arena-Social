document.addEventListener("DOMContentLoaded", () => {
  // === RULES OVERLAY ===
  const rulesBtn = document.getElementById("rules");
  const rulesOverlay = document.getElementById("rulesOverlay");
  const closeRules = document.getElementById("closeRules");

  rulesBtn.addEventListener("click", () => {
    rulesOverlay.classList.remove("hidden");
  });

  if (closeRules) {
    closeRules.addEventListener("click", () => {
      rulesOverlay.classList.add("hidden");
    });
  }

  rulesOverlay.addEventListener("click", (e) => {
    if (e.target === rulesOverlay) {
      rulesOverlay.classList.add("hidden");
    }
  });

  // === NICKNAME ===
  const nicknameInput = document.getElementById("nicknameInput");
  const nicknameBtn = document.getElementById("nicknameBtn");
  const champs = document.querySelectorAll(".champ");
  const btn1v1 = document.getElementById("btn1v1");
  const btnTournament = document.getElementById("btnTournament");

  let selectedChampion = null;

  nicknameBtn.addEventListener("click", () => {
    const nick = nicknameInput.value.trim();
    if (!nick) {
      alert("Insert nickname!");
      return;
    }
    localStorage.setItem("nickname", nick);
    alert(`Nickname saved: ${nick}`);
  });

  // === SCELTA CAMPIONE ===
  champs.forEach((champ) => {
    champ.addEventListener("click", () => {
      champs.forEach((c) => c.classList.remove("selected"));
      champ.classList.add("selected");
      selectedChampion = champ.dataset.name;
      localStorage.setItem("champion", selectedChampion);
    });
  });

  // === BOTTONI MODALITÀ ===
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