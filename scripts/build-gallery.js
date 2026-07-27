#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'images');
const DIST_DIR = path.join(ROOT, 'dist');
const DIST_IMAGES_DIR = path.join(DIST_DIR, 'images');
const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.gif', '.avif']);
const MAX_DIMENSION = 2400;
const JPEG_QUALITY = 82;

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

function copyStaticFiles(repoSlug, branch, entries) {
  fs.mkdirSync(DIST_DIR, { recursive: true });

  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  // Fetched live from GitHub's raw content at runtime so gear.md edits show up
  // without needing a full rebuild — falls back to the bundled copy when
  // there's no known repo (e.g. a local checkout with no git remote).
  config.gearUrl = repoSlug
    ? `https://raw.githubusercontent.com/${repoSlug}/${branch}/gear.md`
    : 'gear.md';
  fs.writeFileSync(path.join(DIST_DIR, 'config.json'), JSON.stringify(config, null, 2) + '\n');

  const siteUrl = getSiteUrl(config, repoSlug);
  const indexHtml = fs
    .readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .replace('<!--OG_META-->', buildOgMeta(config, entries, siteUrl));
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), indexHtml);

  fs.cpSync(path.join(ROOT, 'gear.md'), path.join(DIST_DIR, 'gear.md'));

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

function slugify(file) {
  return path
    .parse(file)
    .name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function labelFromFilename(file) {
  return path.parse(file).name.replace(/[-_]+/g, ' ');
}

function humanizeToken(token) {
  return token
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .trim();
}

// Filenames follow {year}-{season}-{camera}-{filmStock}-[R{roll}-]{frame}, e.g.
// "2026-Autumn-KonicaAutoS2-FujiC200-R01-0024.jpg" or, without a roll number,
// "2026-Autumn-KonicaAutoS2-FujiC200-0024.jpg". Scanner/editor-embedded photo
// metadata turned out to be unreliable across the library (present on some
// files, present-but-blank on others, absent elsewhere), so both the gallery
// order and the camera/film caption are derived entirely from this naming
// convention, which is the one thing guaranteed present on every file.
const SEASONS = ['Summer', 'Autumn', 'Winter', 'Spring'];
const FILENAME_PATTERN = /^(\d{4})-(Summer|Autumn|Winter|Spring)-([^-]+)-([^-]+)-(?:R(\d+)-)?(\d+)$/;

function parseFilename(file) {
  const match = path.parse(file).name.match(FILENAME_PATTERN);
  if (!match) return null;
  const [, year, season, camera, film, roll, frame] = match;
  return {
    year: Number(year),
    season,
    seasonIndex: SEASONS.indexOf(season),
    camera: humanizeToken(camera),
    film: humanizeToken(film),
    roll: roll ? Number(roll) : 0,
    frame: Number(frame),
  };
}

// Sorts newest first: later year, then later season, then later roll, then
// later frame. Files that don't match the naming convention (meta === null)
// sort last, since there's nothing to rank them by.
function recencyRank(meta) {
  if (!meta) return [-Infinity, -Infinity, -Infinity, -Infinity];
  return [meta.year, meta.seasonIndex, meta.roll, meta.frame];
}

function compareByRecency(metaA, metaB) {
  const a = recencyRank(metaA);
  const b = recencyRank(metaB);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return b[i] - a[i];
  }
  return 0;
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

function originalUrl(repoSlug, branch, file) {
  if (!repoSlug) return null;
  return `https://raw.githubusercontent.com/${repoSlug}/${branch}/images/${encodeURIComponent(file)}`;
}

async function processImages(repoSlug, branch) {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.log('No images/ directory found — skipping gallery, placeholder will render.');
    return [];
  }

  const files = fs
    .readdirSync(IMAGES_DIR)
    .filter((file) => EXTENSIONS.has(path.extname(file).toLowerCase()));

  fs.mkdirSync(DIST_IMAGES_DIR, { recursive: true });

  const outNameSources = new Map();

  const built = await mapWithConcurrency(files, 8, async (file) => {
    const srcPath = path.join(IMAGES_DIR, file);
    const outName = `${slugify(file)}.jpg`;
    const outPath = path.join(DIST_IMAGES_DIR, outName);

    const collidesWith = outNameSources.get(outName);
    if (collidesWith) {
      throw new Error(`Filename collision: "${file}" and "${collidesWith}" both produce "${outName}" — rename one of them.`);
    }
    outNameSources.set(outName, file);

    let metadata;
    const srcMtime = fs.statSync(srcPath).mtimeMs;
    if (fs.existsSync(outPath) && fs.statSync(outPath).mtimeMs >= srcMtime) {
      metadata = await sharp(outPath).metadata();
    } else {
      const image = sharp(srcPath).rotate();
      const resized = image.resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      });
      metadata = await resized.jpeg({ quality: JPEG_QUALITY, progressive: true }).toFile(outPath);
    }

    const meta = parseFilename(file);
    if (!meta) {
      console.warn(`Warning: "${file}" doesn't match the expected naming pattern — it will sort last and show no camera/film caption.`);
    }

    return {
      meta,
      entry: {
        file: `images/${outName}`,
        original: originalUrl(repoSlug, branch, file) || `images/${outName}`,
        alt: labelFromFilename(file),
        date: meta ? `${meta.season} ${meta.year}` : null,
        width: metadata.width,
        height: metadata.height,
        camera: meta ? meta.camera : undefined,
        film: meta ? meta.film : undefined,
      },
    };
  });

  built.sort((a, b) => compareByRecency(a.meta, b.meta));
  const entries = built.map((b) => b.entry);

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
