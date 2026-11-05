// A song link in stream chat, read strictly.   node web/dj/SongLink.test.mjs
import { parseSongLink, audiusExact, songchainnMatch, slug, LINK_MAX } from './SongLink.js';
import { moderate } from './ChatFilter.js';

let failed = 0, passed = 0;
const check = (label, cond) => { cond ? passed++ : failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`); };
const kind = (t) => parseSongLink(t)?.kind ?? null;

console.log('SongLink: a song name is not a link');
for (const t of ['rude boy', 'Rude Boy - IMan Afrikah', 'song feat. Drake', 'Mr. Brightside please', '']) check(`no link: ${JSON.stringify(t)}`, parseSongLink(t) === null);

console.log('SongLink: Audius track pages');
const a = parseSongLink('https://audius.co/imanafrikah/rude-boy');
check('an Audius track page is a playable link, the artist and song read off it', a?.kind === 'audius' && a.handle === 'imanafrikah' && a.slug === 'rude-boy');
check('the looked-up link is the clean page, no query or hash', parseSongLink('https://www.audius.co/imanafrikah/rude-boy?ref=x#t')?.url === 'https://audius.co/imanafrikah/rude-boy');
check('http is refused', kind('http://audius.co/imanafrikah/rude-boy') === 'refused' && parseSongLink('http://audius.co/imanafrikah/rude-boy').reason === 'https links only');
for (const t of ['https://audius.co.evil.com/imanafrikah/rude-boy', 'https://evilaudius.co/imanafrikah/rude-boy', 'https://audius.com/imanafrikah/rude-boy',
    'https://api.audius.co/imanafrikah/rude-boy', 'https://audius.co@evil.com/imanafrikah/rude-boy', 'https://evil.com/audius.co/imanafrikah/rude-boy',
    'https://audius.co:8443/imanafrikah/rude-boy', 'https://user:pw@audius.co/imanafrikah/rude-boy']) {
    check(`lookalike or dressed-up host refused: ${t}`, kind(t) === 'refused');
}
for (const t of ['https://audius.co/imanafrikah', 'https://audius.co/imanafrikah/playlist/mix', 'https://audius.co/imanafrikah/tracks',
    'https://audius.co/trending/x', 'https://audius.co/search/rude']) {
    check(`not one track: ${t}`, kind(t) === 'refused');
}
check('a link with words around it is refused, so it stays one clear thing', kind('play https://audius.co/imanafrikah/rude-boy now') === 'refused');
check('a backslash or a non-plain letter in the link is refused', kind('https://audius.co\\@evil.com/a/b') === 'refused' && kind('https://audiuѕ.co/imanafrikah/rude-boy') === 'refused');
check(`a link longer than ${LINK_MAX} is refused`, kind('https://audius.co/imanafrikah/' + 'a'.repeat(LINK_MAX)) === 'refused');
check('a link is still never chat text on the stream', !moderate('https://audius.co/imanafrikah/rude-boy').ok);

console.log('SongLink: what Audius finds must be that exact track');
const found = { id: 'Xy1', title: 'Rude Boy', permalink: '/imanafrikah/rude-boy', user: { handle: 'imanafrikah' } };
check('the same page counts', audiusExact(found, a));
check('the page is compared without case', audiusExact({ ...found, permalink: '/IMANafrikah/Rude-Boy' }, a));
check('another track (Audius sent a different page) does not', !audiusExact({ ...found, permalink: '/someone/else' }, a));
check('no page given: the artist handle must match', audiusExact({ ...found, permalink: undefined }, a) && !audiusExact({ ...found, permalink: undefined, user: { handle: 'other' } }, a));
check('a playlist, a deleted, unlisted, paywalled or unstreamable track does not', !audiusExact({ ...found, playlist_name: 'Mix' }, a)
    && !audiusExact({ ...found, is_delete: true }, a) && !audiusExact({ ...found, is_unlisted: true }, a)
    && !audiusExact({ ...found, is_stream_gated: true }, a) && !audiusExact({ ...found, is_streamable: false }, a));
check('nothing found does not', !audiusExact(null, a) && !audiusExact({}, a));

console.log('SongLink: SongChainn song pages');
const id = '94e4377c-bb84-4bea-8b3f-324e1aded3e5';
const list = [{ id: `songchainn:${id}`, title: 'Jewellry', artist: 'C3DDC3SSION' }, { id: 'songchainn:2', title: 'Nemesis on the Board', artist: 'N3M3SIS' },
    { id: 'songchainn:3', title: 'Twin', artist: 'Dup' }, { id: 'songchainn:4', title: 'Twin', artist: 'Dup' }];
check('a /song/<id> page finds that song by id', songchainnMatch(list, parseSongLink(`https://songchainn.xyz/song/${id}`))?.title === 'Jewellry');
check('an artist and song page finds it by its slug', songchainnMatch(list, parseSongLink('https://www.songchainn.xyz/n3m3sis/nemesis-on-the-board'))?.id === 'songchainn:2');
check('two songs with the same slug: neither, rather than a guess', songchainnMatch(list, parseSongLink('https://songchainn.xyz/dup/twin')) === null);
check('an id not in the list: nothing', songchainnMatch(list, parseSongLink('https://songchainn.xyz/song/00000000-0000-0000-0000-000000000000')) === null);
check('the site\'s own pages are not songs', kind('https://songchainn.xyz/world/x') === 'refused' && kind('https://songchainn.xyz/song/not-an-id') === 'refused' && kind('https://songchainn.xyz/n3m3sis') === 'refused');
check('lookalike SongChainn host refused', kind('https://songchainn.xyz.evil.com/song/' + id) === 'refused');
check('the slug is SongChainn\'s own', slug('Nemesis on the Board') === 'nemesis-on-the-board' && slug('Beyoncé!') === 'beyonce');

console.log('SongLink: other music sites are suggestions, never played');
const yt = parseSongLink('https://www.youtube.com/watch?v=dQw4w9-WgXcQ');
check('YouTube becomes a suggestion, with no made-up title', yt?.kind === 'suggest' && yt.site === 'YouTube' && yt.host === 'www.youtube.com' && yt.title === '');
check('youtu.be, Spotify and Apple Music too', parseSongLink('https://youtu.be/abc')?.site === 'YouTube' && parseSongLink('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')?.site === 'Spotify'
    && parseSongLink('https://music.apple.com/us/album/rude-boy/123')?.title === 'rude boy');
const sc = parseSongLink('https://soundcloud.com/imanafrikah/rude-boy');
check('SoundCloud spells the song out in the link', sc?.kind === 'suggest' && sc.title === 'rude boy');
check('a Bandcamp page is a suggestion', parseSongLink('https://someone.bandcamp.com/track/a-song')?.site === 'Bandcamp' && kind('https://bandcamp.com.evil.io/track/x') === 'refused');
check('the same song twice has the same key', parseSongLink('https://soundcloud.com/imanafrikah/rude-boy/')?.key === sc.key);
check('http and lookalikes are refused here too', kind('http://www.youtube.com/watch?v=x') === 'refused' && kind('https://youtube.com.evil.com/watch?v=x') === 'refused');
check('any other site is refused, not suggested', kind('https://evil.example/song') === 'refused' && kind('https://bit.ly/abc') === 'refused');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
