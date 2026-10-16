#!/usr/bin/env node
// Jango UU's catalogue into the MixZ library.
// Takes the zip(s) Drive made of "All Jango Projects 4 Zaal", converts every master to mp3
// with a clean name, drops them in ZAO_MUSIC_DIR with a titles.json, for upload to the
// private music source. Zaal, 14 Oct 2026: "Add them all to dj deck pls".
// No music files in this repo (Zaal, 16 Oct 2026): ZAO_MUSIC_DIR must be outside it.
//
//   ZAO_MUSIC_DIR=<folder outside the repo> node pipeline/jango_import.mjs <zip or folder> [more zips...]
//
// Needs ffmpeg and (for zips) PowerShell's Expand-Archive on the PATH.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
if (!process.env.ZAO_MUSIC_DIR) { console.error('set ZAO_MUSIC_DIR to a folder outside this repo'); process.exit(1); }
const outDir = path.resolve(process.env.ZAO_MUSIC_DIR, 'jango-uu');
if (!path.relative(repo, outDir).startsWith('..')) { console.error('ZAO_MUSIC_DIR must be outside this repo: no music files in git'); process.exit(1); }
const inputs = process.argv.slice(2);
if (!inputs.length) { console.error('usage: jango_import.mjs <zip or folder> ...'); process.exit(1); }

// Source file (without extension, case-insensitive, spaces and punctuation dropped) -> slug, title, genre.
// Slugs become the mp3 names; add_music.mjs reads titles.json for the display title.
export const TRACKS = [
    // ALICE (2020)
    ['demise2master', 'demise', 'Demise', 'Rage pop'],
    ['aimh2master', 'aimh', 'AIMH', 'Rage pop'],
    ['rnrfinalmaster', 'rnr', 'RNR', 'Rage pop'],
    ['rnrmix2master3', 'rnr-single', 'RNR (single mix)', 'Rage pop'],
    // GUCCI SHIT (2020)
    ['guccishitv9', 'gucci-shit', 'Gucci Shit', 'Rage pop'],
    ['guccishitremix3', 'gucci-shit-remix', 'Gucci Shit (remix)', 'Rage pop'],
    // WIDE AWAKE 3 TRACK (2020)
    ['wideawakeofficial', 'wide-awake', 'Wide Awake', 'Rage pop'],
    ['djangoresetlastmixnowhitenoise1', 'reset', 'Reset', 'Rage pop'],
    ['deepwithintrem3', 'deep-within', 'Deep Within', 'Rage pop'],
    // RAGEPOP 2021 (Drive only holds 3 of the 7 masters as of 14 Oct 2026; the ._ stubs are AppleDouble files)
    ['1prettyfacesintrojwamasters', 'pretty-faces-intro', 'Pretty Faces (intro)', 'Rage pop'],
    ['2prettyfaces', 'pretty-faces', 'Pretty Faces', 'Rage pop'],
    ['3neilfeatultrasonicmaster', 'neil-feat-ultrasonic', 'Neil (feat. Ultrasonic)', 'Rage pop'],
    ['4southofthecityfinalmaster', 'south-of-the-city', 'South of the City', 'Rage pop'],
    ['5ongodfinalmaster', 'on-god', 'On God', 'Rage pop'],
    ['6fallbeforemefinalmaster', 'fall-before-me', 'Fall Before Me', 'Rage pop'],
    ['7staysolidfinalmaster', 'stay-solid', 'Stay Solid', 'Rage pop'],
    // YPMR (2021)
    ['samepacev7', 'same-pace', 'Same Pace', 'Rage pop'],
    ['secretsv9', 'secrets', 'Secrets', 'Rage pop'],
    ['stonecoldv6', 'stone-cold', 'Stone Cold', 'Rage pop'],
    // 2022 LOOSIES
    ['bezosfeatandrewkellyv4', 'bezos-feat-andrew-kelly', 'Bezos (feat. Andrew Kelly)', 'Rage pop'],
    ['wantitlikemefinalv54master', 'want-it-like-me', 'Want It Like Me', 'Rage pop'],
    // Let Them Hoes ROCK 2022
    ['1neverbeenthesamesincev961crazydjangoxraavixsaph', 'never-been-the-same-since', 'Never Been the Same Since (x Raavi x Saph)', 'Rage pop'],
    ['2themusethatkeepsongivingv61djangoxraavi', 'the-muse-that-keeps-on-giving', 'The Muse That Keeps on Giving (x Raavi)', 'Rage pop'],
    ['3dontappreciatethejourneyinterludev6masterdjangoxraavi', 'dont-appreciate-the-journey', 'Dont Appreciate the Journey (interlude, x Raavi)', 'Rage pop'],
    ['4curedailmentsv92masterfadedjangoxjkimbeats', 'cured-ailments', 'Cured Ailments (x JKim Beats)', 'Rage pop'],
    ['5december35thv71masterdjangoxraavi', 'december-35th', 'December 35th (x Raavi)', 'Rage pop'],
    // TSRCV2 FULL EP
    ['fuckitbetv81final', 'fuck-it-bet', 'Fuck It Bet', 'Rage pop'],
    ['shatterpoint2025v5', 'shatterpoint', 'Shatterpoint', 'Rage pop'],
    ['whenimhighv5a', 'when-im-high', 'When Im High', 'Rage pop'],
    ['beforeiblitzinthewraithv2bfinalalt', 'before-i-blitz-in-the-wraith', 'Before I Blitz / In the Wraith', 'Rage pop'],
    ['ashes2ashesv15', 'ashes-2-ashes', 'Ashes 2 Ashes', 'Rage pop'],
    // 2023 LOOSIES
    ['talkinflyv45', 'talkin-fly', 'Talkin Fly', 'Rage pop'],
    ['southofthecity2023v091bcameraalive', 'south-of-the-city-2023', 'South of the City 2023', 'Rage pop'],
    ['nbtssroughmixv211', 'nbtss-rough-mix', 'NBTSS (rough mix)', 'Rage pop'],
    // GAME IN 2023
    ['realplayasv353fullexplicit', 'real-playas', 'Real Playas', 'Rage pop'],
    ['thedamnprinciplefullv51pitched', 'the-damn-principle', 'The Damn Principle', 'Rage pop'],
    // RAGEPOP REIMAGINED (2023)
    ['southofthecity2023v092b1cameraalive', 'south-of-the-city-2023-reimagined', 'South of the City 2023 (reimagined)', 'Rage pop'],
    ['realone2023v22', 'real-one', 'Real One', 'Rage pop'],
    ['allmyoppsfinnafallbeforemev05', 'all-my-opps-finna-fall-before-me', 'All My Opps Finna Fall Before Me', 'Rage pop'],
    ['ongodroughv09', 'on-god-rough', 'On God (rough)', 'Rage pop'],
    ['glpfv08', 'glpf', 'GLPF', 'Rage pop'],
    // THE SYNTHROCK CONCEPT V1
    ['dualwieldv401', 'dual-wield', 'Dual Wield', 'Synth rock'],
    ['sunrider2024v17', 'sunrider', 'Sunrider', 'Synth rock'],
    ['psychic2024v6', 'psychic', 'Psychic', 'Synth rock'],
    ['iii2024v4final', 'iii', 'III', 'Synth rock'],
];
const norm = (s) => s.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]/g, '');
const byKey = new Map(TRACKS.map((t) => [t[0], t]));

// Every audio file under the inputs (zips are unpacked to a temp folder first).
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jango-'));
const files = [];
const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(wav|mp3|aiff?|flac|m4a)$/i.test(e.name) && !e.name.startsWith('._')) files.push(p); } };
for (const input of inputs) {
    if (/\.zip$/i.test(input)) {
        const dest = path.join(temp, path.basename(input, '.zip'));
        console.log(`unpacking ${path.basename(input)}`);
        execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${input.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`], { stdio: 'inherit' });
        walk(dest);
    } else walk(input);
}
console.log(`${files.length} audio files found`);

fs.mkdirSync(outDir, { recursive: true });
const titles = fs.existsSync(path.join(outDir, 'titles.json')) ? JSON.parse(fs.readFileSync(path.join(outDir, 'titles.json'), 'utf8')) : {};
let done = 0;
const unknown = [];
for (const file of files) {
    const t = byKey.get(norm(path.basename(file)));
    if (!t) { unknown.push(path.basename(file)); continue; }
    const [, slug, title, genre] = t;
    const out = path.join(outDir, `${slug}.mp3`);
    if (!fs.existsSync(out)) {
        // VBR around 130 kbps: good enough on a deck, small enough for the site.
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vn', '-c:a', 'libmp3lame', '-q:a', '5', '-ar', '44100', '-map_metadata', '-1', out], { stdio: 'inherit' });
    }
    titles[slug] = { title, genre };
    done += 1;
    console.log(`${title}  <-  ${path.basename(file)}`);
}
fs.writeFileSync(path.join(outDir, 'titles.json'), JSON.stringify(titles, null, 2) + '\n');
console.log(`${done} tracks converted into ${outDir}`);
if (unknown.length) console.log(`not in the map, skipped: ${unknown.join(', ')}`);
const missing = TRACKS.filter((t) => !titles[t[1]]).map((t) => t[2]);
if (missing.length) console.log(`still missing: ${missing.join(', ')}`);
try { fs.rmSync(temp, { recursive: true, force: true }); } catch (e) { /* temp stays */ }
console.log('now: upload them to the private music source (ZAO_MUSIC_SOURCE) with their manifest and data json. Not to web/music.');
