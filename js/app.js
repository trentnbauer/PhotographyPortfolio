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

  function initLightbox() {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const spinner = document.getElementById('lightbox-spinner');
    let loadToken = 0;

    function open(src, alt, thumbSrc) {
      const token = ++loadToken;
      lightboxImg.alt = alt || '';
      lightbox.hidden = false;

      if (thumbSrc) {
        lightboxImg.src = thumbSrc;
        lightboxImg.classList.add('is-loading');
        spinner.hidden = false;
      }

      const full = new Image();
      full.onload = () => {
        if (token !== loadToken) return;
        lightboxImg.src = src;
        lightboxImg.classList.remove('is-loading');
        spinner.hidden = true;
      };
      full.src = src;
    }

    function close() {
      loadToken++;
      lightbox.hidden = true;
      lightboxImg.src = '';
      lightboxImg.classList.remove('is-loading');
      spinner.hidden = true;
    }

    document.getElementById('lightbox-close').addEventListener('click', close);
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !lightbox.hidden) close();
    });

    return open;
  }

  function renderGallery(manifest, openLightbox) {
    const gallery = document.getElementById('gallery');
    const hint = document.getElementById('empty-hint');
    gallery.innerHTML = '';

    if (manifest && manifest.length) {
      hint.hidden = true;
      manifest.forEach((entry) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'photo-item';
        item.title = 'View full-size photo';

        const img = document.createElement('img');
        img.src = entry.file;
        img.loading = 'lazy';
        img.alt = entry.alt || '';
        if (entry.width && entry.height) {
          img.width = entry.width;
          img.height = entry.height;
        }
        item.appendChild(img);
        item.addEventListener('click', () => openLightbox(entry.original || entry.file, entry.alt, entry.file));
        gallery.appendChild(item);
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
    const openLightbox = initLightbox();
    const config = (await loadJSON('config.json')) || {};
    renderHero(config);
    renderGallery(await loadJSON('images/manifest.json'), openLightbox);
  }

  init();
})();
