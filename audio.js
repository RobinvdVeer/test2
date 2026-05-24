let audioContext = null;

export function playBadNoise() {
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  const ctx = audioContext;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = 160 + Math.random() * 900;
  gain.gain.value = 0.05;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.15);
}
