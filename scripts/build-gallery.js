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

function copyStaticFiles() {
  fs.mkdirSync(DIST_DIR, { recursive: true });
  for (const entry of ['index.html', 'config.json', 'gear.md']) {
    fs.cpSync(path.join(ROOT, entry), path.join(DIST_DIR, entry));
  }
  for (const dir of ['css', 'js']) {
    fs.cpSync(path.join(ROOT, dir), path.join(DIST_DIR, dir), { recursive: true });
  }
}

function loadGitAddedDates() {
  const map = new Map();
  try {
    const log = execFileSync(
      'git',
      ['log', '--diff-filter=A', '--format=%x00%aI', '--name-only', '--', 'images/'],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    let currentDate = null;
    for (const line of log.split('\n')) {
      if (line.startsWith('\0')) {
        currentDate = line.slice(1);
      } else if (line.trim()) {
        // git log runs newest-first, so the last write for a path wins (earliest add)
        map.set(line.trim(), currentDate);
      }
    }
  } catch (e) {
    // no git history available (e.g. fresh checkout) — callers fall back to mtime
  }
  return map;
}

function gitAddedDate(absPath, datesMap) {
  const relPath = path.relative(ROOT, absPath).split(path.sep).join('/');
  return datesMap.get(relPath) || fs.statSync(absPath).mtime.toISOString();
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
// "2026-Autumn-KonicaAutoS2-FujiC200-R01-0024.jpg" — camera and film stock
// are always the 3rd and 4th hyphen-separated segments.
function parseFilenameMeta(file) {
  const tokens = path.parse(file).name.split('-');
  if (tokens.length < 4) return {};
  return {
    camera: humanizeToken(tokens[2]),
    film: humanizeToken(tokens[3]),
  };
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

async function processImages() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.log('No images/ directory found — skipping gallery, placeholder will render.');
    return [];
  }

  const files = fs
    .readdirSync(IMAGES_DIR)
    .filter((file) => EXTENSIONS.has(path.extname(file).toLowerCase()));

  fs.mkdirSync(DIST_IMAGES_DIR, { recursive: true });

  const repoSlug = getRepoSlug();
  const branch = getBranch();
  const gitDates = loadGitAddedDates();

  const entries = await mapWithConcurrency(files, 8, async (file) => {
    const srcPath = path.join(IMAGES_DIR, file);
    const outName = `${slugify(file)}.jpg`;
    const outPath = path.join(DIST_IMAGES_DIR, outName);

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

    const { camera, film } = parseFilenameMeta(file);

    return {
      file: `images/${outName}`,
      original: originalUrl(repoSlug, branch, file) || `images/${outName}`,
      alt: labelFromFilename(file),
      date: gitAddedDate(srcPath, gitDates),
      width: metadata.width,
      height: metadata.height,
      camera,
      film,
    };
  });

  entries.sort((a, b) => new Date(b.date) - new Date(a.date));

  fs.writeFileSync(path.join(DIST_IMAGES_DIR, 'manifest.json'), JSON.stringify(entries, null, 2) + '\n');
  return entries;
}

async function main() {
  copyStaticFiles();
  const entries = await processImages();
  console.log(`Built ${entries.length} image(s) into dist/, sorted newest first.`);
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
