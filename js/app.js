(function () {
  const root = document.documentElement;
  const THEME_KEY = 'photo-portfolio-theme';
  const SEEN_KEY = 'photo-portfolio-visits';
  const VISIT_GAP_MS = 30 * 60 * 1000;
  const DEFAULT_FONTS = { display: 'Archivo', body: 'Archivo', mono: 'JetBrains Mono' };
  const VIEWS = { '': 'index', index: 'index', favourites: 'favs', gear: 'gear' };
  const FILM_TAGS = new Set(['colour', 'color', 'b&w', 'bw', 'black & white', 'slide', 'mystery']);

  const bodyScrollLock = (() => {
    let count = 0;
    return {
      lock() {
        count++;
        document.body.classList.add('scroll-locked');
      },
      unlock() {
        count = Math.max(0, count - 1);
        if (count === 0) document.body.classList.remove('scroll-locked');
      },
    };
  })();

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* private mode etc. */ }
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

  function el(tag, props, children) {
    const node = document.createElement(tag);
    Object.entries(props || {}).forEach(([key, value]) => {
      if (value == null || value === false) return;
      if (key === 'className') node.className = value;
      else if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value);
    });
    (children || []).forEach((child) => node.append(child));
    return node;
  }

  // Short labels must fit the phone nav, so they're capped at 4 characters.
  function shortLabel(short, long) {
    const value = String(short || long || '').trim();
    if (short && value.length > 4) console.warn(`[config] shortLabel "${value}" is over 4 characters; truncating`);
    return value.slice(0, 4);
  }

  // ---------- Theme ----------

  function currentTheme() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    if (theme === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    const next = theme === 'dark' ? 'Light' : 'Dark';
    document.getElementById('theme-label').textContent = next;
    document.getElementById('theme-toggle').setAttribute('aria-label', `Switch to ${next.toLowerCase()} mode`);
  }

  function initTheme() {
    applyTheme(currentTheme());
    document.getElementById('theme-toggle').addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      storageSet(THEME_KEY, next);
      const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!document.startViewTransition || reduceMotion) {
        applyTheme(next);
        return;
      }
      // Sweep the new theme across the screen as a diagonal wipe from the left.
      const transition = document.startViewTransition(() => applyTheme(next));
      transition.ready.then(() => {
        root.animate(
          { clipPath: ['polygon(0 0, 0% 0, -35% 100%, 0 100%)', 'polygon(0 0, 135% 0, 100% 100%, 0 100%)'] },
          { duration: 750, easing: 'cubic-bezier(.7,0,.25,1)', pseudoElement: '::view-transition-new(root)' }
        );
      }).catch(() => {});
    });
  }

  // ---------- Config ----------

  function loadFonts(fonts) {
    const families = [...new Set([fonts.display, fonts.body, fonts.mono])].filter(Boolean);
    const params = families
      .map((name) => 'family=' + encodeURIComponent(name).replace(/%20/g, '+') + ':wght@400;500;600;700')
      .join('&');
    document.getElementById('cfg-fonts').href = `https://fonts.googleapis.com/css2?${params}&display=swap`;
    const stack = (name, fallback) => `'${String(name).replace(/'/g, '')}', ${fallback}`;
    root.style.setProperty('--font-display', stack(fonts.display, 'sans-serif'));
    root.style.setProperty('--font-body', stack(fonts.body, 'sans-serif'));
    root.style.setProperty('--font-mono', stack(fonts.mono, 'monospace'));
  }

  function applyConfig(config) {
    const name = config.photographerName || 'Your Name Here';
    document.title = `${name} — Photography`;

    // Break the name onto one line per word, as in the design ("Trent / Bauer").
    const title = document.getElementById('photographer-name');
    title.textContent = '';
    name.split(/\s+/).forEach((word, i) => {
      if (i) title.append(el('br'));
      title.append(word);
    });

    document.getElementById('brand-long').textContent = name;
    document.getElementById('brand-short').textContent = shortLabel(config.photographerShortName, name);

    const tagline = document.getElementById('tagline');
    tagline.textContent = config.tagline ? config.tagline.replace(/\.?$/, '.') : '';
    tagline.hidden = !config.tagline;

    const avatar = document.getElementById('avatar');
    if (config.avatar) {
      avatar.src = config.avatar;
      avatar.alt = name;
      avatar.hidden = false;
    }

    if (config.siteUrl) {
      document.getElementById('footer-site').textContent = config.siteUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    }

    if (config.accentColor) root.style.setProperty('--accent', config.accentColor);

    const fonts = Object.assign({}, DEFAULT_FONTS, config.fonts || {});
    if (JSON.stringify(fonts) !== JSON.stringify(DEFAULT_FONTS)) loadFonts(fonts);

    const pages = config.pages || {};
    document.getElementById('favs-title').textContent = (pages.favourites && pages.favourites.label) || 'Favourites';
    document.getElementById('gear-title').textContent = (pages.gear && pages.gear.label) || 'Gear';
  }

  // headerLinks replaced the older `social` block; still honour `social` so old configs work.
  function headerLinks(config) {
    if (Array.isArray(config.headerLinks)) return config.headerLinks.filter((l) => l && l.label && l.url);
    const social = config.social || {};
    const known = { instagram: ['Instagram', 'IG'], twitter: ['X', 'X'], behance: ['Behance', 'Bē'] };
    return Object.entries(known)
      .filter(([key]) => social[key])
      .map(([key, [label, short]]) => ({ label, shortLabel: short, url: social[key] }));
  }

  // ---------- Nav ----------

  function initNav(config) {
    const nav = document.getElementById('site-nav');
    const pages = config.pages || {};
    const page = (key, view, hash, label, short) => ({
      view,
      hash,
      label: (pages[key] && pages[key].label) || label,
      short: shortLabel(pages[key] && pages[key].shortLabel, short),
    });
    const items = [
      page('index', 'index', '#', 'Index', 'Home'),
      page('favourites', 'favs', '#favourites', 'Favourites', 'Favs'),
      page('gear', 'gear', '#gear', 'Gear', 'Gear'),
    ].concat(headerLinks(config).map((l) => ({ label: l.label, short: shortLabel(l.shortLabel, l.label), url: l.url })));

    const labelled = (item) => [
      el('span', { className: 'l-long', text: item.url ? `${item.label} ↗` : item.label }),
      el('span', { className: 'l-short', text: item.url ? `${item.short} ↗` : item.short }),
    ];
    const navLink = (item, className) => item.url
      ? el('a', { className, href: item.url, target: '_blank', rel: 'noopener noreferrer' }, labelled(item))
      : el('a', { className, href: item.hash, 'data-view': item.view }, labelled(item));

    // Index and Favourites always stay visible; everything else folds into the menu when the row is too long.
    nav.textContent = '';
    items.forEach((item, i) => nav.append(navLink(item, i < 2 ? 'nav-item' : 'nav-item nav-extra')));

    const toggle = el('button', { className: 'nav-item menu-toggle', type: 'button', 'aria-expanded': 'false', 'aria-haspopup': 'true' }, [
      el('span', { className: 'burger', 'aria-hidden': 'true' }, [el('span'), el('span'), el('span')]),
      el('span', { className: 'menu-label', text: 'Menu' }),
    ]);
    const panel = el('span', { className: 'menu-panel', hidden: 'hidden' });
    items.slice(2).forEach((item) => {
      panel.append(item.url
        ? el('a', { href: item.url, target: '_blank', rel: 'noopener noreferrer', text: `${item.label} ↗` })
        : el('a', { href: item.hash, 'data-view': item.view }, [el('span', { text: item.label }), el('span', { className: 'dot', text: '●', 'aria-hidden': 'true' })]));
    });
    nav.append(el('span', { className: 'nav-menu' }, [toggle, panel]));

    function setMenu(open) {
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('.menu-label').textContent = open ? 'Close' : 'Menu';
    }
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      setMenu(panel.hidden);
    });
    panel.addEventListener('click', () => setMenu(false));
    document.addEventListener('click', (e) => {
      if (!panel.hidden && !panel.contains(e.target)) setMenu(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.hidden) setMenu(false);
    });

    function layout() {
      if (nav.offsetParent === null) return;
      nav.classList.remove('is-collapsed');
      nav.classList.add('is-measuring');
      const overflowing = nav.scrollWidth > nav.clientWidth + 1;
      nav.classList.remove('is-measuring');
      nav.classList.toggle('is-collapsed', overflowing);
      if (!overflowing) setMenu(false);
    }
    let resizeFrame = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(layout);
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
    return layout;
  }

  // ---------- Views ----------

  function initRouting(onShow) {
    const sections = { index: 'view-index', favs: 'view-favs', gear: 'view-gear' };
    let current = null;
    function show() {
      const view = VIEWS[location.hash.replace(/^#/, '')] || 'index';
      if (view === current) return;
      const first = current === null;
      current = view;
      document.body.dataset.view = view;
      Object.entries(sections).forEach(([key, id]) => { document.getElementById(id).hidden = key !== view; });
      document.querySelectorAll('[data-view]').forEach((link) => {
        if (link.dataset.view === view) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
      if (!first) window.scrollTo(0, 0);
      onShow(view);
    }
    window.addEventListener('hashchange', show);
    show();
  }

  // ---------- Gallery ----------

  // A photo is "new" if it wasn't in the gallery when this visitor's previous visit ended.
  // A visit lasts until they've been away for VISIT_GAP_MS, so NEW tags survive reloads and
  // page changes, then clear on the next visit. Comparing photo lists rather than upload dates
  // means a photo committed just before a visit but deployed just after still gets flagged.
  // First-time visitors have no previous visit, so nothing is new for them.
  function newPhotoChecker(manifest) {
    const names = manifest.map((entry) => entry.name || entry.file);
    const now = Date.now();
    let saved = null;
    try {
      saved = JSON.parse(storageGet(SEEN_KEY));
    } catch (e) {
      saved = null;
    }
    let baseline = null;
    if (saved && Array.isArray(saved.seen)) {
      const newVisit = !(now - saved.lastActive < VISIT_GAP_MS);
      baseline = newVisit ? saved.seen : saved.baseline;
    }
    storageSet(SEEN_KEY, JSON.stringify({ seen: names, baseline, lastActive: now }));
    const known = baseline ? new Set(baseline) : null;
    return (entry) => !!known && !known.has(entry.name || entry.file);
  }

  function renderGrid(container, entries, { isNew, onOpen }) {
    container.textContent = '';
    entries.forEach((entry, i) => {
      const ar = entry.width && entry.height ? entry.width / entry.height : 1.5;
      const img = el('img', {
        src: entry.thumb || entry.file,
        srcset: entry.thumb ? `${entry.thumb} 1200w, ${entry.file} 2400w` : null,
        sizes: entry.thumb ? '(max-width: 640px) 100vw, 50vw' : null,
        alt: entry.alt || '',
        loading: 'lazy',
        decoding: 'async',
        width: entry.width,
        height: entry.height,
      });
      const fresh = isNew && isNew(entry);
      const inner = el('span', { className: 'tile-inner' }, [img]);
      if (fresh) inner.append(el('span', { className: 'new-badge', text: 'NEW' }));
      const tile = el('a', { className: fresh ? 'tile is-new' : 'tile', href: entry.original || entry.file }, [inner]);
      tile.style.setProperty('--ar', ar.toFixed(4));
      tile.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onOpen(entries, i);
      });
      container.append(tile);
    });
  }

  function normaliseName(name) {
    return String(name).trim().toLowerCase().replace(/\.(jpe?g|png|webp|tiff?|gif|avif)$/, '');
  }

  // config.heroImages lists favourite filenames; matching ignores case and extension
  // (images/ has both .jpg and .JPG), falling back to a partial match.
  function pickFavourites(config, manifest) {
    const wanted = config.heroImages || config.favourites || [];
    const byName = new Map(manifest.map((entry) => [normaliseName(entry.name || ''), entry]));
    return wanted
      .map((name) => {
        const key = normaliseName(name);
        return byName.get(key) || manifest.find((entry) => normaliseName(entry.name || '').includes(key));
      })
      .filter(Boolean);
  }

  // ---------- Gear ----------

  function parseGearItem(text) {
    let name = text;
    let href = '';
    let rest = '';
    const link = text.match(/^\[(.+?)\]\((.+?)\)\s*(.*)$/);
    if (link) {
      [, name, href, rest] = link;
    } else {
      const split = text.match(/^(.*?)\s*((?:`[^`]+`|—\s).*)?$/);
      name = split[1];
      rest = split[2] || '';
    }
    let tag = '';
    const tagMatch = rest.match(/^`([^`]+)`\s*/);
    if (tagMatch) {
      tag = tagMatch[1];
      rest = rest.slice(tagMatch[0].length);
    }
    let note = rest.replace(/^—\s*/, '').trim();
    // Older gear.md wrote link notes in brackets: "[FilmCalc](url) (Calculates ...)".
    const bracketed = note.match(/^\((.*)\)$/);
    if (bracketed) note = bracketed[1].replace(/^./, (c) => c.toUpperCase());
    return { name: name.trim(), href, tag, note };
  }

  function parseGear(md) {
    const result = { intro: '', groups: [], selling: null };
    let current = null;
    let sawTitle = false;
    let selling = false;
    md.replace(/<!--[\s\S]*?-->/g, '').split('\n').forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      const heading = line.match(/^(#{1,3})\s+(.*)/);
      if (heading) {
        if (!sawTitle && heading[1] === '#') {
          sawTitle = true;
          return;
        }
        selling = /^selling$/i.test(heading[2]);
        current = selling ? null : { title: heading[2], items: [] };
        if (current) result.groups.push(current);
        return;
      }
      const item = line.match(/^[-*]\s+(.*)/);
      if (selling) {
        const link = line.match(/\[(.+?)\]\((.+?)\)/);
        if (link && !result.selling) result.selling = { label: link[1], url: link[2] };
      } else if (item && current) {
        current.items.push(parseGearItem(item[1]));
      } else if (!current && !result.intro) {
        result.intro = line;
      }
    });
    result.groups = result.groups.filter((group) => group.items.length);
    return result;
  }

  function gearCount(items) {
    const tags = items.map((item) => item.tag.toLowerCase());
    let unit = ['piece', 'pieces'];
    if (tags.every((tag) => tag === 'app')) unit = ['app', 'apps'];
    else if (tags.every((tag) => FILM_TAGS.has(tag))) unit = ['stock', 'stocks'];
    return `${items.length} ${unit[items.length === 1 ? 0 : 1]}`;
  }

  async function loadGear(gearUrl) {
    let text = null;
    for (const url of [gearUrl, 'gear.md'].filter(Boolean)) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) { text = await res.text(); break; }
      } catch (e) { /* try the next source */ }
    }
    const groupsEl = document.getElementById('gear-groups');
    if (!text) {
      groupsEl.textContent = 'Could not load gear.md.';
      return;
    }
    const gear = parseGear(text);

    const intro = document.getElementById('gear-intro');
    intro.textContent = gear.intro;
    intro.hidden = !gear.intro;

    groupsEl.textContent = '';
    gear.groups.forEach((group) => {
      const items = group.items.map((item) => el('div', { className: 'gear-item' }, [
        el('div', { className: 'gear-text' }, [
          item.href
            ? el('a', { className: 'gear-name', href: item.href, target: '_blank', rel: 'noopener noreferrer', text: `${item.name} ↗` })
            : el('span', { className: 'gear-name', text: item.name }),
          item.note ? el('span', { className: 'gear-note', text: item.note }) : '',
        ]),
        el('span', { className: 'gear-tag', text: item.tag }),
      ]));
      groupsEl.append(el('div', { className: 'gear-group' }, [
        el('div', { className: 'gear-label' }, [
          el('span', { className: 'gear-title', text: `▶ ${group.title}` }),
          el('span', { className: 'gear-count', text: gearCount(group.items) }),
        ]),
        el('div', { className: 'gear-items' }, items),
      ]));
    });

    const sellingEl = document.getElementById('gear-selling');
    if (gear.selling) {
      sellingEl.href = gear.selling.url;
      document.getElementById('gear-selling-label').textContent = gear.selling.label;
      sellingEl.hidden = false;
    }
  }

  // ---------- Lightbox ----------

  function resetViewportZoom() {
    const viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) return;
    const original = viewport.getAttribute('content');
    viewport.setAttribute('content', `${original}, maximum-scale=1.0`);
    setTimeout(() => viewport.setAttribute('content', original), 350);
  }

  function initLightbox() {
    const lightbox = document.getElementById('lightbox');
    const img = document.getElementById('lb-img');
    const spinner = document.getElementById('lb-spinner');
    const count = document.getElementById('lb-count');
    const caption = document.getElementById('lb-caption');
    const hint = document.getElementById('lb-hint');
    let list = [];
    let index = 0;
    let loadToken = 0;
    let historyPushed = false;

    function show() {
      const entry = list[index];
      const token = ++loadToken;
      const full = entry.original || entry.file;
      img.alt = entry.alt || '';
      // Only ever show the untouched original: keep the spinner up until it has loaded.
      // The resized copy is used only if the original can't be fetched at all.
      img.classList.add('is-loading');
      img.removeAttribute('src');
      spinner.hidden = false;
      const original = new Image();
      original.onload = () => {
        if (token !== loadToken) return;
        img.src = full;
        img.classList.remove('is-loading');
        spinner.hidden = true;
      };
      original.onerror = () => {
        if (token !== loadToken) return;
        img.src = entry.file;
        img.classList.remove('is-loading');
        spinner.hidden = true;
      };
      original.src = full;
      // Warm the cache for the neighbours so stepping through feels quick.
      [1, -1].forEach((d) => {
        const next = list[(index + d + list.length) % list.length];
        if (next && next !== entry) new Image().src = next.original || next.file;
      });

      const pad = (n) => String(n).padStart(2, '0');
      count.textContent = `${pad(index + 1)} / ${pad(list.length)}`;
      const cap = [entry.camera, entry.film].filter(Boolean).join(' · ');
      caption.textContent = cap;
      if (entry.frame) caption.append(el('span', { className: 'l-short', text: `${cap ? ' · ' : ''}${entry.frame}` }));
      hint.textContent = `${entry.frame ? `Frame ${entry.frame} · ` : ''}← → Esc`;
    }

    function open(entries, i) {
      list = entries;
      index = i;
      if (lightbox.hidden) {
        lightbox.hidden = false;
        bodyScrollLock.lock();
      }
      if (!historyPushed) {
        history.pushState({ lightboxOpen: true }, '');
        historyPushed = true;
      }
      show();
      document.getElementById('lb-close').focus({ preventScroll: true });
    }

    // Wraps at either end rather than clamping.
    function step(delta) {
      if (lightbox.hidden || !list.length) return;
      index = (index + delta + list.length) % list.length;
      show();
    }

    function close({ fromPopstate } = {}) {
      if (lightbox.hidden) return;
      loadToken++;
      lightbox.hidden = true;
      bodyScrollLock.unlock();
      img.removeAttribute('src');
      spinner.hidden = true;
      resetViewportZoom();
      if (historyPushed) {
        historyPushed = false;
        // Closed via button/backdrop/Escape rather than the Back button itself —
        // pop the state we pushed on open so a later Back press doesn't land on it.
        if (!fromPopstate) history.back();
      }
    }

    document.getElementById('lb-close').addEventListener('click', () => close());
    lightbox.querySelectorAll('.lb-arrow').forEach((button) => {
      button.addEventListener('click', () => step(Number(button.dataset.step)));
    });
    // Clicking the empty area around the photo closes the viewer.
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox || e.target.classList.contains('lb-stage') || e.target.classList.contains('lb-frame')) close();
    });
    document.addEventListener('keydown', (e) => {
      if (lightbox.hidden) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    });
    window.addEventListener('popstate', () => close({ fromPopstate: true }));

    let touchX = null;
    let touchY = null;
    lightbox.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) { touchX = null; return; }
      touchX = e.touches[0].clientX;
      touchY = e.touches[0].clientY;
    }, { passive: true });
    lightbox.addEventListener('touchend', (e) => {
      if (touchX === null || !e.changedTouches.length) return;
      const dx = e.changedTouches[0].clientX - touchX;
      const dy = e.changedTouches[0].clientY - touchY;
      touchX = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
    });

    return open;
  }

  // ---------- Boot ----------

  async function init() {
    initTheme();
    const config = (await loadJSON('config.json')) || {};
    applyConfig(config);
    const layoutNav = initNav(config);
    const openLightbox = initLightbox();

    let gearLoaded = false;
    initRouting((view) => {
      if (view === 'index') layoutNav();
      if (view === 'gear' && !gearLoaded) {
        gearLoaded = true;
        loadGear(config.gearUrl);
      }
    });

    const manifest = (await loadJSON('images/manifest.json')) || [];
    document.getElementById('empty-hint').hidden = manifest.length > 0;
    renderGrid(document.getElementById('gallery'), manifest, { isNew: newPhotoChecker(manifest), onOpen: openLightbox });
    renderGrid(document.getElementById('favs-gallery'), pickFavourites(config, manifest), { onOpen: openLightbox });
  }

  init();
})();
