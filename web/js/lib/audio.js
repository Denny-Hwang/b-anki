// Text-to-speech and short feedback tones.
//
// Both were already browser APIs in the Streamlit build, where they had to be
// smuggled into a components iframe. Here they are just called directly.

let audioContext = null;

export function ttsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speak(text, lang = 'ko-KR', rate = 0.9) {
  if (!ttsSupported() || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = rate;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}

const PRESETS = {
  success: [[523.25, 0.10], [659.25, 0.12], [783.99, 0.18]],
  fail: [[311.13, 0.18], [233.08, 0.22]],
  complete: [[523.25, 0.12], [659.25, 0.12], [783.99, 0.12], [1046.5, 0.30]],
};

/** kind: success | fail | complete */
export function playSound(kind) {
  const notes = PRESETS[kind];
  if (!notes) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioContext) audioContext = new Ctx();
    // Browsers start the context suspended until a user gesture resumes it.
    if (audioContext.state === 'suspended') audioContext.resume();

    let at = audioContext.currentTime;
    notes.forEach(([frequency, duration]) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'triangle';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.12, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
      osc.connect(gain).connect(audioContext.destination);
      osc.start(at);
      osc.stop(at + duration);
      at += duration;
    });
  } catch {
    /* audio is a nicety; never let it break a review */
  }
}
