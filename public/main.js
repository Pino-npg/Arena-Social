// MUSIC TOGGLE
const musicBtn = document.getElementById("music-toggle");
let musicOn = true;

musicBtn.addEventListener("click", () => {
  musicOn = !musicOn;
  musicBtn.textContent = musicOn ? "🎧" : "🔇";
  if(musicOn) {
    bgMusic.play().catch(()=>{});
  } else {
    bgMusic.pause();
  }
});

// FULLSCREEN TOGGLE
const fullscreenBtn = document.getElementById("fullscreen-btn");
fullscreenBtn.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
});