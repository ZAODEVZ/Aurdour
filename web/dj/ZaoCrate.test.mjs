// Offline check of the off-air list.   node web/dj/ZaoCrate.test.mjs
import { OFF_AIR, songKey, artistOffAir, offAirTrack, ONLY_SONGS } from './ZaoCrate.js';

const off = new Set(OFF_AIR);
let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const isOff = (t) => off.has(songKey(t));

check(OFF_AIR.length === 28, `28 songs off air (${OFF_AIR.length})`);
check(isOff({ artist: 'NDA', title: 'STILL' }), 'NDA - Still (the YouTube claim) is off');
check(isOff({ artist: 'NDA', title: "CAN'T MATCH" }), "NDA - Can't Match is off");
check(isOff({ artist: 'NDA', title: 'Shadow Work' }), 'NDA Vol 1 is off');
check(isOff({ artist: '7ROO7H', title: "Eve's Daughter (Alt Mix)" }), '7ROO7H Vol 1 alt mix is off');
check(isOff({ artist: 'WaveWarZ Africa', title: '7ROO7H - DISCORD' }), 'a Vol 2 song posted by WaveWarZ Africa on Audius is off');
check(isOff({ artist: 'WaveWarZ Africa', title: "7ROO7H - Eve's Daughter" }), 'Vol 1 on Audius is off');
check(!isOff({ artist: 'NDA', title: 'STILL WATCHING' }), 'NDA Vol 6 "Still Watching" stays');
check(!isOff({ artist: 'NDA', title: '4.44' }), 'NDA Vol 5 stays');
check(!isOff({ artist: '7ROO7H', title: 'TWEAKING' }), '7ROO7H Vol 3 stays');
check(!isOff({ artist: 'WaveWarZ Africa', title: '7ROO7H - THE SUMO WRESLER' }), 'later 7ROO7H on Audius stays');
check(!isOff({ artist: 'T3RNNN & 7ROO7H', title: 'MuLiLow' }), 'the T3RNNN collab stays');
check(!isOff({ artist: 'IMan Afrikah', title: 'Money' }), 'another artist with the same song name stays');
check(artistOffAir({ artist: 'Geezy2126', title: 'GEEZY2126 & THEE LEASONS Go Getter' }), 'Geezy2126 is off');
check(artistOffAir({ artist: 'WaveWarZ Africa', title: 'Geezy2126 - Anything' }), 'Geezy2126 posted from another account is off');
check(!artistOffAir({ artist: 'IMan Afrikah', title: 'Lusaka Nights' }), 'other artists stay');
check(artistOffAir({ artist: 'NDA', title: 'B.T.T.B' }), 'NDA B.T.T.B (YouTube claim 28 Oct) is off');
check(artistOffAir({ artist: 'NDA', title: 'BOSSED UP' }), 'NDA Bossed Up (YouTube claim 28 Oct) is off');
check(artistOffAir({ artist: 'WaveWarZ Africa', title: 'NDA - PREACH' }), 'NDA posted by WaveWarZ Africa is off');
check(artistOffAir({ artist: 'NDA x Geezy2126', title: 'Anything' }), 'an NDA collab is off');
check(artistOffAir({ artist: 'WaveWarZ Africa', title: 'Camstar & Krytic Ft Dagger - Flip ' }), 'Flip (TuneCore claim 28 Oct) is off');
check(!artistOffAir({ artist: 'Santana', title: 'SUNDAY' }), '"nda" inside another word stays');
check(!artistOffAir({ artist: 'Amanda', title: 'Rwanda - Home' }), 'Amanda and Rwanda stay');

// N3M3SIS: only the songs named in ONLY_SONGS play (Zaal, 29 Oct: no diss songs)
const nemKeep = ONLY_SONGS.n3m3sis;
check(offAirTrack({ artist: 'N3M3SIS', title: 'LUI WHO?' }) === !nemKeep.includes('luiwho'), 'N3M3SIS songs not on her list are off');
check(offAirTrack({ artist: 'WaveWarZ Africa', title: 'N3M3SIS - THE CALL OUT' }) === !nemKeep.includes('thecallout'), 'an N3M3SIS song posted from another account follows the same list');
check(!offAirTrack({ artist: 'IMan Afrikah', title: 'ROYALTY' }), 'IMan songs stay');
check(offAirTrack({ artist: 'NDA', title: 'Still' }), 'offAirTrack covers the NDA rule too');

if (fail) { console.log(`${fail} failed`); process.exit(1); }
console.log('all passed');
