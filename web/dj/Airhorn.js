// Airhorn.js — the dancehall air horn, made on the spot with Web Audio (no sample to license).
// Three detuned saws through a band-pass. 'classic' is the big one, three long blasts in one
// take (the way the famous club horn gets played); 'stabs' is the short-short-long sound-system
// pattern. Each blast drops in pitch as it ends. DJ MixZ fires it on party mixes.

// When each blast starts and how long it lasts, in seconds from the first one.
export function hornPattern(style = 'classic') {
    if (style === 'double') return [{ at: 0, len: 0.16 }, { at: 0.2, len: 0.55 }];
    if (style === 'stabs') return [{ at: 0, len: 0.14 }, { at: 0.18, len: 0.14 }, { at: 0.36, len: 0.7 }];
    return [{ at: 0, len: 0.95 }, { at: 1.1, len: 0.95 }, { at: 2.2, len: 1.1 }];
}

// Plays the horn into `dest` (the master bus). `level` 0 to 1. Returns how long it runs.
export function airhorn(ctx, dest, { level = 0.32, style = 'classic', pitch = 466 } = {}) {
    if (!ctx || !dest) return 0;
    const t0 = ctx.currentTime + 0.02;
    const out = ctx.createGain();
    out.gain.value = level;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1400;
    band.Q.value = 0.8;
    band.connect(out);
    out.connect(dest);
    const blasts = hornPattern(style);
    for (const { at, len } of blasts) {
        const start = t0 + at, end = start + len;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, start);
        env.gain.linearRampToValueAtTime(1, start + 0.012);
        env.gain.setValueAtTime(1, end - 0.05);
        env.gain.linearRampToValueAtTime(0, end);
        env.connect(band);
        for (const detune of [-14, 0, 11]) {
            const osc = ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(pitch, start);
            osc.frequency.setValueAtTime(pitch, end - 0.08);
            osc.frequency.exponentialRampToValueAtTime(pitch * 0.82, end);
            osc.detune.value = detune;
            osc.connect(env);
            osc.start(start);
            osc.stop(end + 0.02);
        }
    }
    const last = blasts[blasts.length - 1];
    const total = last.at + last.len + 0.1;
    setTimeout(() => { try { out.disconnect(); } catch (e) { /* already gone */ } }, (total + 0.5) * 1000);
    return total;
}
