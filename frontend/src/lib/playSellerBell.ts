/** Short bell-like chimes for seller arrival alerts (no external audio file). */
export function playSellerBell(times = 4) {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const playOnce = (offsetMs: number) => {
      window.setTimeout(() => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = 880;
        o.connect(g);
        g.connect(ctx.destination);
        const t0 = ctx.currentTime;
        g.gain.setValueAtTime(0.12, t0);
        g.gain.exponentialRampToValueAtTime(0.01, t0 + 0.22);
        o.start(t0);
        o.stop(t0 + 0.24);
      }, offsetMs);
    };
    for (let i = 0; i < times; i++) playOnce(i * 400);
  } catch {
    /* ignore */
  }
}
