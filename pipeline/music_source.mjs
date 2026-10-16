#!/usr/bin/env node
// Writes web/music-source.js from the ZAO_MUSIC_SOURCE env var: the base URL of the
// private music source (a bucket or a licensed streaming host). Run it as the deploy
// build step once a source exists. No music files go in this repo (Zaal, 16 Oct 2026).
//
//   ZAO_MUSIC_SOURCE=https://<private source> node pipeline/music_source.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'web', 'music-source.js');
const src = String(process.env.ZAO_MUSIC_SOURCE || '').trim().replace(/\/+$/, '');
if (src && !/^https:\/\//.test(src)) { console.error('ZAO_MUSIC_SOURCE must be an https URL'); process.exit(1); }
fs.writeFileSync(out, `// Written by pipeline/music_source.mjs at deploy time. Never put music files in this repo.\nwindow.ZAO_MUSIC_SOURCE = ${JSON.stringify(src)};\n`);
console.log(src ? `music source set: ${src}` : 'no music source set: the library shows only what the site ships with');
