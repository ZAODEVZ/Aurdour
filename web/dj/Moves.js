// Moves.js — TRY A MOVE
// One small thing to try at a time. The app notices when it has been done, the controller
// lights celebrate, and nothing else appears until the DJ asks for another. No list, no
// score, no lesson plan on screen: it is meant to feel like a dare, not a course.
//
// MOVES and nextMove() are pure so they run under node: see Moves.test.mjs.

// say: what to try, in one short line. win: why it matters, shown once it is done.
// done(s, m): s is the state right now, m is this move's own scratch memory.
export const MOVES = [
    {
        id: 'two-tracks', say: 'Load a track on each deck.',
        win: 'Two decks loaded. That is a mix waiting to happen.',
        done: s => s.A.loaded && s.B.loaded,
    },
    {
        id: 'blend', say: 'Play both decks, then slide the crossfader all the way across.',
        win: 'That was a blend: one track out, the next one in.',
        done: (s, m) => {
            if (!(s.A.playing && s.B.playing)) return false;
            if (s.crossfader < 0.2) m.left = true;
            if (s.crossfader > 0.8) m.right = true;
            return !!(m.left && m.right);
        },
    },
    {
        id: 'sync', say: 'Press SYNC so both decks run at the same speed.',
        win: 'Tempos matched. Watch SYNC glow on both decks.',
        done: s => s.matched && s.A.loaded && s.B.loaded && s.A.bpm !== s.B.bpm,
    },
    {
        id: 'hot-cue', say: 'While a track plays, press a pad to mark that spot.',
        win: 'That pad now jumps back to that exact moment, any time.',
        done: (s, m) => {
            const count = s.A.cues + s.B.cues;
            if (m.start == null) m.start = count;
            return count > m.start;
        },
    },
    {
        id: 'loop', say: 'Catch a 4 beat loop, let it ride, then let it go.',
        win: 'Loops buy you time. That is how DJs stretch a good part.',
        done: (s, m) => {
            if (s.A.loop || s.B.loop) m.seen = true;
            return !!m.seen && !s.A.loop && !s.B.loop;
        },
    },
    {
        id: 'filter', say: 'Turn the FILTER knob on a playing deck and bring it back.',
        win: 'The filter is the easiest way to add tension before a drop.',
        done: (s, m) => {
            const swept = (s.A.playing && s.A.filtered) || (s.B.playing && s.B.filtered);
            if (swept) m.seen = true;
            return !!m.seen && !s.A.filtered && !s.B.filtered;
        },
    },
    {
        id: 'beat-jump', say: 'Hold SHIFT, press HOT CUE, then tap a pad to jump by beats.',
        win: 'Beat jump moves you through a track without losing the groove.',
        done: (s, m) => {
            if (m.start == null) m.start = s.jumps;
            return s.jumps > m.start;
        },
    },
    {
        id: 'fx-fade', say: 'Press FX FADE, then a pad, to send a playing deck out in style.',
        win: 'One press, one clean exit. Top row is quick, bottom row is long.',
        done: s => s.A.fading || s.B.fading,
    },
    {
        id: 'slicer', say: 'Hold SHIFT, press PAD SCRATCH, then play the pads like drums.',
        win: 'That is the slicer: the last 8 beats, one per pad.',
        done: (s, m) => {
            if (m.start == null) m.start = s.slices;
            return s.slices >= m.start + 3;
        },
    },
    {
        id: 'take-over', say: 'Start DJ MixZ, then grab the crossfader to take the decks back.',
        win: 'You and the machine, trading the decks. That is the whole idea.',
        done: (s, m) => {
            if (s.mixzRunning && !s.mixzHuman) m.seen = true;
            return !!m.seen && s.mixzRunning && s.mixzHuman;
        },
    },
];

// The first move not done yet, starting after `afterId` when given. Wraps to the start, so
// SKIP never runs out. Null once every move is done.
export function nextMove(doneIds, afterId = null) {
    const left = MOVES.filter(m => !doneIds.includes(m.id));
    if (!left.length) return null;
    const from = afterId ? MOVES.findIndex(m => m.id === afterId) : -1;
    return left.find(m => MOVES.indexOf(m) > from) || left[0];
}

export class Moves {
    constructor(djPlayer) {
        this.dj = djPlayer;
        this.current = null;
        this.memory = {};
        this.won = false;
        this.card = document.getElementById('move-card');
        this.sayEl = document.getElementById('move-say');
        this.tagEl = document.getElementById('move-tag');
        this.nextBtn = document.getElementById('move-next');
        this.skipBtn = document.getElementById('move-skip');
        document.getElementById('move-open')?.addEventListener('click', () => this.open());
        document.getElementById('move-close')?.addEventListener('click', () => this.close());
        this.nextBtn?.addEventListener('click', () => this.open());
        this.skipBtn?.addEventListener('click', () => this.open(this.current?.id));
        this._timer = setInterval(() => this._tick(), 250);
    }

    _doneIds() {
        try { return JSON.parse(localStorage.getItem('mixz-moves-done') || '[]'); } catch (e) { return []; }
    }

    open(skipId = null) {
        if (!this.card) return;
        const move = nextMove(this._doneIds(), skipId);
        this.card.classList.remove('hidden', 'won');
        this.won = false;
        this.memory = {};
        this.current = move;
        if (!move) {
            // Everything has been tried once: start the round again rather than run dry.
            localStorage.setItem('mixz-moves-done', '[]');
            this.tagEl.textContent = 'ALL DONE';
            this.sayEl.textContent = 'You have tried every move. Go again?';
            this.nextBtn.textContent = 'AGAIN';
            this.nextBtn.classList.remove('hidden');
            this.skipBtn.classList.add('hidden');
            return;
        }
        this.tagEl.textContent = 'TRY THIS';
        this.sayEl.textContent = move.say;
        this.nextBtn.classList.add('hidden');
        this.skipBtn.classList.remove('hidden');
    }

    close() {
        this.card?.classList.add('hidden');
        this.current = null;
    }

    _state() {
        const dj = this.dj;
        const deck = (id) => {
            const d = dj.decks?.[id];
            const ch = dj.audioRouter?.channels?.[id];
            const f = ch?.filter;
            return {
                loaded: !!d?.isLoaded, playing: !!d?.isPlaying, bpm: d?.getBPM?.() || null,
                cues: (d?.hotCues || []).filter(Boolean).length, loop: !!d?.loop?.active,
                filtered: !!f && (f.type === 'highpass' ? f.frequency.value > 60 : f.frequency.value < 12000),
                fading: !!dj.fxFade?.active?.[id],
            };
        };
        const A = deck('A'), B = deck('B');
        const live = (id) => { const d = dj.decks?.[id]; const b = d?.getBPM?.(); return b ? b * (d.currentRate || 1) : null; };
        const a = live('A'), b = live('B');
        return {
            A, B,
            crossfader: dj.audioRouter?._lastCrossfadePosition ?? 0.5,
            matched: !!(a && b && Math.abs(a - b) <= 0.06),
            jumps: dj.padModes?.jumpCount || 0,
            slices: dj.padModes?.sliceCount || 0,
            mixzRunning: !!dj.djMixz?.running, mixzHuman: !!dj.djMixz?.human,
        };
    }

    _tick() {
        if (!this.current || this.won || !this.card || this.card.classList.contains('hidden')) return;
        let ok = false;
        try { ok = this.current.done(this._state(), this.memory); } catch (e) { ok = false; }
        if (!ok) return;
        this.won = true;
        const done = this._doneIds();
        if (!done.includes(this.current.id)) done.push(this.current.id);
        localStorage.setItem('mixz-moves-done', JSON.stringify(done));
        this.tagEl.textContent = 'NICE';
        this.sayEl.textContent = this.current.win;
        this.card.classList.add('won');
        this.nextBtn.textContent = 'ANOTHER';
        this.nextBtn.classList.remove('hidden');
        this.skipBtn.classList.add('hidden');
        // The controller joins in: the same light sweep it does when it is plugged in.
        this.dj.lights?.celebrate?.();
    }
}
