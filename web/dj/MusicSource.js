// MusicSource.js — where music that is not in this repo is played from.
// No music files go in git (Zaal, 16 Oct 2026). Tracks that are not public live in a
// private source: a bucket or a licensed streaming host. Its base URL is set at deploy
// time from the ZAO_MUSIC_SOURCE env var (pipeline/music_source.mjs writes music-source.js).
// Empty means no private source: the library shows only what the site ships with.
//
// The source serves the same shape as web/: manifest.json, data/<id>.json, and audio
// at the path each json names (relative paths resolve against the source).

const clean = (s) => String(s || '').trim().replace(/\/+$/, '');

export const musicSource = (g = globalThis) => clean(g.ZAO_MUSIC_SOURCE);

const isAbsolute = (u) => /^(https?:|blob:|data:)/.test(String(u || ''));

// A path inside the source, as a full URL.
export function fromSource(path, base = musicSource()) {
    if (!base || isAbsolute(path)) return path;
    return `${base}/${String(path).replace(/^\.?\//, '')}`;
}

// The private source's manifest, with every dataFile pointing back at the source.
export async function loadSourceManifest(fetchFn = fetch, base = musicSource()) {
    if (!base) return [];
    try {
        const resp = await fetchFn(fromSource('manifest.json', base));
        if (!resp.ok) return [];
        const data = await resp.json();
        return (data.tracks || []).map((t) => ({ ...t, dataFile: fromSource(t.dataFile, base) }));
    } catch (e) {
        console.warn('[MusicSource] private source unreachable:', e?.message || e);
        return [];
    }
}

// The audio URL for a track json: a json from the source names audio inside the source;
// a json the site ships with keeps its site path.
export function resolveAudio(jsonPath, audio, base = musicSource()) {
    if (!audio || isAbsolute(audio)) return audio;
    if (base && String(jsonPath).startsWith(`${base}/`)) return fromSource(audio, base);
    return audio;
}
