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
      avatar.classList.toggle('is-square', String(config.avatarShape).toLowerCase() === 'square');
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

  function initNav(config, { hasFavourites, hasGear }) {
    const nav = document.getElementById('site-nav');
    const pages = config.pages || {};
    const page = (key, view, hash, label, short) => ({
      view,
      hash,
      label: (pages[key] && pages[key].label) || label,
      short: shortLabel(pages[key] && pages[key].shortLabel, short),
      hover: pages[key] && pages[key].hover,
    });
    // The site's own pages are always visible. Favourites only appears once there's at least
    // one favourite photo, and Gear only when gear.md has something in it.
    const primary = [page('index', 'index', '#', 'Index', 'Home')];
    if (hasFavourites) primary.push(page('favourites', 'favs', '#favourites', 'Favourites', 'Favs'));
    if (hasGear) primary.push(page('gear', 'gear', '#gear', 'Gear', 'Gear'));
    const items = primary.concat(headerLinks(config).map((l) => ({ label: l.label, short: shortLabel(l.shortLabel, l.label), url: l.url, hover: l.hover })));

    const labelled = (item) => [
      el('span', { className: 'l-long', text: item.url ? `${item.label} ↗` : item.label }),
      el('span', { className: 'l-short', text: item.url ? `${item.short} ↗` : item.short }),
    ];
    const navLink = (item, className) => item.url
      ? el('a', { className, href: item.url, target: '_blank', rel: 'noopener noreferrer', title: item.hover }, labelled(item))
      : el('a', { className, href: item.hash, 'data-view': item.view, title: item.hover }, labelled(item));

    // The pages stay visible; the outside links fold into the menu on phones, and on wider
    // screens when the row is too long. On very small screens where even the pages don't fit,
    // everything but Home goes in the menu.
    nav.textContent = '';
    const navClass = (i) => (i === 0 ? 'nav-item' : i < primary.length ? 'nav-item nav-page' : 'nav-item nav-extra');
    items.forEach((item, i) => nav.append(navLink(item, navClass(i))));

    const toggle = el('button', { className: 'nav-item menu-toggle', type: 'button', 'aria-expanded': 'false', 'aria-haspopup': 'true' }, [
      el('span', { className: 'burger', 'aria-hidden': 'true' }, [el('span'), el('span'), el('span')]),
      el('span', { className: 'menu-label', text: 'Menu' }),
    ]);
    const panel = el('span', { className: 'menu-panel', hidden: 'hidden' });
    items.slice(1).forEach((item, i) => {
      panel.append(item.url
        ? el('a', { href: item.url, target: '_blank', rel: 'noopener noreferrer', title: item.hover, text: `${item.label} ↗` })
        : el('a', { className: i + 1 < primary.length ? 'menu-page' : null, href: item.hash, 'data-view': item.view, title: item.hover }, [el('span', { text: item.label }), el('span', { className: 'dot', text: '●', 'aria-hidden': 'true' })]));
    });
    nav.append(el('span', { className: 'nav-menu' }, [toggle, panel]));

    function setMenu(open) {
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('.menu-label').textContent = open ? 'Close' : 'Menu';
      if (!open) return;
      // Nudge the panel back on screen if it would hang off either edge (tiny screens).
      panel.style.setProperty('--nudge', '0px');
      const edge = 8;
      const box = panel.getBoundingClientRect();
      const viewport = document.documentElement.clientWidth;
      if (box.left < edge) panel.style.setProperty('--nudge', `${edge - box.left}px`);
      else if (box.right > viewport - edge) panel.style.setProperty('--nudge', `${viewport - edge - box.right}px`);
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

    const phone = window.matchMedia('(max-width: 640px)');
    const hasExtras = items.length > primary.length;
    // Lay the visible items out in one unwrapped row and compare their span with the room
    // inside the nav's padding.
    const overflows = () => {
      nav.classList.add('is-measuring');
      const shown = [...nav.querySelectorAll(':scope > .nav-item, .menu-toggle')].filter((node) => node.offsetParent !== null);
      const style = getComputedStyle(nav);
      const room = nav.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const span = shown.length ? shown[shown.length - 1].getBoundingClientRect().right - shown[0].getBoundingClientRect().left : 0;
      nav.classList.remove('is-measuring');
      return span > room + 1;
    };
    function layout() {
      if (nav.offsetParent === null) return;
      nav.classList.remove('is-collapsed', 'is-compact');
      const collapse = hasExtras && (phone.matches || overflows());
      nav.classList.toggle('is-collapsed', collapse);
      // Still too wide: fold the other pages into the menu as well.
      const compact = primary.length > 1 && overflows();
      if (compact) nav.classList.add('is-collapsed', 'is-compact');
      if (!collapse && !compact) setMenu(false);
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

  function initRouting(onShow, { hasFavourites, hasGear }) {
    const sections = { index: 'view-index', favs: 'view-favs', gear: 'view-gear' };
    let current = null;
    function show() {
      let view = VIEWS[location.hash.replace(/^#/, '')] || 'index';
      if ((view === 'favs' && !hasFavourites) || (view === 'gear' && !hasGear)) view = 'index';
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

  // A photo is "new" if its content hash wasn't in the gallery when this visitor's previous
  // visit ended. Hashing content (done at build time) means a renamed photo isn't new, while
  // an edited re-upload is.
  // A visit lasts until they've been away for VISIT_GAP_MS, so NEW tags survive reloads and
  // page changes, then clear on the next visit. Comparing photo lists rather than upload dates
  // means a photo committed just before a visit but deployed just after still gets flagged.
  // First-time visitors have no previous visit, so nothing is new for them.
  function newPhotoChecker(manifest) {
    const idOf = (entry) => entry.hash || entry.name || entry.file;
    const ids = manifest.map(idOf);
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
    storageSet(SEEN_KEY, JSON.stringify({ seen: ids, baseline, lastActive: now }));
    const known = baseline ? new Set(baseline) : null;
    return (entry) => !!known && !known.has(idOf(entry));
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
      if (fresh) {
        const added = entry.date ? new Date(entry.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }).toUpperCase() : '';
        inner.append(el('span', { className: 'new-badge', text: added ? `NEW · ${added}` : 'NEW' }));
      }
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

  // ---------- Gear ----------

  function gearCount(items) {
    const tags = items.map((item) => item.tag.toLowerCase());
    let unit = ['piece', 'pieces'];
    if (tags.every((tag) => tag === 'app')) unit = ['app', 'apps'];
    else if (tags.every((tag) => FILM_TAGS.has(tag))) unit = ['stock', 'stocks'];
    return `${items.length} ${unit[items.length === 1 ? 0 : 1]}`;
  }

  // gear is dist/gear.json, built from gear.md.
  function renderGear(gear) {
    const groupsEl = document.getElementById('gear-groups');
    const intro = document.getElementById('gear-intro');
    intro.textContent = gear.intro;
    intro.hidden = !gear.intro;

    groupsEl.textContent = '';
    gear.groups.forEach((group) => {
      const items = group.items.map((item) => el('div', { className: 'gear-item' }, [
        el('div', { className: 'gear-text' }, [
          item.url
            ? el('a', { className: 'gear-name', href: item.url, target: '_blank', rel: 'noopener noreferrer', text: `${item.name} ↗` })
            : el('span', { className: 'gear-name', text: item.name }),
          item.note ? el('span', { className: 'gear-note', text: item.note }) : '',
        ]),
        el('span', { className: 'gear-tag', text: item.tag }),
      ]));
      groupsEl.append(el('div', { className: 'gear-group' }, [
        el('div', { className: 'gear-label' }, [
          el('span', { className: 'gear-title', text: group.title }),
          el('span', { className: 'gear-count', text: gearCount(group.items) }),
        ]),
        el('div', { className: 'gear-items' }, items),
      ]));
    });
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
    const progress = document.getElementById('lb-progress');
    const bar = progress.firstElementChild;
    const count = document.getElementById('lb-count');
    const caption = document.getElementById('lb-caption');
    const hint = document.getElementById('lb-hint');
    const save = document.getElementById('lb-save');
    const frame = img.parentElement;
    let list = [];
    let index = 0;
    let loadToken = 0;
    let blobUrl = null;
    let historyPushed = false;
    let zoomed = false;
    let scale = 1;

    // Clicking the loaded original shows it at 100% (one image pixel per CSS pixel), keeping
    // the clicked point under the pointer; the frame then scrolls to pan. Clicking again fits it.
    // Pinching (or a trackpad pinch) sets any zoom between fitting the screen and 100%.
    function canZoom() {
      if (img.classList.contains('is-loading') || !img.naturalWidth) return false;
      return img.naturalWidth > img.clientWidth + 1 || img.naturalHeight > img.clientHeight + 1;
    }

    // The scale at which the whole photo fits the frame.
    function fitScale() {
      const box = frame.getBoundingClientRect();
      return Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight, 1);
    }

    function unzoom() {
      zoomed = false;
      lightbox.classList.remove('is-zoomed');
      img.style.width = '';
      img.style.height = '';
      frame.scrollLeft = 0;
      frame.scrollTop = 0;
      alignCaption();
    }

    // The caption comes only from the photo's own metadata (read at build time): its title,
    // then Camera · Lens · Aperture · Shutter · ISO, with "-" for any missing value. The fields
    // row is left out when all five are missing. Older manifests only have the combined
    // `exposure` string, so aperture, shutter and ISO fall back to parsing that.
    function renderCaption(entry) {
      const exposure = entry.exposure || '';
      const fromExposure = (re, group = 0) => (exposure.match(re) || [])[group] || '';
      const fields = [
        ['Camera', entry.camera],
        ['Lens', entry.lens],
        ['Aperture', entry.aperture || fromExposure(/f\/[\d.]+/)],
        ['Shutter', entry.shutter || fromExposure(/(?:1\/\d+|[\d.]+)s\b/)],
        ['ISO', entry.iso || fromExposure(/ISO (\d+)/, 1)],
      ];
      caption.textContent = '';
      const title = entry.title || entry.description;
      if (title) caption.append(el('span', { className: 'lb-title', text: title }));
      if (fields.some(([, value]) => value)) {
        caption.append(el('span', { className: 'lb-fields' }, fields.map(([label, value]) => el('span', { className: 'lb-field' }, [
          el('span', { className: 'lb-field-label', text: label }),
          el('span', { className: 'lb-field-value', text: value ? String(value) : '-' }),
        ]))));
      }
      alignCaption();
    }

    // On wider screens, line the caption up with the photo: its left edge under the photo's,
    // and its top 16px below the photo's bottom. While zoomed it sits in its normal place.
    const wideScreen = window.matchMedia('(min-width: 641px)');
    function alignCaption() {
      caption.style.marginLeft = '';
      caption.style.transform = '';
      if (lightbox.hidden || zoomed || !wideScreen.matches || !img.naturalWidth) return;
      const row = caption.parentElement;
      const rowBox = row.getBoundingClientRect();
      const padLeft = parseFloat(getComputedStyle(row).paddingLeft) || 0;
      const photo = img.getBoundingClientRect();
      caption.style.marginLeft = `${Math.max(0, photo.left - rowBox.left - padLeft)}px`;
      const dy = Math.min(0, photo.bottom + 16 - caption.getBoundingClientRect().top);
      caption.style.transform = `translateY(${dy}px)`;
    }

    // Show the photo at `next` × its full size (capped at 100%), keeping the point under
    // (clientX, clientY) in place. Zooming out to the fitted size or below returns to fit.
    function zoomTo(next, clientX, clientY) {
      if (img.classList.contains('is-loading') || !img.naturalWidth) return;
      const target = Math.min(1, next);
      if (target <= fitScale() * 1.02) {
        if (zoomed) unzoom();
        return;
      }
      const box = frame.getBoundingClientRect();
      const cx = clientX === undefined ? box.left + box.width / 2 : clientX;
      const cy = clientY === undefined ? box.top + box.height / 2 : clientY;
      const before = img.getBoundingClientRect();
      const fx = Math.min(1, Math.max(0, (cx - before.left) / before.width));
      const fy = Math.min(1, Math.max(0, (cy - before.top) / before.height));
      zoomed = true;
      scale = target;
      lightbox.classList.add('is-zoomed');
      img.style.width = `${img.naturalWidth * target}px`;
      img.style.height = `${img.naturalHeight * target}px`;
      const after = img.getBoundingClientRect();
      frame.scrollLeft += after.left + fx * after.width - cx;
      frame.scrollTop += after.top + fy * after.height - cy;
    }

    function setZoom(on, clientX, clientY) {
      if (on === zoomed) return;
      if (!on) unzoom();
      else if (canZoom()) zoomTo(1, clientX, clientY);
    }

    // fraction 0–1, or null when the size is unknown.
    function setProgress(fraction) {
      progress.classList.toggle('is-indeterminate', fraction === null);
      bar.style.width = fraction === null ? '' : `${fraction * 100}%`;
    }

    function releaseBlob() {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = null;
    }

    async function fetchWithProgress(url, token) {
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const total = Number(res.headers.get('content-length')) || 0;
      if (!total) setProgress(null);
      const reader = res.body.getReader();
      const chunks = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (token !== loadToken) {
          reader.cancel();
          throw new Error('superseded');
        }
        chunks.push(value);
        received += value.length;
        if (total) setProgress(Math.min(received / total, 1));
      }
      return URL.createObjectURL(new Blob(chunks, { type: res.headers.get('content-type') || '' }));
    }

    function show() {
      const entry = list[index];
      const token = ++loadToken;
      const full = entry.original || entry.file;
      // Save downloads the untouched original. Release files are served as downloads; a
      // committed photo opens in a new tab instead, from where it can be saved.
      save.href = full;
      save.setAttribute('download', entry.name || '');
      setZoom(false);
      img.alt = entry.alt || '';
      // Show the grid thumbnail (usually already cached) blurred under the progress bar while
      // the untouched original loads, then swap the original in once it's decoded, so the sharp
      // photo is always the original. The resized copy is used only if the original fails.
      img.classList.add('is-loading');
      img.src = entry.thumb || entry.file;
      releaseBlob();
      setProgress(0);
      progress.hidden = false;
      const finish = async (src) => {
        const decoded = new Image();
        decoded.src = src;
        try { await decoded.decode(); } catch (e) { /* show it anyway */ }
        if (token !== loadToken) return;
        img.src = src;
        img.classList.remove('is-loading');
        progress.hidden = true;
        alignCaption();
      };
      fetchWithProgress(full, token).then((url) => {
        if (token !== loadToken) return URL.revokeObjectURL(url);
        blobUrl = url;
        finish(url);
      }, () => {
        if (token !== loadToken) return;
        // Hosts without CORS headers (release downloads) can't be read by fetch, so load
        // the plain way with a progress bar that only shows something is happening.
        setProgress(null);
        const original = new Image();
        original.onload = () => finish(full);
        original.onerror = () => finish(entry.file);
        original.src = full;
      });
      // Warm the cache for the neighbours so stepping through feels quick.
      [1, -1].forEach((d) => {
        const next = list[(index + d + list.length) % list.length];
        if (next && next !== entry) new Image().src = next.original || next.file;
      });

      const pad = (n) => String(n).padStart(2, '0');
      count.textContent = `${pad(index + 1)} / ${pad(list.length)}`;
      renderCaption(entry);
      hint.textContent = '← → Esc';
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
      setZoom(false);
      lightbox.hidden = true;
      bodyScrollLock.unlock();
      img.removeAttribute('src');
      releaseBlob();
      progress.hidden = true;
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
    let drag = null;
    let dragged = false;
    // Clicking the empty area around the photo closes the viewer (or zooms back out).
    lightbox.addEventListener('click', (e) => {
      if (dragged) {
        // The click that ends a pan isn't a request to zoom out or close.
        dragged = false;
        return;
      }
      if (e.target === lightbox || e.target.classList.contains('lb-stage') || e.target === frame) {
        if (zoomed) setZoom(false);
        else close();
      }
    });

    // Drag to pan while zoomed (mouse; touch scrolls the frame natively). A drag isn't a click.
    frame.addEventListener('pointerdown', (e) => {
      dragged = false;
      if (!zoomed || e.pointerType !== 'mouse' || e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, left: frame.scrollLeft, top: frame.scrollTop };
      frame.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    frame.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) dragged = true;
      frame.scrollLeft = drag.left - dx;
      frame.scrollTop = drag.top - dy;
    });
    const endDrag = () => {
      drag = null;
      lightbox.classList.remove('is-dragging');
    };
    frame.addEventListener('pointerup', endDrag);
    frame.addEventListener('pointercancel', endDrag);
    frame.addEventListener('pointermove', () => { if (drag && dragged) lightbox.classList.add('is-dragging'); });
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dragged) {
        dragged = false;
        return;
      }
      setZoom(!zoomed, e.clientX, e.clientY);
    });
    img.addEventListener('load', () => img.classList.toggle('can-zoom', canZoom()));
    window.addEventListener('resize', () => {
      img.classList.toggle('can-zoom', canZoom());
      alignCaption();
    });

    document.addEventListener('keydown', (e) => {
      if (lightbox.hidden) return;
      if (e.key === 'Escape') {
        if (zoomed) setZoom(false);
        else close();
      }
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    });
    window.addEventListener('popstate', () => close({ fromPopstate: true }));

    // Pinch to zoom: the scale follows the change in distance between two fingers,
    // centred on the point between them.
    let pinch = null;
    const touchGap = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    lightbox.addEventListener('touchmove', (e) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const t = e.touches;
      zoomTo(pinch.scale * (touchGap(t) / pinch.gap), (t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2);
    }, { passive: false });
    lightbox.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) pinch = null;
    });
    // Keep iOS Safari from zooming the whole page instead.
    document.addEventListener('gesturestart', (e) => {
      if (!lightbox.hidden) e.preventDefault();
    });
    // The mouse wheel zooms around the pointer; trackpad pinches arrive as ctrl + wheel and
    // move in bigger steps.
    lightbox.addEventListener('wheel', (e) => {
      if (lightbox.hidden || img.classList.contains('is-loading')) return;
      e.preventDefault();
      const k = e.ctrlKey ? 0.01 : 0.0025;
      zoomTo((zoomed ? scale : fitScale()) * Math.exp(-e.deltaY * k), e.clientX, e.clientY);
    }, { passive: false });

    let touchX = null;
    let touchY = null;
    lightbox.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2 && !img.classList.contains('is-loading') && img.naturalWidth) {
        pinch = { gap: touchGap(e.touches), scale: zoomed ? scale : fitScale() };
      }
      if (e.touches.length !== 1) { touchX = null; return; }
      touchX = e.touches[0].clientX;
      touchY = e.touches[0].clientY;
    }, { passive: true });
    lightbox.addEventListener('touchend', (e) => {
      // While zoomed, swipes pan the photo instead of changing it.
      if (zoomed || touchX === null || !e.changedTouches.length) return;
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
    const manifest = (await loadJSON('images/manifest.json')) || [];
    // Favourites are the photos in the favourites release or images/favourites/ (flagged by the build).
    const favourites = manifest.filter((entry) => entry.favourite);
    const hasFavourites = favourites.length > 0;
    const gear = (await loadJSON('gear.json')) || { groups: [] };
    const hasGear = gear.groups.length > 0;
    const layoutNav = initNav(config, { hasFavourites, hasGear });
    const openLightbox = initLightbox();
    if (hasGear) renderGear(gear);

    initRouting((view) => {
      if (view === 'index') layoutNav();
    }, { hasFavourites, hasGear });

    document.getElementById('empty-hint').hidden = manifest.length > 0;
    renderGrid(document.getElementById('gallery'), manifest, { isNew: newPhotoChecker(manifest), onOpen: openLightbox });
    renderGrid(document.getElementById('favs-gallery'), favourites, { onOpen: openLightbox });
    document.getElementById('favs-count').textContent = `${favourites.length} ${favourites.length === 1 ? 'frame' : 'frames'}`;
  }

  init();
})();
