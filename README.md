# LOOP — website

Live at https://rohitd1729.github.io/loop/ (GitHub Pages, free).

```
index.html            page structure
css/style.css         styling
js/main.js            animations + rendering
js/content.js         fixed page text (hero, services, franchise, contact…)
content/updates.json  updates + top announcement bar  ← the owner edits this from his phone
.pages.yml            defines the owner's editor form (Pages CMS)
assets/               images (owner uploads go to assets/uploads/)
```

## How the owner posts an update (phone or tablet)

1. Open **https://app.pagescms.org** and sign in (email link — no GitHub account needed).
2. Open **LOOP → Website updates**.
3. Under **Updates**, tap **Add an entry**, then fill in title, date, category, photo, short summary
   and (optional) full article.
4. Tap **Save**. The site updates in about 1 minute.

He can also turn the **top announcement bar** on/off and change its text on the same screen.
Updates are sorted by date automatically; posts from the last 14 days show a "New" badge.

## One-time setup (developer)

1. Sign in at https://app.pagescms.org with the GitHub account that owns the repo.
2. Install the Pages CMS GitHub App when asked and give it access to the `loop` repo.
3. Open the repo in Pages CMS → **Settings / Collaborators** → invite the owner's email.

## Preview locally

Updates are loaded with `fetch`, which browsers block when you double-click `index.html`.
Run a tiny server instead, from this folder: `python -m http.server`, then open http://localhost:8000.
