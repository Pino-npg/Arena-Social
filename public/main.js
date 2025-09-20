document.addEventListener("DOMContentLoaded", () => {
  const nicknameInput = document.getElementById("nicknameInput");
  const nicknameBtn = document.getElementById("nicknameBtn");
  const champs = document.querySelectorAll(".champ");
  const btn1v1 = document.getElementById("btn1v1");
  const btnTournament = document.getElementById("btnTournament");

  let selectedChampion = null;

  // Salva nickname
  nicknameBtn.addEventListener("click", () => {
    const nick = nicknameInput.value.trim();
    if (!nick) {
      alert("Insert nickname!");
      return;
    }
    localStorage.setItem("nickname", nick);
    alert(`Nickname saved: ${nick}`);
  });

  // Selezione campione
  champs.forEach(champ => {
    champ.addEventListener("click", () => {
      champs.forEach(c => c.classList.remove("selected"));
      champ.classList.add("selected");
      selectedChampion = champ.dataset.name;
      localStorage.setItem("champion", selectedChampion);
    });
  });

  // Bottoni modalità
  btn1v1.addEventListener("click", () => {
    if (!selectedChampion) return alert("Select a champion!");
    alert("Qui si andrà alla modalità 1vs1");
  });

  btnTournament.addEventListener("click", () => {
    alert("Qui si andrà al repo 2 (torneo)");
  });
});