// Licence.js — every track the decks play carries a licence, or the decks refuse it.
// Zaal, 16 Oct 2026: music can be hosted publicly as long as each track says who the
// artist is and what is allowed, so the artist has something to point to.
//
// A hosted track carries its own licence in its data json (and the manifest entry):
//   "licence": {
//     "artist": "IMan Afrikah",            who the music belongs to
//     "uses": { "stream": true, "dj": true, "radio": true, "commercial": false },
//     "terms": "https://...",               where the artist's grant is written down
//     "granted": "2026-10-15"               optional
//   }
// Tracks from a platform carry that platform's terms instead (SOURCE_LICENCES).
// A file the DJ drops from their own computer is theirs to play and is never hosted by ZAO.

export const USES = ['stream', 'dj', 'radio', 'commercial'];

// What playing on the decks means. A DJ set is mixed and streamed.
export const DECK_USES = ['stream', 'dj'];

export const SOURCE_LICENCES = {
    // Audius: the artist uploaded it for streaming through the Audius API, and Audius
    // counts and pays the stream. Not a licence to sell or monetise it.
    audius: {
        artist: '',
        holder: 'the artist, through Audius',
        uses: { stream: true, dj: true, radio: true, commercial: false },
        terms: 'https://audius.co/legal/terms-of-use',
    },
    // SongChainn: the artist uploaded it to songchainn.xyz to be streamed and played.
    songchainn: {
        artist: '',
        holder: 'the artist, through SongChainn',
        uses: { stream: true, dj: true, radio: true, commercial: false },
        terms: 'https://songchainn.xyz',
    },
};

// Artists who signed the ZAO play rights agreement (or wrote their own grant). Their songs
// carry it wherever they come from: their Audius page, SongChainn or the music source.
// Keyed by artist name and Audius handle, lowercased.
export const SIGNED = {
    'iman afrikah': {
        artist: 'IMan Afrikah',
        uses: { stream: true, dj: true, radio: true, commercial: false },
        terms: 'https://github.com/ZAODEVZ/iman-desk/blob/main/media/iman-afrikah-play-rights.md',
        granted: '2026-10-15',
    },
};
SIGNED.imanafrikah = SIGNED['iman afrikah'];

// The signed grant that covers a track: the artist is a signer, the Audius page is theirs,
// or a signer is named in the title. IMan's note covers EVERY song with his name on it
// (IMan, 16 Oct 2026): his own pages, SongChainn, the WaveWarZ Africa uploads and the
// collabs, e.g. "N3M3SIS x IMan Afrikah - TAKE OVER" on the WaveWarZ Africa page.
const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function signedFor(track = {}, artist = track.artist || track.metadata?.artist || '') {
    const title = squash(track.title || track.metadata?.title);
    const who = squash(artist);
    const page = squash(track.uploader);
    for (const [name, grant] of Object.entries(SIGNED)) {
        const n = squash(name);
        if (who.includes(n) || page === n || title.includes(n)) return grant;
    }
    return null;
}

// An Audius licence the artist chose that lets anyone play it: Creative Commons.
// "All rights reserved" or blank means we ask the artist.
export function audiusCreativeCommons(license) {
    const l = String(license || '');
    if (!/creative commons|^cc[\s-]/i.test(l)) return null;
    return {
        uses: { stream: true, dj: true, radio: true, commercial: !/non.?commercial|\bnc\b/i.test(l) },
        terms: 'https://creativecommons.org/licenses/',
        name: l,
    };
}

// Sources that are the DJ's own files on their own machine.
const OWN_FILE_SOURCES = new Set(['file', 'blob']);

const isUrl = (s) => /^https?:\/\/\S+$/.test(String(s || '').trim());

// A licence object, cleaned, or null if it is not a usable licence.
export function cleanLicence(l, artistFallback = '') {
    if (!l || typeof l !== 'object') return null;
    const artist = String(l.artist || artistFallback || '').trim();
    const uses = {};
    for (const u of USES) uses[u] = l.uses?.[u] === true;
    const terms = String(l.terms || '').trim();
    if (!artist && !l.holder) return null;
    if (!isUrl(terms)) return null;
    if (!USES.some((u) => uses[u])) return null;
    return { artist, holder: l.holder || artist, uses, terms, granted: l.granted || null };
}

// The licence that covers a track, or null.
// track: a library/manifest entry, a data json's metadata, or a loadDirect meta.
export function licenceOf(track = {}) {
    const artist = track.artist || track.metadata?.artist || '';
    const own = cleanLicence(track.licence || track.metadata?.licence, artist);
    if (own) return own;
    const signed = signedFor(track, artist);
    if (signed) return cleanLicence(signed, artist);
    const src = String(track.source || track._source || '').toLowerCase();
    const cc = src === 'audius' ? audiusCreativeCommons(track.audiusLicense) : null;
    if (cc) return { artist, holder: `${artist || 'the artist'}, ${cc.name}`, uses: cc.uses, terms: cc.terms, granted: null };
    if (SOURCE_LICENCES[src]) return { ...SOURCE_LICENCES[src], artist };
    return null;
}

// Can the decks play this track? { ok, licence, reason }
export function canPlay(track = {}, uses = DECK_USES) {
    const src = String(track.source || track._source || '').toLowerCase();
    if (OWN_FILE_SOURCES.has(src)) return { ok: true, licence: null, reason: 'your own file' };
    const licence = licenceOf(track);
    const title = track.title || track.metadata?.title || 'this track';
    if (!licence) return { ok: false, licence: null, reason: `No licence on "${title}", so the decks will not play it.` };
    const missing = uses.filter((u) => !licence.uses[u]);
    if (missing.length) return { ok: false, licence, reason: `"${title}" is not licensed for ${missing.join(' or ')}.` };
    return { ok: true, licence, reason: '' };
}

// One line for the deck: who it belongs to and what the licence allows.
export function licenceLine(licence) {
    if (!licence) return '';
    const allowed = USES.filter((u) => licence.uses[u]).join(', ');
    return `${licence.holder || licence.artist}: ${allowed}`;
}
