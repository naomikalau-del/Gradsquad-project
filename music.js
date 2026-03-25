// music.js
window.audio = null; // global audio object
window.musicReady = false;

function initMusic() {
  if (window.audio) return; // only one instance

  const tracks = [
    "/happinessinmusic-love-139559 (1).mp3",
    "/jerzygorecki-endless-road-i-take-background-music-vocal-relaxing-soul-lyrics-409774.mp3",
    "/magpiemusic-catchy-uplifting-inspiring-indie-pop-182349.mp3",
    "/mason_wagner-first-things-first-300090.mp3",
    "/sound_for_you-happy-indie-pop-energetic-upbeat-uplifting-catchy-indie-pop-487485.mp3",
    "/viicreateur-midnight-on-my-phone-no-copyright-468774.mp3"
  ];

  const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];

  window.audio = new Audio(randomTrack);
  window.audio.loop = true;
  window.audio.volume = 0.5;
  window.musicReady = true;

  const tryPlay = () => {
    window.audio.play().catch(() => {
      // waiting for user interaction
    });
  };

  // Try immediate play
  tryPlay();

  // Start music on first user interaction if blocked
  const startOnInteraction = () => {
    tryPlay();
    document.removeEventListener("click", startOnInteraction);
    document.removeEventListener("keydown", startOnInteraction);
  };

  document.addEventListener("click", startOnInteraction);
  document.addEventListener("keydown", startOnInteraction);
}

function toggleMusic() {
  if (!window.audio || !window.musicReady) return;

  if (window.audio.paused) {
    window.audio.play();
  } else {
    window.audio.pause();
  }
}