// ControllerLights.js — LED feedback for the Pioneer DDJ (DDJ-SB3 layout)
// The controller only lights up when the software tells it to. This reads the deck state
// 25 times a second, works out what every LED should be, and sends only the changes.
//
// lightsFor() is pure (state in, LED map out) so it runs under node: see
// ControllerLights.test.mjs. The class below is the part that touches MIDI and the page.

export const LIGHTS = {
    CH_DECK: { A: 0, B: 1 },
    CH_PADS: { A: 7, B: 8 },   // DDJ-SB3: deck 1 pads on 7, deck 2 pads on 8
    NOTE_PLAY: 0x0B,
    NOTE_CUE: 0x0C,
    NOTE_SYNC: 0x58,
    NOTE_PFL: 0x54,
    NOTE_KEYLOCK: 0x1A,
    NOTE_SLIP: 0x40,
    NOTE_LOOP_IN: 0x10,
    NOTE_LOOP_OUT: 0x11,
    NOTE_AUTO_LOOP: 0x14,
    NOTE_RELOOP: 0x4D,
    NOTE_FX: 0x47,
    PAD_HOTCUE_BASE: 0x00,
    PAD_FXFADE_BASE: 0x10,
    PAD_SWITCH_BASE: 0x20,
    PAD_SAMPLER_BASE: 0x30,
    // Pad mode buttons, on the deck channel
    MODE_NOTES: { hotcue: 0x1B, fxfade: 0x1E, switch: 0x20, sampler: 0x22 },
    CC_LEVEL: 0x02,            // channel level meter
    ON: 0x7F,
    OFF: 0x00,
    BOOT_MS: 1400,             // length of the hello sweep when the controller connects
    END_WARN_S: 30,            // play LED starts flashing this close to the end
    END_URGENT_S: 10,
    TEMPO_MATCH_BPM: 0.06,     // decks within this many BPM count as matched
};

const key = (status, data1) => (status << 8) | data1;
const blink = (t, hz) => Math.floor(t * hz * 2 / 1000) % 2 === 0;

// Which beat of the bar the deck is on (0 based), and how far through that beat (0 to 1).
// Null when the track has no BPM.
export function beatAt(deck) {
    if (!deck.bpm || deck.bpm <= 0) return null;
    const beats = Math.max(0, deck.time) * deck.bpm / 60;
    return { index: Math.floor(beats), phase: beats - Math.floor(beats) };
}

// The tempo a deck is really playing at: its BPM times its pitch fader.
export function liveBpm(deck) {
    return deck.bpm ? deck.bpm * (deck.rate || 1) : null;
}

export function tempoMatched(a, b) {
    const x = liveBpm(a), y = liveBpm(b);
    return !!(a.loaded && b.loaded && x && y && Math.abs(x - y) <= LIGHTS.TEMPO_MATCH_BPM);
}

// state: { decks: { A, B }, mixz: { running, human }, bootAt }
// deck:  { loaded, playing, time, duration, bpm, rate, hotCues[8] of bool, loopIn, loopActive,
//          keyLock, slip, pfl, fx, level (0 to 1) }
// t: milliseconds. Returns Map of (status << 8 | data1) -> value.
export function lightsFor(state, t) {
    const L = LIGHTS;
    const out = new Map();
    const set = (status, data1, on) => out.set(key(status, data1), typeof on === 'number' ? on : on ? L.ON : L.OFF);
    const booting = state.bootAt != null && t - state.bootAt < L.BOOT_MS;
    const matched = tempoMatched(state.decks.A, state.decks.B);
    const aiDriving = !!(state.mixz?.running && !state.mixz?.human);

    for (const id of ['A', 'B']) {
        const d = state.decks[id];
        const note = 0x90 | L.CH_DECK[id];
        const pad = 0x90 | L.CH_PADS[id];
        const beat = d.playing ? beatAt(d) : null;
        const left = d.duration > 0 ? d.duration - d.time : Infinity;

        if (booting) {
            // Hello sweep: one lit pad runs left to right across both decks, twice.
            const step = Math.floor((t - state.bootAt) / (L.BOOT_MS / 32)) % 16;
            const mine = id === 'A' ? step : step - 8;
            for (let i = 0; i < 8; i++) set(pad, L.PAD_HOTCUE_BASE + i, i === mine);
            for (const m of Object.keys(L.MODE_NOTES)) set(note, L.MODE_NOTES[m], m === 'hotcue');
            const flash = blink(t - state.bootAt, 4);
            for (const n of [L.NOTE_PLAY, L.NOTE_CUE, L.NOTE_SYNC]) set(note, n, flash);
            for (const n of [L.NOTE_PFL, L.NOTE_KEYLOCK, L.NOTE_SLIP, L.NOTE_LOOP_IN, L.NOTE_LOOP_OUT, L.NOTE_AUTO_LOOP, L.NOTE_RELOOP, L.NOTE_FX]) set(note, n, false);
            set(0xB0 | L.CH_DECK[id], L.CC_LEVEL, 0);
            continue;
        }

        // PLAY: solid while playing, slow blink when loaded and waiting, fast flash near the end.
        let play = false;
        if (d.loaded && d.playing) play = left <= L.END_URGENT_S ? blink(t, 6) : left <= L.END_WARN_S ? blink(t, 2.5) : true;
        else if (d.loaded) play = blink(t, 1);
        set(note, L.NOTE_PLAY, play);

        // CUE: solid when parked, flashes on every beat while playing so the tempo is visible.
        let cue = false;
        if (d.loaded && !d.playing) cue = true;
        else if (d.loaded) cue = beat ? beat.phase < 0.35 : true;
        set(note, L.NOTE_CUE, cue);

        set(note, L.NOTE_SYNC, matched);
        set(note, L.NOTE_PFL, !!d.pfl);
        set(note, L.NOTE_KEYLOCK, !!d.keyLock);
        set(note, L.NOTE_SLIP, !!d.slip);
        set(note, L.NOTE_LOOP_IN, d.loopIn || d.loopActive);
        set(note, L.NOTE_LOOP_OUT, !!d.loopActive);
        // An active loop pulses on the beat, so a forgotten loop is hard to miss.
        const loopPulse = d.loopActive ? (beat ? beat.phase < 0.5 : true) : false;
        set(note, L.NOTE_AUTO_LOOP, loopPulse);
        set(note, L.NOTE_RELOOP, loopPulse);
        set(note, L.NOTE_FX, !!d.fx);

        // PADS: the hot cues that are set. While DJ MixZ is driving, the playing deck runs a
        // beat counter across its pads instead, eight beats left to right.
        for (let i = 0; i < 8; i++) {
            let on = !!d.hotCues?.[i];
            if (aiDriving && d.playing && beat) on = (beat.index % 8) === i;
            set(pad, L.PAD_HOTCUE_BASE + i, on);
        }

        // The pad mode button that is in use stays lit.
        const mode = d.padMode || 'hotcue';
        for (const m of Object.keys(L.MODE_NOTES)) set(note, L.MODE_NOTES[m], m === mode);

        // FX FADE pads: all eight lit while the deck plays, since each one is ready to fire.
        // While a fade runs, its pad flashes and the rest go dark.
        for (let i = 0; i < 8; i++) {
            let on = !!(d.loaded && d.playing);
            if (d.fxFadePad != null) on = i === d.fxFadePad && blink(t, 5);
            set(pad, L.PAD_FXFADE_BASE + i, on);
        }
        // Next track switches and sampler pads: lit, so the row can be found in the dark.
        for (let i = 0; i < 8; i++) {
            set(pad, L.PAD_SWITCH_BASE + i, true);
            set(pad, L.PAD_SAMPLER_BASE + i, true);
        }

        // Channel level meter, in 16 steps so a steady signal does not flood the cable.
        const level = d.playing ? Math.max(0, Math.min(1, d.level || 0)) : 0;
        set(0xB0 | L.CH_DECK[id], L.CC_LEVEL, Math.min(127, Math.round(level * 16) * 8));
    }
    return out;
}

// Everything dark. Sent when the page closes, so the controller is not left lit.
export function allOff() {
    const dark = { loaded: false, playing: false, time: 0, duration: 0, hotCues: [] };
    return new Map([...lightsFor({ decks: { A: dark, B: dark } }, 0).keys()].map(k => [k, 0]));
}

export class ControllerLights {
    constructor(djPlayer) {
        this.dj = djPlayer;
        this.enabled = localStorage.getItem('mixz-lights') !== 'off';
        this._sent = new Map();
        this._output = null;
        this._bootAt = null;
        this._timer = setInterval(() => this._tick(), 40);
        window.addEventListener('pagehide', () => this._send(allOff(), true));
    }

    setEnabled(on) {
        this.enabled = !!on;
        localStorage.setItem('mixz-lights', on ? 'on' : 'off');
        if (!on) this._send(allOff(), true);
        this._sent.clear();
    }

    // The DDJ's own port if there is one, otherwise the first output.
    _pickOutput() {
        const outs = this.dj.midi?._outputs || [];
        return outs.find(o => /pioneer|ddj|serato/i.test(o.name || '')) || outs[0] || null;
    }

    _deckState(id) {
        const deck = this.dj.decks?.[id];
        if (!deck) return { loaded: false, playing: false, time: 0, duration: 0, hotCues: [] };
        const ch = this.dj.audioRouter?.channels?.[id];
        let level = 0;
        if (deck.isPlaying && ch?.analyser) {
            const data = new Uint8Array(ch.analyser.frequencyBinCount);
            ch.analyser.getByteFrequencyData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i++) sum += (data[i] / 255) ** 2;
            level = Math.min(1, Math.sqrt(sum / data.length) * 1.5);
        }
        const fxBtn = document.getElementById(`fx-${id.toLowerCase()}-toggle`);
        return {
            loaded: !!deck.isLoaded,
            playing: !!deck.isPlaying,
            time: deck.getCurrentTime?.() || 0,
            duration: deck.getDuration?.() || 0,
            bpm: deck.getBPM?.() || null,
            rate: deck.currentRate || 1,
            hotCues: (deck.hotCues || []).map(c => !!c),
            loopIn: deck.loop?.inPoint != null,
            loopActive: !!deck.loop?.active,
            keyLock: !!deck.keyLock,
            slip: !!deck.slipMode,
            pfl: !!ch?.pfl,
            fx: !!fxBtn?.classList.contains('active'),
            padMode: this.dj.midi?.padMode?.[id] || 'hotcue',
            fxFadePad: this.dj.fxFade?.active?.[id]?.plan.pad ?? null,
            level,
        };
    }

    _tick() {
        if (!this.enabled) return;
        const output = this._pickOutput();
        if (output !== this._output) {
            // A controller was plugged in (or swapped): forget what was sent and say hello.
            this._output = output;
            this._sent.clear();
            this._bootAt = output ? performance.now() : null;
            // A DDJ is its own sound card: send the mix to it, unless that was switched off.
            if (output && /pioneer|ddj/i.test(output.name || '') && localStorage.getItem('mixz-deck-audio') !== 'off') {
                this.dj.routeAudioToController?.(false)
                    .then(result => this.dj._paintDeckAudio?.(result))
                    .catch(() => {});
            }
        }
        if (!output) return;
        const mixz = this.dj.djMixz;
        const state = {
            decks: { A: this._deckState('A'), B: this._deckState('B') },
            mixz: { running: !!mixz?.running, human: !!mixz?.human },
            bootAt: this._bootAt,
        };
        this._send(lightsFor(state, performance.now()), false);
    }

    _send(map, force) {
        const output = this._output || this._pickOutput();
        if (!output) return;
        for (const [k, value] of map) {
            if (!force && this._sent.get(k) === value) continue;
            this._sent.set(k, value);
            try { output.send([k >> 8, k & 0xFF, value]); } catch (e) { /* port closed mid-send */ }
        }
    }
}
