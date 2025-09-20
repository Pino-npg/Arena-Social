// main.js
document.addEventListener("DOMContentLoaded", () => {
  const nicknameInput = document.getElementById("nicknameInput");
  const nicknameBtn = document.getElementById("nicknameBtn");

  nicknameBtn.addEventListener("click", () => {
    const nick = nicknameInput.value.trim();
    if (!nick) {
      alert("Inserisci un nickname!");
      return;
    }
    // Salva nickname nel localStorage
    localStorage.setItem("nickname", nick);

    // Redirect a select.html
    window.location.href = "select.html";
  });

  // Premendo Invio sull'input
  nicknameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") nicknameBtn.click();
  });
});