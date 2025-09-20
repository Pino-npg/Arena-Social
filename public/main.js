document.addEventListener("DOMContentLoaded", () => {
  const nicknameInput = document.getElementById("nicknameInput");
  const nicknameBtn = document.getElementById("nicknameBtn");

  nicknameBtn.addEventListener("click", () => {
    const nick = nicknameInput.value.trim();
    if (!nick) { alert("Inserisci un nickname!"); return; }
    localStorage.setItem("nickname", nick);
    window.location.href = "select.html";
  });

  nicknameInput.addEventListener("keypress", e => {
    if(e.key==="Enter") nicknameBtn.click();
  });
});