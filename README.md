# Photography Portfolio

A minimal, framework-free photography portfolio: a contact-sheet style grid of
your photos sorted by upload date, a Favourites page, a Gear page, a photo
viewer and a light/dark theme toggle. Push a full-resolution photo to `images/`, and GitHub Actions
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
     "photographerShortName": "YN",
     "tagline": "Hobby film photographer from Somewhere",
     "siteUrl": "https://yourdomain.com",
     "accentColor": "oklch(0.58 0.13 35)",
     "fonts": { "display": "Archivo", "body": "Archivo", "mono": "JetBrains Mono" },
     "avatar": "https://gravatar.com/avatar/<hash>?s=400&d=mp",
     "pages": {
       "index": { "label": "Index", "shortLabel": "Home" },
       "favourites": { "label": "Favourites", "shortLabel": "Favs" },
       "gear": { "label": "Gear", "shortLabel": "Gear" }
     },
     "headerLinks": [
       { "label": "Instagram", "shortLabel": "IG", "url": "https://instagram.com/yourhandle" }
     ]
   }
   ```
   - Every name has a long version (desktop) and a `shortLabel` of 4 characters
     or fewer (phones). Longer short labels are cut to 4 with a console warning.
   - `headerLinks` can hold any number of links. When the nav row gets too long,
     Index and Favourites stay visible and the rest fold into a ☰ Menu.
   - `fonts` takes any Google Fonts family names; they're loaded automatically.
   - `avatar` is optional; leave it out to hide the display picture.
   - `accentColor` accepts any valid CSS color. `siteUrl` is used for the
     social-preview image (`og:image`/`og:url`); without it, the build falls
     back to your `github.io` URL.
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
Open http://localhost:8080. With no photos yet, the page shows a short hint
on how to add them.

## How it works

- `images/` holds your original, full-resolution photos, committed as-is.
- On every push, `.github/workflows/deploy.yml` runs `npm run build`
  (`scripts/build-gallery.js`), which uses [sharp](https://sharp.pixelplumb.com/)
  to resize each photo (capped at 2400px, so nobody downloads an 80MB scan to
  view a gallery thumbnail) plus a 1200px copy for the grid, both as
  **progressive JPEGs** — the format browsers render low-resolution-first
  while the rest streams in, so photos appear to load fast-then-sharpen.
- The build also writes `images/manifest.json` (inside the build output only,
  not committed) listing every photo, sorted newest first by the date it was
  added to the repo (from git history, falling back to the file's mtime for
  photos that aren't committed yet).
- The workflow deploys the built output directly to GitHub Pages. Nothing is
  written back to your `main` branch; resized images and the manifest are
  regenerated fresh on every push.
- Clicking a gallery photo opens it in a viewer (arrow keys, swipe, Esc)
  that shows only the **original, untouched file** (full resolution, no
  compression applied), loaded directly from the repo via
  `raw.githubusercontent.com`. The photos either side are preloaded so
  stepping through is quick. Only the small gallery thumbnail
  is lossy-compressed — the original is never modified and isn't duplicated
  into the deployed site, so a large library of full-res scans doesn't risk
  hitting GitHub Pages' recommended ~1GB site size.

- The build also records a short SHA-256 fingerprint of each original's
  contents. Each visitor's browser (localStorage) remembers which
  fingerprints were in the gallery on their last visit. Anything added since
  gets an orange outline and a NEW tag for the whole visit (reloads
  included); a visit ends after 30 minutes away. First-time visitors see no tags. Because it goes by file
  contents, renaming a photo doesn't make it look new, but replacing it with
  an edited version does.

Because everything (code, config, photos) is public in this repo, there are
no secrets or credentials to manage — the whole pipeline runs on GitHub's
free Actions minutes for public repos and free GitHub Pages hosting.

## Filename convention

Photo metadata from scanners/film-editing software turned out to be
unreliable — present on some files, present-but-blank on others, absent
elsewhere — so the camera/film caption shown in the lightbox is derived
entirely from the filename instead:

```
{year}-{season}-{camera}-{filmStock}-[R{roll}-]{frame}
```

For example `2026-Autumn-KonicaAutoS2-FujiC200-R01-0024.jpg`, or without a
roll number, `2026-Autumn-KonicaAutoS2-FujiC200-0024.jpg`. `season` must be
one of `Summer`, `Autumn`, `Winter`, `Spring`. A file that doesn't match
this pattern still builds, sorts, and displays fine — it just won't show a
camera/film caption (a build-time warning is logged so it's easy to spot a
typo in a filename).

Gallery order itself doesn't come from this filename — it comes from git
history (see [How it works](#how-it-works)), since roll/frame numbers reset
independently per camera and aren't comparable across different cameras
used in the same season.

## Photos in releases

Photos can also be attached to two GitHub releases instead of committed,
which keeps large scans out of the repo (each file can be up to 2GB and
GitHub never compresses them):

- **`images`** — every photo on the site.
- **`favourites`** — photos also shown on the Favourites page.

To add photos, open **Releases → Images → Edit**, drag files into the
attachments box and click **Update release** (or run
`gh release upload images *.jpg`). The site rebuilds every hour; to update
straight away, open **Actions → Build and deploy → Run workflow**. A
release photo's gallery date is when it was uploaded.

To make a photo a favourite, upload an **exact copy** of the file to the
`favourites` release. The build matches files by content, so a photo found
in both releases (or in a release and `images/`) shows once in the gallery,
keeps its earliest date, and doesn't get a NEW tag. If the copies differ
(say, a re-export), it will show twice, and the build logs a warning.

`.github/workflows/migrate-to-releases.yml` is a one-off workflow that copies
the photos committed in `images/` into these releases, in the batches they
were originally committed in so the gallery keeps its order.

## Favourites folder

Committed photos in `images/favourites/` also make up the Favourites page,
and still appear in the main gallery. Moving a photo into that folder keeps
its place in the gallery (dates are tracked by filename) and doesn't give it
a NEW tag (those go by file contents).

## Gear page

`gear.md` drives the Gear page. Each `## Heading` is a group and each list
item a row; a tag in backticks (`` `Body` ``, `` `Lens` ``, `` `App` ``…) shows on
the right, and text after ` — ` is a note. The paragraph under the top
`# Gear` heading is the intro, and the first link in a `## Selling` section
becomes the bar at the bottom:

```md
## Minolta
- SRT 303 `Body`
- [FilmCalc](https://filmcalc.app) `App` — Price of shooting film.
```

## Custom domain + SSL

In the repo's Settings → Pages, add your custom domain (e.g.
`photography.example.com`) and add the CNAME record GitHub gives you at your
DNS provider. GitHub Pages auto-provisions a free SSL certificate (Let's
Encrypt) once DNS resolves — no extra cost or setup.

## Project structure

```
index.html                Page structure
css/style.css              Styling, light/dark theme, photo grid
js/app.js                  Loads config, manifest + gear.md; renders Index, Favourites and Gear
gear.md                    Gear list shown on the Gear page
scripts/build-gallery.js   Resizes images/ and release photos into dist/, writes dist/images/manifest.json
scripts/migrate-to-releases.js  One-off copy of images/ into the images/favourites releases
config.json                 Your name, links, fonts, avatar (committed)
images/                     Your original photos (committed, any resolution)
images/favourites/          Photos also shown on the Favourites page
.github/workflows/deploy.yml  Builds and deploys to GitHub Pages on every push
dist/                       Build output (git-ignored, regenerated each run)
```

## Credits

Designed by Trent Bauer, built by Claude.
