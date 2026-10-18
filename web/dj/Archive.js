// Archive.js — the screen keeps only what is needed right now
//
// Zaal, 18 Oct: "wayyyyyy to many inputs", "we need to archive everything and test one by one",
// "put those all to one file for later". Everything below is hidden, not deleted: the code still
// runs, so bringing one back is taking its line out of ARCHIVED. ARCHIVE.md at the repo root
// lists the same things in plain words.
//
// Open the app with ?all=1 to see everything again for a test.

export const ARCHIVED = [
    // Top bar
    { sel: '#flow-toggle-btn', what: 'AUTO MIX', why: 'DJ MIXZ does the same and more' },
    { sel: '#travel-mode-btn', what: 'TRAVEL', why: 'phone use goes through PHONE now' },
    { sel: '#four-deck-toggle', what: '4 DECK', why: 'decks C and D were never finished' },
    { sel: '#install-btn', what: 'INSTALL', why: 'not needed to mix' },
    { sel: '#test-open', what: 'TEST', why: 'FEEDBACK covers it' },
    { sel: '#move-open', what: 'TRY A MOVE', why: 'lessons, later' },
    { sel: '#zm-btn', what: 'ZM', why: 'community link, lives on the feedback page' },
    // Over the library
    { sel: '#switch-pad', what: 'NEXT TRACK switch pad (8 picks)', why: 'pushed the library off the screen' },
    // Library tabs that are empty or not connected
    { sel: '.library-tab[data-tab="liked"]', what: 'LIKED tab', why: 'empty for everyone so far' },
    { sel: '.library-tab[data-tab="playlists"]', what: 'PLAYLISTS tab', why: 'empty for everyone so far' },
    { sel: '.library-tab[data-tab="soundcloud"]', what: 'SOUNDCLOUD tab', why: 'no SoundCloud key, it never loaded' },
    { sel: '.library-tab[data-tab="spotify"]', what: 'SPOTIFY tab', why: 'Spotify only gives 30 second previews' },
    // PRO toolbar extras
    { sel: '#viz-toggle', what: 'VIZ', why: 'visualizer, not needed to mix' },
    { sel: '#viz-mode', what: 'BARS', why: 'visualizer style' },
    { sel: '#rgb-toggle', what: 'RGB', why: 'waveform colours' },
    { sel: '#suggest-toggle', what: 'SUGGEST', why: 'DJ MIXZ picks the next song' },
    { sel: '#plugins-btn', what: 'PLUGINS', why: 'no plugins exist' },
    { sel: '#stream-chat-toggle', what: 'CHAT', why: 'stream chat panel, not wired to a stream' },
    { sel: '#obs-setup-btn', what: 'OBS', why: 'OBS overlay setup, for ZAO Stream later' },
    { sel: '#midi-learn', what: 'LEARN', why: 'the DDJ-SB3 map is built in' },
    { sel: '#quantize-toggle', what: 'QTZ', why: 'beat grid quantize' },
    { sel: '#bpm-tap-reset', what: 'RST', why: 'tap tempo reset' },
];

export const showAll = (search) => /[?&]all=1\b/.test(search || '');

export function archiveCss(list = ARCHIVED) {
    return `${list.map((a) => a.sel).join(',\n')} { display: none !important; }`;
}

export class Archive {
    constructor(dj) {
        this.dj = dj;
        if (typeof document === 'undefined' || showAll(location.search)) return;
        const style = document.createElement('style');
        style.id = 'mixz-archive';
        style.textContent = archiveCss();
        document.head.appendChild(style);
        this._openZaoFirst();
    }

    // LOCAL is empty now that no music ships with the app, so open on the ZAO music instead,
    // unless the person has already picked a tab.
    _openZaoFirst() {
        let tries = 0;
        const timer = setInterval(() => {
            tries += 1;
            const lib = this.dj.library, crate = this.dj.zaoCrate;
            if (!lib || !crate || tries > 60 || lib.activeTab !== 'local') { clearInterval(timer); return; }
            if ((lib.tracks || []).length) { clearInterval(timer); return; }
            if (crate.tracks?.length) { clearInterval(timer); crate.show(true); }
        }, 500);
    }
}
