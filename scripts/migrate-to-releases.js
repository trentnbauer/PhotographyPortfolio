#!/usr/bin/env node
// One-off: copy the photos committed in images/ into the "images" and
// "favourites" GitHub releases. Photos are uploaded in the same batches they
// were originally committed in, oldest batch first, so their upload times
// keep the gallery's newest-first order. Re-running skips files already
// uploaded. Run by .github/workflows/migrate-to-releases.yml (needs gh + GH_TOKEN).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'images');
const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.gif', '.avif']);

const RELEASES = [
  {
    tag: 'images',
    title: 'Images',
    dir: IMAGES_DIR,
    notes: 'Every photo on the site. Attach new scans here; the site picks them up on its next build (hourly, or run "Build and deploy" from the Actions tab).',
  },
  {
    tag: 'favourites',
    title: 'Favourites',
    dir: path.join(IMAGES_DIR, 'favourites'),
    notes: 'Photos shown on the Favourites page. Upload an exact copy of a file from the Images release; it still shows only once in the main gallery.',
  },
];

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opts });
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Group the files in `dir` by the commit that first added each filename,
// oldest commit first.
function batchesFor(dir) {
  if (!fs.existsSync(dir)) return [];
  const current = new Set(
    fs.readdirSync(dir).filter((f) => EXTENSIONS.has(path.extname(f).toLowerCase()) && fs.statSync(path.join(dir, f)).isFile())
  );
  const log = run('git', ['log', '--reverse', '--no-renames', '--diff-filter=A', '--format=%x00%h %aI %s', '--name-only', '--', 'images/']);
  const firstCommit = new Map();
  const order = [];
  log.split('\0').forEach((block) => {
    const lines = block.split('\n').filter((l) => l.trim());
    if (!lines.length) return;
    const commit = lines[0];
    lines.slice(1).forEach((file) => {
      const name = path.posix.basename(file.trim());
      if (current.has(name) && !firstCommit.has(name)) {
        firstCommit.set(name, commit);
        if (!order.includes(commit)) order.push(commit);
      }
    });
  });
  const batches = order.map((commit) => ({
    commit,
    files: [...firstCommit].filter(([, c]) => c === commit).map(([name]) => name).sort(),
  }));
  // Files with no git history (shouldn't happen for committed photos) go last.
  const untracked = [...current].filter((name) => !firstCommit.has(name)).sort();
  if (untracked.length) batches.push({ commit: '(no git history)', files: untracked });
  return batches;
}

function ensureRelease({ tag, title, notes }) {
  try {
    run('gh', ['release', 'view', tag, '--json', 'tagName']);
    console.log(`Release "${tag}" already exists.`);
  } catch (e) {
    run('gh', ['release', 'create', tag, '--title', title, '--notes', notes, '--latest=false', '--target', 'main']);
    console.log(`Created release "${tag}".`);
  }
  const names = run('gh', ['release', 'view', tag, '--json', 'assets', '--jq', '.assets[].name']);
  return new Set(names.split('\n').filter(Boolean));
}

for (const release of RELEASES) {
  const uploaded = ensureRelease(release);
  const batches = batchesFor(release.dir);
  console.log(`\n${release.tag}: ${batches.reduce((n, b) => n + b.files.length, 0)} photo(s) in ${batches.length} batch(es).`);
  batches.forEach((batch, i) => {
    const todo = batch.files.filter((name) => !uploaded.has(name));
    console.log(`  Batch ${i + 1}/${batches.length} — ${batch.commit}: ${todo.length} to upload, ${batch.files.length - todo.length} already there.`);
    if (!todo.length) return;
    run('gh', ['release', 'upload', release.tag, ...todo.map((name) => path.join(release.dir, name))], { stdio: ['ignore', 'inherit', 'inherit'] });
    // Keep each batch's upload times clearly after the previous batch's.
    sleep(3000);
  });
}
console.log('\nDone.');
