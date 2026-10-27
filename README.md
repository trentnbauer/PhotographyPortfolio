# Photography Portfolio

A minimal, framework-free photography portfolio: a contact-sheet style grid of
your photos (newest first), a Favourites page, a Gear page, a full-resolution
photo viewer and a light/dark theme. GitHub Actions resizes your photos and
deploys the site to GitHub Pages — no servers, no paid services, no secrets to
manage.

This repo is a **template**: anyone can fork or clone it to build their own
version. Everything here — code, config, and photos — is public, which is what
lets the whole pipeline run free on GitHub.

## Quick start

1. Fork or clone this repo.
2. Edit [`config.yaml`](config.yaml) with your details (see [Configuration](#configuration)).
3. Turn on GitHub Pages once: **Settings → Pages → Source: GitHub Actions**.
4. Add photos (see [Adding photos](#adding-photos)).

After the first successful workflow run, your site is live at
`https://<username>.github.io/<repo>/`.

To preview locally:
```
npm install
npm run build
cd dist && python3 -m http.server 8080
```
Open http://localhost:8080. With no photos yet, the page shows a short hint.

## Configuration

Everything about the site lives in `config.yaml`; each setting is commented in
the file itself. In short:

| Setting | What it does |
|---|---|
| `photographerName` / `photographerShortName` | Your name: the long one on desktop, the short one (≤ 4 characters) on phones. |
| `tagline` | The line under your name. |
| `siteUrl` | Your domain, used for link previews (`og:image`/`og:url`). Without it the build uses your `github.io` address. |
| `accentColor` | Any CSS colour (oklch, hex…). |
| `fonts` | `display`, `body` and `mono` — any Google Fonts family names; loaded automatically. |
| `avatar` | Display picture next to your name. Leave it out to hide it. |
| `pages` | Labels for the Index and Gear pages. (Favourites and Gear only appear when they have something to show.) |
| `headerLinks` | Extra links in the nav (Instagram, eBay…), as many as you like. |

Every page and link has a `label` (desktop) and a `shortLabel` of 4 characters
or fewer (phones; longer ones are cut to 4 with a console warning). Pages and
links can also have a `hover` — the tooltip shown when the mouse rests on it:

```yaml
headerLinks:
  - label: eBay
    shortLabel: eBay
    url: https://www.ebay.com.au/usr/yourname
    hover: The gear I'm selling
```

When the nav row gets too long, Index and Favourites stay visible and the rest
fold into a ☰ Menu.

## Adding photos

Photos live as files attached to two GitHub releases, which keeps large scans
out of the repo (each file can be up to 2GB, and GitHub stores it untouched):

- **`images`** — every photo on the site.
- **`favourites`** — photos also shown on the Favourites page.

**To add photos:** open **Releases → Images → Edit**, drag the files into the
attachments box and click **Update release** — or from a terminal,
`gh release upload images *.jpg`. This works from a phone's browser too.

The Favourites page (and its nav link) only appears once the `favourites`
release has at least one photo.

**To make a photo a favourite:** upload an **exact copy** of the same file to
the `favourites` release. The build matches files by their contents, so the
photo still shows only once in the main gallery, keeps its original date and
doesn't get a NEW tag. If the copies differ (a re-export, say) it shows twice,
and the build log warns about it. To remove a favourite, delete it from the
`favourites` release.

**To remove a photo:** delete it from the release.

**When it goes live:** the site rebuilds every hour (at :17). To update
straight away, open **Actions → Build and deploy → Run workflow**.

Gallery order is upload order, newest first. Name files following the
[filename convention](#filename-convention) to get camera/film captions.

### Committing photos instead

The build also picks up photos committed to an `images/` folder (and
`images/favourites/` for favourites), dated by when they were first
committed. GitHub limits committed files to 100MB each, and large libraries
make the repo slow to clone, which is why releases are preferred.

## Filename convention

Scanner metadata is unreliable, so the camera/film caption in the photo viewer
comes from the filename:

```
{year}-{season}-{camera}-{filmStock}-[R{roll}-]{frame}
```

For example `2026-Autumn-KonicaAutoS2-FujiC200-R01-0024.jpg`, or without a roll
number, `2026-Autumn-KonicaAutoS2-FujiC200-0024.jpg`. `season` is one of
`Summer`, `Autumn`, `Winter`, `Spring`. Other filenames still work; they just
show no caption (the build logs a warning so typos are easy to spot).

## Gear page

[`gear.md`](gear.md) drives the Gear page. The paragraph under the top
`# Gear` heading is the intro; each `## Heading` is a group and each list item
a row. A tag in backticks (`` `Body` ``, `` `Lens` ``, `` `App` ``…) shows on
the right, text after ` — ` is a note underneath, and `[Name](url)` makes the
item a link:

```md
## Minolta
- SRT 303 `Body`

## Tools
- [FilmCalc](https://filmcalc.app) `App` — Price of shooting film.
```

If `gear.md` is missing or has no items, the Gear page and its nav link are
hidden. Edits go live with the next build (pushing the change triggers one).

## How it works

- **Build** (`npm run build` → `scripts/build-gallery.js`), run by
  `.github/workflows/deploy.yml` on every push, every hour, and on demand:
  - collects photos from the `images` and `favourites` releases and from
    `images/`, and merges identical files by their SHA-256;
  - makes a 2400px copy and a 1200px grid thumbnail of each, as progressive
    JPEGs (they render blurry-first, then sharpen), cached by content hash in
    `.cache/` between runs so each photo is only downloaded and resized once;
  - writes `images/manifest.json` (build output only) listing every photo,
    newest first;
  - turns `config.yaml` and `gear.md` into `config.json` and `gear.json`
    for the page, and bakes link-preview tags into `index.html`.
- **Deploy:** the built `dist/` folder goes straight to GitHub Pages; nothing
  is written back to the repo.
- **Photo viewer:** clicking a photo opens the **original, untouched file**,
  straight from the release (or the repo), with arrow keys, swipe and Esc. The
  photos either side are preloaded. Only grid thumbnails are compressed.
- **NEW tags:** each visitor's browser remembers the fingerprints of the photos
  on the site at their last visit. Anything added since gets an orange outline
  and a NEW tag for the whole visit (a visit ends after 30 minutes away).
  First-time visitors see no tags. Because it goes by file contents, renaming
  a photo doesn't make it look new, but replacing it with an edit does.
- **Theme:** follows the visitor's system setting until they toggle it; the
  switch sweeps across the screen diagonally (instant with reduced motion).

## Custom domain + SSL

In **Settings → Pages**, add your custom domain (e.g.
`photography.example.com`) and add the CNAME record GitHub gives you at your
DNS provider. GitHub Pages provisions a free SSL certificate once DNS
resolves. Set `siteUrl` in `config.yaml` to match.

## Project structure

```
config.yaml                     Site settings (name, links, fonts, avatar…)
gear.md                         Gear list shown on the Gear page
index.html                      Page structure
css/style.css                   Styling, light/dark theme, photo grid
js/app.js                       Renders Index, Favourites, Gear and the viewer
scripts/build-gallery.js        Collects + resizes photos, writes dist/
.github/workflows/deploy.yml    Build + deploy on push, hourly and on demand
dist/, .cache/                  Build output and resize cache (git-ignored)
```

## Credits

Designed by Trent Bauer, built by Claude.
