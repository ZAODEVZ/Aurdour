// PartyFX.js — the sound-system tricks: MC shouts, dub siren, air horn and the rewind.
// Shouts are short voice clips in data/shouts/: a male MC (<name>.wav) and a female MC
// (<name>-f.wav), picked at random so the mic passes around. Drop your own recording in with the
// same file name to replace one. They play loud, through a dub echo. The siren and the horn are made on the spot. The rewind ("pull up") winds
// the song down with a spin-back sound, then plays the same song again from the top.

import { airhorn } from './Airhorn.js';

export const SHOUTS = {
    'big-tune': 'Big tune!',
    massive: 'Massive tune!',
    badman: 'Bad man tune!',
    forward: 'Forward!',
    'hold-tight': 'Hold tight!',
    'wheel-up': 'Wheel up!',
    rewind: 'Rewind! Pull up selecta!',
    reload: 'Reload!',
    'pull-up': 'Pull up!',
    mixz: 'ZAO MixZ!',
};
// What DJ MixZ says after a new song lands
export const HYPE = ['big-tune', 'massive', 'badman', 'forward', 'hold-tight', 'wheel-up', 'mixz'];

// The next hype shout: never the same one twice running
export function nextHype(last) {
    const pool = HYPE.filter((s) => s !== last);
    return pool[Math.floor(Math.random() * pool.length)];
}

export class PartyFX {
    constructor(dj) {
        this.dj = dj;
        this._buffers = {};
        this._lastHype = null;
        this.level = 1.0;
    }

    get ctx() { return this.dj.audioRouter?.getAudioContext?.() || this.dj.audioRouter?.ctx || null; }
    get out() { return this.dj.audioRouter?.masterGain || null; }

    // A dub echo send: the shout and siren ring out on the beat-ish 3/8 delay
    _dub(input, time = 0.33, feedback = 0.42) {
        const ctx = this.ctx;
        const delay = ctx.createDelay(2);
        delay.delayTime.value = time;
        const fb = ctx.createGain(); fb.gain.value = feedback;
        const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2600;
        const wet = ctx.createGain(); wet.gain.value = 0.55;
        input.connect(delay); delay.connect(tone); tone.connect(fb); fb.connect(delay); tone.connect(wet);
        wet.connect(this.out);
        input.connect(this.out);
        setTimeout(() => { try { delay.disconnect(); tone.disconnect(); fb.disconnect(); wet.disconnect(); } catch (e) { /* gone */ } }, 6000);
    }

    async _load(file) {
        if (this._buffers[file]) return this._buffers[file];
        const r = await fetch(`data/shouts/${file}.wav`, { cache: 'no-store' });
        if (!r.ok) throw new Error(`no shout ${file}`);
        this._buffers[file] = await this.ctx.decodeAudioData(await r.arrayBuffer());
        return this._buffers[file];
    }

    // The two MCs' takes of a shout, whichever exist
    async _takes(name) {
        const out = [];
        for (const file of [name, `${name}-f`]) { try { out.push(await this._load(file)); } catch (e) { /* no such take */ } }
        if (!out.length) throw new Error(`no shout ${name}`);
        return out;
    }

    // Warm the clips up so the first shout is not late
    preload() { Object.keys(SHOUTS).forEach((n) => this._takes(n).catch(() => {})); }

    async shout(name) {
        const ctx = this.ctx;
        if (!ctx || !this.out) return;
        try {
            const takes = await this._takes(name);
            const src = ctx.createBufferSource();
            src.buffer = takes[Math.floor(Math.random() * takes.length)];
            const g = ctx.createGain(); g.gain.value = this.level;
            const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180; // MC on a mic, not a bass bin
            src.connect(hp); hp.connect(g);
            this._dub(g);
            src.start();
        } catch (e) {
            console.warn('[PartyFX] shout failed:', e.message);
        }
    }

    hype() { this._lastHype = nextHype(this._lastHype); return this.shout(this._lastHype); }

    // The air horn: a real one from data/fx/airhorn.(wav|mp3) when the DJ has dropped one in
    // (IMan's own sample), else the synthesized one.
    async horn(style = 'classic') {
        const ctx = this.ctx;
        if (!ctx || !this.out) return;
        if (this._hornFile === undefined) {
            this._hornFile = null;
            for (const name of ['data/fx/airhorn.wav', 'data/fx/airhorn.mp3']) {
                try { const r = await fetch(name); if (r.ok) { this._hornFile = await ctx.decodeAudioData(await r.arrayBuffer()); break; } } catch (e) { /* try the next */ }
            }
        }
        if (this._hornFile) {
            const src = ctx.createBufferSource(); src.buffer = this._hornFile;
            const g = ctx.createGain(); g.gain.value = 0.85;
            src.connect(g); this._dub(g, 0.3, 0.3);
            src.start();
            return;
        }
        try { airhorn(ctx, this.out, { style }); } catch (e) { /* no horn */ }
    }

    // The dub siren: a square wave wailing up and down, into the echo
    siren(seconds = 2.4) {
        const ctx = this.ctx;
        if (!ctx || !this.out) return;
        const t0 = ctx.currentTime + 0.02;
        const osc = ctx.createOscillator(); osc.type = 'square';
        const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 2.2;
        const depth = ctx.createGain(); depth.gain.value = 320;
        osc.frequency.value = 780;
        lfo.connect(depth); depth.connect(osc.frequency);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, t0); env.gain.linearRampToValueAtTime(0.16, t0 + 0.05);
        env.gain.setValueAtTime(0.16, t0 + seconds - 0.3); env.gain.linearRampToValueAtTime(0, t0 + seconds);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
        osc.connect(lp); lp.connect(env);
        this._dub(env, 0.25, 0.5);
        osc.start(t0); lfo.start(t0); osc.stop(t0 + seconds + 0.05); lfo.stop(t0 + seconds + 0.05);
    }

    // The spin-back: a record dragged backwards, a falling then rising scratch of noise and tone
    _spinback(seconds = 1.1) {
        const ctx = this.ctx;
        const t0 = ctx.currentTime + 0.01;
        const osc = ctx.createOscillator(); osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(420, t0);
        osc.frequency.exponentialRampToValueAtTime(1800, t0 + seconds * 0.35);
        osc.frequency.exponentialRampToValueAtTime(60, t0 + seconds);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.9;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t0); env.gain.exponentialRampToValueAtTime(0.28, t0 + 0.06);
        env.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
        osc.connect(bp); bp.connect(env); env.connect(this.out);
        osc.start(t0); osc.stop(t0 + seconds + 0.05);
    }

    // Rewind, pull up: wind the song on `deck` down, shout, spin back, play it again from the top.
    // Resolves once the song is playing again.
    async rewind(deck) {
        const ctx = this.ctx;
        const ch = this.dj.audioRouter?.channels?.[deck?.id];
        if (!ctx || !ch || !deck?.isPlaying) return false;
        const g = ch.channelGain.gain;
        const before = g.value;
        const rate = deck.currentRate || 1;
        this.shout('rewind');
        // wind down: tempo drops, volume goes
        for (let i = 1; i <= 8; i++) {
            setTimeout(() => { try { deck.setPlaybackRate(rate * (1 - i * 0.09)); g.value = before * (1 - i / 8); } catch (e) { /* deck gone */ } }, i * 40);
        }
        setTimeout(() => this._spinback(), 300);
        await new Promise((r) => setTimeout(r, 1500));
        try {
            deck.setPlaybackRate(rate);
            deck.wavesurfer?.setTime?.(0);
            g.value = before;
            if (!deck.isPlaying) deck.play();
        } catch (e) { g.value = before; }
        this.horn('classic');
        setTimeout(() => this.shout('reload'), 600);
        return true;
    }
}
