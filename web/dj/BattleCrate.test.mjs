// node web/dj/BattleCrate.test.mjs
import { battleNight, nights, songsOfNight, resultLine } from './BattleCrate.js';

let failed = 0, passed = 0;
const check = (label, cond) => { cond ? passed++ : failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`); };

const side = (name, link) => ({ name, musicLink: link, albumArtUrl: `${link}.jpg` });
const battle = (at, a, b, winnerSide = 'artist1', decided = true, live = false, poll = null) => ({ createdAt: at, artist1: a, artist2: b, winnerSide, winnerDecided: decided, live, factors: { pollWinner: poll }, url: `https://wavewarz.info/battles/${at}` });
const ALGO = side('Algorithm', 'https://audius.co/srchappell/algorithm');
const SWEAR = side('swear', 'https://audius.co/_0xQuan/swear');
const TELL = side('TELL ME', 'https://audius.co/prp/tell-me');
const OLD = side('Old Song', 'https://audius.co/someone/old-song');
const battles = [
    battle('2026-10-15T03:38:19Z', ALGO, SWEAR),            // 11:38 PM ET on the 14th
    battle('2026-10-15T01:10:00Z', TELL, ALGO, 'artist2'),  // 9:10 PM ET on the 14th
    battle('2026-10-13T01:00:00Z', OLD, TELL),              // the 12th
];

console.log('BattleCrate');
check('a battle after midnight UTC stays on its ET night', battleNight('2026-10-15T03:38:19Z') === '2026-10-14');
check('an evening ET battle is its own date', battleNight('2026-10-14T23:00:00Z') === '2026-10-14');
check('bad dates give no night', battleNight('nope') === '');
check('nights come newest first, once each', JSON.stringify(nights(battles)) === JSON.stringify(['2026-10-14', '2026-10-12']));

const songs = songsOfNight(battles, '2026-10-14');
check('a night lists each song once', songs.length === 3);
check('songs come in battle order', songs[0].title === 'TELL ME' && songs[1].title === 'Algorithm' && songs[2].title === 'swear');
check('a song that battled twice keeps both results', songs[1].battles.length === 2);
check('the result line reads naturally', resultLine(songs[1]) === 'WON vs TELL ME, WON vs swear');
check('a loss reads as lost', resultLine(songs[0]) === 'lost vs Algorithm');
check('the Audius handle comes from the link', songs[1].handle === 'srchappell');
check('album art is kept', songs[1].artwork === 'https://audius.co/srchappell/algorithm.jpg');
check('other nights stay out', !songs.some((s) => s.title === 'Old Song'));
check('a live battle reads live', resultLine(songsOfNight([battle('2026-10-16T01:00:00Z', ALGO, SWEAR, null, false, true)], '2026-10-15')[0]) === 'live vs swear');
check('an ended, unsettled battle uses the crowd poll', resultLine(songsOfNight([battle('2026-10-16T01:00:00Z', ALGO, SWEAR, null, false, false, 'artist2')], '2026-10-15')[0]) === 'lost vs swear');
check('no settle and no poll reads no result', resultLine(songsOfNight([battle('2026-10-16T01:00:00Z', ALGO, SWEAR, null, false, false, null)], '2026-10-15')[0]) === 'no result vs swear');
check('a side with no link is skipped', songsOfNight([battle('2026-10-16T01:00:00Z', ALGO, { name: 'x' })], '2026-10-15').length === 1);
check('no battles, no songs', songsOfNight([], '2026-10-14').length === 0 && nights(undefined).length === 0);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
