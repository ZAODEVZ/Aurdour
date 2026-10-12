#!/usr/bin/env node
// Adds every mp3 in web/music/<artist-folder>/ to the LOCAL library:
// writes web/data/<id>.json for each and lists it in web/data/manifest.json.
// Tempo and key come from the ZAO song sheet (web/dj/ZaoCrate.js) when the song is on it.
//
//   node pipeline/add_music.mjs "IMan Afrikah" iman-afrikah "Tribe Bass"
//
// Needs ffprobe on the PATH for the track length.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { applySheet } from '../web/dj/ZaoCrate.js';

const [artist, folder, genre = ''] = process.argv.slice(2);
if (!artist || !folder) { console.error('usage: add_music.mjs "<Artist>" <folder> ["Genre"]'); process.exit(1); }

const web = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
const dir = path.join(web, 'music', folder);
const manifestPath = path.join(web, 'data', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const titleOf = (file) => file.replace(/\.mp3$/i, '').split('-').map((w) => (/^vol$/i.test(w) ? 'vol' : /^\d+$/.test(w) ? w : w[0].toUpperCase() + w.slice(1))).join(' ')
    .replace(/^(North|South|Mid) East/, '$1-East');

let added = 0;
for (const file of fs.readdirSync(dir).filter((f) => /\.mp3$/i.test(f)).sort()) {
    const id = `${folder}-${file.replace(/\.mp3$/i, '')}`;
    const title = titleOf(file);
    const seconds = Math.round(parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(dir, file)]).toString()));
    const sheet = applySheet({ title });
    const meta = { id, title, artist, duration: seconds, genre, bpm: sheet.bpm || null, key: sheet.key || null };
    fs.writeFileSync(path.join(web, 'data', `${id}.json`), JSON.stringify({
        metadata: { ...meta, description: `${title} by ${artist}`, tags: [], source: 'add_music' },
        audio_files: { mp3: `music/${folder}/${file}` },
        markers: [],
        social: { share_url: '', download_enabled: false, comments_enabled: false },
    }, null, 2) + '\n');
    manifest.tracks = manifest.tracks.filter((t) => t.id !== id);
    manifest.tracks.push({ id, dataFile: `data/${id}.json`, title, artist, bpm: meta.bpm, key: meta.key, duration: seconds, genre });
    added += 1;
    console.log(`${title} | ${meta.bpm ?? '-'} BPM | ${meta.key ?? '-'} | ${seconds}s`);
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`${added} tracks in the library from music/${folder}`);
