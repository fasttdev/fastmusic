/**
 * FastMusic — Frontend Application
 * NanzMusify Engine Consumer
 * Author: Fortech Executor
 * For: FortechDev
 */

'use strict';

// ============================================================================
// 1. STATE
// ============================================================================
const state = {
  view: 'home',
  query: '',
  trending: [],
  suggestions: [],
  searchResults: [],
  queue: [],
  currentIndex: -1,
  currentTrack: null,
  lyrics: null,
  lyricsLines: [],
  translatedLines: [],
  showTranslation: false,
  isPlaying: false,
  theme: 'light',
  history: [],
  liked: new Set(),
  volume: 0.8,
  muted: false,
  shuffle: false,
  repeat: 'off',
  lastSyncLine: -1,
  searchTimer: null,
  loadingLyrics: false,
  seeking: false
};

// ============================================================================
// 2. DOM REFERENCES
// ============================================================================
const audio = document.getElementById('audio');

const el = {
  // Search
  searchInput: document.getElementById('search-input'),
  clearSearch: document.getElementById('clear-search'),

  // Theme
  themeToggle: document.getElementById('theme-toggle'),
  themeIcon: document.getElementById('theme-icon'),

  // Nav
  navItems: document.querySelectorAll('.nav-item'),
  views: document.querySelectorAll('.view'),

  // Sidebar
  sidebarTrending: document.getElementById('sidebar-trending'),

  // Player
  playerArtwork: document.getElementById('player-artwork'),
  playerTitle: document.getElementById('player-title'),
  playerArtist: document.getElementById('player-artist'),
  likeBtn: document.getElementById('like-btn'),

  // Controls
  shuffleBtn: document.getElementById('shuffle-btn'),
  prevBtn: document.getElementById('prev-btn'),
  playBtn: document.getElementById('play-btn'),
  nextBtn: document.getElementById('next-btn'),
  repeatBtn: document.getElementById('repeat-btn'),
  playIcon: document.getElementById('play-icon'),

  // Progress
  currentTime: document.getElementById('current-time'),
  totalTime: document.getElementById('total-time'),
  progressWrap: document.getElementById('progress-wrap'),
  progressBar: document.getElementById('progress-bar'),
  progressBuffer: document.getElementById('progress-buffer'),
  progressThumb: document.getElementById('progress-thumb'),

  // Volume
  volumeBtn: document.getElementById('volume-btn'),
  volumeIcon: document.getElementById('volume-icon'),
  volumeSlider: document.getElementById('volume-slider'),

  // Extras
  lyricsToggle: document.getElementById('lyrics-toggle'),
  downloadBtn: document.getElementById('download-btn'),

  // Lyrics panel
  lyricsPanel: document.getElementById('lyrics-panel'),
  lyricsTitle: document.getElementById('lyrics-title'),
  lyricsArtist: document.getElementById('lyrics-artist'),
  lyricsClose: document.getElementById('lyrics-close'),
  translateToggle: document.getElementById('translate-toggle'),
  lyricsContent: document.getElementById('lyrics-content'),

  // Download modal
  downloadModal: document.getElementById('download-modal'),
  downloadClose: document.getElementById('download-close'),
  downloadArtwork: document.getElementById('download-artwork'),
  downloadTitle: document.getElementById('download-title'),
  downloadArtist: document.getElementById('download-artist'),
  downloadHigh: document.getElementById('download-high'),
  downloadLow: document.getElementById('download-low'),

  // Toast
  toastContainer: document.getElementById('toast-container')
};

// ============================================================================
// 3. UTILITIES
// ============================================================================
async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      if (err && err.error) msg = err.error;
    } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTime(sec) {
  if (!sec || isNaN(sec) || !isFinite(sec)) return '0:00';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  el.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function safeText(str, fallback = '-') {
  return (str && String(str).trim()) || fallback;
}

// ============================================================================
// 4. PERSISTENCE (localStorage)
// ============================================================================
function saveHistory() {
  try {
    localStorage.setItem('fastmusic:history', JSON.stringify(state.history.slice(0, 50)));
  } catch (_) {}
}

function loadHistory() {
  try {
    const raw = localStorage.getItem('fastmusic:history');
    if (raw) state.history = JSON.parse(raw) || [];
    const liked = localStorage.getItem('fastmusic:liked');
    if (liked) state.liked = new Set(JSON.parse(liked) || []);
  } catch (_) {}
}

function saveLiked() {
  try {
    localStorage.setItem('fastmusic:liked', JSON.stringify([...state.liked]));
  } catch (_) {}
}

function addToHistory(track) {
  if (!track || !track.id) return;
  state.history = state.history.filter(t => t.id !== track.id);
  state.history.unshift(track);
  if (state.history.length > 50) state.history.length = 50;
  saveHistory();
}

// ============================================================================
// 5. THEME
// ============================================================================
function loadTheme() {
  const saved = localStorage.getItem('fastmusic:theme');
  if (saved === 'dark' || saved === 'light') {
    state.theme = saved;
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    state.theme = 'dark';
  }
  applyTheme();
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', state.theme === 'dark' ? '#0a1420' : '#38a3e0');

  if (el.themeIcon) {
    el.themeIcon.innerHTML = state.theme === 'dark'
      ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
      : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  }
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('fastmusic:theme', state.theme);
  applyTheme();
}

// ============================================================================
// 6. VIEW NAVIGATION
// ============================================================================
function switchView(view) {
  state.view = view;
  el.views.forEach(v => v.classList.remove('active'));
  const target = document.getElementById(`view-${view}`);
  if (target) target.classList.add('active');
  el.navItems.forEach(n => n.classList.toggle('active', n.dataset.view === view));

  if (view === 'library') renderLibrary();
}

// ============================================================================
// 7. HOME VIEW
// ============================================================================
async function loadHome() {
  const container = document.getElementById('view-home');
  if (!container) return;

  container.innerHTML = `
    <div class="loader">
      <div class="spinner"></div>
      <div>Memuat konten...</div>
    </div>
  `;

  try {
    const [trending, suggestions] = await Promise.all([
      fetchJSON('/api/trending').then(d => d.results || []).catch(() => []),
      fetchJSON('/api/suggestions').then(d => d.results || []).catch(() => [])
    ]);

    state.trending = trending;
    state.suggestions = suggestions;

    renderHome();
    renderSidebarTrending();
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">Gagal memuat</div>
        <div class="empty-desc">${escapeHtml(err.message)}</div>
      </div>
    `;
  }
}

function renderHome() {
  const container = document.getElementById('view-home');
  if (!container) return;

  container.innerHTML = `
    <div class="hero">
      <div class="hero-content">
        <div class="hero-tag">FastMusic Premium</div>
        <div class="hero-title">Streaming Musik Tanpa Batas</div>
        <div class="hero-subtitle">Nikmati jutaan lagu, chart trending, dan lirik tersinkronisasi dalam kualitas terbaik.</div>
        <div class="hero-stats">
          <div class="hero-stat">
            <div class="hero-stat-value">${state.trending.length}+</div>
            <div class="hero-stat-label">Trending</div>
          </div>
          <div class="hero-stat">
            <div class="hero-stat-value">256</div>
            <div class="hero-stat-label">kbps HQ</div>
          </div>
          <div class="hero-stat">
            <div class="hero-stat-value">ID</div>
            <div class="hero-stat-label">Lyrics</div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <div>
          <div class="section-title">Trending Now</div>
          <div class="section-subtitle">Chart terpopuler saat ini</div>
        </div>
      </div>
      <div class="track-grid" id="trending-grid"></div>
    </div>

    <div class="section">
      <div class="section-header">
        <div>
          <div class="section-title">Rekomendasi Untukmu</div>
          <div class="section-subtitle">Pilihan editor FastMusic</div>
        </div>
      </div>
      <div class="track-grid" id="suggestions-grid"></div>
    </div>
  `;

  renderTrackGrid('trending-grid', state.trending.slice(0, 12));
  renderTrackGrid('suggestions-grid', state.suggestions.slice(0, 12));
}

// ============================================================================
// 8. TRACK RENDERING
// ============================================================================
function renderTrackGrid(containerId, tracks) {
  const grid = document.getElementById(containerId);
  if (!grid) return;

  if (!tracks || tracks.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1; padding:40px;">
        <div class="empty-title">Tidak ada lagu</div>
      </div>
    `;
    return;
  }

  grid.innerHTML = tracks.map(track => `
    <div class="track-card" data-id="${escapeHtml(track.id)}">
      <div class="track-card-artwork">
        <img
          src="${escapeHtml(track.artworks?.medium || track.thumbnail || '')}"
          alt="${escapeHtml(track.title)}"
          loading="lazy"
          onerror="this.style.opacity='0'">
        <div class="track-card-duration">${escapeHtml(track.duration?.formatted || '')}</div>
        <button class="track-card-play" data-play="${escapeHtml(track.id)}" aria-label="Putar ${escapeHtml(track.title)}">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <polygon points="5,3 19,12 5,21"/>
          </svg>
        </button>
      </div>
      <div>
        <div class="track-card-title">${escapeHtml(track.title)}</div>
        <div class="track-card-artist">${escapeHtml(track.artist)}</div>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.track-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.track-card-play')) return;
      const id = card.dataset.id;
      playTrackById(id);
    });
  });

  grid.querySelectorAll('.track-card-play').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.play;
      playTrackById(id);
    });
  });
}

function renderTrackList(containerId, tracks, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!tracks || tracks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">${escapeHtml(options.emptyTitle || 'Tidak ada lagu')}</div>
        <div class="empty-desc">${escapeHtml(options.emptyDesc || '')}</div>
      </div>
    `;
    return;
  }

  container.innerHTML = tracks.map((track, i) => {
    const isActive = state.currentTrack && state.currentTrack.id === track.id;
    return `
      <div class="track-row ${isActive ? 'active' : ''}" data-id="${escapeHtml(track.id)}">
        <div class="track-row-index">${isActive && state.isPlaying ? '▶' : (i + 1)}</div>
        <img
          class="track-row-artwork"
          src="${escapeHtml(track.artworks?.small || track.thumbnail || '')}"
          alt="${escapeHtml(track.title)}"
          loading="lazy"
          onerror="this.style.opacity='0'">
        <div class="track-row-info">
          <div class="track-row-title">${escapeHtml(track.title)}</div>
          <div class="track-row-artist">${escapeHtml(track.artist)}</div>
        </div>
        <div class="track-row-duration">${escapeHtml(track.duration?.formatted || '')}</div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.track-row').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.dataset.id;
      const index = tracks.findIndex(t => t.id === id);
      if (index !== -1) {
        state.queue = tracks.slice();
        playTrackByIndex(index);
      }
    });
  });
}

function renderSidebarTrending() {
  if (!el.sidebarTrending) return;
  const tracks = state.trending.slice(0, 8);

  if (tracks.length === 0) {
    el.sidebarTrending.innerHTML = `
      <div class="empty-state" style="padding:20px; font-size:12px;">
        <div class="empty-desc">Belum ada data</div>
      </div>
    `;
    return;
  }

  el.sidebarTrending.innerHTML = tracks.map(track => `
    <div class="sidebar-track" data-id="${escapeHtml(track.id)}">
      <img
        class="sidebar-track-artwork"
        src="${escapeHtml(track.artworks?.small || track.thumbnail || '')}"
        alt="${escapeHtml(track.title)}"
        loading="lazy"
        onerror="this.style.opacity='0'">
      <div class="sidebar-track-info">
        <div class="sidebar-track-title">${escapeHtml(track.title)}</div>
        <div class="sidebar-track-artist">${escapeHtml(track.artist)}</div>
      </div>
    </div>
  `).join('');

  el.sidebarTrending.querySelectorAll('.sidebar-track').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      const index = state.trending.findIndex(t => t.id === id);
      if (index !== -1) {
        state.queue = state.trending.slice();
        playTrackByIndex(index);
      }
    });
  });
}

// ============================================================================
// 9. SEARCH
// ============================================================================
function renderSearchInitial() {
  const container = document.getElementById('view-search');
  if (!container) return;

  if (state.history.length > 0) {
    container.innerHTML = `
      <div class="section">
        <div class="section-header">
          <div>
            <div class="section-title">Baru Diputar</div>
            <div class="section-subtitle">Riwayat pemutaran kamu</div>
          </div>
        </div>
        <div class="track-list" id="search-history"></div>
      </div>
    `;
    renderTrackList('search-history', state.history, { emptyTitle: 'Belum ada riwayat' });
  } else {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">Mulai cari musik</div>
        <div class="empty-desc">Ketik judul lagu, nama artis, atau album di kolom pencarian</div>
      </div>
    `;
  }
}

async function performSearch(query) {
  const container = document.getElementById('view-search');
  if (!container) return;

  query = (query || '').trim();
  state.query = query;

  if (!query) {
    renderSearchInitial();
    return;
  }

  container.innerHTML = `
    <div class="loader">
      <div class="spinner"></div>
      <div>Mencari "${escapeHtml(query)}"...</div>
    </div>
  `;

  try {
    const data = await fetchJSON(`/api/search?q=${encodeURIComponent(query)}`);
    state.searchResults = data.results || [];

    if (state.searchResults.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-title">Tidak ditemukan</div>
          <div class="empty-desc">Coba kata kunci lain untuk "${escapeHtml(query)}"</div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="section">
        <div class="section-header">
          <div>
            <div class="section-title">Hasil untuk "${escapeHtml(query)}"</div>
            <div class="section-subtitle">${state.searchResults.length} lagu ditemukan</div>
          </div>
        </div>
        <div class="track-list" id="search-results"></div>
      </div>
    `;
    renderTrackList('search-results', state.searchResults);
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">Pencarian gagal</div>
        <div class="empty-desc">${escapeHtml(err.message)}</div>
      </div>
    `;
  }
}

// ============================================================================
// 10. LIBRARY VIEW
// ============================================================================
function renderLibrary() {
  const container = document.getElementById('view-library');
  if (!container) return;

  const likedTracks = state.history.filter(t => state.liked.has(t.id));

  if (likedTracks.length === 0 && state.history.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">Library masih kosong</div>
        <div class="empty-desc">Lagu yang kamu sukai dan riwayat akan muncul di sini</div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    ${likedTracks.length > 0 ? `
      <div class="section">
        <div class="section-header">
          <div>
            <div class="section-title">Disukai</div>
            <div class="section-subtitle">${likedTracks.length} lagu</div>
          </div>
        </div>
        <div class="track-list" id="library-liked"></div>
      </div>
    ` : ''}

    ${state.history.length > 0 ? `
      <div class="section">
        <div class="section-header">
          <div>
            <div class="section-title">Riwayat</div>
            <div class="section-subtitle">${state.history.length} lagu</div>
          </div>
        </div>
        <div class="track-list" id="library-history"></div>
      </div>
    ` : ''}
  `;

  if (likedTracks.length > 0) renderTrackList('library-liked', likedTracks);
  if (state.history.length > 0) renderTrackList('library-history', state.history);
}

// ============================================================================
// 11. PLAYER — CORE
// ============================================================================
async function playTrackById(id) {
  try {
    showToast('Memuat...', 'info');

    const data = await fetchJSON(`/api/play?id=${encodeURIComponent(id)}`);

    const track = {
      id: data.id,
      title: data.title || 'Unknown',
      artist: data.artist || 'Unknown',
      artwork: data.artworks?.hd || data.artworks?.thumbnail || '',
      streamUrl: data.proxyStreamUrl || `/api/stream?id=${encodeURIComponent(data.id)}`,
      duration: 0
    };

    // Insert to queue if not present
    const existingIndex = state.queue.findIndex(t => t.id === track.id);
    if (existingIndex === -1) {
      state.queue.push(track);
      state.currentIndex = state.queue.length - 1;
    } else {
      state.currentIndex = existingIndex;
    }

    await loadTrack(track);
  } catch (err) {
    showToast(`Gagal memutar: ${err.message}`, 'error');
  }
}

async function playTrackByIndex(index) {
  if (index < 0 || index >= state.queue.length) return;

  state.currentIndex = index;
  const track = state.queue[index];

  try {
    if (!track.streamUrl) {
      showToast('Memuat...', 'info');
      const data = await fetchJSON(`/api/play?id=${encodeURIComponent(track.id)}`);
      track.title = data.title || track.title;
      track.artist = data.artist || track.artist;
      track.artwork = data.artworks?.hd || data.artworks?.thumbnail || track.artwork;
      track.streamUrl = data.proxyStreamUrl || `/api/stream?id=${encodeURIComponent(data.id)}`;
    }
    await loadTrack(track);
  } catch (err) {
    showToast(`Gagal memutar: ${err.message}`, 'error');
  }
}

async function loadTrack(track) {
  state.currentTrack = track;
  state.lastSyncLine = -1;
  state.lyricsLines = [];
  state.translatedLines = [];
  state.lyrics = null;

  // Update UI
  el.playerTitle.textContent = track.title;
  el.playerArtist.textContent = track.artist;

  el.playerArtwork.innerHTML = track.artwork
    ? `<img src="${escapeHtml(track.artwork)}" alt="${escapeHtml(track.title)}" onerror="this.style.display='none'">`
    : `<div class="artwork-placeholder">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 18V5l12-2v13"/>
          <circle cx="6" cy="18" r="3"/>
          <circle cx="18" cy="16" r="3"/>
        </svg>
      </div>`;

  // Update like button
  updateLikeButton();

  // Load audio
  audio.src = track.streamUrl;
  audio.load();

  try {
    await audio.play();
    state.isPlaying = true;
    updatePlayIcon();
    addToHistory(track);
  } catch (err) {
    state.isPlaying = false;
    updatePlayIcon();
    showToast('Tap tombol play untuk mulai', 'info');
  }

  // Refresh views to reflect active track
  refreshActiveView();

  // Load lyrics
  loadLyrics(track.id);
}

function refreshActiveView() {
  if (state.view === 'home' && state.trending.length > 0) {
    // Nothing to re-render for cards
  }
  if (state.view === 'search' && state.searchResults.length > 0) {
    renderTrackList('search-results', state.searchResults);
  }
  if (state.view === 'library') {
    renderLibrary();
  }
}

// ============================================================================
// 12. PLAYER — CONTROLS
// ============================================================================
function togglePlay() {
  if (!state.currentTrack) {
    if (state.queue.length > 0) {
      playTrackByIndex(0);
    } else {
      showToast('Pilih lagu terlebih dahulu', 'info');
    }
    return;
  }

  if (audio.paused) {
    audio.play().then(() => {
      state.isPlaying = true;
      updatePlayIcon();
      refreshActiveView();
    }).catch(() => {
      showToast('Gagal memutar', 'error');
    });
  } else {
    audio.pause();
    state.isPlaying = false;
    updatePlayIcon();
    refreshActiveView();
  }
}

function updatePlayIcon() {
  if (!el.playIcon) return;
  if (state.isPlaying) {
    el.playIcon.innerHTML = '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>';
    el.playBtn.setAttribute('title', 'Jeda');
    el.playBtn.setAttribute('aria-label', 'Jeda');
  } else {
    el.playIcon.innerHTML = '<polygon points="5,3 19,12 5,21"/>';
    el.playBtn.setAttribute('title', 'Putar');
    el.playBtn.setAttribute('aria-label', 'Putar');
  }
}

function playPrev() {
  if (state.queue.length === 0) return;
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  const index = state.shuffle ? randomIndex() : state.currentIndex - 1;
  if (index < 0) {
    if (state.repeat !== 'off') {
      playTrackByIndex(state.queue.length - 1);
    } else {
      audio.currentTime = 0;
    }
  } else {
    playTrackByIndex(index);
  }
}

function playNext() {
  if (state.queue.length === 0) return;

  if (state.repeat === 'one') {
    audio.currentTime = 0;
    audio.play();
    return;
  }

  const index = state.shuffle ? randomIndex() : state.currentIndex + 1;

  if (index >= state.queue.length) {
    if (state.repeat === 'all') {
      playTrackByIndex(0);
    } else {
      audio.pause();
      state.isPlaying = false;
      updatePlayIcon();
    }
  } else {
    playTrackByIndex(index);
  }
}

function randomIndex() {
  if (state.queue.length <= 1) return 0;
  let idx;
  do {
    idx = Math.floor(Math.random() * state.queue.length);
  } while (idx === state.currentIndex);
  return idx;
}

function toggleShuffle() {
  state.shuffle = !state.shuffle;
  el.shuffleBtn.classList.toggle('active', state.shuffle);
  showToast(state.shuffle ? 'Mode acak aktif' : 'Mode acak nonaktif', 'info');
}

function cycleRepeat() {
  const modes = ['off', 'all', 'one'];
  const current = modes.indexOf(state.repeat);
  state.repeat = modes[(current + 1) % modes.length];

  el.repeatBtn.classList.toggle('active', state.repeat !== 'off');
  el.repeatBtn.classList.toggle('repeat-one', state.repeat === 'one');

  const labels = { off: 'Ulangi nonaktif', all: 'Ulangi semua', one: 'Ulangi satu lagu' };
  showToast(labels[state.repeat], 'info');
}

function toggleMute() {
  state.muted = !state.muted;
  audio.muted = state.muted;
  updateVolumeIcon();
}

function updateVolumeIcon() {
  if (!el.volumeIcon) return;
  if (state.muted || audio.volume === 0) {
    el.volumeIcon.innerHTML = '<polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
  } else if (audio.volume < 0.5) {
    el.volumeIcon.innerHTML = '<polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>';
  } else {
    el.volumeIcon.innerHTML = '<polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
  }
}

function setVolume(val) {
  const v = Math.max(0, Math.min(1, val));
  audio.volume = v;
  state.volume = v;
  state.muted = v === 0;
  audio.muted = state.muted;
  if (el.volumeSlider) el.volumeSlider.value = Math.round(v * 100);
  updateVolumeIcon();
}

// ============================================================================
// 13. PLAYER — PROGRESS
// ============================================================================
function updateProgress() {
  if (!audio.duration || isNaN(audio.duration)) return;

  if (!state.seeking) {
    const pct = (audio.currentTime / audio.duration) * 100;
    if (el.progressBar) el.progressBar.style.width = `${pct}%`;
    if (el.progressThumb) el.progressThumb.style.left = `${pct}%`;
    if (el.currentTime) el.currentTime.textContent = formatTime(audio.currentTime);
  }

  // Buffer
  try {
    if (audio.buffered.length > 0) {
      const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
      const bufPct = (bufferedEnd / audio.duration) * 100;
      if (el.progressBuffer) el.progressBuffer.style.width = `${bufPct}%`;
    }
  } catch (_) {}

  // Update lyrics sync
  if (state.lyricsLines.length > 0) {
    syncLyrics(audio.currentTime);
  }
}

function seekFromEvent(e) {
  const rect = el.progressWrap.getBoundingClientRect();
  const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const pct = Math.max(0, Math.min(1, x / rect.width));
  if (audio.duration && isFinite(audio.duration)) {
    audio.currentTime = pct * audio.duration;
  }
}

function setupProgressInteraction() {
  let dragging = false;

  const start = (e) => {
    dragging = true;
    state.seeking = true;
    seekFromEvent(e);
    const onMove = (ev) => {
      if (!dragging) return;
      seekFromEvent(ev);
    };
    const onEnd = () => {
      dragging = false;
      state.seeking = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd);
  };

  el.progressWrap.addEventListener('mousedown', start);
  el.progressWrap.addEventListener('touchstart', start, { passive: true });

  el.progressWrap.addEventListener('keydown', (e) => {
    if (!audio.duration) return;
    if (e.key === 'ArrowRight') {
      audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
    } else if (e.key === 'ArrowLeft') {
      audio.currentTime = Math.max(0, audio.currentTime - 5);
    }
  });
}

// ============================================================================
// 14. LYRICS
// ============================================================================
async function loadLyrics(id) {
  el.lyricsTitle.textContent = state.currentTrack?.title || 'Lirik';
  el.lyricsArtist.textContent = state.currentTrack?.artist || '';
  el.lyricsContent.innerHTML = `
    <div class="loader" style="min-height:120px;">
      <div class="spinner"></div>
    </div>
  `;

  state.loadingLyrics = true;

  try {
    const data = await fetchJSON(`/api/lyric?id=${encodeURIComponent(id)}`);
    state.lyrics = data;
    state.lyricsLines = data.lyrics?.parsed || [];
    state.translatedLines = [];

    renderLyrics();
  } catch (err) {
    el.lyricsContent.innerHTML = `
      <div class="lyrics-placeholder">Lirik tidak tersedia</div>
    `;
  } finally {
    state.loadingLyrics = false;
  }
}

function renderLyrics() {
  if (state.loadingLyrics) return;

  if (!state.lyrics || (!state.lyrics.hasSynced && !state.lyrics.hasPlain)) {
    el.lyricsContent.innerHTML = `
      <div class="lyrics-placeholder">Lirik tidak ditemukan untuk lagu ini</div>
    `;
    return;
  }

  if (state.lyrics.hasSynced && state.lyricsLines.length > 0) {
    el.lyricsContent.innerHTML = state.lyricsLines.map((line, i) => `
      <div class="lyric-line" data-index="${i}" data-time="${line.timestamp}">
        <div class="lyric-line-text">${escapeHtml(line.text)}</div>
        ${state.showTranslation && state.translatedLines[i] ? `
          <div class="lyric-line-translation">${escapeHtml(state.translatedLines[i])}</div>
        ` : ''}
      </div>
    `).join('');

    el.lyricsContent.querySelectorAll('.lyric-line').forEach(line => {
      line.addEventListener('click', () => {
        const t = parseFloat(line.dataset.time);
        if (!isNaN(t)) audio.currentTime = t;
      });
    });

    state.lastSyncLine = -1;
  } else if (state.lyrics.hasPlain) {
    el.lyricsContent.innerHTML = `
      <div class="lyric-plain">${escapeHtml(state.lyrics.lyrics.plain)}</div>
    `;
  }
}

function syncLyrics(currentTime) {
  if (state.lyricsLines.length === 0) return;

  let activeIdx = -1;
  for (let i = 0; i < state.lyricsLines.length; i++) {
    if (state.lyricsLines[i].timestamp <= currentTime + 0.3) {
      activeIdx = i;
    } else {
      break;
    }
  }

  if (activeIdx === state.lastSyncLine) return;
  state.lastSyncLine = activeIdx;

  const lines = el.lyricsContent.querySelectorAll('.lyric-line');
  lines.forEach((line, i) => {
    line.classList.toggle('active', i === activeIdx);
  });

  if (activeIdx >= 0 && lines[activeIdx]) {
    const line = lines[activeIdx];
    const container = el.lyricsContent;
    const offset = line.offsetTop - container.clientHeight / 2 + line.clientHeight / 2;
    container.scrollTo({ top: offset, behavior: 'smooth' });
  }
}

async function toggleTranslation() {
  state.showTranslation = !state.showTranslation;

  if (!state.showTranslation) {
    state.translatedLines = [];
    renderLyrics();
    return;
  }

  if (!state.lyrics || !state.lyrics.hasSynced || state.lyricsLines.length === 0) {
    showToast('Lirik tersinkron tidak tersedia', 'info');
    state.showTranslation = false;
    el.translateToggle.checked = false;
    return;
  }

  if (state.translatedLines.length > 0) {
    renderLyrics();
    return;
  }

  showToast('Menerjemahkan lirik...', 'info');

  try {
    const texts = state.lyricsLines.map(l => l.text);
    const data = await fetchJSON('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines: texts, target: 'id' })
    });

    if (data.status && Array.isArray(data.translated)) {
      state.translatedLines = data.translated;
      renderLyrics();
    } else {
      showToast('Gagal menerjemahkan', 'error');
    }
  } catch (err) {
    showToast(`Gagal menerjemahkan: ${err.message}`, 'error');
  }
}

function toggleLyricsPanel() {
  el.lyricsPanel.classList.toggle('open');
}

// ============================================================================
// 15. LIKE
// ============================================================================
function updateLikeButton() {
  if (!state.currentTrack) {
    el.likeBtn.style.color = '';
    return;
  }
  const isLiked = state.liked.has(state.currentTrack.id);
  el.likeBtn.style.color = isLiked ? 'var(--danger)' : '';
  const path = el.likeBtn.querySelector('path');
  if (path) path.setAttribute('fill', isLiked ? 'currentColor' : 'none');
}

function toggleLike() {
  if (!state.currentTrack) {
    showToast('Pilih lagu terlebih dahulu', 'info');
    return;
  }

  const id = state.currentTrack.id;
  if (state.liked.has(id)) {
    state.liked.delete(id);
    showToast('Dihapus dari Disukai', 'info');
  } else {
    state.liked.add(id);
    showToast('Ditambahkan ke Disukai', 'success');
  }
  saveLiked();
  updateLikeButton();
}

// ============================================================================
// 16. DOWNLOAD
// ============================================================================
function openDownloadModal() {
  if (!state.currentTrack) {
    showToast('Pilih lagu terlebih dahulu', 'info');
    return;
  }

  const t = state.currentTrack;
  el.downloadTitle.textContent = t.title;
  el.downloadArtist.textContent = t.artist;
  el.downloadArtwork.style.backgroundImage = t.artwork ? `url("${t.artwork}")` : 'none';

  const base = `/api/download?id=${encodeURIComponent(t.id)}&title=${encodeURIComponent(t.title)}`;
  el.downloadHigh.href = `${base}&quality=256`;
  el.downloadLow.href = `${base}&quality=48`;

  el.downloadModal.classList.add('open');
}

function closeDownloadModal() {
  el.downloadModal.classList.remove('open');
}

// ============================================================================
// 17. EVENT BINDING
// ============================================================================
function bindEvents() {
  // Navigation
  el.navItems.forEach(item => {
    item.addEventListener('click', () => {
      const view = item.dataset.view;
      switchView(view);
      if (view === 'search' && !state.query) renderSearchInitial();
    });
  });

  // Theme
  el.themeToggle.addEventListener('click', toggleTheme);

  // Search
  const debouncedSearch = debounce((q) => performSearch(q), 450);
  el.searchInput.addEventListener('input', (e) => {
    const q = e.target.value;
    el.clearSearch.classList.toggle('hidden', !q);
    debouncedSearch(q);
  });

  el.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      performSearch(e.target.value);
    }
  });

  el.clearSearch.addEventListener('click', () => {
    el.searchInput.value = '';
    el.clearSearch.classList.add('hidden');
    state.query = '';
    renderSearchInitial();
    el.searchInput.focus();
  });

  // Player controls
  el.playBtn.addEventListener('click', togglePlay);
  el.prevBtn.addEventListener('click', playPrev);
  el.nextBtn.addEventListener('click', playNext);
  el.shuffleBtn.addEventListener('click', toggleShuffle);
  el.repeatBtn.addEventListener('click', cycleRepeat);
  el.likeBtn.addEventListener('click', toggleLike);

  // Progress
  setupProgressInteraction();

  // Volume
  el.volumeBtn.addEventListener('click', toggleMute);
  el.volumeSlider.addEventListener('input', (e) => {
    setVolume(parseInt(e.target.value, 10) / 100);
  });

  // Extras
  el.lyricsToggle.addEventListener('click', toggleLyricsPanel);
  el.lyricsClose.addEventListener('click', () => el.lyricsPanel.classList.remove('open'));
  el.downloadBtn.addEventListener('click', openDownloadModal);
  el.downloadClose.addEventListener('click', closeDownloadModal);

  el.downloadModal.addEventListener('click', (e) => {
    if (e.target === el.downloadModal) closeDownloadModal();
  });

  // Translation
  el.translateToggle.addEventListener('change', toggleTranslation);

  // Audio events
  audio.addEventListener('timeupdate', updateProgress);
  audio.addEventListener('progress', updateProgress);
  audio.addEventListener('loadedmetadata', () => {
    if (el.totalTime) el.totalTime.textContent = formatTime(audio.duration);
  });
  audio.addEventListener('durationchange', () => {
    if (el.totalTime) el.totalTime.textContent = formatTime(audio.duration);
  });
  audio.addEventListener('play', () => {
    state.isPlaying = true;
    updatePlayIcon();
    refreshActiveView();
  });
  audio.addEventListener('pause', () => {
    state.isPlaying = false;
    updatePlayIcon();
    refreshActiveView();
  });
  audio.addEventListener('ended', () => {
    state.isPlaying = false;
    updatePlayIcon();
    playNext();
  });
  audio.addEventListener('error', () => {
    if (state.currentTrack) showToast('Gagal memuat audio', 'error');
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.code === 'ArrowRight' && e.shiftKey) {
      playNext();
    } else if (e.code === 'ArrowLeft' && e.shiftKey) {
      playPrev();
    } else if (e.code === 'KeyL') {
      toggleLike();
    }
  });

  // Close lyrics/modal with ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      el.lyricsPanel.classList.remove('open');
      closeDownloadModal();
    }
  });
}

// ============================================================================
// 18. INIT
// ============================================================================
function init() {
  loadTheme();
  loadHistory();
  bindEvents();
  setVolume(0.8);
  updateVolumeIcon();

  // Initial view
  switchView('home');
  loadHome();
}

document.addEventListener('DOMContentLoaded', init);