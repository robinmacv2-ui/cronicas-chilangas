let ctx: AudioContext | null = null;
let bed: { gain: GainNode; nodes: OscillatorNode[] } | null = null;

function context(): AudioContext | null {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

export function unlockAudio(): void {
  const audio = context();
  if (!audio) return;
  if (audio.state === "suspended") void audio.resume();
  if (!bed) {
    const gain = audio.createGain();
    gain.gain.value = 0;
    gain.connect(audio.destination);
    const make = (freq: number, type: OscillatorType) => {
      const node = audio.createOscillator();
      node.type = type;
      node.frequency.value = freq;
      node.connect(gain);
      node.start();
      return node;
    };
    bed = {
      gain,
      nodes: [make(82, "sine"), make(123.5, "triangle"), make(196, "sine")],
    };
  }
}

export function setMusicGain(amount: number): void {
  if (!bed || !ctx) return;
  const value = Math.max(0, Math.min(1, amount)) * 0.012;
  bed.gain.gain.setTargetAtTime(value, ctx.currentTime, 0.08);
}

export function blip(amount: number, pitch = 640): void {
  const audio = context();
  if (!audio || amount <= 0) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "square";
  osc.frequency.value = pitch;
  gain.gain.value = 0.025 * Math.max(0, Math.min(1, amount));
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.07);
  osc.stop(audio.currentTime + 0.08);
}
