// SongLink.js — a song link dropped in stream chat, read strictly.
//
// Zaal, 5 Nov 2026: "Can we make it easier for me to pull in songs from anywhere / ppl to
// suggest songs? So if someone puts a link in chat..." A "!sr <link>" in Twitch or YouTube chat
// comes here, and only here: ChatFilter still keeps every link out of the chat text the
// stream shows. Two kinds of link mean something:
//   - an Audius track page (audius.co/<artist>/<song>) or a SongChainn song page: the desk looks
//     up that exact track, and it goes on the request line to wait for PLAY NEXT like any other.
//   - a song on another site (YouTube, Spotify, SoundCloud and the rest): MixZ cannot play those
//     under a licence, so it stays a suggestion for the DJ to look at, never a song on the decks.
// Anything else is refused: https only, the hosts below only, one link and nothing around it.
//
// Pure: see SongLink.test.mjs.

import { looksLikeLink } from './ChatFilter.js';

export const LINK_MAX = 300;

// Hosts whose song pages MixZ can play, exactly as written (no other subdomain).
export const PLAY_HOSTS = {
    'audius.co': 'audius', 'www.audius.co': 'audius',
    'songchainn.xyz': 'songchainn', 'www.songchainn.xyz': 'songchainn',
};

// Hosts kept as suggestions, with the name the desk shows. Bandcamp pages are
// <artist>.bandcamp.com, read below.
export const SUGGEST_HOSTS = {
    'youtube.com': 'YouTube', 'www.youtube.com': 'YouTube', 'm.youtube.com': 'YouTube', 'youtu.be': 'YouTube',
    'music.youtube.com': 'YouTube Music',
    'open.spotify.com': 'Spotify',
    'soundcloud.com': 'SoundCloud', 'www.soundcloud.com': 'SoundCloud', 'm.soundcloud.com': 'SoundCloud', 'on.soundcloud.com': 'SoundCloud',
    'music.apple.com': 'Apple Music',
    'tidal.com': 'TIDAL', 'listen.tidal.com': 'TIDAL',
    'deezer.com': 'Deezer', 'www.deezer.com': 'Deezer',
};
const BANDCAMP = /^[a-z0-9-]{1,63}\.bandcamp\.com$/;

// Audius pages that are not one track: the site's own pages, and an artist's tabs.
const AUDIUS_NOT_ARTIST = new Set(['search', 'trending', 'explore', 'feed', 'settings', 'library', 'upload', 'messages',
    'notifications', 'signin', 'signup', 'signon', 'legal', 'app', 'apps', 'download', 'dashboard', 'rewards', 'audio', 'oauth', 'api']);
const AUDIUS_NOT_TRACK = new Set(['tracks', 'albums', 'playlists', 'reposts', 'collectibles', 'supporting', 'followers',
    'following', 'mutuals', 'playlist', 'album', 'collection', 'remixes']);
// SongChainn pages that are the site's own, not an artist (their router, 5 Nov 2026).
const SONGCHAINN_NOT_ARTIST = new Set(['about', 'admin', 'api', 'artist', 'artists', 'assets', 'audience', 'auth', 'bettercallzaal',
    'catalog', 'claim', 'community', 'console', 'day-ones', 'delete-account', 'discover', 'dj-shuffle', 'drops', 'guidelines',
    'inbox', 'install', 'keys', 'launch', 'leaderboard', 'license', 'marketplace', 'not-found', 'playlist', 'playlists',
    'post', 'privacy', 'profile', 'reset-password', 'room', 'social', 'song', 'studio', 'terms', 'w', 'wallet',
    'wavewarz-africa', 'world-builder', 'world', 'worlds']);

const HANDLE = /^[A-Za-z0-9_.-]{1,40}$/;
const SLUG = /^[A-Za-z0-9_.~%-]{1,150}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// SongChainn's own slug: lowercase, accents dropped, anything else a dash.
export const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const refuse = (reason) => ({ kind: 'refused', reason });

// What a "!sr" text is:
//   null                                   no link in it: a song name, matched as before
//   { kind: 'refused', reason }            a link MixZ does not take
//   { kind: 'audius', handle, slug, url }  one Audius track page
//   { kind: 'songchainn', id } or { kind: 'songchainn', artist, song }  one SongChainn song page
//   { kind: 'suggest', site, host, title, key }  a song on another site, for the DJ to look at
export function parseSongLink(raw) {
    const text = String(raw ?? '').trim();
    if (!looksLikeLink(text.normalize('NFKC'))) return null;
    // One link, plain letters only: no spaces, no hidden or lookalike characters, no backslash
    if (text.length > LINK_MAX || !/^[\x21-\x7e]+$/.test(text) || text.includes('\\')) return refuse('one link, nothing else');
    if (!/^https:\/\//i.test(text)) return refuse('https links only');
    let u;
    try { u = new URL(text); } catch (e) { return refuse('not a link'); }
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return refuse('https links only');
    const host = u.hostname.toLowerCase();
    let parts;
    try { parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent); } catch (e) { return refuse('not a link'); }
    const play = PLAY_HOSTS[host];
    if (play === 'audius') {
        const [handle, song] = parts;
        if (parts.length !== 2 || !HANDLE.test(handle) || !SLUG.test(song) || AUDIUS_NOT_ARTIST.has(handle.toLowerCase()) || AUDIUS_NOT_TRACK.has(song.toLowerCase())) {
            return refuse('not an Audius track link');
        }
        return { kind: 'audius', handle, slug: song, url: `https://audius.co/${handle}/${song}` };
    }
    if (play === 'songchainn') {
        if (parts.length === 2 && parts[0] === 'song' && UUID.test(parts[1].toLowerCase())) return { kind: 'songchainn', id: parts[1].toLowerCase() };
        const [artist, song] = parts.map((p) => p.toLowerCase());
        if (parts.length === 2 && /^[a-z0-9-]{1,120}$/.test(artist) && /^[a-z0-9-]{1,150}$/.test(song) && !SONGCHAINN_NOT_ARTIST.has(artist)) {
            return { kind: 'songchainn', artist, song };
        }
        return refuse('not a SongChainn song link');
    }
    const site = SUGGEST_HOSTS[host] || (BANDCAMP.test(host) ? 'Bandcamp' : '');
    if (!site) return refuse('not a music site MixZ knows');
    return { kind: 'suggest', site, host, title: titleFrom(site, parts), key: `${host}${u.pathname}`.toLowerCase().replace(/\/+$/, '') };
}

// A song name, where the link spells one out ("soundcloud.com/artist/rude-boy" is "rude boy").
// YouTube, Spotify and the rest only carry an id, so they get none.
const words = (s) => (/^[a-z0-9]+(-[a-z0-9]+)*$/i.test(s || '') ? s.replace(/-/g, ' ').slice(0, 80) : '');
function titleFrom(site, parts) {
    if (site === 'SoundCloud' && parts.length === 2) return words(parts[1]);
    if (site === 'Bandcamp' && parts.length === 2 && parts[0] === 'track') return words(parts[1]);
    if (site === 'Apple Music' && parts.length >= 3 && (parts[1] === 'album' || parts[1] === 'song')) return words(parts[2]);
    return '';
}

// Is what Audius found for the link that exact track? Its page must be the link's page (or,
// with no page given, the artist's handle must be the link's), and it must be a public,
// streamable track, not a playlist, a deleted song or one behind a paywall.
export function audiusExact(raw, link) {
    if (!raw || typeof raw !== 'object' || !raw.id || !raw.title || raw.playlist_name) return false;
    if (raw.is_delete || raw.is_unlisted || raw.is_stream_gated || raw.is_streamable === false) return false;
    const want = `/${link.handle}/${link.slug}`.toLowerCase();
    if (typeof raw.permalink === 'string' && raw.permalink) return raw.permalink.toLowerCase() === want;
    return String(raw.user?.handle || '').toLowerCase() === link.handle.toLowerCase();
}

// The one SongChainn track a link means, from the song list, or null. By id it is exact; by
// artist and title slug it must be the only song that fits.
export function songchainnMatch(tracks = [], link) {
    if (link.id) return tracks.find((t) => t?.id === `songchainn:${link.id}`) || null;
    const hits = tracks.filter((t) => slug(t?.artist) === link.artist && slug(t?.title) === link.song);
    return hits.length === 1 ? hits[0] : null;
}
