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
  for (const entry of ['index.html', 'config.json']) {
    fs.cpSync(path.join(ROOT, entry), path.join(DIST_DIR, entry));
  }
  for (const dir of ['css', 'js']) {
    fs.cpSync(path.join(ROOT, dir), path.join(DIST_DIR, dir), { recursive: true });
  }
}

function gitAddedDate(absPath) {
  const relPath = path.relative(ROOT, absPath);
  try {
    const log = execFileSync(
      'git',
      ['log', '--diff-filter=A', '--follow', '--format=%aI', '--', relPath],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    const lines = log.split('\n').filter(Boolean);
    if (lines.length) return lines[lines.length - 1];
  } catch (e) {
    // not tracked yet (e.g. local preview before first commit) — fall through
  }
  return fs.statSync(absPath).mtime.toISOString();
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

  const entries = [];
  for (const file of files) {
    const srcPath = path.join(IMAGES_DIR, file);
    const outName = `${slugify(file)}.jpg`;
    const outPath = path.join(DIST_IMAGES_DIR, outName);

    const image = sharp(srcPath).rotate();
    const resized = image.resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    });
    const metadata = await resized.jpeg({ quality: JPEG_QUALITY, progressive: true }).toFile(outPath);

    entries.push({
      file: `images/${outName}`,
      original: originalUrl(repoSlug, branch, file) || `images/${outName}`,
      alt: labelFromFilename(file),
      date: gitAddedDate(srcPath),
      width: metadata.width,
      height: metadata.height,
    });
  }

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
