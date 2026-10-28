#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const sharp = require('sharp');
const YAML = require('yaml');
const exifr = require('exifr');

const ROOT = path.join(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'images');
// Photos in images/favourites/ appear in the main gallery and on the Favourites page.
const FAVOURITES_SUBDIR = 'favourites';
const DIST_DIR = path.join(ROOT, 'dist');
const DIST_IMAGES_DIR = path.join(DIST_DIR, 'images');
const DIST_THUMBS_DIR = path.join(DIST_IMAGES_DIR, 'thumbs');
const CACHE_DIR = path.join(ROOT, '.cache', 'images');
const ASSET_HASHES_FILE = path.join(ROOT, '.cache', 'asset-hashes.json');
const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.gif', '.avif']);
const MAX_DIMENSION = 2400;
const JPEG_QUALITY = 82;
// Grid tiles are at most ~600 CSS px wide, so 1200px covers 2x screens
// without making every visitor download the 2400px copy just to browse.
const THUMB_DIMENSION = 1200;

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// config.siteUrl is optional (e.g. a custom domain set only in GitHub Pages
// settings, and thus otherwise unknown to this script) — falls back to the
// github.io URL derivable from the repo slug so forks still get a working
// og:image for free.
function getSiteUrl(config, repoSlug) {
  if (config.siteUrl) return config.siteUrl.replace(/\/+$/, '');
  if (repoSlug) {
    const [owner, repo] = repoSlug.split('/');
    return `https://${owner}.github.io/${repo}`;
  }
  return null;
}

// Social/link-preview crawlers read the static HTML and don't run
// js/app.js, so — unlike the rest of the page's config-driven content,
// which is rendered client-side — these tags have to be baked into
// dist/index.html at build time.
function buildOgMeta(config, entries, siteUrl) {
  const title = config.photographerName ? `${config.photographerName} — Photography` : 'Photography Portfolio';
  const description = config.tagline || 'A photography portfolio.';
  const tags = [
    '<meta property="og:type" content="website">',
    `<meta property="og:title" content="${escapeAttr(title)}">`,
    `<meta property="og:description" content="${escapeAttr(description)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
  ];
  if (siteUrl) tags.push(`<meta property="og:url" content="${escapeAttr(siteUrl + '/')}">`);
  const newest = entries[0];
  // Deliberately points at the site's own resized copy (entry.file), not
  // entry.original (raw.githubusercontent.com) — GitHub serves raw file
  // content as `application/octet-stream` regardless of actual file type,
  // which makes Facebook/Messenger's crawler reject the image and, with it,
  // the whole link preview. Files served from the built site get a correct
  // `image/jpeg` content-type.
  if (newest && siteUrl) {
    tags.push(`<meta property="og:image" content="${escapeAttr(`${siteUrl}/${newest.file}`)}">`);
    tags.push(`<meta property="og:image:width" content="${newest.width}">`);
    tags.push(`<meta property="og:image:height" content="${newest.height}">`);
  }
  return tags.join('\n');
}

// gear.md → the Gear page's data (dist/gear.json). The paragraph under the
// top "# " heading is the intro; each "## Heading" is a group of "- item"
// rows, written as  Name `Tag` — note  or  [Name](url) `Tag` — note.
// Groups with no items are dropped; with none left the page is hidden.
function parseGearItem(text) {
  let name = text;
  let url = '';
  let rest = '';
  const link = text.match(/^\[(.+?)\]\((.+?)\)\s*(.*)$/);
  if (link) {
    [, name, url, rest] = link;
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
  return { name: name.trim(), tag, url, note: rest.replace(/^—\s*/, '').trim() };
}

// Drops <!-- ... --> comments. Uses plain string search and repeats until none
// are left, so pieces either side of a removed comment can't join up into a
// new "<!--". An unclosed comment drops everything after it.
function stripHtmlComments(text) {
  let previous;
  do {
    previous = text;
    let out = '';
    let pos = 0;
    for (;;) {
      const start = text.indexOf('<!--', pos);
      if (start === -1) {
        out += text.slice(pos);
        break;
      }
      out += text.slice(pos, start);
      const end = text.indexOf('-->', start + 4);
      if (end === -1) break;
      pos = end + 3;
    }
    text = out;
  } while (text !== previous);
  return text;
}

function loadGear() {
  const file = path.join(ROOT, 'gear.md');
  const gear = { intro: '', groups: [] };
  if (!fs.existsSync(file)) return gear;
  let current = null;
  let sawTitle = false;
  stripHtmlComments(fs.readFileSync(file, 'utf8'))
    .split('\n')
    .forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      const heading = line.match(/^(#{1,3})\s+(.*)/);
      if (heading) {
        if (!sawTitle && heading[1] === '#') {
          sawTitle = true;
          return;
        }
        current = { title: heading[2], items: [] };
        gear.groups.push(current);
        return;
      }
      const item = line.match(/^[-*]\s+(.*)/);
      if (item && current) current.items.push(parseGearItem(item[1]));
      else if (!current && !gear.intro) gear.intro = line;
    });
  gear.groups = gear.groups.filter((group) => group.items.length);
  return gear;
}

function copyStaticFiles(repoSlug, branch, entries) {
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // config.yaml is the source of truth; the page reads it as dist/config.json.
  const config = YAML.parse(fs.readFileSync(path.join(ROOT, 'config.yaml'), 'utf8')) || {};
  fs.writeFileSync(path.join(DIST_DIR, 'gear.json'), JSON.stringify(loadGear(), null, 2) + '\n');
  fs.writeFileSync(path.join(DIST_DIR, 'config.json'), JSON.stringify(config, null, 2) + '\n');

  const siteUrl = getSiteUrl(config, repoSlug);
  const indexHtml = fs
    .readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .replace('<!--OG_META-->', buildOgMeta(config, entries, siteUrl));
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), indexHtml);

  for (const dir of ['css', 'js']) {
    fs.cpSync(path.join(ROOT, dir), path.join(DIST_DIR, dir), { recursive: true });
  }
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Short fingerprint of a photo's contents. The site uses it to spot photos a
// visitor hasn't seen, so renaming a file doesn't make it look new but
// re-uploading an edited version does. 12 hex chars (48 bits) is plenty to
// keep a few thousand photos apart while keeping visitors' saved lists small.
function hashFile(absPath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(absPath)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex').slice(0, 12)))
      .on('error', reject);
  });
}

function slugify(file) {
  return path
    .parse(file)
    .name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------- Photo metadata ----------

// Captions come from each original's own metadata (EXIF / XMP / IPTC). Film
// scans mostly carry the lab scanner's details instead of the camera's, so
// anything that came from a scanner is ignored rather than shown.
const SCANNER_PATTERN = /noritsu|ez controller|frontier|fujifilm sp-|epson|perfection v|coolscan|nikon scan|plustek|opticfilm|pakon|imacon|flextight|silverfast|vuescan|reflecta|pacific image|kodak professional|scanner/i;

function metaText(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(metaText).filter(Boolean).join(', ');
  if (typeof value === 'object') return metaText(value.value);
  return String(value).replace(/\0/g, '').trim();
}

function formatExposure(m) {
  const parts = [];
  if (m.FocalLength) parts.push(`${Math.round(m.FocalLength)}mm`);
  if (m.FNumber) parts.push(`f/${Number(m.FNumber.toFixed(1))}`);
  if (m.ExposureTime) {
    const t = m.ExposureTime;
    parts.push(t >= 1 ? `${Number(t.toFixed(1))}s` : `1/${Math.round(1 / t)}s`);
  }
  const iso = m.ISO || m.ISOSpeedRatings;
  if (iso) parts.push(`ISO ${Array.isArray(iso) ? iso[0] : iso}`);
  return parts.join(' ');
}

async function readPhotoMetadata(filePath) {
  let m;
  try {
    m = await exifr.parse(filePath, { tiff: true, exif: true, xmp: true, iptc: true, mergeOutput: true });
  } catch (e) {
    return {};
  }
  if (!m) return {};
  const make = metaText(m.Make);
  const model = metaText(m.Model);
  const fromScanner = SCANNER_PATTERN.test(`${make} ${model}`);
  const camera = fromScanner ? '' : (model.toLowerCase().startsWith(make.toLowerCase()) ? model : `${make} ${model}`).trim();
  const info = {
    title: metaText(m.title) || metaText(m.ObjectName) || metaText(m.XPTitle),
    description: metaText(m.description) || metaText(m.ImageDescription) || metaText(m.Caption),
    camera,
    lens: fromScanner ? '' : metaText(m.LensModel) || metaText(m.Lens),
    exposure: fromScanner ? '' : formatExposure(m),
  };
  // A scanner's own text (e.g. its model in the description) isn't a caption either.
  ['title', 'description'].forEach((key) => {
    if (SCANNER_PATTERN.test(info[key])) info[key] = '';
  });
  return Object.fromEntries(Object.entries(info).filter(([, v]) => v));
}

function loadGitAddedDates() {
  const map = new Map();
  try {
    const log = execFileSync(
      // --no-renames: git's content-similarity heuristic can otherwise pair
      // a newly-added photo with an unrelated deleted one (binary JPEGs of
      // similar size trip the default 50% threshold), reclassifying it as a
      // rename so it's silently missing from --diff-filter=A output.
      'git',
      ['log', '--no-renames', '--diff-filter=A', '--format=%x00%aI', '--name-only', '--', 'images/'],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    let currentDate = null;
    for (const line of log.split('\n')) {
      if (line.startsWith('\0')) {
        currentDate = line.slice(1);
      } else if (line.trim()) {
        // Keyed by filename alone, so moving a photo into images/favourites/
        // keeps its original date (and place in the gallery) instead of
        // counting as a fresh upload. git log runs newest-first, so the last
        // write for a name wins (earliest add).
        map.set(path.posix.basename(line.trim()), currentDate);
      }
    }
  } catch (e) {
    // no git history available (e.g. fresh checkout) — callers fall back to mtime
  }
  return map;
}

function gitAddedDate(absPath, datesMap) {
  return datesMap.get(path.basename(absPath)) || fs.statSync(absPath).mtime.toISOString();
}

function getRepoSlug() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  try {
    const url = execFileSync('git', ['config', '--get', 'remote.origin.url'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const match = url.match(/[:/]([^/]+\/[^/]+?)(\.git)?$/);
    if (match) return match[1];
  } catch (e) {
    // no git remote available (e.g. fresh local checkout) — fall through
  }
  return null;
}

function getBranch() {
  return process.env.GITHUB_REF_NAME || 'main';
}

function originalUrl(repoSlug, branch, relPath) {
  if (!repoSlug) return null;
  const encoded = relPath.split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${repoSlug}/${branch}/images/${encoded}`;
}

function listImages(dir, favourite) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => EXTENSIONS.has(path.extname(file).toLowerCase()))
    .map((file) => ({ file, relPath: favourite ? `${FAVOURITES_SUBDIR}/${file}` : file, favourite }));
}

// ---------- Release photos ----------

// Photos can also live as files attached to two GitHub releases, so originals
// don't bloat the repo: everything in RELEASE_ALL shows in the gallery, and
// anything in RELEASE_FAVOURITES also shows on the Favourites page.
const RELEASE_ALL = 'images';
const RELEASE_FAVOURITES = 'favourites';

async function githubJSON(url) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'photography-portfolio-build' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${url}`);
  return res.json();
}

async function listReleaseAssets(repoSlug, tag) {
  const release = await githubJSON(`https://api.github.com/repos/${repoSlug}/releases/tags/${tag}`);
  if (!release) return [];
  const assets = [];
  for (let page = 1; ; page++) {
    const batch = await githubJSON(`https://api.github.com/repos/${repoSlug}/releases/${release.id}/assets?per_page=100&page=${page}`);
    if (!batch || !batch.length) break;
    assets.push(...batch);
    if (batch.length < 100) break;
  }
  return assets.filter((asset) => EXTENSIONS.has(path.extname(asset.name).toLowerCase()));
}

async function downloadTo(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': 'photography-portfolio-build' } });
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
}

// ---------- Resize cache ----------

// Resized copies are cached by content hash in .cache/ (kept between CI runs
// by actions/cache), so each original is only downloaded and resized once.
function cacheDir(hash) {
  return path.join(CACHE_DIR, hash);
}

// Bump when the cached per-photo data changes shape, so older cache entries
// are rebuilt (which re-reads each original once).
const CACHE_VERSION = 2;

function readCached(hash) {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(cacheDir(hash), 'meta.json'), 'utf8'));
    return meta.version === CACHE_VERSION ? meta : null;
  } catch (e) {
    return null;
  }
}

async function resizeIntoCache(hash, srcPath) {
  const dir = cacheDir(hash);
  fs.mkdirSync(dir, { recursive: true });
  const full = path.join(dir, 'full.jpg');
  const metadata = await sharp(srcPath)
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, progressive: true })
    .toFile(full);
  await sharp(full)
    .resize({ width: THUMB_DIMENSION, height: THUMB_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, progressive: true })
    .toFile(path.join(dir, 'thumb.jpg'));
  const meta = { version: CACHE_VERSION, width: metadata.width, height: metadata.height, info: await readPhotoMetadata(srcPath) };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta));
  return meta;
}

function loadAssetHashes() {
  try {
    return JSON.parse(fs.readFileSync(ASSET_HASHES_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

// ---------- Collecting photos ----------

async function localCandidates(repoSlug, branch) {
  if (!fs.existsSync(IMAGES_DIR)) return [];
  const files = listImages(IMAGES_DIR, false).concat(listImages(path.join(IMAGES_DIR, FAVOURITES_SUBDIR), true));
  const gitDates = loadGitAddedDates();
  return mapWithConcurrency(files, 8, async ({ file, relPath, favourite }) => {
    const srcPath = path.join(IMAGES_DIR, relPath);
    const hash = await hashFile(srcPath);
    const meta = readCached(hash) || await resizeIntoCache(hash, srcPath);
    return {
      name: file,
      hash,
      meta,
      favourite,
      date: gitAddedDate(srcPath, gitDates),
      original: originalUrl(repoSlug, branch, relPath),
    };
  });
}

async function releaseCandidates(repoSlug) {
  if (!repoSlug) return [];
  const assetHashes = loadAssetHashes();
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'release-photos-'));
  const candidates = [];
  try {
    for (const [tag, favourite] of [[RELEASE_ALL, false], [RELEASE_FAVOURITES, true]]) {
      const assets = await listReleaseAssets(repoSlug, tag);
      const results = await mapWithConcurrency(assets, 4, async (asset) => {
        // GitHub reports a sha256 digest for newer uploads; otherwise reuse the
        // hash from an earlier build, and only download when neither is known.
        let hash = asset.digest && asset.digest.startsWith('sha256:')
          ? asset.digest.slice(7, 19)
          : assetHashes[asset.id];
        let meta = hash && readCached(hash);
        if (!meta) {
          const tmp = path.join(tmpDir, `${asset.id}${path.extname(asset.name)}`);
          await downloadTo(asset.browser_download_url, tmp);
          hash = await hashFile(tmp);
          meta = readCached(hash) || await resizeIntoCache(hash, tmp);
          fs.rmSync(tmp, { force: true });
        }
        assetHashes[asset.id] = hash;
        return {
          name: asset.name,
          hash,
          meta,
          favourite,
          date: asset.created_at,
          original: asset.browser_download_url,
        };
      });
      candidates.push(...results);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(ASSET_HASHES_FILE), { recursive: true });
    fs.writeFileSync(ASSET_HASHES_FILE, JSON.stringify(assetHashes));
  }
  return candidates;
}

// The same file can turn up more than once (in images/ and a release, or in
// both releases): identical content is one photo, dated by its earliest
// upload, and a favourite if any copy is.
function mergeByHash(candidates) {
  const byHash = new Map();
  const hashesByName = new Map();
  candidates.forEach((c) => {
    const names = hashesByName.get(c.name) || new Set();
    names.add(c.hash);
    hashesByName.set(c.name, names);
    const existing = byHash.get(c.hash);
    if (!existing) {
      byHash.set(c.hash, { ...c });
      return;
    }
    if (new Date(c.date) < new Date(existing.date)) {
      byHash.set(c.hash, { ...c, favourite: existing.favourite || c.favourite });
    } else if (c.favourite) {
      existing.favourite = true;
    }
  });
  hashesByName.forEach((hashes, name) => {
    if (hashes.size > 1) {
      console.warn(`Warning: "${name}" exists as ${hashes.size} different files — it will show ${hashes.size} times. Upload the exact same file to both releases to show it once.`);
    }
  });
  return [...byHash.values()];
}

async function processImages(repoSlug, branch) {
  let releases = [];
  try {
    releases = await releaseCandidates(repoSlug);
  } catch (err) {
    // A CI build without the release photos would publish a half-empty site, so fail instead.
    if (process.env.CI) throw err;
    console.warn(`Skipping release photos: ${err.message}`);
  }
  const photos = mergeByHash((await localCandidates(repoSlug, branch)).concat(releases));

  fs.mkdirSync(DIST_THUMBS_DIR, { recursive: true });
  const entries = photos.map((photo) => {
    // The hash keeps names unique even if two different files share a filename.
    const outName = `${slugify(photo.name)}-${photo.hash.slice(0, 8)}.jpg`;
    fs.copyFileSync(path.join(cacheDir(photo.hash), 'full.jpg'), path.join(DIST_IMAGES_DIR, outName));
    fs.copyFileSync(path.join(cacheDir(photo.hash), 'thumb.jpg'), path.join(DIST_THUMBS_DIR, outName));

    const info = photo.meta.info || {};
    return {
      name: photo.name,
      hash: photo.hash,
      file: `images/${outName}`,
      thumb: `images/thumbs/${outName}`,
      original: photo.original || `images/${outName}`,
      alt: info.title || info.description || 'Photograph',
      date: photo.date,
      width: photo.meta.width,
      height: photo.meta.height,
      title: info.title,
      description: info.description,
      camera: info.camera,
      lens: info.lens,
      exposure: info.exposure,
      favourite: photo.favourite || undefined,
    };
  });

  entries.sort((a, b) => new Date(b.date) - new Date(a.date));

  fs.writeFileSync(path.join(DIST_IMAGES_DIR, 'manifest.json'), JSON.stringify(entries, null, 2) + '\n');
  return entries;
}

async function main() {
  const repoSlug = getRepoSlug();
  const branch = getBranch();
  const entries = await processImages(repoSlug, branch);
  copyStaticFiles(repoSlug, branch, entries);
  console.log(`Built ${entries.length} image(s) into dist/, sorted newest first.`);
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
