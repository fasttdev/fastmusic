/**
 * FastMusic Backend Server
 * NanzMusify Engine - YouTube Music & Vidssave AES Engine
 * Author: Fortech Executor
 * For: FortechDev
 *
 * Endpoints:
 *   GET  /api/search?q=QUERY             - Search lagu/album/artis
 *   GET  /api/play?id=ID                 - Play info (stream URL)
 *   GET  /api/info?id=ID                 - Metadata + related tracks
 *   GET  /api/lyric?id=ID                - Synced lyrics
 *   GET  /api/trending                   - Home trending charts
 *   GET  /api/suggestions                - Suggestions
 *   GET  /api/stream?id=ID               - Direct stream proxy (Range support)
 *   GET  /api/download?id=ID&quality=X   - Direct MP3 download (256/48 kbps)
 *   POST /api/translate                  - Translate lyrics to Indonesian
 */

'use strict';

const express = require('express');
const compression = require('compression');
const path = require('path');

// ============================================================
// CONFIGURATION
// ============================================================
const PORT = process.env.PORT || 3000;
const BASE_URL = 'https://www.musicku.web.id';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://www.musicku.web.id/',
  'Origin': 'https://www.musicku.web.id'
};

// ============================================================
// SIMPLE IN-MEMORY CACHE
// ============================================================
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > entry.ttl) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCache(key, value, ttl = CACHE_TTL) {
  cache.set(key, { value, time: Date.now(), ttl });
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now - v.time > v.ttl) cache.delete(k);
    }
  }
}

// ============================================================
// HELPERS
// ============================================================
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const sec = parseInt(seconds, 10);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function cleanTitle(str) {
  if (!str) return '';
  return str
    .replace(/\s*\([^)]*official[^)]*\)/gi, '')
    .replace(/\s*\[[^\]]*official[^\]]*\]/gi, '')
    .replace(/\s*\([^)]*video[^)]*\)/gi, '')
    .replace(/\s*\[[^\]]*video[^\]]*\]/gi, '')
    .replace(/\s*\([^)]*audio[^)]*\)/gi, '')
    .replace(/\s*\[[^\]]*audio[^\]]*\]/gi, '')
    .replace(/\s*\([^)]*lyric[^)]*\)/gi, '')
    .replace(/\s*\[[^\]]*lyric[^\]]*\]/gi, '')
    .replace(/\s*\([^)]*mv[^)]*\)/gi, '')
    .replace(/\s*\[[^\]]*mv[^\]]*\]/gi, '')
    .replace(/\s*\([^)]*hd[^)]*\)/gi, '')
    .replace(/\s*\[[^\]]*hd[^\]]*\]/gi, '')
    .trim();
}

function cleanArtist(str) {
  if (!str) return '';
  return str.replace(/\s*-\s*Topic$/i, '').trim();
}

function getArtwork(thumbUrl, videoId, size = 512) {
  if (thumbUrl && thumbUrl.includes('googleusercontent.com')) {
    return thumbUrl.replace(/=[wsh]\d+.*$/, `=w${size}-h${size}-l90-rj`);
  }
  if (videoId) {
    if (size >= 1080) return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
    if (size >= 512) return `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`;
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  }
  return thumbUrl || null;
}

function isValidVideoId(id) {
  return /^[a-zA-Z0-9_-]{11}$/.test(id || '');
}

function safeFilename(name) {
  return String(name || 'track')
    .replace(/[^\w\s\-]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 100) || 'track';
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ============================================================
// SCRAPER CORE - SEARCH
// ============================================================
async function search(query) {
  if (!query || typeof query !== 'string') {
    throw new Error('Parameter query pencarian wajib diisi.');
  }

  const cacheKey = `search:${query.toLowerCase()}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const endpoint = `${BASE_URL}/api/a?op=search&q=${encodeURIComponent(query.trim())}`;
  const res = await fetch(endpoint, { method: 'GET', headers: DEFAULT_HEADERS });

  if (!res.ok) {
    throw new Error(`Gagal mencari musik: HTTP ${res.status}`);
  }

  const raw = await res.json();
  if (!Array.isArray(raw)) return [];

  const results = raw.map(item => ({
    id: item.id,
    title: item.title,
    artist: item.artist,
    duration: {
      seconds: item.dur || 0,
      formatted: formatDuration(item.dur)
    },
    thumbnail: item.thumb,
    artworks: {
      small: getArtwork(item.thumb, item.id, 96),
      medium: getArtwork(item.thumb, item.id, 512),
      large: getArtwork(item.thumb, item.id, 1080)
    },
    url: `https://www.youtube.com/watch?v=${item.id}`,
    embedUrl: `https://www.youtube.com/embed/${item.id}`
  }));

  setCache(cacheKey, results);
  return results;
}

// ============================================================
// SCRAPER CORE - PLAY
// ============================================================
async function play(idOrQuery) {
  if (!idOrQuery) throw new Error('Parameter idOrQuery wajib diisi.');

  let videoId = String(idOrQuery).trim();
  let trackData = null;

  if (!isValidVideoId(videoId)) {
    const results = await search(videoId);
    if (!results || results.length === 0) {
      throw new Error(`Musik dengan kata kunci "${videoId}" tidak ditemukan.`);
    }
    trackData = results[0];
    videoId = trackData.id;
  } else {
    try {
      const oeRes = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
      );
      if (oeRes.ok) {
        const oe = await oeRes.json();
        trackData = {
          title: oe.title,
          artist: oe.author_name,
          thumbnail: oe.thumbnail_url
        };
      }
    } catch (_) {}
  }

  const streamEndpoint = `${BASE_URL}/api/a?op=stream&id=${encodeURIComponent(videoId)}`;

  return {
    status: true,
    creator: 'Vamz Spectre',
    id: videoId,
    title: trackData ? trackData.title : null,
    artist: trackData ? trackData.artist : null,
    playback: {
      streamApiUrl: streamEndpoint,
      streamWebmUrl: `${streamEndpoint}&f=webm`,
      embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1`,
      watchUrl: `https://www.youtube.com/watch?v=${videoId}`
    },
    artworks: {
      thumbnail: (trackData && trackData.thumbnail) || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      hd: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`
    }
  };
}

// ============================================================
// SCRAPER CORE - INFO / ALBUM
// ============================================================
async function info(idOrQuery) {
  if (!idOrQuery) throw new Error('Parameter idOrQuery wajib diisi.');

  let videoId = String(idOrQuery).trim();
  let baseTrack = null;

  if (!isValidVideoId(videoId)) {
    const results = await search(videoId);
    if (!results || results.length === 0) {
      throw new Error(`Lagu "${videoId}" tidak ditemukan.`);
    }
    baseTrack = results[0];
    videoId = baseTrack.id;
  }

  const [oembedRes, radioRes] = await Promise.allSettled([
    fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
      .then(r => (r.ok ? r.json() : null)),
    fetch(`${BASE_URL}/api/a?op=radio&id=${encodeURIComponent(videoId)}`, { headers: DEFAULT_HEADERS })
      .then(r => (r.ok ? r.json() : []))
  ]);

  const oembed = oembedRes.status === 'fulfilled' ? oembedRes.value : null;
  const radioRaw = (radioRes.status === 'fulfilled' && Array.isArray(radioRes.value)) ? radioRes.value : [];

  const title = (baseTrack && baseTrack.title) || (oembed && oembed.title) || null;
  const artist = (baseTrack && baseTrack.artist) || (oembed && oembed.author_name) || null;
  const durationSec = baseTrack
    ? baseTrack.duration.seconds
    : ((radioRaw.find(r => r.id === videoId) || {}).dur || 0);

  const albumTracks = radioRaw.slice(0, 20).map(item => ({
    id: item.id,
    title: item.title,
    artist: item.artist,
    duration: {
      seconds: item.dur || 0,
      formatted: formatDuration(item.dur)
    },
    thumbnail: item.thumb,
    url: `https://www.youtube.com/watch?v=${item.id}`
  }));

  return {
    status: true,
    creator: 'Vamz Spectre',
    id: videoId,
    title,
    artist,
    author: {
      name: oembed ? oembed.author_name : artist,
      channelUrl: oembed ? oembed.author_url : null
    },
    duration: {
      seconds: durationSec,
      formatted: formatDuration(durationSec)
    },
    artworks: {
      thumbnail: oembed ? oembed.thumbnail_url : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      medium: getArtwork(baseTrack && baseTrack.thumbnail, videoId, 512),
      large: getArtwork(baseTrack && baseTrack.thumbnail, videoId, 1080),
      maxres: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`
    },
    links: {
      watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
      streamApiUrl: `${BASE_URL}/api/a?op=stream&id=${videoId}`
    },
    relatedTracksCount: albumTracks.length,
    relatedTracks: albumTracks
  };
}

// ============================================================
// SCRAPER CORE - LYRIC
// ============================================================
async function lyric(titleOrId, artist = '', duration = 0) {
  if (!titleOrId) throw new Error('Parameter titleOrId wajib diisi.');

  let title = String(titleOrId).trim();
  let artistName = String(artist || '').trim();
  let dur = parseInt(duration, 10) || 0;

  if (isValidVideoId(title)) {
    const infoData = await info(title);
    title = cleanTitle(infoData.title || '');
    artistName = cleanArtist(infoData.artist || '');
    dur = infoData.duration.seconds || 0;
  }

  async function fetchLyric(t, a, d) {
    const params = new URLSearchParams({
      op: 'lyrics',
      title: t,
      artist: a,
      d: String(d || 0)
    });
    const res = await fetch(`${BASE_URL}/api/a?${params.toString()}`, {
      method: 'GET',
      headers: DEFAULT_HEADERS
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  }

  let data = await fetchLyric(title, artistName, dur);
  if ((!data || (!data.synced && !data.plain)) && title.includes('(')) {
    const simplified = title.replace(/\s*\([^)]*\)/g, '').trim();
    const fallback = await fetchLyric(simplified, artistName, dur);
    if (fallback && (fallback.synced || fallback.plain)) {
      data = fallback;
      title = simplified;
    }
  }

  if (!data || (!data.synced && !data.plain)) {
    return {
      status: false,
      creator: 'Vamz Spectre',
      message: `Lirik tidak ditemukan untuk "${title}"`,
      title,
      artist: artistName,
      lyrics: { synced: null, plain: null, parsed: [] }
    };
  }

  const synced = data.synced || null;
  const plain = data.plain || null;

  const parsedLines = [];
  if (synced) {
    for (const line of synced.split('\n')) {
      const match = line.match(/^\[(\d{2}):(\d{2}\.\d{2})\]\s*(.*)$/);
      if (match) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseFloat(match[2]);
        const timeSec = parseFloat((minutes * 60 + seconds).toFixed(2));
        const text = match[3].trim();
        if (text) {
          parsedLines.push({
            time: `${match[1]}:${match[2]}`,
            timestamp: timeSec,
            text
          });
        }
      }
    }
  }

  return {
    status: true,
    creator: 'Vamz Spectre',
    title,
    artist: artistName,
    hasSynced: Boolean(synced),
    hasPlain: Boolean(plain),
    totalLines: parsedLines.length,
    lyrics: { synced, plain, parsed: parsedLines }
  };
}

// ============================================================
// TRENDING & SUGGESTIONS
// ============================================================
async function getTrending() {
  const cacheKey = 'trending:v1';
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const queries = [
    'top hits 2025',
    'lagu populer indonesia 2025',
    'trending music global',
    'viral tiktok 2025'
  ];

  const all = [];
  const seen = new Set();

  await Promise.all(queries.map(async (q) => {
    try {
      const results = await search(q);
      for (const track of results.slice(0, 6)) {
        if (!seen.has(track.id)) {
          seen.add(track.id);
          all.push(track);
        }
      }
    } catch (_) {}
  }));

  setCache(cacheKey, all, 10 * 60 * 1000);
  return all;
}

async function getSuggestions() {
  const cacheKey = 'suggestions:v1';
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const queries = [
    'acoustic chill 2025',
    'indie pop indonesia',
    'lofi study music',
    'best of pop hits'
  ];

  const all = [];
  const seen = new Set();

  await Promise.all(queries.map(async (q) => {
    try {
      const results = await search(q);
      for (const track of results.slice(0, 5)) {
        if (!seen.has(track.id)) {
          seen.add(track.id);
          all.push(track);
        }
      }
    } catch (_) {}
  }));

  setCache(cacheKey, all, 10 * 60 * 1000);
  return all;
}

// ============================================================
// TRANSLATION (Google Translate Free Endpoint)
// ============================================================
async function translateText(text, targetLang = 'id') {
  if (!text || !text.trim()) return '';
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FastMusic/1.0)' }
  });
  if (!res.ok) throw new Error('Translation failed');
  const data = await res.json();
  if (Array.isArray(data) && Array.isArray(data[0])) {
    return data[0].map(seg => (Array.isArray(seg) ? seg[0] : '')).filter(Boolean).join('');
  }
  return '';
}

// ============================================================
// EXPRESS APP
// ============================================================
const app = express();
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  etag: true
}));

// ---------- SEARCH ----------
app.get('/api/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Query wajib diisi.' });
    const results = await search(q);
    res.json({ status: true, query: q, count: results.length, results });
  } catch (err) {
    res.status(500).json({ status: false, error: err.message });
  }
});

// ---------- PLAY ----------
app.get('/api/play', async (req, res) => {
  try {
    const id = String(req.query.id || '').trim();
    if (!id) return res.status(400).json({ error: 'ID wajib diisi.' });
    const data = await play(id);
    data.proxyStreamUrl = `/api/stream?id=${encodeURIComponent(data.id)}`;
    res.json(data);
  } catch (err) {
    res.status(500).json({ status: false, error: err.message });
  }
});

// ---------- INFO ----------
app.get('/api/info', async (req, res) => {
  try {
    const id = String(req.query.id || '').trim();
    if (!id) return res.status(400).json({ error: 'ID wajib diisi.' });
    const data = await info(id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ status: false, error: err.message });
  }
});

// ---------- LYRIC ----------
app.get('/api/lyric', async (req, res) => {
  try {
    const id = String(req.query.id || '').trim();
    if (!id) return res.status(400).json({ error: 'ID wajib diisi.' });
    const data = await lyric(id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ status: false, error: err.message });
  }
});

// ---------- TRENDING ----------
app.get('/api/trending', async (_req, res) => {
  try {
    const results = await getTrending();
    res.json({ status: true, count: results.length, results });
  } catch (err) {
    res.status(500).json({ status: false, error: err.message });
  }
});

// ---------- SUGGESTIONS ----------
app.get('/api/suggestions', async (_req, res) => {
  try {
    const results = await getSuggestions();
    res.json({ status: true, count: results.length, results });
  } catch (err) {
    res.status(500).json({ status: false, error: err.message });
  }
});

// ---------- STREAM PROXY (Range-aware) ----------
app.get('/api/stream', async (req, res) => {
  const id = String(req.query.id || '').trim();
  if (!isValidVideoId(id)) {
    return res.status(400).json({ error: 'Invalid video ID' });
  }

  const streamUrl = `${BASE_URL}/api/a?op=stream&id=${encodeURIComponent(id)}`;
  const headers = { ...DEFAULT_HEADERS };
  if (req.headers.range) headers['Range'] = req.headers.range;

  try {
    const upstream = await fetch(streamUrl, { headers });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'Upstream error' });
    }

    const contentType = upstream.headers.get('content-type') || 'audio/mpeg';
    const contentLength = upstream.headers.get('content-length');
    const contentRange = upstream.headers.get('content-range');
    const acceptRanges = upstream.headers.get('accept-ranges') || 'bytes';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', acceptRanges);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);
    res.status(upstream.status);

    if (!upstream.body) return res.end();

    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.write(Buffer.from(value))) {
          await new Promise(r => res.once('drain', r));
        }
      }
    } catch (e) {
      // client disconnected or upstream error
    } finally {
      try { res.end(); } catch (_) {}
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.end();
    }
  }
});

// ---------- DOWNLOAD (256 / 48 kbps) ----------
app.get('/api/download', async (req, res) => {
  const id = String(req.query.id || '').trim();
  const quality = String(req.query.quality || '256');
  const title = String(req.query.title || 'track');

  if (!isValidVideoId(id)) {
    return res.status(400).json({ error: 'Invalid video ID' });
  }

  const bitrate = quality === '48' ? '48' : '256';
  const streamUrl = `${BASE_URL}/api/a?op=stream&id=${encodeURIComponent(id)}&br=${bitrate}`;

  try {
    const upstream = await fetch(streamUrl, { headers: DEFAULT_HEADERS });
    if (!upstream.ok) throw new Error(`Upstream ${upstream.status}`);

    const safeName = safeFilename(title);
    const fileName = `${safeName}_${bitrate}kbps.mp3`;

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    const len = upstream.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);

    if (!upstream.body) return res.end();

    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.write(Buffer.from(value))) {
          await new Promise(r => res.once('drain', r));
        }
      }
    } catch (_) {}
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.end();
    }
  }
});

// ---------- TRANSLATE ----------
app.post('/api/translate', async (req, res) => {
  try {
    const { lines, target = 'id' } = req.body || {};
    if (!Array.isArray(lines)) {
      return res.status(400).json({ error: 'lines harus berupa array' });
    }

    const translated = [];
    for (const line of lines) {
      const text = String(line || '').trim();
      if (!text) {
        translated.push('');
        continue;
      }
      try {
        const t = await translateText(text, target);
        translated.push(t);
      } catch (_) {
        translated.push('');
      }
      await sleep(40);
    }

    res.json({ status: true, translated });
  } catch (err) {
    res.status(500).json({ status: false, error: err.message });
  }
});

// ---------- HEALTH ----------
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    engine: 'NanzMusify',
    uptime: process.uptime(),
    cacheSize: cache.size
  });
});

// ---------- SPA FALLBACK ----------
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log('==============================================');
  console.log('  FastMusic Server');
  console.log('  Engine: NanzMusify');
  console.log(`  Port:   ${PORT}`);
  console.log(`  URL:    http://localhost:${PORT}`);
  console.log('==============================================');
});