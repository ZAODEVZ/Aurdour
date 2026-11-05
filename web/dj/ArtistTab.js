// ArtistTab.js — one artist's own page in the library
//
// Zaal, 18 Oct: "bro where are the jango songs", "please make its own page". Jango's songs come
// from his Audius page, Jango UU (read by ZaoCrate.loadJango, kept in lib.jangoTracks), plus any
// of his that the ZAO music source (MusicSource.js) carries. The tab reads Audius on first click.

export const ARTIST_TABS = [
    {
        id: 'jango', label: 'JANGO', artist: /jango/i, pool: 'jangoTracks', load: (dj) => dj.zaoCrate?.loadJango?.(),
        loading: "Fetching Jango UU's songs from Audius…",
        waiting: "Jango UU's songs did not load from Audius. Check the connection and open the tab again.",
    },
];

// The artist's songs: their own pool (Audius) first, then any in the library under their name,
// one copy of each.
export const tracksFor = (tracks, tab, pool = []) => {
    const seen = new Set();
    return [...(pool || []), ...(tracks || []).filter((t) => t && tab.artist.test(String(t.artist || '')))].filter((t) => {
        if (!t) return false;
        const k = `${t.source || ''}:${t.id ?? t.title}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
};

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

    _list(tab) {
        const lib = this.dj.library || {};
        return tracksFor(lib.tracks, tab, tab.pool ? lib[tab.pool] : []);
    }

    _count(tab) {
        // The library reads the music source a moment after start: count once it has.
        let tries = 0;
        const timer = setInterval(() => {
            const n = this._list(tab).length;
            const el = document.getElementById(`artist-tab-${tab.id}-count`);
            if (el) el.textContent = n ? ` ${n}` : '';
            if (n || ++tries > 30) clearInterval(timer);
        }, 1000);
    }

    async show(tab) {
        const lib = this.dj.library;
        if (!lib) return;
        document.querySelectorAll('.library-tab').forEach((t) => t.classList.remove('active'));
        document.getElementById(`artist-tab-${tab.id}`)?.classList.add('active');
        lib.activeTab = 'local';
        lib.currentPage = 1;
        lib.viewingPlaylist = null;
        let list = this._list(tab);
        // Not read yet: say so, read it, and show what came (unless another tab was opened meanwhile).
        if (!list.length && tab.load) {
            lib._renderError?.(tab.loading || tab.waiting);
            try { await tab.load(this.dj); } catch (e) { /* the empty page says so */ }
            if (!document.getElementById(`artist-tab-${tab.id}`)?.classList.contains('active')) return;
            list = this._list(tab);
            const el = document.getElementById(`artist-tab-${tab.id}-count`);
            if (el) el.textContent = list.length ? ` ${list.length}` : '';
        }
        lib.filteredTracks = list;
        if (!list.length) { lib._renderError?.(tab.waiting); this._card(tab); return; }
        lib._renderPaginatedTracks(list, 'local');
    }

    // An empty artist page looked broken (Zaal, 25 Oct call: "when I press Jango it still doesn't
    // do anything"): show a clear card in the list instead of one small grey line.
    _card(tab) {
        const td = this.dj.library?.tableBody?.querySelector('td');
        if (!td) return;
        td.textContent = '';
        const card = document.createElement('div');
        card.className = 'artist-wait-card';
        const h = document.createElement('div'); h.className = 'artist-wait-title'; h.textContent = `${tab.label}'s songs did not load`;
        const p = document.createElement('div'); p.className = 'artist-wait-text'; p.textContent = tab.waiting;
        card.append(h, p);
        td.appendChild(card);
    }
}
