// Pagina 1 - Inserimento Nickname
const nicknameInput = document.getElementById("nicknameInput");
const nicknameBtn = document.getElementById("nicknameBtn");

nicknameBtn.addEventListener("click", () => {
  const nick = nicknameInput.value.trim();
  if (!nick) {
    alert("Inserisci un nickname!");
    return;
  }
  // Salvo nel localStorage per passarlo alle altre pagine
  localStorage.setItem("nickname", nick);
  // Vai alla pagina di selezione
  window.location.href = "select.html";
});