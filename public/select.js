// Pagina 2 - Scelta campione + modalità
const champs = document.querySelectorAll(".champ");
const modeBtns = document.querySelectorAll(".mode-buttons button");

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

// Scelta modalità
modeBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    if (!selectedChampion) return;
    // Salvo scelta nel localStorage
    localStorage.setItem("champion", selectedChampion);
    localStorage.setItem("mode", btn.dataset.mode);

    // Vai alla pagina giusta
    if (btn.dataset.mode === "1v1") {
      window.location.href = "fight.html";
    } else if (btn.dataset.mode === "t4") {
      window.location.href = "tournament4.html";
    } else if (btn.dataset.mode === "t8") {
      window.location.href = "tournament8.html";
    }
  });
});
