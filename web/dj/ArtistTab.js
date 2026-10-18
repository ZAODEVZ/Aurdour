// ArtistTab.js — one artist's own page in the library
//
// Zaal, 18 Oct: "bro where are the jango songs", "please make its own page". Jango's songs come
// from the ZAO music source (MusicSource.js), never from this repo, and only once his signed
// play-rights licence is in, so the tab is there now and fills itself when they land.

export const ARTIST_TABS = [
    { id: 'jango', label: 'JANGO', artist: /jango/i, waiting: "Jango's songs are not in yet. They come in once his signed play rights and the ZAO music host are set." },
];

export const tracksFor = (tracks, tab) => (tracks || []).filter((t) => tab.artist.test(String(t.artist || '')));

export class ArtistTab {
    constructor(dj, tabs = ARTIST_TABS) {
        this.dj = dj;
        if (typeof document === 'undefined') return;
        const bar = document.querySelector('.library-tabs');
        if (!bar) return;
        for (const tab of tabs) {
            if (document.getElementById(`artist-tab-${tab.id}`)) continue;
            const btn = document.createElement('button');
            btn.id = `artist-tab-${tab.id}`;
            btn.className = 'library-tab artist-tab';
            btn.title = `${tab.label}: every song, nothing else`;
            btn.innerHTML = `${tab.label}<span id="artist-tab-${tab.id}-count"></span>`;
            bar.appendChild(btn);
            btn.addEventListener('click', () => this.show(tab));
            this._count(tab);
        }
    }

    _count(tab) {
        // The library reads the music source a moment after start: count once it has.
        let tries = 0;
        const timer = setInterval(() => {
            const n = tracksFor(this.dj.library?.tracks, tab).length;
            const el = document.getElementById(`artist-tab-${tab.id}-count`);
            if (el) el.textContent = n ? ` ${n}` : '';
            if (n || ++tries > 30) clearInterval(timer);
        }, 1000);
    }

    show(tab) {
        const lib = this.dj.library;
        if (!lib) return;
        document.querySelectorAll('.library-tab').forEach((t) => t.classList.remove('active'));
        document.getElementById(`artist-tab-${tab.id}`)?.classList.add('active');
        lib.activeTab = 'local';
        lib.currentPage = 1;
        lib.viewingPlaylist = null;
        const list = tracksFor(lib.tracks, tab);
        lib.filteredTracks = list;
        if (!list.length) { lib._renderError?.(tab.waiting); return; }
        lib._renderPaginatedTracks(list, 'local');
    }
}
