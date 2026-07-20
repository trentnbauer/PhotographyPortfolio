(function () {
  const root = document.documentElement;
  const THEME_KEY = 'photo-portfolio-theme';
  const SOCIAL_LABELS = { instagram: 'IG', twitter: 'X', behance: 'Bē' };

  function applyTheme(theme) {
    if (theme === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    applyTheme(saved === 'dark' ? 'dark' : 'light');

    document.getElementById('theme-toggle').addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem(THEME_KEY, next);
    });
  }

  async function loadJSON(url) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  function renderHero(config) {
    const name = config.photographerName || 'Your Name Here';
    document.title = `${name} — Photography`;
    document.getElementById('photographer-name').textContent = name;

    root.style.setProperty('--accent', config.accentColor || 'oklch(0.58 0.13 35)');

    const social = config.social || {};
    const row = document.getElementById('social-row');
    row.innerHTML = '';
    Object.entries(SOCIAL_LABELS).forEach(([key, label]) => {
      const url = social[key];
      if (!url) return;
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'social-link';
      a.setAttribute('aria-label', key);
      a.textContent = label;
      row.appendChild(a);
    });
  }

  function renderGallery(manifest) {
    const gallery = document.getElementById('gallery');
    const hint = document.getElementById('empty-hint');
    gallery.innerHTML = '';

    if (manifest && manifest.length) {
      hint.hidden = true;
      manifest.forEach((entry) => {
        const link = document.createElement('a');
        link.className = 'photo-item';
        link.href = entry.original || entry.file;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.title = 'View original file';

        const img = document.createElement('img');
        img.src = entry.file;
        img.loading = 'lazy';
        img.alt = entry.alt || '';
        if (entry.width && entry.height) {
          img.width = entry.width;
          img.height = entry.height;
        }
        link.appendChild(img);
        gallery.appendChild(link);
      });
      return;
    }

    hint.hidden = false;
    const heights = [360, 260, 420, 300, 340, 460, 280, 400, 320, 380, 300, 440];
    heights.forEach((h, i) => {
      const item = document.createElement('div');
      item.className = 'placeholder-item';
      item.style.height = `${h}px`;
      const label = document.createElement('div');
      label.className = 'placeholder-label';
      label.textContent = `image ${String(i + 1).padStart(2, '0')}`;
      item.appendChild(label);
      gallery.appendChild(item);
    });
  }

  async function init() {
    initTheme();
    const config = (await loadJSON('config.json')) || {};
    renderHero(config);
    renderGallery(await loadJSON('images/manifest.json'));
  }

  init();
})();
