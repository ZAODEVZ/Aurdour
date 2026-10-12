// DjMixz.js — DJ MixZ, the bot DJ.
// Give it a playlist and a mood. It plans the whole set (which track when, so the energy
// follows the mood and the keys and tempos sit together), then plays it: it chooses how to
// move between every pair of tracks the way a working DJ would (long blend when they fit,
// filter sweep to cover a tempo gap, echo out or a hard cut when the keys clash) and times
// each move in bars, not seconds. It never uses the same move three times running.
//
// The planning is pure functions (planSet, planTransition) so it can be tested without audio.
// Playing rides on the app's FlowMode and AutoTransition.

import { keyRelation } from './SwitchPad.js';

// Mood = the energy the room should feel, from the first track (x = 0) to the last (x = 1).
export const MOODS = [
    { id: 'warmup',  label: 'WARM UP',   hint: 'opens easy, builds steadily',        curve: (x) => 0.25 + 0.4 * x },
    { id: 'peak',    label: 'PEAK TIME', hint: 'high the whole way, short breathers', curve: (x) => 0.82 + 0.1 * Math.sin(x * Math.PI * 5) },
    { id: 'journey', label: 'JOURNEY',   hint: 'builds to a peak, then lands',        curve: (x) => (x < 0.72 ? 0.3 + 0.62 * (x / 0.72) : 0.92 - 0.45 * ((x - 0.72) / 0.28)) },
    { id: 'sunset',  label: 'SUNSET',    hint: 'starts warm, winds down',             curve: (x) => 0.62 - 0.38 * x },
    { id: 'party',   label: 'PARTY',     hint: 'waves: push, release, push',          curve: (x) => 0.7 + 0.22 * Math.sin(x * Math.PI * 4 - 0.6) },
];

const GENRE_ENERGY = [
    [/drum\s*&?\s*bass|dnb|jungle|hardstyle|hardcore/i, 0.95],
    [/techno|trance|dubstep|trap|drill/i, 0.85],
    [/house|electro|dance|edm|afro|amapiano|dancehall|soca/i, 0.72],
    [/hip.?hop|rap|reggaeton|pop|tribe|bass/i, 0.6],
    [/r&b|rnb|soul|funk|disco|reggae/i, 0.48],
    [/lo.?fi|chill|ambient|downtempo|acoustic|jazz|classical/i, 0.25],
];
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : null; };
const idOf = (t) => String(t.id ?? t.sourceId ?? `${t.title}|${t.artist}`);
const clamp01 = (n) => Math.max(0, Math.min(1, n));

// How hard a track hits, 0 to 1. Uses the track's own energy when it has one; otherwise
// tempo and genre. Half-time tracks (hip-hop at 80) are read at double tempo.
export function energyOf(t) {
    if (typeof t.energy === 'number') return clamp01(t.energy);
    let bpm = num(t.bpm);
    // Rap and trap written at 70 to 95 are felt at about one and a half times that
    if (bpm && bpm < 95 && /hip.?hop|rap|trap|drill|dancehall|reggaeton/i.test(t.genre || '')) bpm *= 1.5;
    const tempo = bpm ? clamp01((bpm - 80) / 70) : 0.5;
    const g = GENRE_ENERGY.find(([re]) => re.test(t.genre || ''));
    return clamp01(g ? tempo * 0.55 + g[1] * 0.45 : tempo);
}

function tempoGap(a, b) {
    const x = num(a.bpm), y = num(b.bpm);
    if (!x || !y) return { pct: null, doubled: false };
    const r = y / x;
    if ((r > 1.9 && r < 2.1) || (r > 0.47 && r < 0.53)) return { pct: 0, doubled: true };
    return { pct: (r - 1) * 100, doubled: false };
}

const KEY_COST = { same: 0, up1: 0, down1: 0.05, flip: 0.05, up2: 0.3, unknown: 0.4, clash: 1 };

// The move from track a to track b. `prevTypes` are the moves already used, newest last.
export function planTransition(a, b, harmonic, prevTypes = []) {
    const rel = keyRelation(harmonic, a.key, b.key);
    const { pct, doubled } = tempoGap(a, b);
    const gap = pct === null ? null : Math.abs(pct);
    const energy = (energyOf(a) + energyOf(b)) / 2;
    const fits = rel === 'same' || rel === 'up1' || rel === 'down1' || rel === 'flip';
    let type, bars, why;

    if (rel === 'clash' || (gap !== null && gap > 8 && !doubled)) {
        if (energy > 0.68) { type = 'cut'; bars = 1; why = rel === 'clash' ? 'keys clash, so a clean cut on the one' : 'tempo jump, so a clean cut on the one'; }
        else { type = 'echo-out'; bars = 4; why = rel === 'clash' ? 'keys clash, so the old track echoes away first' : 'tempo jump, so the old track echoes away first'; }
    } else if (doubled) {
        type = 'echo-out'; bars = 4; why = 'half or double time, echo out and drop in';
    } else if (gap !== null && gap > 4) {
        type = 'filter-sweep'; bars = energy > 0.65 ? 8 : 16; why = 'tempo shifts under a filter sweep';
    } else if (fits) {
        type = 'blend'; bars = energy < 0.45 ? 32 : 16; why = rel === 'up1' ? 'keys step up, long blend' : rel === 'flip' ? 'same notes, new mood, long blend' : 'same key family, long blend';
    } else {
        type = 'filter-sweep'; bars = 8; why = 'no key on file, sweep keeps it safe';
    }

    // A DJ does not do the same move three times in a row.
    const last2 = prevTypes.slice(-2);
    if (last2.length === 2 && last2[0] === type && last2[1] === type) {
        if (type === 'blend') { type = 'filter-sweep'; bars = 16; why += ', swept for variety'; }
        else if (type === 'filter-sweep') { type = fits ? 'blend' : 'echo-out'; bars = fits ? 16 : 4; why += ', changed up for variety'; }
        else if (type === 'cut') { type = 'echo-out'; bars = 4; why += ', echo this time'; }
        else { type = energy > 0.6 ? 'cut' : 'filter-sweep'; bars = type === 'cut' ? 1 : 8; why += ', changed up for variety'; }
    }

    const bpm = num(a.bpm) || 120;
    const seconds = Math.max(type === 'cut' ? 1.5 : 6, Math.min(40, (bars * 4 * 60) / bpm));
    return { type, bars, seconds: Math.round(seconds * 10) / 10, why };
}

// Order a playlist for a mood. Returns [{ track, energy, target, move }] where `move` is how
// to get INTO that track from the one before (null for the first).
export function planSet(tracks, moodId, harmonic, opts = {}) {
    const mood = MOODS.find((m) => m.id === moodId) || MOODS[2];
    const seen = new Set();
    const pool = (tracks || []).filter((t) => t && !seen.has(idOf(t)) && seen.add(idOf(t)));
    const count = Math.min(pool.length, opts.maxTracks || pool.length);
    if (!count) return [];

    const targets = Array.from({ length: count }, (_, i) => mood.curve(count === 1 ? 0 : i / (count - 1)));

    // How well two tracks sit next to each other: keys, tempo, and not the same artist twice.
    const join = (x, y) => {
        if (!x || !y) return 0;
        const g = tempoGap(x, y);
        return KEY_COST[keyRelation(harmonic, x.key, y.key)] + 0.9 * (g.pct === null ? 0.4 : g.doubled ? 0.35 : Math.min(1, Math.abs(g.pct) / 9))
            + (x.artist && x.artist === y.artist ? 0.25 : 0);
    };

    const seat = new Array(count);
    if (pool.length >= count * 1.5) {
        // Plenty to choose from: walk the set in order and take the track that is right for the
        // slot's energy AND mixes well out of the one before. This is where the long blends come from.
        const left = pool.slice();
        for (let i = 0; i < count; i++) {
            let best = 0, bestCost = Infinity;
            for (let j = 0; j < left.length; j++) {
                const cost = 2.4 * Math.abs(energyOf(left[j]) - targets[i]) + (i ? join(seat[i - 1], left[j]) : 0);
                if (cost < bestCost) { bestCost = cost; best = j; }
            }
            seat[i] = left.splice(best, 1)[0];
        }
    } else {
        // The playlist IS the set: seat by rank, so it has the mood's shape whatever it holds.
        // The quietest track goes in the quietest slot, the hardest in the hardest.
        const slots = targets.map((t, i) => i).sort((x, y) => targets[x] - targets[y]);
        const byEnergy = pool.slice().sort((x, y) => energyOf(x) - energyOf(y));
        slots.forEach((slot, rank) => { seat[slot] = byEnergy[rank]; });
    }

    // Smooth the joins: swap neighbours when it makes the keys and tempos sit better and the
    // two tracks are close enough in energy that the shape does not change.
    const around = (i) => join(seat[i - 1], seat[i]) + join(seat[i], seat[i + 1]) + join(seat[i + 1], seat[i + 2]);
    for (let pass = 0; pass < 4; pass++) {
        for (let i = 0; i < count - 1; i++) {
            if (Math.abs(energyOf(seat[i]) - energyOf(seat[i + 1])) > 0.14) continue;
            const before = around(i);
            [seat[i], seat[i + 1]] = [seat[i + 1], seat[i]];
            if (around(i) >= before - 0.001) [seat[i], seat[i + 1]] = [seat[i + 1], seat[i]];
        }
    }

    const out = [];
    const types = [];
    seat.forEach((track, i) => {
        const prev = out[out.length - 1]?.track;
        const move = prev ? planTransition(prev, track, harmonic, types) : null;
        if (move) types.push(move.type);
        out.push({ track, energy: energyOf(track), target: targets[i], move });
    });
    return out;
}

export class DjMixz {
    constructor(dj) {
        this.dj = dj;
        this.plan = [];
        this.index = 0;
        this.running = false;
        this.mood = 'journey';
        this._buildUI();
    }

    _sources() {
        const lib = this.dj.library || {};
        return [
            { id: 'view', label: 'What the library is showing', tracks: () => lib._displayedTracks || [] },
            { id: 'zao', label: 'ZAO crate', tracks: () => lib.zaoTracks || [] },
            { id: 'local', label: 'LOCAL tab', tracks: () => lib.tracks || [] },
        ];
    }

    build(sourceId, moodId, minutes) {
        const src = this._sources().find((s) => s.id === sourceId) || this._sources()[0];
        const tracks = src.tracks().filter((t) => t && (t.streamUrl || t.dataFile));
        const avg = 3.2; // minutes a track stays on air, after overlaps
        const maxTracks = minutes ? Math.max(2, Math.round(minutes / avg)) : tracks.length;
        this.mood = moodId;
        this.plan = planSet(tracks, moodId, this.dj.harmonic, { maxTracks });
        this.index = 0;
        this._renderPlan();
        return this.plan;
    }

    start() {
        const flow = this.dj.flowMode;
        if (!flow || this.plan.length < 2) { this._say('Add at least two tracks, then build the set.'); return false; }
        if (!flow.enabled) flow.enable();
        this.running = true;
        this.index = 0;

        // DJ MixZ owns the queue while it plays: no auto-suggestions sneaking in.
        if (!this._orig) this._orig = { fill: flow._autoFillQueue.bind(flow), trigger: flow._triggerTransition.bind(flow), done: flow.onTransitionComplete.bind(flow) };
        flow._autoFillQueue = () => {};
        flow._triggerTransition = () => {
            const next = this.plan[this.index + 1];
            if (!next) { this._finish(); return; }
            this._applyMove(next.move);
            this._orig.trigger();
        };
        flow.onTransitionComplete = (direction) => {
            this._orig.done(direction);
            this.index += 1;
            this._armNext();
            this._renderPlan();
        };

        flow.queue = this.plan.slice(1).map((p) => p.track);
        flow.start(this.plan[0].track);
        this._armNext();
        this._renderPlan();
        this._say(`DJ MixZ is on. ${this.plan.length} tracks, ${MOODS.find((m) => m.id === this.mood)?.label} mood.`);
        document.getElementById('djmixz-open')?.classList.add('live');
        return true;
    }

    // Set FlowMode up for the next move: how long before the end to start, and how.
    _armNext() {
        const next = this.plan[this.index + 1];
        if (next) this._applyMove(next.move);
    }

    _applyMove(move) {
        const flow = this.dj.flowMode;
        if (!flow || !move) return;
        flow.transitionType = move.type;
        flow.transitionDuration = move.seconds;
        flow.transitionPointMode = 'fixed';
        // Start early enough that the move finishes a few seconds before the old track runs out.
        flow.transitionPoint = Math.round(move.seconds + (move.type === 'cut' ? 2 : 6));
    }

    stop() {
        const flow = this.dj.flowMode;
        if (flow && this._orig) { flow._autoFillQueue = this._orig.fill; flow._triggerTransition = this._orig.trigger; flow.onTransitionComplete = this._orig.done; }
        this.running = false;
        document.getElementById('djmixz-open')?.classList.remove('live');
        this._renderPlan();
    }

    _finish() {
        this._say('That was the set. DJ MixZ is off.');
        this.stop();
    }

    // ── Panel ──────────────────────────────────────────────────
    _buildUI() {
        if (typeof document === 'undefined' || document.getElementById('djmixz-panel')) return;
        const bar = document.querySelector('.top-bar');
        if (!bar) return;
        const open = document.createElement('button');
        open.id = 'djmixz-open';
        open.className = 'btn-toolbar djmixz-open';
        open.title = 'DJ MixZ plays your playlist as a full set';
        open.innerHTML = '<span class="djmixz-dot"></span>DJ MIXZ<span class="djmixz-pro">PRO</span>';
        const anchor = document.getElementById('flow-toggle-btn');
        if (anchor) anchor.insertAdjacentElement('beforebegin', open); else bar.appendChild(open);

        const panel = document.createElement('div');
        panel.id = 'djmixz-panel';
        panel.className = 'djmixz-panel hidden';
        panel.innerHTML = `
            <div class="djmixz-head">
                <div><div class="djmixz-title">DJ MixZ</div><div class="djmixz-sub">Hand it a playlist and a mood. It plans the set and mixes it.</div></div>
                <button class="btn-mini" id="djmixz-close" aria-label="Close">X</button>
            </div>
            <label class="djmixz-label" for="djmixz-source">Playlist</label>
            <select id="djmixz-source" class="toolbar-select djmixz-select">${this._sources().map((s) => `<option value="${s.id}">${s.label}</option>`).join('')}</select>
            <div class="djmixz-label">Mood</div>
            <div class="djmixz-moods">${MOODS.map((m) => `<button class="djmixz-mood${m.id === this.mood ? ' active' : ''}" data-mood="${m.id}"><b>${m.label}</b><span>${m.hint}</span></button>`).join('')}</div>
            <label class="djmixz-label" for="djmixz-length">Set length</label>
            <select id="djmixz-length" class="toolbar-select djmixz-select"><option value="30">30 minutes</option><option value="60" selected>1 hour</option><option value="90">90 minutes</option><option value="0">The whole playlist</option></select>
            <div class="djmixz-actions">
                <button class="djmixz-btn" id="djmixz-build">BUILD THE SET</button>
                <button class="djmixz-btn djmixz-go" id="djmixz-start" disabled>START</button>
                <button class="djmixz-btn" id="djmixz-stop" hidden>STOP</button>
            </div>
            <div class="djmixz-say" id="djmixz-say" aria-live="polite">Pick a playlist and a mood, then build the set.</div>
            <ol class="djmixz-plan" id="djmixz-plan"></ol>`;
        document.body.appendChild(panel);

        open.addEventListener('click', () => panel.classList.toggle('hidden'));
        panel.querySelector('#djmixz-close').addEventListener('click', () => panel.classList.add('hidden'));
        panel.querySelectorAll('.djmixz-mood').forEach((b) => b.addEventListener('click', () => {
            panel.querySelectorAll('.djmixz-mood').forEach((x) => x.classList.remove('active'));
            b.classList.add('active'); this.mood = b.dataset.mood;
        }));
        panel.querySelector('#djmixz-build').addEventListener('click', () => {
            const plan = this.build(panel.querySelector('#djmixz-source').value, this.mood, Number(panel.querySelector('#djmixz-length').value));
            panel.querySelector('#djmixz-start').disabled = plan.length < 2;
            this._say(plan.length < 2 ? 'That playlist has fewer than two playable tracks. Open a fuller tab in the library and build again.' : `Set built: ${plan.length} tracks. Read it through, then press START.`);
        });
        panel.querySelector('#djmixz-start').addEventListener('click', () => { if (this.start()) { panel.querySelector('#djmixz-stop').hidden = false; } });
        panel.querySelector('#djmixz-stop').addEventListener('click', () => { this.stop(); this.dj.flowMode?.disable(); panel.querySelector('#djmixz-stop').hidden = true; this._say('Stopped. The decks are yours.'); });
    }

    _say(text) { const el = typeof document !== 'undefined' && document.getElementById('djmixz-say'); if (el) el.textContent = text; }

    _renderPlan() {
        const el = typeof document !== 'undefined' && document.getElementById('djmixz-plan');
        if (!el) return;
        const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        el.innerHTML = this.plan.map((p, i) => {
            const state = this.running && i === this.index ? ' now' : this.running && i < this.index ? ' done' : '';
            const move = p.move ? `<div class="djmixz-move"><b>${p.move.type.replace('-', ' ')}</b>, ${p.move.bars} ${p.move.bars === 1 ? 'bar' : 'bars'}. ${esc(p.move.why)}.</div>` : '<div class="djmixz-move"><b>opens the set</b></div>';
            return `<li class="djmixz-row${state}">${move}<div class="djmixz-track"><span class="djmixz-energy" style="--e:${Math.round(p.energy * 100)}%"></span><span class="djmixz-name">${esc(p.track.title)}</span><span class="djmixz-meta">${esc(p.track.artist)}${p.track.bpm ? ' · ' + Math.round(p.track.bpm) + ' BPM' : ''}</span></div></li>`;
        }).join('');
    }
}
