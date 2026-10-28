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
    // Favourites only appears once there's at least one favourite photo.
    const primary = [page('index', 'index', '#', 'Index', 'Home')];
    if (hasFavourites) primary.push(page('favourites', 'favs', '#favourites', 'Favourites', 'Favs'));
    // Gear likewise only appears when gear.md has something in it.
    const items = primary.concat(
      hasGear ? [page('gear', 'gear', '#gear', 'Gear', 'Gear')] : [],
    ).concat(headerLinks(config).map((l) => ({ label: l.label, short: shortLabel(l.shortLabel, l.label), url: l.url, hover: l.hover })));

    const labelled = (item) => [
      el('span', { className: 'l-long', text: item.url ? `${item.label} ↗` : item.label }),
      el('span', { className: 'l-short', text: item.url ? `${item.short} ↗` : item.short }),
    ];
    const navLink = (item, className) => item.url
      ? el('a', { className, href: item.url, target: '_blank', rel: 'noopener noreferrer', title: item.hover }, labelled(item))
      : el('a', { className, href: item.hash, 'data-view': item.view, title: item.hover }, labelled(item));

    // Index and Favourites always stay visible; everything else folds into the menu when the row is too long.
    nav.textContent = '';
    items.forEach((item, i) => nav.append(navLink(item, i < primary.length ? 'nav-item' : 'nav-item nav-extra')));

    const toggle = el('button', { className: 'nav-item menu-toggle', type: 'button', 'aria-expanded': 'false', 'aria-haspopup': 'true' }, [
      el('span', { className: 'burger', 'aria-hidden': 'true' }, [el('span'), el('span'), el('span')]),
      el('span', { className: 'menu-label', text: 'Menu' }),
    ]);
    const panel = el('span', { className: 'menu-panel', hidden: 'hidden' });
    items.slice(primary.length).forEach((item) => {
      panel.append(item.url
        ? el('a', { href: item.url, target: '_blank', rel: 'noopener noreferrer', title: item.hover, text: `${item.label} ↗` })
        : el('a', { href: item.hash, 'data-view': item.view, title: item.hover }, [el('span', { text: item.label }), el('span', { className: 'dot', text: '●', 'aria-hidden': 'true' })]));
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
          el('span', { className: 'gear-title', text: `▶ ${group.title}` }),
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
    const spinner = document.getElementById('lb-spinner');
    const count = document.getElementById('lb-count');
    const caption = document.getElementById('lb-caption');
    const hint = document.getElementById('lb-hint');
    const save = document.getElementById('lb-save');
    const frame = img.parentElement;
    let list = [];
    let index = 0;
    let loadToken = 0;
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
      // Show the grid thumbnail (usually already cached) blurred under the spinner while the
      // untouched original loads, then swap the original in once it's decoded, so the sharp
      // photo is always the original. The resized copy is used only if the original fails.
      img.classList.add('is-loading');
      img.src = entry.thumb || entry.file;
      spinner.hidden = false;
      const original = new Image();
      original.onload = async () => {
        try { await original.decode(); } catch (e) { /* show it anyway */ }
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
      // From the photo's own metadata (read at build time); empty when the file has none.
      caption.textContent = [entry.title || entry.description, entry.camera, entry.lens, entry.exposure].filter(Boolean).join(' · ');
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
    window.addEventListener('resize', () => img.classList.toggle('can-zoom', canZoom()));

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
    // Trackpad pinches arrive as ctrl + wheel.
    lightbox.addEventListener('wheel', (e) => {
      if (!e.ctrlKey || lightbox.hidden) return;
      e.preventDefault();
      zoomTo((zoomed ? scale : fitScale()) * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
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
  }

  init();
})();
