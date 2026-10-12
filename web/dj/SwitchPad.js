// SwitchPad.js — one-tap "what do I play next" buttons.
// Each button picks the best next track for a kind of switch (same vibe, energy up,
// energy down, key lift, mood flip, genre switch, half/double time, surprise) from
// whatever is in the library, and loads it on the deck that is not playing.
// Tap the same button again for the next-best pick.
// The same eight actions sit on the controller's pads in Pad Scratch mode (notes 0x20–0x27).

export const SWITCH_MODES = [
    { id: 'smooth', label: 'SAME VIBE',   hint: 'closest tempo and key' },
    { id: 'up',     label: 'ENERGY UP',   hint: 'a bit faster' },
    { id: 'down',   label: 'COOL DOWN',   hint: 'a bit slower' },
    { id: 'key',    label: 'KEY LIFT',    hint: 'new key that still fits' },
    { id: 'mood',   label: 'MOOD FLIP',   hint: 'minor to major, or back' },
    { id: 'genre',  label: 'NEW GENRE',   hint: 'different style, same pace' },
    { id: 'double', label: 'HALF / 2X',   hint: 'half or double time' },
    { id: 'wild',   label: 'SURPRISE',    hint: 'a good one you did not expect' },
];

const idOf = (t) => String(t.id ?? t.sourceId ?? `${t.title}|${t.artist}`);
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : null; };
const genreOf = (t) => String(t.genre || '').trim().toLowerCase();

// Camelot helpers. `harmonic` is the app's HarmonicMixer (getCamelot).
function camelot(harmonic, key) {
    const code = harmonic && key ? harmonic.getCamelot(key) : null;
    if (!code) return null;
    return { n: parseInt(code, 10), l: code.slice(-1), code };
}
const wheelStep = (a, b) => ((b.n - a.n + 12) % 12); // 0..11, clockwise steps from a to b

// How two keys relate, from the current track's point of view.
export function keyRelation(harmonic, curKey, candKey) {
    const a = camelot(harmonic, curKey);
    const b = camelot(harmonic, candKey);
    if (!a || !b) return 'unknown';
    const step = wheelStep(a, b);
    if (a.l === b.l) {
        if (step === 0) return 'same';
        if (step === 1) return 'up1';      // classic energy lift
        if (step === 11) return 'down1';
        if (step === 2) return 'up2';      // bigger lift, still musical
        return 'clash';
    }
    if (step === 0) return 'flip';         // relative major/minor: same notes, other mood
    return 'clash';
}

// Score one candidate for one mode. Returns null when it does not fit the mode at all.
export function scoreFor(mode, cur, cand, harmonic) {
    const cb = num(cur.bpm);
    const nb = num(cand.bpm);
    const ratio = cb && nb ? nb / cb : null;
    const pct = ratio ? (ratio - 1) * 100 : null;
    const rel = keyRelation(harmonic, cur.key, cand.key);
    const sameGenre = genreOf(cur) && genreOf(cur) === genreOf(cand);
    const fits = rel === 'same' || rel === 'up1' || rel === 'down1' || rel === 'flip';
    const why = [];
    let score = 0;

    const tempoNote = () => { if (pct !== null) why.push(`${Math.round(nb)} BPM (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`); };
    const keyNote = () => { const c = camelot(harmonic, cand.key); if (c) why.push(`key ${c.code}`); };
    const near = (limit) => (pct === null ? 0 : Math.max(0, 1 - Math.abs(pct) / limit));

    switch (mode) {
        case 'smooth':
            if (pct !== null && Math.abs(pct) > 6) return null;
            if (rel === 'clash') return null;
            score = 40 * near(6) + (rel === 'same' ? 35 : fits ? 28 : 0) + (sameGenre ? 15 : 0);
            break;
        case 'up':
            if (pct === null || pct < 1.5 || pct > 12) return null;
            score = 45 * (1 - Math.abs(pct - 5) / 7) + (rel === 'up1' ? 30 : rel === 'up2' ? 22 : fits ? 18 : rel === 'unknown' ? 5 : 0) + (sameGenre ? 10 : 0);
            break;
        case 'down':
            if (pct === null || pct > -1.5 || pct < -12) return null;
            score = 45 * (1 - Math.abs(pct + 5) / 7) + (rel === 'down1' ? 30 : fits ? 20 : rel === 'unknown' ? 5 : 0) + (sameGenre ? 10 : 0);
            break;
        case 'key':
            if (rel !== 'up1' && rel !== 'up2' && rel !== 'down1') return null;
            if (pct !== null && Math.abs(pct) > 6) return null;
            score = (rel === 'up1' ? 45 : rel === 'up2' ? 35 : 28) + 35 * near(6) + (sameGenre ? 10 : 0);
            break;
        case 'mood':
            if (rel !== 'flip') return null;
            if (pct !== null && Math.abs(pct) > 8) return null;
            score = 50 + 35 * near(8) + (sameGenre ? 8 : 0);
            break;
        case 'genre':
            if (!genreOf(cand) || !genreOf(cur) || sameGenre) return null;
            if (pct !== null && Math.abs(pct) > 8 && !(ratio > 1.9 && ratio < 2.1) && !(ratio > 0.47 && ratio < 0.53)) return null;
            score = 30 + 35 * near(8) + (fits ? 25 : rel === 'unknown' ? 8 : 0);
            why.push(cand.genre);
            break;
        case 'double':
            if (!ratio) return null;
            if (!((ratio > 1.9 && ratio < 2.1) || (ratio > 0.47 && ratio < 0.53))) return null;
            score = 50 + (fits ? 30 : rel === 'unknown' ? 8 : 0) + (sameGenre ? 5 : 0);
            why.push(ratio > 1 ? 'double time' : 'half time');
            break;
        case 'wild':
            // Anything that will not sound wrong: tempo in reach, key not clashing.
            if (pct !== null && Math.abs(pct) > 10) return null;
            if (rel === 'clash') return null;
            score = 20 + (sameGenre ? 0 : 15) + (fits ? 15 : 0);
            break;
        default:
            return null;
    }
    tempoNote();
    keyNote();
    if (rel === 'clash') why.push('keys clash, cut it in quick');
    if (mode !== 'genre' && sameGenre && cand.genre) why.push(cand.genre);
    return { score, why };
}

// Ranked picks for a mode. `exclude` is a Set of track ids already played or loaded.
export function rankFor(mode, cur, pool, harmonic, exclude = new Set()) {
    if (!cur) return [];
    const me = idOf(cur);
    const seen = new Set();
    const out = [];
    for (const cand of pool || []) {
        if (!cand) continue;
        const id = idOf(cand);
        if (id === me || exclude.has(id) || seen.has(id)) continue;
        seen.add(id);
        const s = scoreFor(mode, cur, cand, harmonic);
        if (s) out.push({ track: cand, score: s.score, why: s.why });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
}

export class SwitchPad {
    constructor(dj) {
        this.dj = dj;
        this.played = new Set();      // ids loaded through the pad this session
        this.cursor = {};             // mode -> index into the ranked list, for "tap again"
        this.cursorFor = null;        // id of the track the cursors belong to
        this.autoMatch = true;        // match the new deck's tempo to the playing one
        this._buildUI();
    }

    // The deck the crowd is hearing, and the one that is free.
    _decks() {
        const d = this.dj.decks || {};
        const a = d.A, b = d.B;
        if (!a || !b) return null;
        let cur = a.isPlaying && !b.isPlaying ? a : b.isPlaying && !a.isPlaying ? b : null;
        if (!cur && a.isPlaying && b.isPlaying) {
            // Both playing: the louder side of the crossfader is "current".
            const xf = parseFloat(document.getElementById('crossfader')?.value ?? '50');
            cur = xf > 50 ? b : a;
        }
        if (!cur) cur = a.metadata ? a : b.metadata ? b : null;
        if (!cur) return null;
        return { cur, next: cur === a ? b : a };
    }

    _current(deck) {
        const m = deck.metadata?.metadata || {};
        return {
            id: m.id ?? deck.metadata?.id, title: m.title, artist: m.artist,
            bpm: m.bpm || (deck.getBPM ? deck.getBPM() : null), key: m.key, genre: m.genre,
        };
    }

    _pool() {
        const lib = this.dj.library;
        if (!lib) return [];
        return [...(lib.tracks || []), ...(lib.audiusTracks || []), ...(lib.soundcloudTracks || [])];
    }

    // Tap a button (or a pad). Returns the pick, or null with a message shown.
    trigger(modeOrIndex) {
        const mode = typeof modeOrIndex === 'number' ? SWITCH_MODES[modeOrIndex]?.id : modeOrIndex;
        const def = SWITCH_MODES.find((m) => m.id === mode);
        if (!def) return null;
        const decks = this._decks();
        if (!decks) { this._say('Load and play a track first, then tap a switch.'); return null; }
        const cur = this._current(decks.cur);
        const curId = idOf(cur);
        if (this.cursorFor !== curId) { this.cursor = {}; this.cursorFor = curId; }

        const ranked = rankFor(mode, cur, this._pool(), this.dj.harmonic, this.played);
        if (!ranked.length) {
            const missing = !num(cur.bpm) && !cur.key ? ' This track has no tempo or key yet.' : '';
            this._say(`${def.label}: nothing in the library fits.${missing} Search or browse more music to widen the pool.`);
            this._flash(mode, false);
            return null;
        }
        let i = this.cursor[mode] ?? 0;
        if (mode === 'wild' && this.cursor[mode] === undefined) i = Math.floor(Math.random() * Math.min(ranked.length, 8));
        const pick = ranked[i % ranked.length];
        this.cursor[mode] = (i + 1) % ranked.length;

        this.dj.library.loadToDeck(pick.track, decks.next.id);
        this.played.add(idOf(pick.track));
        const more = ranked.length > 1 ? ` Tap again for another (${ranked.length} fit).` : '';
        this._say(`${def.label}: ${pick.track.title || 'Unknown'}${pick.track.artist ? ', ' + pick.track.artist : ''} on Deck ${decks.next.id}. ${pick.why.join(', ')}.${more}`);
        this._flash(mode, true);

        // Tempo match, so the blend is ready. Not for the tempo switches: there the new speed is the point.
        if (this.autoMatch && mode !== 'up' && mode !== 'down' && mode !== 'double') this._matchWhenReady(decks.next, decks.cur);
        return pick;
    }

    _matchWhenReady(next, cur) {
        let tries = 0;
        const t = setInterval(() => {
            tries += 1;
            const target = cur.getBPM ? cur.getBPM() : null;
            const ready = next.getBPM ? next.getBPM() : null;
            if (target && ready && next.syncTo) { next.syncTo(target); clearInterval(t); }
            else if (tries > 40) clearInterval(t);
        }, 250);
    }

    _buildUI() {
        if (typeof document === 'undefined') return;
        const anchor = document.querySelector('.crossfader-section');
        if (!anchor || document.getElementById('switch-pad')) return;
        const bar = document.createElement('div');
        bar.id = 'switch-pad';
        bar.className = 'switch-pad';
        bar.innerHTML = `
            <div class="switch-pad-head">
                <span class="switch-pad-title">NEXT TRACK</span>
                <label class="switch-pad-auto"><input type="checkbox" id="switch-pad-auto" checked> match tempo</label>
            </div>
            <div class="switch-pad-grid">
                ${SWITCH_MODES.map((m, i) => `<button class="switch-btn" id="switch-btn-${m.id}" data-mode="${m.id}" title="${m.hint}. Pad ${i + 1} in Pad Scratch mode."><span class="switch-btn-n">${i + 1}</span><span class="switch-btn-label">${m.label}</span><span class="switch-btn-hint">${m.hint}</span></button>`).join('')}
            </div>
            <div class="switch-pad-say" id="switch-pad-say" aria-live="polite">Play a track, then tap a switch. It loads the best next track on the other deck.</div>`;
        anchor.insertAdjacentElement('afterend', bar);
        bar.querySelectorAll('.switch-btn').forEach((b) => b.addEventListener('click', () => this.trigger(b.dataset.mode)));
        bar.querySelector('#switch-pad-auto').addEventListener('change', (e) => { this.autoMatch = e.target.checked; });
    }

    _say(text) {
        const el = typeof document !== 'undefined' && document.getElementById('switch-pad-say');
        if (el) el.textContent = text;
    }

    _flash(mode, ok) {
        const b = typeof document !== 'undefined' && document.getElementById(`switch-btn-${mode}`);
        if (!b) return;
        b.classList.add(ok ? 'hit' : 'miss');
        setTimeout(() => b.classList.remove('hit', 'miss'), 700);
    }
}
