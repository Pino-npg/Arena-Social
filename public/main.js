const nicknameInput = document.getElementById("nickname");
const confirmBtn = document.getElementById("confirm-nick");
const chars = document.querySelectorAll(".char");
const mode1 = document.getElementById("mode-1vs1");
const mode2 = document.getElementById("mode-tournament");

let nickConfirmed = false;
let selectedChar = null;

// Conferma nickname
confirmBtn.onclick = () => {
  if(nicknameInput.value.trim() !== ""){
    nickConfirmed = true;
    confirmBtn.disabled = true;
    nicknameInput.disabled = true;
    alert("Nickname confirmed!");
  }
};

// Selezione personaggio
chars.forEach(c=>{
  c.onclick = ()=>{
    if(!nickConfirmed) return;
    chars.forEach(el=>el.classList.remove("selected"));
    c.classList.add("selected");
    selectedChar = c.dataset.char;
    mode1.disabled = false;
    mode2.disabled = false;
  };
});

// Rules popup
document.getElementById("rules-btn").onclick = ()=>{
  document.getElementById("rules-popup").classList.remove("hidden");
};
document.getElementById("close-rules").onclick = ()=>{
  document.getElementById("rules-popup").classList.add("hidden");
};

// Music toggle
const music = new Audio("img/1.mp3");
music.loop = true;
document.getElementById("music-toggle").onclick = ()=>{
  if(music.paused){
    music.play();
  } else {
    music.pause();
  }
};

// Fullscreen
document.getElementById("fullscreen-btn").onclick = ()=>{
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
};