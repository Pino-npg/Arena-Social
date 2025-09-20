document.addEventListener("DOMContentLoaded", () => {
  const nicknameDisplay = document.getElementById("nicknameDisplay");
  const champs = document.querySelectorAll(".characters-selection img");
  const modeBtns = document.querySelectorAll(".mode-buttons button");

  // Mostra nickname salvato
  const nickname = localStorage.getItem("nickname") || "Player";
  nicknameDisplay.textContent = `Nickname: ${nickname}`;

  let selectedChampion = null;

  // Disabilita pulsanti finché non scelgo un campione
  modeBtns.forEach(btn => btn.disabled = true);

  // Clic su campione
  champs.forEach(champ => {
    champ.addEventListener("click", () => {
      champs.forEach(c => c.classList.remove("selected"));
      champ.classList.add("selected");
      selectedChampion = champ.dataset.name;

      // Abilita i pulsanti modalità
      modeBtns.forEach(btn => btn.disabled = false);
    });
  });

  // Clic sui pulsanti modalità
  modeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      if (!selectedChampion) return;

      // Salva scelta campione e modalità
      localStorage.setItem("champion", selectedChampion);
      localStorage.setItem("mode", btn.dataset.mode);

      // Redirect alla pagina corretta
      if (btn.dataset.mode === "1v1") window.location.href = "fight.html";
      else if (btn.dataset.mode === "t4") window.location.href = "tournament4.html";
      else if (btn.dataset.mode === "t8") window.location.href = "tournament8.html";
    });
  });
});