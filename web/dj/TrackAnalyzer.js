// TrackAnalyzer.js — tempo and key for every song in the ZAO crate, found once and kept.
// SongChainn sends no tempo or key, so DJ MixZ could not tell a slow song from a fast one or a
// clash from a match. This walks the crate in the background, one song at a time, through the
// app's own detector (BpmDetector, which keeps every result in IndexedDB), and writes what it
// finds onto the songs, so planning uses it. A song is analyzed once, ever: after that its
// tempo and key come back from storage at start-up in a moment.
// Songs DJ MixZ is about to plan with (picked artists, a party set) jump the queue.

const PAUSE_MS = 1200;   // between songs, so the decks and the network keep the room
const BUSY_MS = 4000;    // wait while a deck is busy analyzing its own song
const ONAIR_MS = 10000;  // background songs wait while music plays: the stream keeps the bandwidth

export class TrackAnalyzer {
    constructor(dj) {
        this.dj = dj;
        this.queue = [];
        this.done = new Set();
        this.running = false;
        this.allowDownloads = false; // true would fetch every song to analyze it: off, it eats mobile data
        this.urgent = new Set(); // ids DJ MixZ is about to plan with: these run even on air
        this.onUpdate = null;  // (known, total) after each song
    }

    _tracks() {
        return (this.dj.library?.zaoTracks || []).filter((t) => t && t.streamUrl && t.id != null);
    }

    known() {
        const all = this._tracks();
        return { known: all.filter((t) => t.bpm && t.key).length, total: all.length };
    }

    // Put these songs at the front of the queue (DJ MixZ calls this before it plans).
    prioritize(tracks) {
        const ids = new Set((tracks || []).map((t) => t.id));
        const front = this._tracks().filter((t) => ids.has(t.id) && !(t.bpm && t.key) && !this.done.has(t.id));
        front.forEach((t) => this.urgent.add(t.id));
        this.queue = [...front, ...this.queue.filter((t) => !ids.has(t.id))];
        this.start();
    }

    // The crate reloads with fresh copies of its songs (every few minutes): put tempo and key back
    // on them. Songs already analyzed come back from storage at once.
    refresh() {
        this.done.clear();
        this.queue = [];
        this.start();
    }

    start() {
        if (!this.dj.bpmDetector) return;
        const have = new Set(this.queue.map((t) => t.id));
        for (const t of this._tracks()) if (!(t.bpm && t.key) && !this.done.has(t.id) && !have.has(t.id)) this.queue.push(t);
        if (!this.running && this.queue.length) { this.running = true; this._next(); }
    }

    async _next() {
        const t = this.queue.shift();
        if (!t) { this.running = false; return; }
        // A deck analyzing its own song shares the detector's worker: wait for it
        if (typeof document !== 'undefined' && document.querySelector('.analyzing')) {
            this.queue.unshift(t);
            setTimeout(() => this._next(), BUSY_MS);
            return;
        }
        // Never download a song just to measure it: data is precious. Only tempos and keys already in
        // storage are read back; a song gets measured when it is actually played on a deck.
        if (!this.allowDownloads && !(await this._isStored(t))) {
            this.done.add(t.id); this.urgent.delete(t.id);
            setTimeout(() => this._next(), 0);
            return;
        }
        let cached = false;
        try {
            const before = Date.now();
            const r = await this.dj.bpmDetector.analyze(t.streamUrl, `track:${t.id}`);
            cached = Date.now() - before < 150;
            this.apply(t.id, r);
        } catch (e) { /* a song that will not decode just stays unknown */ }
        this.done.add(t.id);
        this.urgent.delete(t.id);
        try { this.onUpdate?.(this.known()); } catch (e) { /* display only */ }
        setTimeout(() => this._next(), cached ? 0 : PAUSE_MS);
    }

    // Already analyzed once (in storage): free to read back any time, it costs no download
    async _isStored(t) {
        const d = this.dj.bpmDetector;
        if (d?._cache?.[`track:${t.id}`]) return true;
        try { return !!(await d?._getFromDB?.(`track:${t.id}`)); } catch (e) { return false; }
    }

    // Write a result onto every copy of the song the app holds, and teach DJ MixZ its tempo.
    apply(id, r) {
        if (!r) return;
        const bpm = r.bpm && r.bpm > 50 && r.bpm < 220 ? Math.round(r.bpm * 10) / 10 : null;
        for (const t of this._tracks()) {
            if (t.id !== id) continue;
            if (bpm && !t.bpm) t.bpm = bpm;
            if (r.key && !t.key) t.key = r.key;
        }
        const m = this.dj.djMixz;
        if (m && bpm && m._bpm && !m._bpm[id]) {
            m._bpm[id] = bpm;
            try { localStorage.setItem('mixz-bpm', JSON.stringify(m._bpm)); } catch (e) { /* no storage */ }
        }
    }
}
