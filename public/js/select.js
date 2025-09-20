document.addEventListener("DOMContentLoaded", () => {
  const nicknameDisplay = document.getElementById("nicknameDisplay");
  const champs = document.querySelectorAll(".characters-selection img");
  const modeBtns = document.querySelectorAll(".mode-buttons button");

  const nickname = localStorage.getItem("nickname") || "Player";
  nicknameDisplay.textContent = `Nickname: ${nickname}`;

  let selectedChampion = null;
  modeBtns.forEach(btn => btn.disabled = true);

  champs.forEach(champ => {
    champ.addEventListener("click", () => {
      champs.forEach(c => c.classList.remove("selected"));
      champ.classList.add("selected");
      selectedChampion = champ.dataset.name;
      modeBtns.forEach(btn => btn.disabled = false);
    });
  });

  modeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      if (!selectedChampion) return;
      localStorage.setItem("champion", selectedChampion);
      localStorage.setItem("mode", btn.dataset.mode);
      window.location.href = "fight.html";
    });
  });
});