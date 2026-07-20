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
   any resolution, GitHub's limit is 100MB per file).
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
  not committed) listing every photo with its upload date — taken from the
  git commit that first added the file — sorted newest first.
- The workflow deploys the built output directly to GitHub Pages. Nothing is
  written back to your `main` branch; resized images and the manifest are
  regenerated fresh on every push.

Because everything (code, config, photos) is public in this repo, there are
no secrets or credentials to manage — the whole pipeline runs on GitHub's
free Actions minutes for public repos and free GitHub Pages hosting.

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
