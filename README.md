# LOOP — landing page

Open `index.html` in a browser. No build step and no install needed.

```
index.html      page structure
css/style.css   all styling (colour tokens at the top)
js/content.js   ALL text, numbers, services and updates  ← edit this
js/main.js      animations and rendering (no need to touch)
assets/         images
```

## Posting an update

1. Put the image in `assets/` (optional).
2. Open `js/content.js` and find `updates: [`.
3. Copy an existing `{ ... },` block, paste it at the top of the list and edit it:

```js
{
  date: "2026-11-01",            // YYYY-MM-DD. Posts from the last 14 days get a "New" badge
  tag: "Launch",
  title: "Pune store is open",
  text: "Walk in from 1 November, or book a pickup.",
  image: "assets/pune-store.jpg" // optional
},
```

4. Save and refresh. The page sorts updates newest first on its own.

Everything else works the same way: the top announcement bar, hero copy, services, stats, franchise figures, phone numbers, social links and cities are all in `content.js`.

## Contact form

The form opens a pre-filled WhatsApp chat to `contact.whatsapp`, so no server is needed.
