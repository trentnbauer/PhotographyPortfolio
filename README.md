# Photography Portfolio

A minimal, framework-free photography portfolio: a hero with your name and social
links, a light/dark theme toggle, and a masonry gallery of your photos sorted by
upload date. Push a full-resolution photo to `images/`, and GitHub Actions
automatically resizes it into a fast, progressive JPEG and redeploys the site —
no manual build step, no third-party accounts, no secrets.

This repo is a **template**: it ships with placeholder photos/name and anyone
can fork or clone it to build their own version. Everything here — code,
config, and photos — is public, which is what makes the automatic
build-on-push pipeline possible for free (see [How it works](#how-it-works)).

## Quick start

1. Fork or clone this repo.
2. Edit `config.json` with your own details:
   ```json
   {
     "photographerName": "Your Name",
     "accentColor": "oklch(0.58 0.13 35)",
     "social": {
       "instagram": "https://instagram.com/yourhandle",
       "twitter": "https://x.com/yourhandle",
       "behance": "https://behance.net/yourhandle"
     }
   }
   ```
   Leave any social URL blank to hide that icon. `accentColor` accepts any
   valid CSS color (oklch, hex, etc).
3. Drop your photos into `images/` (jpg, jpeg, png, webp, tiff, gif, avif —
   any resolution, GitHub's limit is 100MB per file), named following the
   [filename convention](#filename-convention) below.
4. Commit and push. GitHub Actions takes it from there.
5. Turn on GitHub Pages once (Settings → Pages → Source: **GitHub Actions**).
   After the first successful workflow run, your site is live at
   `https://<username>.github.io/<repo>/`.

To preview locally before pushing:
```
npm install
npm run build
cd dist && python3 -m http.server 8080
```
Open http://localhost:8080. With no photos yet, the page falls back to a
placeholder gallery so you can see the layout.

## How it works

- `images/` holds your original, full-resolution photos, committed as-is.
- On every push, `.github/workflows/deploy.yml` runs `npm run build`
  (`scripts/build-gallery.js`), which uses [sharp](https://sharp.pixelplumb.com/)
  to resize each photo (capped at 2400px, so nobody downloads an 80MB scan to
  view a gallery thumbnail) and re-encodes it as a **progressive JPEG** — the
  format browsers render low-resolution-first while the rest streams in, so
  photos appear to load fast-then-sharpen with no extra thumbnail files or
  infrastructure needed.
- The build also writes `images/manifest.json` (inside the build output only,
  not committed) listing every photo, sorted newest first by the year/season/
  roll/frame encoded in its filename (see [Filename convention](#filename-convention)).
- The workflow deploys the built output directly to GitHub Pages. Nothing is
  written back to your `main` branch; resized images and the manifest are
  regenerated fresh on every push.
- Clicking a gallery photo opens the **original, untouched file** (full
  resolution, no compression applied) directly from the repo via
  `raw.githubusercontent.com`, in a new tab. Only the small gallery thumbnail
  is lossy-compressed — the original is never modified and isn't duplicated
  into the deployed site, so a large library of full-res scans doesn't risk
  hitting GitHub Pages' recommended ~1GB site size.

Because everything (code, config, photos) is public in this repo, there are
no secrets or credentials to manage — the whole pipeline runs on GitHub's
free Actions minutes for public repos and free GitHub Pages hosting.

## Filename convention

Photo metadata from scanners/film-editing software turned out to be
unreliable — present on some files, present-but-blank on others, absent
elsewhere — so gallery order and the camera/film caption shown in the
lightbox are both derived entirely from the filename instead:

```
{year}-{season}-{camera}-{filmStock}-[R{roll}-]{frame}
```

For example `2026-Autumn-KonicaAutoS2-FujiC200-R01-0024.jpg`, or without a
roll number, `2026-Autumn-KonicaAutoS2-FujiC200-0024.jpg`. `season` must be
one of `Summer`, `Autumn`, `Winter`, `Spring`. Photos are sorted newest
first by year, then season, then roll, then frame — so within a roll, later
frame numbers should be later shots. A file that doesn't match this pattern
still builds and displays fine, just without a camera/film caption, and
sorts to the end of the gallery (a build-time warning is logged so it's easy
to spot a typo in a filename).

## Custom domain + SSL

In the repo's Settings → Pages, add your custom domain (e.g.
`photography.example.com`) and add the CNAME record GitHub gives you at your
DNS provider. GitHub Pages auto-provisions a free SSL certificate (Let's
Encrypt) once DNS resolves — no extra cost or setup.

## Project structure

```
index.html                Page structure
css/style.css              Styling, light/dark theme, masonry layout
js/app.js                  Loads config + gallery manifest, renders the page
scripts/build-gallery.js   Resizes images/ into dist/, writes dist/images/manifest.json
config.json                 Your name, accent color, social links (committed)
images/                     Your original photos (committed, any resolution)
.github/workflows/deploy.yml  Builds and deploys to GitHub Pages on every push
dist/                       Build output (git-ignored, regenerated each run)
```

## Credits

Designed by Trent Bauer, built by Claude.
