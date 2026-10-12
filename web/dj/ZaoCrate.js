// ZaoCrate.js — the ZAO crate: music from ZAO artists, pulled from their Audius pages,
// always in the pool the next-track switches pick from, and one click away in the library.
// To add an artist, add their Audius handle to CRATE_HANDLES.

export const CRATE_HANDLES = ['IManAfrikah', 'WaveWarzAfrica'];

// SongChainn artists in the crate. Add a name to bring in another artist's songs.
export const SONGCHAINN_ARTISTS = ['IMan Afrikah'];

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
        this._buildTab();
        this.load();
    }

    async load() {
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
            if (this.dj.songchainn) all.push(...(await this.dj.songchainn.byArtists(SONGCHAINN_ARTISTS)));
        } catch (e) {
            console.warn('[ZaoCrate] could not load SongChainn:', e.message);
        }
        const seen = new Set();
        const titles = new Set();
        const nameOf = (t) => squash(t.title).replace(/^imanafrikah/, '');
        this.tracks = all.filter((t) => {
            if (seen.has(t.id) || titles.has(nameOf(t))) return false;
            seen.add(t.id); titles.add(nameOf(t));
            return true;
        }).map(applySheet);
        lib.zaoTracks = this.tracks; // the switch pad reads this
        const count = document.getElementById('zao-crate-count');
        if (count) count.textContent = this.tracks.length ? ` ${this.tracks.length}` : '';
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
    show() {
        const lib = this.dj.library;
        if (!lib) return;
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
