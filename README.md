# Photography Portfolio

A simple, free photography portfolio: a grid of your photos (newest first), a
full-resolution photo viewer, optional Favourites and Gear pages, and a
light/dark theme. GitHub builds and hosts it for you — no servers, no paid
services.

## Set up

### 1. Copy the repo and make it yours

1. Click **Fork** at the top of this page to make your own copy.
2. In your copy, edit [`config.yaml`](config.yaml): your name, tagline, links
   and so on. Every setting is explained in the file. Change `siteUrl` to your
   own domain, or delete that line if you don't have one.
3. Edit [`gear.md`](gear.md) with your gear, or delete it to hide the Gear page.

You can do all of this in the browser: open a file and click the ✏️ pencil.

### 2. Turn on GitHub Pages

1. Go to **Settings → Pages** and under **Source** choose **GitHub Actions**.
2. Go to the **Actions** tab. On a fork, click **I understand my workflows, go
   ahead and enable them** first.
3. Click **Build and deploy → Run workflow**.

After a minute or two your site is live at
`https://<your-username>.github.io/<repo-name>/`.

### 3. Add your photos

Photos are stored as files attached to a GitHub release, so they don't bloat
the repo and are kept full size and untouched.

1. Go to **Releases → Draft a new release** (on the right of the repo's main
   page).
2. Click **Choose a tag**, type `images` and pick **Create new tag**. Give it
   any title.
3. Drag your photos into the box at the bottom and click **Publish release**.

To add more later, open the **images** release, click **✏️ Edit**, drop in the
new files and click **Update release**. The site picks them up within the
hour, or straight away with **Actions → Build and deploy → Run workflow**.

**Favourites (optional):** make a second release with the tag `favourites`
and upload an **exact copy** of each photo you want on the Favourites page. A
photo in both releases still shows only once on the main page, and the
Favourites page appears once that release has a photo in it.

### 4. Point your domain at it (optional)

1. Go to **Settings → Pages → Custom domain**, enter your domain (e.g.
   `photos.example.com`) and click **Save**.
2. At your domain provider, add a DNS record:
   - **Subdomain** (like `photos.example.com`): a `CNAME` record pointing to
     `<your-username>.github.io`.
   - **Root domain** (like `example.com`): four `A` records pointing to
     `185.199.108.153`, `185.199.109.153`, `185.199.110.153` and
     `185.199.111.153`.
3. Once GitHub shows the domain check as passing, tick **Enforce HTTPS**. The
   certificate is free and automatic, but can take up to a day.
4. Set `siteUrl` in `config.yaml` to your domain so link previews use it.

That's it.

---

## Reference

### Captions

The photo viewer shows each photo's own metadata: its title (or description),
camera, lens and exposure. Details written by film scanners (e.g. *Noritsu EZ
Controller*) are ignored. To add a caption, fill in the fields in Lightroom or
Photoshop (**File → File Info**) before uploading, or use
[ExifTool](https://exiftool.org):

```
exiftool -Title="Beach, Phillip Island" -Make=Minolta -Model="SRT 101" photo.jpg
```

Re-uploading an edited file counts as a new photo (it moves to the top and
gets a NEW tag), so it's easiest to add metadata before the first upload.

### Gear page

In [`gear.md`](gear.md), each `## Heading` is a group and each `- item` a row.
Add a tag in backticks, a note after ` — `, or make an item a link:

```md
## Minolta
- SRT 303 `Body`
- [FilmCalc](https://filmcalc.app) `App` — Price of shooting film.
```

### Settings

All in [`config.yaml`](config.yaml):

| Setting | What it does |
|---|---|
| `photographerName` / `photographerShortName` | Your name. The short one (4 characters max) is used on phones. |
| `tagline` | The line under your name. |
| `siteUrl` | Your domain, for link previews. |
| `accentColor` | Any CSS colour. |
| `fonts` | Any Google Fonts names for headings, text and labels. |
| `avatar` | Picture next to your name, also used as the browser-tab icon. Leave it out to hide it (the tab then shows 📷). |
| `headerLinks` | Extra nav links, each with a `label`, `shortLabel`, `url` and optional `hover` tooltip. |

### Good to know

- **Order:** newest upload first.
- **NEW tags:** returning visitors see an orange NEW tag on photos added since
  their last visit.
- **Zoom:** in the viewer, click a photo to see it at 100% and drag to look
  around.
- **Updates:** the site rebuilds on every change to the repo and every hour
  (to pick up new release photos).
- **Committed photos:** photos in an `images/` folder in the repo (and
  `images/favourites/`) work too, but releases are better for large scans.
- **Preview on your computer:** `npm install`, `npm run build`, then
  `cd dist && python3 -m http.server 8080` and open http://localhost:8080.

## Credits

Designed by Trent Bauer, built by Claude.
