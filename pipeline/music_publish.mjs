#!/usr/bin/env node
// Puts an artist's mp3s in the ZAO music source (a Cloudflare R2 bucket), each with its
// licence. No music goes in this repo, and no track goes out without a licence
// (Zaal, 16 Oct 2026). The decks refuse a track whose licence is missing.
//
//   node pipeline/music_publish.mjs <mp3 folder> --artist "IMan Afrikah" --licence <licence.json> [--genre "Tribe Bass"] [--upload]
//
// licence.json:
//   { "artist": "IMan Afrikah", "uses": { "stream": true, "dj": true, "radio": true, "commercial": false },
//     "terms": "https://<where the artist's signed grant lives>", "granted": "2026-10-15" }
//
// Builds the source in ZAO_MUSIC_DIR (a folder OUTSIDE the repo), same shape the app reads:
//   manifest.json, data/<id>.json, music/<artist>/<file>.mp3
// With --upload, sends what changed to R2. Needs, in the environment (never in git):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
// The bucket's public URL is what ZAO_MUSIC_SOURCE is set to at deploy (music_source.mjs).
// Needs ffprobe on the PATH for track lengths.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cleanLicence } from '../web/dj/Licence.js';
import { applySheet } from '../web/dj/ZaoCrate.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function args(argv) {
    const out = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i].startsWith('--')) {
            const k = argv[i].slice(2);
            out[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
        } else out._.push(argv[i]);
    }
    return out;
}

export const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-');

export const titleOf = (file) => file.replace(/\.mp3$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// The data json the decks read for one track.
export function trackJson({ id, title, artist, genre, seconds, bpm, key, audio, licence }) {
    return {
        metadata: { id, title, artist, duration: seconds, genre, bpm: bpm ?? null, key: key ?? null, description: `${title} by ${artist}`, tags: [], source: 'music_publish' },
        audio_files: { mp3: audio },
        licence,
        markers: [],
        social: { share_url: '', download_enabled: false, comments_enabled: false },
    };
}

// The manifest after adding entries: same id replaces, others stay.
export function mergeManifest(manifest, entries) {
    const ids = new Set(entries.map((e) => e.id));
    return { tracks: [...(manifest?.tracks || []).filter((t) => !ids.has(t.id)), ...entries] };
}

// ---- R2 (S3 API, signature v4) ----
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();

export function signPut({ accountId, accessKeyId, secret, bucket, key, body, contentType, now = new Date() }) {
    const host = `${accountId}.r2.cloudflarestorage.com`;
    const amz = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const day = amz.slice(0, 8);
    const pathname = `/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const hash = sha256(body);
    const headers = { 'content-type': contentType, host, 'x-amz-content-sha256': hash, 'x-amz-date': amz };
    const names = Object.keys(headers).sort();
    const canonical = ['PUT', pathname, '', ...names.map((n) => `${n}:${headers[n]}`), '', names.join(';'), hash].join('\n');
    const scope = `${day}/auto/s3/aws4_request`;
    const toSign = ['AWS4-HMAC-SHA256', amz, scope, sha256(canonical)].join('\n');
    const kSign = hmac(hmac(hmac(hmac(`AWS4${secret}`, day), 'auto'), 's3'), 'aws4_request');
    const signature = crypto.createHmac('sha256', kSign).update(toSign).digest('hex');
    return {
        url: `https://${host}${pathname}`,
        headers: { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` },
    };
}

const TYPES = { '.mp3': 'audio/mpeg', '.json': 'application/json' };

async function upload(root, files) {
    const env = process.env;
    const need = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'].filter((k) => !env[k]);
    if (need.length) throw new Error(`missing in the environment: ${need.join(', ')}`);
    for (const rel of files) {
        const body = fs.readFileSync(path.join(root, rel));
        const { url, headers } = signPut({
            accountId: env.R2_ACCOUNT_ID, accessKeyId: env.R2_ACCESS_KEY_ID, secret: env.R2_SECRET_ACCESS_KEY,
            bucket: env.R2_BUCKET, key: rel, body, contentType: TYPES[path.extname(rel)] || 'application/octet-stream',
        });
        const res = await fetch(url, { method: 'PUT', headers, body });
        if (!res.ok) throw new Error(`${rel}: R2 said ${res.status} ${await res.text()}`);
        console.log(`  up ${rel}`);
    }
}

async function main() {
    const a = args(process.argv.slice(2));
    const [folder] = a._;
    if (!folder || !a.artist || !a.licence) {
        console.error('usage: music_publish.mjs <mp3 folder> --artist "<Artist>" --licence <licence.json> [--genre "<Genre>"] [--upload]');
        process.exit(1);
    }
    const root = process.env.ZAO_MUSIC_DIR;
    if (!root) { console.error('set ZAO_MUSIC_DIR to a folder outside the repo'); process.exit(1); }
    const rootAbs = path.resolve(root);
    if (rootAbs === repo || rootAbs.startsWith(repo + path.sep)) { console.error('ZAO_MUSIC_DIR is inside the repo; music never goes in git'); process.exit(1); }

    const licence = cleanLicence(JSON.parse(fs.readFileSync(a.licence, 'utf8')), a.artist);
    if (!licence) { console.error('the licence needs an artist, at least one use set to true, and a terms link (https://...)'); process.exit(1); }

    const artistSlug = slugify(a.artist);
    fs.mkdirSync(path.join(rootAbs, 'data'), { recursive: true });
    fs.mkdirSync(path.join(rootAbs, 'music', artistSlug), { recursive: true });
    const titlesPath = path.join(folder, 'titles.json');
    const titles = fs.existsSync(titlesPath) ? JSON.parse(fs.readFileSync(titlesPath, 'utf8')) : {};

    const entries = [];
    const changed = [];
    for (const file of fs.readdirSync(folder).filter((f) => /\.mp3$/i.test(f)).sort()) {
        const base = file.replace(/\.mp3$/i, '');
        const fileSlug = slugify(base);
        const id = `${artistSlug}-${fileSlug}`;
        const named = titles[base] || {};
        const title = named.title || titleOf(base);
        const genre = named.genre || a.genre || '';
        const src = path.join(folder, file);
        const seconds = Math.round(parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src]).toString()));
        const sheet = applySheet({ title });
        const audio = `music/${artistSlug}/${fileSlug}.mp3`;
        const dest = path.join(rootAbs, audio);
        if (!fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(src).size) { fs.copyFileSync(src, dest); changed.push(audio); }
        fs.writeFileSync(path.join(rootAbs, 'data', `${id}.json`), JSON.stringify(trackJson({ id, title, artist: a.artist, genre, seconds, bpm: sheet.bpm, key: sheet.key, audio, licence }), null, 2) + '\n');
        changed.push(`data/${id}.json`);
        entries.push({ id, dataFile: `data/${id}.json`, title, artist: a.artist, bpm: sheet.bpm || null, key: sheet.key || null, duration: seconds, genre, licence });
        console.log(`${title} | ${sheet.bpm ?? '-'} BPM | ${sheet.key ?? '-'} | ${seconds}s`);
    }
    const manifestPath = path.join(rootAbs, 'manifest.json');
    const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { tracks: [] };
    fs.writeFileSync(manifestPath, JSON.stringify(mergeManifest(manifest, entries), null, 2) + '\n');
    changed.push('manifest.json');
    console.log(`${entries.length} tracks by ${a.artist} in ${rootAbs}, licence: ${licence.terms}`);

    if (a.upload) { await upload(rootAbs, changed); console.log(`${changed.length} files sent to R2 bucket ${process.env.R2_BUCKET}`); }
    else console.log('not uploaded (add --upload once the R2 keys are set)');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((e) => { console.error(e.message || e); process.exit(1); });
}
