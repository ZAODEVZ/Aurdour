// node web/dj/NowPlaying.test.mjs
import { cleanTitle, liveDeck, songPage } from './NowPlaying.js';

let failed = 0, passed = 0;
const check = (label, cond) => { cond ? passed++ : failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`); };

console.log('NowPlaying');
check('the artist prefix comes off the title', cleanTitle('IMan Afrikah - RUDE BOY', 'IMan Afrikah') === 'RUDE BOY');
check('any dash, colon or bar after the artist counts', cleanTitle('IMan Afrikah – Rude Boy', 'iman afrikah') === 'Rude Boy' && cleanTitle('IMan Afrikah: Rude Boy', 'IMan Afrikah') === 'Rude Boy' && cleanTitle('IMan Afrikah | Rude Boy', 'IMan Afrikah') === 'Rude Boy');
check('a title that only mentions the artist elsewhere is left alone', cleanTitle('Rude Boy (IMan Afrikah remix)', 'IMan Afrikah') === 'Rude Boy (IMan Afrikah remix)');
check('an artist with regex characters is safe', cleanTitle('C3DDC3SSION (feat. X) - Jewellry', 'C3DDC3SSION (feat. X)') === 'Jewellry');
check('local file names lose the ending and underscores', cleanTitle('my_new_track.mp3') === 'my new track');
check('never empty', cleanTitle('IMan Afrikah - ', 'IMan Afrikah') === 'IMan Afrikah -' && cleanTitle('', '') === 'Untitled' && cleanTitle(null) === 'Untitled');

check('the playing deck is live', liveDeck({ A: { isPlaying: true }, B: { isPlaying: false } }, 1) === 'A' && liveDeck({ A: { isPlaying: false }, B: { isPlaying: true } }, 0) === 'B');
check('both playing: the crossfader decides', liveDeck({ A: { isPlaying: true }, B: { isPlaying: true } }, 0.2) === 'A' && liveDeck({ A: { isPlaying: true }, B: { isPlaying: true } }, 0.8) === 'B');
check('nothing playing: nothing is live', liveDeck({ A: {}, B: {} }, 0.5) === null && liveDeck(null) === null);

check('an Audius song links to its page', songPage({ source: 'audius', permalink: '/imanafrikah/rude-boy' }) === 'https://audius.co/imanafrikah/rude-boy');
check('a SongChainn song links to SongChainn', songPage({ id: 'songchainn:94e4', _source: 'songchainn' }) === 'https://songchainn.xyz' && songPage({ id: 'songchainn:94e4' }) === 'https://songchainn.xyz');
check('a local file has no page', songPage({ id: 'x', source: 'local' }) === null && songPage(null) === null);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
