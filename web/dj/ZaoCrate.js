// ZaoCrate.js — the ZAO crate: music from ZAO artists, pulled from their Audius pages,
// always in the pool the next-track switches pick from, and one click away in the library.
// To add an artist, add their Audius handle to CRATE_HANDLES.

export const CRATE_HANDLES = ['IManAfrikah', 'WaveWarzAfrica'];

// SongChainn artists in the crate. '*' is every artist on SongChainn, so whatever anyone uploads
// there turns up here. To limit it, list names instead: ['IMan Afrikah', 'N3M3SIS'].
export const SONGCHAINN_ARTISTS = '*';

// How often the crate looks for new uploads while the app is open.
const REFRESH_MS = 5 * 60 * 1000;

// Tempo and key as the artist measured them (IMan Afrikah's song sheet for DJ Zaal, Oct 2026).
// These win over what Audius guesses. Matched on the title with spaces and punctuation removed;
// the longer names come first so "North-East vol 1" is not read as "East vol 1".
export const SHEET = [
    ['northeastvol1', 102, 'F minor'],
    ['northeastvol2', 100, 'F major'],
    ['northeastvol3', 102, 'F minor'],
    ['southeastvol1', 103, 'F major'],
    ['mideastvol1', 99.9, 'D major'],
    ['northvol1', 101.6, 'F major'],
    ['eastvol1', 100, 'F major'],
    ['eastvol2', 101, 'F major'],
    ['eastvol3', 102, 'F minor'],
    ['zaofreestyle', 105.7, 'Eb minor'],
    ['ohnahji', 81, 'C# major'],
    ['cocsong', 160.3, 'A# minor'],
    ['farcastersong', 155, 'A# minor'],
    ['bcz', 155.6, 'C major'],
    ['bettercallzaal', 155.6, 'C major'], // the BCZ song, under its full title on Audius
];

const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Returns the track with the sheet's tempo and key when its title is on the sheet.
export function applySheet(track) {
    const t = squash(track.title);
    const row = SHEET.find(([name]) => t.includes(name));
    if (!row) return track;
    return { ...track, bpm: row[1], key: row[2], fromSheet: true };
}

export class ZaoCrate {
    constructor(dj) {
        this.dj = dj;
        this.tracks = [];
        this._known = null;      // ids seen so far, to spot new uploads
        this._watchCovers();
        if (typeof window !== 'undefined') setInterval(() => this.load(true), REFRESH_MS);
        this._buildTab();
        this.load();
    }

    // Cover art on the deck: the deck's letter badge wears the cover of the track loaded on it,
    // so a song looks in MixZ the way it does on SongChainn or Audius.
    _watchCovers() {
        if (typeof document === 'undefined') return;
        const shown = {};
        setInterval(() => {
            for (const id of ['A', 'B']) {
                const art = this.dj.decks?.[id]?.metadata?.metadata?.artwork || '';
                if (shown[id] === art) continue;
                shown[id] = art;
                const badge = document.querySelector(`#deck-${id.toLowerCase()} .deck-label`);
                if (!badge) continue;
                badge.classList.toggle('has-cover', !!art);
                badge.style.backgroundImage = art ? `url("${String(art).replace(/"/g, '%22')}")` : '';
            }
        }, 700);
    }

    // fresh = true skips the five minute memory and reads SongChainn again.
    async load(fresh = false) {
        if (this._loading) return;
        this._loading = true;
        try { await this._load(fresh); } finally { this._loading = false; }
    }

    async _load(fresh) {
        const audius = this.dj.audius;
        const lib = this.dj.library;
        if (!audius || !audius.getUserTracks || !lib) return;
        const all = [];
        for (const handle of CRATE_HANDLES) {
            try {
                all.push(...(await audius.getUserTracks(handle)));
            } catch (e) {
                console.warn(`[ZaoCrate] could not load ${handle}:`, e.message);
            }
        }
        // SongChainn: the same artists' songs from songchainn.xyz. A song already found on Audius
        // keeps its Audius copy, which comes with a tempo and key.
        try {
            if (this.dj.songchainn) all.push(...(await this.dj.songchainn.byArtists(SONGCHAINN_ARTISTS, fresh)));
        } catch (e) {
            console.warn('[ZaoCrate] could not load SongChainn:', e.message);
        }
        // The same song can be on Audius and on SongChainn, sometimes titled "Artist - Song" and
        // posted from another account. One copy stays: same artist and same song name.
        const songKey = (t) => {
            const parts = String(t.title || '').split(' - ');
            const artist = parts.length > 1 ? parts[0] : t.artist;
            const title = parts.length > 1 ? parts.slice(1).join(' - ') : t.title;
            return squash(artist) + '|' + squash(title).replace(/tagged$/, '');
        };
        const seen = new Set();
        const songs = new Set();
        const next = all.filter((t) => {
            const k = songKey(t);
            if (seen.has(t.id) || songs.has(k)) return false;
            seen.add(t.id); songs.add(k);
            return true;
        }).map(applySheet);
        if (!next.length && this.tracks.length) return; // a failed read never empties the crate
        this.tracks = next;
        // New since the last look: say so, and keep the list on screen current
        const ids = new Set(this.tracks.map((t) => t.id));
        const added = this._known ? this.tracks.filter((t) => !this._known.has(t.id)) : [];
        this._known = ids;
        this.newest = added;
        if (added.length && document.getElementById('zao-crate-tab')?.classList.contains('active')) this.show(true);
        lib.zaoTracks = this.tracks; // the switch pad reads this
        const count = document.getElementById('zao-crate-count');
        if (count) count.textContent = this.tracks.length ? ` ${this.tracks.length}` : '';
        const tab = document.getElementById('zao-crate-tab');
        if (tab) { tab.classList.toggle('has-new', added.length > 0); if (added.length) tab.title = `${added.length} new: ${added.slice(0, 3).map((t) => t.title).join(', ')}`; }
    }

    _buildTab() {
        if (typeof document === 'undefined') return;
        const tabs = document.querySelector('.library-tabs');
        if (!tabs || document.getElementById('zao-crate-tab')) return;
        const btn = document.createElement('button');
        btn.id = 'zao-crate-tab';
        btn.className = 'library-tab zao-crate-tab';
        btn.title = 'Music from ZAO artists';
        btn.innerHTML = 'ZAO<span id="zao-crate-count"></span>';
        tabs.appendChild(btn);
        btn.addEventListener('click', () => this.show());
    }

    // Show the crate in the library table. It rides on the Audius view, since that is what the tracks are.
    show(quiet = false) {
        const lib = this.dj.library;
        if (!lib) return;
        if (!quiet) { document.getElementById('zao-crate-tab')?.classList.remove('has-new'); this.load(true); } // opening the tab checks for new uploads
        document.querySelectorAll('.library-tab').forEach((t) => t.classList.remove('active'));
        document.getElementById('zao-crate-tab')?.classList.add('active');
        lib.activeTab = 'audius';
        lib.currentPage = 1;
        lib.viewingPlaylist = null;
        lib.audiusTracks = this.tracks;
        if (!this.tracks.length) { lib._renderError?.('The ZAO crate is empty right now. Check the connection and open it again.'); this.load(); return; }
        lib._renderPaginatedTracks(this.tracks, 'audius');
    }
}
