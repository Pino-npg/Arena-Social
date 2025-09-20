const nicknameInput = document.getElementById("nicknameInput");
const nicknameBtn = document.getElementById("nicknameBtn");

nicknameBtn.addEventListener("click", () => {
  const nick = nicknameInput.value.trim();
  if (!nick) {
    alert("Inserisci un nickname!");
    return;
  }

  // Salvo nel localStorage
  localStorage.setItem("nickname", nick);

  // Invio nickname subito al server se connesso
  if (window.ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "setNickname", nickname: nick }));
  }

  // Vai alla pagina di selezione
  window.location.href = "select.html";
});