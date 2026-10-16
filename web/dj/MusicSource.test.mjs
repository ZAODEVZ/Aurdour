// node web/dj/MusicSource.test.mjs
import { musicSource, fromSource, loadSourceManifest, resolveAudio } from './MusicSource.js';

let failed = 0, passed = 0;
const check = (label, cond) => { cond ? passed++ : failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`); };

console.log('MusicSource');
const base = 'https://music.example/zao';
check('no source set means empty', musicSource({}) === '');
check('trailing slashes come off the source', musicSource({ ZAO_MUSIC_SOURCE: `${base}//` }) === base);
check('a path joins the source', fromSource('data/x.json', base) === `${base}/data/x.json`);
check('a leading ./ or / is dropped', fromSource('./data/x.json', base) === `${base}/data/x.json` && fromSource('/data/x.json', base) === `${base}/data/x.json`);
check('a full URL is left alone', fromSource('https://cdn.example/a.mp3', base) === 'https://cdn.example/a.mp3');
check('with no source, paths are left alone', fromSource('data/x.json', '') === 'data/x.json');

const fake = async (url) => ({ ok: url === `${base}/manifest.json`, json: async () => ({ tracks: [{ id: 'a', dataFile: 'data/a.json' }] }) });
const tracks = await loadSourceManifest(fake, base);
check('source manifest tracks point at the source', tracks.length === 1 && tracks[0].dataFile === `${base}/data/a.json`);
check('no source, no fetch, no tracks', (await loadSourceManifest(async () => { throw new Error('fetched'); }, '')).length === 0);
check('an unreachable source gives no tracks, not an error', (await loadSourceManifest(async () => { throw new Error('offline'); }, base)).length === 0);
check('a missing manifest gives no tracks', (await loadSourceManifest(async () => ({ ok: false }), base)).length === 0);

check('audio named by a source json resolves inside the source', resolveAudio(`${base}/data/a.json`, 'music/a.mp3', base) === `${base}/music/a.mp3`);
check('audio named by a site json keeps its site path', resolveAudio('data/b.json', 'music/b.mp3', base) === 'music/b.mp3');
check('a full audio URL is left alone', resolveAudio(`${base}/data/a.json`, 'https://cdn.example/a.mp3', base) === 'https://cdn.example/a.mp3');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
