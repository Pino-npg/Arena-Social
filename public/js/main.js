document.addEventListener("DOMContentLoaded", () => {
  const nicknameInput = document.getElementById("nicknameInput");
  const nicknameBtn = document.getElementById("nicknameBtn");
  const rulesBtn = document.getElementById("rulesBtn");
  const rulesOverlay = document.getElementById("rulesOverlay");

  nicknameBtn.onclick = () => {
    const nick = nicknameInput.value.trim();
    if (!nick) return alert("Enter a nickname!");
    localStorage.setItem("nickname", nick);
    window.location.href = "select.html";
  };

  nicknameInput.addEventListener("keypress", e => {
    if(e.key === "Enter") nicknameBtn.click();
  });

  rulesBtn.addEventListener("click", () => { rulesOverlay.style.display = "flex"; });
  rulesOverlay.addEventListener("click", () => { rulesOverlay.style.display = "none"; });
});