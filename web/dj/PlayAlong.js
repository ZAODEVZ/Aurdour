// PlayAlong.js — hearing the mix on the phone when a direct call cannot get through
//
// The LISTEN button first tries a direct call from the desk (the real mix, through the
// mixer and FX). Some networks never let that call connect. Then the phone plays along:
// it loads the same two songs from where they live (SongChainn, Audius, or the site), keeps
// each one at the desk's position and speed, and mixes them with the desk's crossfader and
// faders. Not the FX, but the right songs at the right moment, from anywhere.
//
// deckGains and drift are pure and run under node: see PlayAlong.test.mjs.

// Equal-power crossfade: at the middle both decks sit at 0.707, so the level does not dip.
export function deckGains(xf, volA = 1, volB = 1, master = 1) {
    const x = Math.max(0, Math.min(1, Number(xf) || 0));
    const m = Math.max(0, Math.min(1, master));
    return {
        A: Math.cos(x * Math.PI / 2) * Math.max(0, Math.min(1, volA)) * m,
        B: Math.sin(x * Math.PI / 2) * Math.max(0, Math.min(1, volB)) * m,
    };
}

// How far the phone is from where the desk is, in seconds, allowing for the link's delay.
// Positive: the phone is behind.
export function drift(phoneTime, deskTime, rttMs = 0) {
    return (deskTime + Math.max(0, rttMs) / 2000) - phoneTime;
}

export const SEEK_IF_OFF_BY = 0.35;   // seconds; smaller and it would stutter on every tick

export class PlayAlong {
    constructor({ elements, origin }) {
        this.el = elements;   // { A: <audio>, B: <audio> }
        this.origin = origin;
        this.on = false;
        this.ctx = null;
        this.gain = {};
        this.say = '';
        this.trouble = {};
    }

    // Absolute address for a deck's song. The desk sends what it loaded: a full URL for
    // SongChainn and Audius, or a path on the site for a shipped file.
    urlFor(deckState) {
        const u = deckState?.url;
        if (!u) return '';
        if (/^https?:\/\//.test(u)) return u;
        return `${this.origin.replace(/\/$/, '')}/${String(u).replace(/^\.?\//, '')}`;
    }

    start() {
        this.on = true;
        // Gain through WebAudio when the browser allows it (needs CORS on the audio), else
        // the element's own volume.
        try {
            if (!this.ctx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                this.ctx = new AC();
                for (const d of ['A', 'B']) {
                    const src = this.ctx.createMediaElementSource(this.el[d]);
                    const g = this.ctx.createGain();
                    src.connect(g); g.connect(this.ctx.destination);
                    this.gain[d] = g;
                }
            }
            this.ctx.resume?.();
        } catch (e) { this.ctx = null; this.gain = {}; }
        for (const d of ['A', 'B']) { this.el[d].play().catch(() => {}); }   // inside the tap: unlocks sound
    }

    stop() {
        this.on = false;
        for (const d of ['A', 'B']) { try { this.el[d].pause(); this.el[d].removeAttribute('src'); this.el[d].load(); } catch (e) { /* fine */ } this.el[d].dataset.url = ''; }
        this.say = '';
    }

    // Called with every state the desk sends (five times a second).
    update(state, rttMs = 0) {
        if (!this.on || !state) return;
        const g = deckGains(state.xf, state.vol?.A ?? 1, state.vol?.B ?? 1, state.master ?? 1);
        const notes = [];
        for (const d of ['A', 'B']) {
            const el = this.el[d], s = state[d] || {};
            const url = s.loaded ? this.urlFor(s) : '';
            if (el.dataset.url !== url) {
                el.dataset.url = url;
                this.trouble[d] = '';
                if (url) { el.crossOrigin = 'anonymous'; el.src = url; el.load(); if (s.playing) el.play().catch(() => {}); }
                else { el.pause(); el.removeAttribute('src'); }
            }
            if (!url) { if (s.loaded) notes.push(`${d}: only on the desk`); continue; }
            if (this.gain[d]) this.gain[d].gain.value = g[d]; else el.volume = g[d];
            el.playbackRate = s.rate || 1;
            if (s.playing && el.paused) el.play().catch(() => {});
            if (!s.playing && !el.paused) el.pause();
            if (s.playing && el.readyState >= 1) {
                const off = drift(el.currentTime, s.time, rttMs);
                if (Math.abs(off) > SEEK_IF_OFF_BY) { try { el.currentTime = s.time + rttMs / 2000; } catch (e) { /* not seekable yet */ } }
            }
            if (el.error) { this.trouble[d] = 'will not play here'; notes.push(`${d}: will not play here`); }
        }
        this.say = notes.join('. ');
    }
}
