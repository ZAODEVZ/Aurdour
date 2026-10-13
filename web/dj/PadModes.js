// PadModes.js — the two shifted pad modes on the DDJ-SB3 that move the playhead
// BEAT JUMP: skip back or forward by whole beats without losing the groove.
// SLICER: the current 8 beats are laid across the 8 pads; press one to replay that beat.
//
// The maths is pure so it runs under node: see PadModes.test.mjs.

// Top row jumps back, bottom row jumps forward, each by 1, 2, 4 and 8 beats.
export const BEAT_JUMPS = [-1, -2, -4, -8, 1, 2, 4, 8];

// Where a jump of `beats` lands, kept inside the track. Null when the track has no BPM.
export function jumpTarget(time, duration, bpm, beats) {
    if (!bpm || bpm <= 0 || !(duration > 0)) return null;
    return Math.max(0, Math.min(duration, time + beats * 60 / bpm));
}

// The 8 beat window the playhead is in, and the start of slice `pad` inside it.
export function sliceTarget(time, duration, bpm, pad) {
    if (!bpm || bpm <= 0 || !(duration > 0) || pad < 0 || pad > 7) return null;
    const beat = 60 / bpm;
    const windowStart = Math.floor(Math.max(0, time) / (beat * 8)) * beat * 8;
    return Math.min(duration, windowStart + pad * beat);
}

export class PadModes {
    constructor(djPlayer) {
        this.dj = djPlayer;
        this.lastJump = null;   // { deck, beats, at }
        this.lastSlice = null;  // { deck, pad, at }
        this.jumpCount = 0;
        this.sliceCount = 0;
    }

    _seek(deck, time) {
        const dur = deck.getDuration();
        if (dur > 0 && time != null) deck.wavesurfer.seekTo(time / dur);
    }

    beatJump(deckId, pad) {
        const deck = this.dj.decks?.[deckId];
        const beats = BEAT_JUMPS[pad];
        if (!deck?.isLoaded || beats == null) return null;
        const to = jumpTarget(deck.getCurrentTime(), deck.getDuration(), deck.getBPM(), beats);
        if (to == null) return null;
        this._seek(deck, to);
        this.lastJump = { deck: deckId, beats, at: Date.now() };
        this.jumpCount++;
        return beats;
    }

    slice(deckId, pad) {
        const deck = this.dj.decks?.[deckId];
        if (!deck?.isLoaded) return null;
        const to = sliceTarget(deck.getCurrentTime(), deck.getDuration(), deck.getBPM(), pad);
        if (to == null) return null;
        this._seek(deck, to);
        this.lastSlice = { deck: deckId, pad, at: Date.now() };
        this.sliceCount++;
        return pad;
    }
}
