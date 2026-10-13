/* ==========================================================================
   LOOP — interactions
   Content comes from js/content.js. This file only renders and animates it.
   ========================================================================== */
(() => {
  "use strict";

  const C = window.LOOP_CONTENT || {};
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const get = (path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), C);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ------------------------------------------------------------------------
     1. LOGO — the wordmark is drawn as SVG so the robotic O can move
     ------------------------------------------------------------------------ */
  const pt = (cx, cy, r, deg) => {
    const t = ((deg - 90) * Math.PI) / 180;
    return [(cx + r * Math.cos(t)).toFixed(2), (cy + r * Math.sin(t)).toFixed(2)];
  };
  const arc = (cx, cy, r, a0, a1) => {
    const [x0, y0] = pt(cx, cy, r, a0), [x1, y1] = pt(cx, cy, r, a1);
    return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  const ticks = (cx, cy, r0, r1, a0, a1, step) => {
    let d = "";
    for (let a = a0; a <= a1; a += step) {
      const [x0, y0] = pt(cx, cy, r0, a), [x1, y1] = pt(cx, cy, r1, a);
      d += `M${x0} ${y0}L${x1} ${y1}`;
    }
    return d;
  };

  // The "robotic O": a drum drawn like a HUD. Each ring spins at its own speed.
  function roboticO(cx, cy, animated) {
    const layer = (d, speed, inner) =>
      `<g class="${animated ? "ro-layer " : ""}${d ? "ro-inner" : "ro-shell"}" style="--d:${d};transform-box:view-box;transform-origin:${cx}px ${cy}px">` +
      `<g class="spin" data-speed="${speed}" data-cx="${cx}" data-cy="${cy}">${inner}</g></g>`;
    const s = (d, w, extra = "") => `<path class="stroke" d="${d}" stroke-width="${w}" ${extra}/>`;
    return (
      layer(0, 0.15,
        s(arc(cx, cy, 114, 100, 438), 12) +
        `<rect class="fill" x="${cx + 108}" y="${cy + 2}" width="9" height="9"/>`) +
      layer(1, 0.6,
        s(arc(cx, cy, 98, 5, 118), 2.5) + s(arc(cx, cy, 98, 135, 228), 2.5) + s(arc(cx, cy, 98, 246, 350), 2.5) +
        s(arc(cx, cy, 98, 60, 96), 7) + s(ticks(cx, cy, 92, 104, 160, 190, 3), 1.2)) +
      layer(2, -0.9,
        s(arc(cx, cy, 84, 20, 170), 1.4) + s(arc(cx, cy, 84, 190, 330), 1.4) +
        s(ticks(cx, cy, 78, 88, 340, 372, 3), 1.2) + s(ticks(cx, cy, 84, 98, 120, 120, 1) + ticks(cx, cy, 84, 98, 300, 300, 1), 1.4)) +
      layer(3, 1.6,
        `<circle class="stroke" cx="${cx}" cy="${cy}" r="70" stroke-width="1.2" stroke-dasharray="10 6"/>` +
        s(arc(cx, cy, 63, 200, 262), 3.5))
    );
  }

  // Inside the first O: the LOOP service in 5 seconds (client storyboard).
  // Approach → handover → scanning → automation → reset. A businessperson's hand passes a
  // folded garment to a robot hand, which scans it and feeds it into the system.
  // Scene units are relative to the O's centre (scaled by the camera); the O clips everything.
  const f1 = (v) => v.toFixed(2);
  const chain = (base, a0, segs, angs) => {
    const pts = [base]; let a = a0, [x, y] = base;
    segs.forEach((len, i) => { a += angs[i]; x += len * Math.cos(a); y += len * Math.sin(a); pts.push([x, y]); });
    return pts;
  };
  const poly = (pts) => pts.map((q, i) => (i ? "L" : "M") + f1(q[0]) + " " + f1(q[1])).join("");
  const HO = {
    rx: 18, y: 6,                                   // robot wrist anchor (mirrored, points left)
    fingers: [{ base: [-10, -2], segs: [8, 6.5, 5.5], w: 4.6 }, { base: [-10, 3.2], segs: [8.5, 7, 5.5], w: 4.6 }, { base: [-10, 8.4], segs: [7.5, 6, 5], w: 4.4 }],
    thumb: { base: [-31, -5], segs: [9, 7], w: 4.8 },
    open: [-0.12, -0.22, -0.22], hold: [-0.42, -0.68, -0.6]
  };
  const ROBOT_FINGER = `<g class="rb-f"><path class="rb-fo"/><path class="rb-fi"/><circle class="ho-jt" r="1.25"/><circle class="ho-jt" r="1.25"/><circle class="ho-jt" r="1.1"/></g>`;

  function handover(cx, cy, gid) {
    const robot =
      `<g class="ho-r">` +
        `<path class="ho-dark" d="M-150 -11H-52Q-48 -11 -48 -7V11Q-48 15 -52 15H-150Z"/>` +
        `<path class="ho-t" d="M-90 -11V15M-122 -11V15"/><path class="ho-circ" d="M-150 4H-104L-98 -2H-60"/>` +
        `<rect class="ho-ivory" x="-50" y="-9" width="9" height="22" rx="2"/><circle class="ho-brass" cx="-45.5" cy="2" r="2"/>` +
        `<path class="ho-brass-l" d="M-47.5 13V18M-44 13V20"/><circle class="ho-brass" cx="-47.5" cy="19" r="1.2"/><circle class="ho-brass" cx="-44" cy="21" r="1.2"/>` +
        ROBOT_FINGER.replace('class="rb-f"', 'class="rb-f rb-thumb"') +
        `<path class="ho-ivory" d="M-41 -5H-14Q-10 -5 -10 -1V8Q-10 12 -14 12H-37Q-41 12 -41 8Z"/>` +
        `<path class="ho-tl" d="M-30 -5V12M-30 3.5H-10"/><circle class="ho-brass" cx="-20" cy="-1" r="1"/><circle class="ho-brass" cx="-20" cy="8" r="1"/>` +
      `</g>`;
    const human =
      `<g class="ho-h">` +
        `<path class="ho-dark" d="M-150 -13H-58Q-54 -13 -54 -9V14Q-54 18 -58 18H-150Z"/>` +
        `<circle class="ho-ivory" cx="-62" cy="12.5" r="1.3"/><circle class="ho-ivory" cx="-67" cy="12.5" r="1.3"/><circle class="ho-ivory" cx="-72" cy="12.5" r="1.3"/>` +
        `<rect class="ho-ivory" x="-55" y="-10" width="11" height="24" rx="1.5"/><circle class="ho-brass" cx="-49.5" cy="2" r="1.6"/>` +
        `<path class="ho-skin" d="M-44 -6C-34 -6 -22 -4 -12 -3C-6 -2.6 0 -2 3 0C5 2 4 5 1 5.5C-8 7 -20 10 -30 12C-36 13.5 -41 13.5 -44 13Z"/>` +
        `<path class="ho-crease" d="M-14 0C-8 2 -3 3 1 3M-16 4C-10 5.5 -5 6 -1 5.8M-38 2C-34 4 -30 5 -26 5"/>` +
      `</g>`;
    const thumb = `<g class="ho-ht"><g class="ho-thumb"><path class="ho-skin" d="M-40 -5.5C-37 -8.5 -32 -9.5 -27 -8.6C-25 -8.2 -25 -6.4 -27 -6.2C-31 -5.8 -35 -5 -38 -3.6Z"/></g></g>`;
    const cloth =
      `<g class="ho-cloth"><g class="ho-cloth-in">` +
        `<rect class="ho-cloth-f" x="-16" y="-11" width="32" height="11" rx="2.6"/>` +
        `<path class="ho-cloth-l" d="M-15 -7.4H13M-15 -3.7H13"/><path class="ho-cloth-l" d="M12 -11Q16.5 -5.5 12 0"/>` +
        `<rect class="ho-tag" x="-13" y="-12.6" width="6" height="3.2" rx=".7" style="opacity:0"/>` +
      `</g></g>`;
    const streaks = Array.from({ length: 6 }, (_, i) => `<line class="ho-streak" x1="${-12.5 + i * 5}" x2="${-12.5 + i * 5}" y1="-10" y2="-58"/>`).join("");
    const rays = Array.from({ length: 5 }, (_, k) => `<line class="ho-ray" data-a="${-150 + k * 30}"/>`).join("");
    return `<clipPath id="${gid}-clip"><circle cx="${cx}" cy="${cy}" r="101"/></clipPath>` +
      `<g class="robot"><g class="robot__boot"><g clip-path="url(#${gid}-clip)">` +
        `<g class="ho-cam" transform="translate(${cx - 14} ${cy - 2}) scale(1.4)">` +
          robot + human + cloth + thumb +
          `<g class="ho-rf">${HO.fingers.map(() => ROBOT_FINGER).join("")}</g>` +
          `<g class="ho-fx"><path class="ho-vline" style="opacity:0"/><ellipse class="ho-scan" rx="23" ry="5" style="opacity:0"/>` +
          `<g class="ho-auto" style="opacity:0"><rect class="ho-slot" x="-16" y="-14" width="32" height="18" rx="3"/>${streaks}</g>` +
          `<g class="ho-spark" style="opacity:0">${rays}</g>` +
          `<circle class="ho-touch" r="7" style="opacity:0"/>` +
          `<g class="ho-hud" style="opacity:0"><path class="ho-hud-l" d="M-21 -13V-17H-17M17 -17H21V-13M21 0V4H17M-17 4H-21V0"/>` +
            `<path class="ho-hud-t" d="M24 -15H29M24 -11H27M24 -7H28"/><circle class="ho-hud-dot" cx="-24" cy="-15" r=".9"/></g>` +
          `</g>` +
        `</g>` +
      `</g></g></g>`;
  }

  let logoN = 0;
  function wordmark(animated, hero) {
    const gid = "loopScan" + ++logoN;
    const draw = (el, w, delay, cls = "") =>
      animated
        ? el.replace("/>", ` class="stroke draw ${cls}" pathLength="1" stroke-width="${w}" style="--d:${delay}"/>`)
        : el.replace("/>", ` class="stroke ${cls}" stroke-width="${w}"/>`);
    return (
      `<svg class="logo-svg" viewBox="0 0 860 240" role="img" aria-label="LOOP">` +
      (hero && animated
        ? `<defs><linearGradient id="${gid}" x1="0" x2="1"><stop offset="0" stop-color="#b89a63" stop-opacity="0"/>` +
          `<stop offset=".55" stop-color="#ece7df" stop-opacity=".6"/><stop offset="1" stop-color="#b89a63" stop-opacity="0"/></linearGradient></defs>`
        : "") +
      draw(`<path d="M9 0V231H125"/>`, 18, 0) +
      draw(`<circle cx="275" cy="120" r="111" transform="rotate(-90 275 120)"/>`, 18, 0.15, "o1-ring") +
      (hero ? handover(275, 120, gid) : "") +
      roboticO(530, 120, animated) +
      draw(`<path d="M699 240V9H790A61.5 61.5 0 0 1 790 132H699"/>`, 18, 0.3) +
      (hero && animated
        ? `<g class="inf" style="opacity:0"><path class="stroke inf-l"/><path class="stroke inf-r"/>` +
          `<path class="inf-tail"/><circle class="inf-dot" r="7"/></g>` +
          `<rect class="launch-scan" x="-150" y="-30" width="150" height="300" fill="url(#${gid})"/>`
        : "") +
      `</svg>`
    );
  }

  $$("[data-logo]").forEach((el) => {
    const kind = el.dataset.logo;
    if (kind === "o") el.innerHTML = `<svg class="logo-svg" viewBox="0 0 244 244">${roboticO(122, 122, false)}</svg>`;
    else el.innerHTML = wordmark(kind === "hero" && !reduced, kind === "hero");
  });

  /* ------------------------------------------------------------------------
     2. CONTENT — fill the page from content.js
     ------------------------------------------------------------------------ */
  $$("[data-c]").forEach((el) => { const v = get(el.dataset.c); if (v != null) el.textContent = v; });
  $$("[data-href]").forEach((el) => { const v = get(el.dataset.href); if (v) el.setAttribute("href", v); });
  $$("[data-src]").forEach((el) => { const v = get(el.dataset.src); if (v) el.src = v; });

  // Marquee (doubled so the loop is seamless)
  const mq = $(".marquee__track");
  if (mq && C.marquee) mq.innerHTML = [...C.marquee, ...C.marquee].map((t) => `<span>${esc(t)}</span>`).join("");

  // Cycle steps
  const steps = C.cycle?.steps || [];
  $(".cycle__steps").innerHTML = steps.map((s) => `<li><div><h3>${esc(s.title)}</h3></div><p>${esc(s.text)}</p></li>`).join("");

  // Pillars with line icons
  const icons = [
    `<svg viewBox="-50 -50 100 100"><circle r="46" fill="none" stroke="currentColor" stroke-width="1.5"/><circle r="34" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="4 4"/><path d="${arc(0, 0, 40, 30, 120)}" fill="none" stroke="currentColor" stroke-width="4"/><circle r="20" fill="none" stroke="currentColor" stroke-width="1"/><circle r="3" fill="currentColor"/></svg>`,
    `<svg viewBox="-50 -50 100 100"><path d="M0-44C14-24 28-10 28 10a28 28 0 0 1-56 0C-28-10-14-24 0-44Z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M-22 12q11-8 22 0t22 0" fill="none" stroke="currentColor" stroke-width="1"/><path d="M-18 24q9-6 18 0t18 0" fill="none" stroke="currentColor" stroke-width="1"/></svg>`,
    `<svg viewBox="-50 -50 100 100"><circle r="44" fill="none" stroke="currentColor" stroke-width="1.5"/><ellipse rx="18" ry="44" fill="none" stroke="currentColor" stroke-width="1"/><path d="M-44 0H44M-38-22H38M-38 22H38" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="26" cy="-20" r="3.5" fill="currentColor"/></svg>`
  ];
  $(".pillars__grid").innerHTML = (C.pillars || []).map((p, i) => `
    <article class="pillar reveal" style="--i:${i}">
      <div class="pillar__code mono"><span>${esc(p.code)}</span><span>0${i + 1}</span></div>
      <div class="pillar__icon">${icons[i % icons.length]}</div>
      <h3>${esc(p.title)}</h3><p>${esc(p.text)}</p>
    </article>`).join("");

  // Stats
  $(".stats__grid").innerHTML = (C.stats || []).map((s, i) => `
    <div class="stat reveal" style="--i:${i}">
      <strong data-count="${s.value}" data-decimals="${s.decimals || 0}" data-prefix="${esc(s.prefix)}" data-suffix="${esc(s.suffix)}">${esc(s.prefix)}0${esc(s.suffix)}</strong>
      <span>${esc(s.label)}</span>
    </div>`).join("");

  // Services
  $(".services__list").innerHTML = (C.services || []).map((s, i) => `
    <li class="service reveal" style="--i:${i}">
      <span class="service__n mono">${String(i + 1).padStart(2, "0")}</span>
      <h3>${esc(s.name)}</h3><p>${esc(s.text)}</p><span class="service__arrow">→</span>
    </li>`).join("");

  // Franchise list
  $(".franchise__list").innerHTML = (C.franchise?.includes || []).map((t, i) =>
    `<li class="reveal" style="--i:${i}"><span>${String(i + 1).padStart(2, "0")}</span>${esc(t)}</li>`).join("");

  /* Updates + announcement live in content/updates.json, edited by the owner in Pages CMS.
     Image paths are saved as "/assets/..."; the leading slash is dropped so they also
     work while the site sits in a sub-folder (rohitd1729.github.io/loop/). */
  const asset = (p) => (p ? String(p).replace(/^\/(?!\/)/, "") : "");
  const fmt = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "");
  let updates = [];

  function renderAnnouncement(a) {
    const bar = $(".announce");
    if (!bar) return;
    if (!a || !a.show || !a.text) { bar.hidden = true; return; }
    $(".announce__text", bar).textContent = a.text;
    bar.hidden = false;
    onScroll();
  }

  function renderUpdates(list) {
    updates = [...list].filter((u) => u && u.title).sort((a, b) => (String(a.date) < String(b.date) ? 1 : -1));
    const rail = $(".updates__rail");
    if (!updates.length) { rail.innerHTML = `<p class="updates__empty mono">No updates yet.</p>`; return; }
    rail.innerHTML = updates.map((u, i) => {
      const fresh = u.date && (Date.now() - new Date(u.date + "T00:00:00")) / 864e5 <= 14;
      const more = u.body && u.body.trim();
      return `<article class="update reveal${fresh ? " is-new" : ""}${more ? " has-more" : ""}" style="--i:${i}" data-i="${i}">
        ${u.image ? `<div class="update__media"><img src="${esc(asset(u.image))}" alt="" loading="lazy"></div>` : ""}
        <div class="update__body">
          <div class="update__meta mono"><b>${esc(u.tag)}</b><time datetime="${esc(u.date)}">${fmt(u.date)}</time></div>
          <h3>${esc(u.title)}</h3><p>${esc(u.text)}</p>
          ${more ? `<button class="update__more mono" type="button">Read more <span>→</span></button>` : ""}
        </div></article>`;
    }).join("");
    $$(".update", rail).forEach(observeReveal);
  }

  // Full article view
  const dialog = $(".article");
  function openArticle(u) {
    $(".article__meta", dialog).innerHTML = `<b>${esc(u.tag)}</b><time datetime="${esc(u.date)}">${fmt(u.date)}</time>`;
    $(".article__title", dialog).textContent = u.title;
    const img = $(".article__img", dialog);
    img.hidden = !u.image;
    if (u.image) img.src = asset(u.image);
    $(".article__body", dialog).innerHTML = String(u.body).trim().split(/\n\s*\n/)
      .map((para) => `<p>${esc(para).replace(/\n/g, "<br>")}</p>`).join("");
    dialog.showModal();
    dialog.scrollTop = 0;
  }
  $(".updates__rail").addEventListener("click", (e) => {
    const card = e.target.closest(".update.has-more");
    if (card) openArticle(updates[+card.dataset.i]);
  });
  dialog.addEventListener("click", (e) => { if (e.target === dialog || e.target.closest(".article__close")) dialog.close(); });

  fetch("content/updates.json", { cache: "no-store" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((data) => { renderAnnouncement(data.announcement); renderUpdates(data.updates || []); })
    .catch(() => {
      // Opened straight from disk (file://) the browser blocks this request; online it works.
      renderAnnouncement(null);
      $(".updates__rail").innerHTML = `<p class="updates__empty mono">Updates appear when the site is online.</p>`;
    });

  $$(".updates__nav button").forEach((b) => b.addEventListener("click", () => {
    const rail = $(".updates__rail"), card = $(".update", rail);
    rail.scrollBy({ left: (card ? card.offsetWidth + 24 : 320) * +b.dataset.dir, behavior: "smooth" });
  }));

  // Contact
  const ct = C.contact || {};
  $(".contact__phones").innerHTML = (ct.phones || []).map((p) => `<a href="tel:${p.replace(/\s/g, "")}">${esc(p)}</a>`).join("");
  $(".contact__emails").innerHTML = (ct.emails || []).map((e) => `<a href="mailto:${esc(e)}">${esc(e)}</a>`).join("");
  $(".contact__socials").innerHTML = (ct.socials || []).map((s) =>
    `<a href="${esc(s.href)}" target="_blank" rel="noopener"><small>${esc(s.label)}</small>${esc(s.handle)}</a>`).join("");
  $(".footer__cities").textContent = (C.cities || []).join("  |  ");
  $(".footer__values").textContent = (C.footer?.values || []).join("  •  ");

  /* ------------------------------------------------------------------------
     3. SPLIT TEXT + REVEALS
     ------------------------------------------------------------------------ */
  $$(".split").forEach((el) => {
    const words = el.textContent.trim().split(/\s+/);
    el.setAttribute("aria-label", el.textContent.trim());
    el.innerHTML = words.map((w, i) => `<span class="w" aria-hidden="true"><span style="--i:${i}">${esc(w)}</span></span>`).join(" ");
  });

  let io = null;
  function observeReveal(el) { if (io) io.observe(el); } // before startReveals, the initial sweep picks it up
  function startReveals() {
    io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      if (e.target.matches(".stat")) countUp($("[data-count]", e.target));
      io.unobserve(e.target);
    }), { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
    $$(".split, .reveal").forEach((el) => io.observe(el));
  }

  function countUp(el) {
    if (!el) return;
    const to = +el.dataset.count, dec = +el.dataset.decimals, pre = el.dataset.prefix, suf = el.dataset.suffix;
    const t0 = performance.now(), dur = reduced ? 1 : 1600;
    const tick = (now) => {
      const p = clamp((now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = pre + (to * e).toFixed(dec) + suf;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------------------
     4. PRELOADER
     ------------------------------------------------------------------------ */
  const pre = $(".preloader"), preBar = $(".preloader__bar span"), prePct = $(".preloader__pct");
  let loaded = document.readyState === "complete", preP = 0, finished = false;
  addEventListener("load", () => (loaded = true));
  const tStart = performance.now(), minTime = reduced ? 200 : 1500;
  function preTick(now) {
    const target = loaded && now - tStart > minTime ? 1 : Math.min(0.9, (now - tStart) / minTime);
    preP = lerp(preP, target, 0.08);
    if (target === 1 && preP > 0.995) preP = 1;
    preBar.style.setProperty("--p", preP);
    prePct.textContent = String(Math.round(preP * 100)).padStart(3, "0");
    if (preP < 1) requestAnimationFrame(preTick); else finish();
  }
  function finish() {
    if (finished) return;
    finished = true;
    document.body.classList.remove("is-loading");
    setTimeout(() => { document.body.classList.add("is-ready"); stages.forEach(maybeLaunch); startReveals(); }, reduced ? 0 : 450);
    setTimeout(() => pre && pre.setAttribute("hidden", ""), 1600);
  }
  requestAnimationFrame(preTick);
  setTimeout(finish, 6000); // never trap a visitor behind the loader

  /* ------------------------------------------------------------------------
     5. FABRIC — a field of threads that ripples under the cursor
     ------------------------------------------------------------------------ */
  // One instance per stage (the hero, and the finale at the bottom of the page).
  function createFabric(canvas, area) {
    const ctx = canvas.getContext("2d");
    const mouse = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4 };
    let cw = 0, ch = 0;
    function size() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      cw = canvas.clientWidth; ch = canvas.clientHeight;
      canvas.width = cw * dpr; canvas.height = ch * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function draw(t) {
      if (document.documentElement.classList.contains("has-3d")) return; // the 3D fabric (world3d.js) takes over
      ctx.clearRect(0, 0, cw, ch);
      mouse.x = lerp(mouse.x, mouse.tx, 0.08); mouse.y = lerp(mouse.y, mouse.ty, 0.08);
      const gap = cw < 700 ? 16 : 13, step = cw < 700 ? 14 : 10, R = 170;
      for (let i = -2, y0 = -2 * gap; y0 < ch + 2 * gap; i++, y0 += gap) {
        ctx.beginPath();
        for (let x = 0; x <= cw + step; x += step) {
          let y = y0 + Math.sin(x * 0.0042 + t * 0.00055 + i * 0.16) * 11 + Math.sin(x * 0.011 - t * 0.0008 + i * 0.05) * 4;
          const dx = x - mouse.x, dy = y - mouse.y, d2 = dx * dx + dy * dy;
          if (d2 < 9 * R * R) {
            const f = Math.exp(-d2 / (2 * R * R)), d = Math.sqrt(d2) + 1;
            y += (dy / d) * f * 46;
          }
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        const shade = 0.5 + 0.5 * Math.sin(i * 0.22 + t * 0.0004);
        ctx.strokeStyle = `rgba(236,231,223,${0.035 + shade * 0.11})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    size();
    addEventListener("resize", size);
    area.addEventListener("pointermove", (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.tx = e.clientX - r.left; mouse.ty = e.clientY - r.top;
    });
    area.addEventListener("pointerleave", () => { mouse.tx = mouse.ty = -1e4; });
    return { draw, size };
  }

  /* ------------------------------------------------------------------------
     6. CYCLE — one shape that morphs through the four steps, then closes
     ------------------------------------------------------------------------ */
  const N = 200, TAU = Math.PI * 2;
  const shapes = {
    circle: () => 150,
    squircle: (a) => 138 / Math.pow(Math.pow(Math.abs(Math.cos(a)), 4) + Math.pow(Math.abs(Math.sin(a)), 4), 0.25),
    gear: (a) => 142 + 9 * Math.tanh(3 * Math.sin(12 * a)),
    wave: (a, t) => 145 + 11 * Math.sin(7 * a + t * 0.0012),
    hex: (a) => { const s = Math.PI / 3; return (150 * Math.cos(s / 2)) / Math.cos((((a % s) + s) % s) - s / 2); }
  };
  const order = [shapes.squircle, shapes.gear, shapes.wave, shapes.hex];
  const morphPaths = $$(".cycle__stage .m");
  const stepEls = $$(".cycle__steps li");
  const cycleEl = $(".cycle"), idxEl = $(".cycle__idx"), labelEl = $(".cycle__label"), progEl = $(".cycle__progress span");
  const tickG = $(".cycle__ticks");
  tickG.innerHTML = Array.from({ length: 72 }, (_, i) => {
    const a = (i / 72) * TAU, r0 = i % 6 === 0 ? 178 : 184, r1 = 192;
    return `<line x1="${(r0 * Math.cos(a)).toFixed(1)}" y1="${(r0 * Math.sin(a)).toFixed(1)}" x2="${(r1 * Math.cos(a)).toFixed(1)}" y2="${(r1 * Math.sin(a)).toFixed(1)}"/>`;
  }).join("");
  let cycleP = 0, cycleVisible = false, lastStep = -1;
  new IntersectionObserver(([e]) => (cycleVisible = e.isIntersecting)).observe(cycleEl);

  function radiusAt(a, t, p) {
    // shape leads the label a little, so each step is fully formed when its title lights up
    const seg = p * order.length + 0.3, k = Math.min(order.length - 1, Math.floor(seg)), u = seg - k;
    const from = k === 0 ? shapes.circle : order[k - 1], to = order[k];
    let r = lerp(from(a, t), to(a, t), smooth(0, 0.45, u));
    if (k === order.length - 1) r = lerp(r, shapes.circle(), smooth(0.72, 1, u)); // the loop closes
    return r;
  }
  function drawCycle(t) {
    morphPaths.forEach((path, j) => {
      const scale = 1 - j * 0.15, rot = (j % 2 ? -1 : 1) * t * 0.00006 * (j + 1) + j * 0.3 + cycleP * Math.PI * (j % 2 ? -1 : 1);
      let d = "";
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * TAU;
        const r = radiusAt(a, t + j * 400, cycleP) * scale + Math.sin(a * 3 + t * 0.001 + j) * 1.5;
        d += (i ? "L" : "M") + (r * Math.cos(a + rot)).toFixed(1) + " " + (r * Math.sin(a + rot)).toFixed(1);
      }
      path.setAttribute("d", d + "Z");
    });
    tickG.setAttribute("transform", `rotate(${(cycleP * 180).toFixed(2)})`);
    const step = Math.min(steps.length - 1, Math.floor(cycleP * steps.length));
    if (step !== lastStep) {
      lastStep = step;
      stepEls.forEach((li, i) => li.classList.toggle("is-active", i === step));
      idxEl.textContent = String(step + 1).padStart(2, "0");
      labelEl.textContent = steps[step] ? `◦ ${steps[step].title}` : "";
    }
    progEl.style.setProperty("--p", cycleP.toFixed(4));
  }
  $(".cycle__num small").textContent = "/ " + String(steps.length).padStart(2, "0");

  /* ------------------------------------------------------------------------
     7. SCROLL — nav, hero parallax, store reveal, drum speed
     ------------------------------------------------------------------------ */
  const nav = $(".nav"), announce = $(".announce"), heroLogo = $(".hero__logo"), heroInner = $(".hero__inner");
  const store = $(".store"), storeSticky = $(".store__sticky");
  let lastY = scrollY, velocity = 0;

  function onScroll() {
    const y = scrollY, vh = innerHeight;
    velocity += Math.abs(y - lastY);
    const annH = announce ? announce.offsetHeight : 0;
    nav.style.top = Math.max(0, annH - y) + "px";
    nav.classList.toggle("is-pinned", y > annH + 10);
    nav.classList.toggle("is-hidden", y > vh * 0.8 && y > lastY && !document.body.classList.contains("menu-open"));
    lastY = y;

    if (!reduced) {
      const hp = clamp(y / vh);
      heroInner.style.transform = `translate3d(0, ${hp * 120}px, 0) scale(${1 - hp * 0.12})`;
      heroInner.style.opacity = String(1 - hp * 0.9);
      heroLogo.style.filter = hp > 0.01 ? `blur(${(hp * 8).toFixed(1)}px)` : "";
    }

    const cr = cycleEl.getBoundingClientRect();
    cycleP = clamp(-cr.top / (cr.height - vh));
    if (reduced) drawCycle(0);

    const sr = store.getBoundingClientRect();
    const sp = clamp((vh - sr.top) / (sr.height));
    const open = smooth(0.2, 0.62, sp);
    storeSticky.style.setProperty("--p-inv", (1 - open).toFixed(4));
    storeSticky.style.setProperty("--scrim", smooth(0.45, 0.62, sp).toFixed(3));
    storeSticky.style.setProperty("--cap", smooth(0.6, 0.78, sp).toFixed(3));
  }
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);
  onScroll();

  /* ------------------------------------------------------------------------
     7b. HERO LOGO — the two Os morph into ∞ and back; the robot lives in O #1
     ------------------------------------------------------------------------ */
  function createLogo(svg) {
    if (!svg || reduced) return null;
    const L = {
      svg, launchAt: 0, nextBlink: 0, blinkUntil: 0,
      o1: $(".o1-ring", svg),
      shell: $(".ro-shell > .spin", svg),
      inner: $$(".ro-inner > .spin", svg),
      robot: $(".robot", svg),
      ho: $(".ho-cam", svg), hoR: $(".ho-r", svg), hoRF: $(".ho-rf", svg), hoH: $(".ho-h", svg), hoHT: $(".ho-ht", svg),
      hoFing: $$(".ho-rf .rb-f", svg), hoThumb: $(".ho-r .rb-thumb", svg),
      cloth: $(".ho-cloth", svg), clothIn: $(".ho-cloth-in", svg), clothF: $(".ho-cloth-f", svg),
      fx: $(".ho-fx", svg), scan: $(".ho-scan", svg), vline: $(".ho-vline", svg),
      auto: $(".ho-auto", svg), streaks: $$(".ho-streak", svg),
      spark: $(".ho-spark", svg), rays: $$(".ho-ray", svg),
      touch: $(".ho-touch", svg), hud: $(".ho-hud", svg), hThumb: $(".ho-thumb", svg), tag: $(".ho-tag", svg),
      inf: $(".inf", svg), infL: $(".inf-l", svg), infR: $(".inf-r", svg),
      tail: $(".inf-tail", svg), dot: $(".inf-dot", svg)
    };
    return L;
  }

  // Lemniscate (∞) centred between the two Os. Each lobe is matched point-for-point
  // with one O, so the morph is a straight interpolation.
  const INF = { cx: 402.5, cy: 120, a: 262, ys: 1.25, n: 96 };
  const lobe = (side, s) => {
    const t = side > 0 ? -Math.PI / 2 + Math.PI * s : Math.PI / 2 + Math.PI * s;
    const sn = Math.sin(t), cs = Math.cos(t), den = 1 + sn * sn;
    return [INF.cx + (INF.a * cs) / den, INF.cy + (INF.ys * INF.a * sn * cs) / den];
  };
  const ring = (side, s) => side > 0
    ? [530 + 114 * Math.cos(Math.PI + TAU * s), 120 + 114 * Math.sin(Math.PI + TAU * s)]
    : [275 + 111 * Math.cos(-TAU * s), 120 + 111 * Math.sin(-TAU * s)];
  const onInf = (u) => (u < 0.5 ? lobe(1, u * 2) : lobe(-1, (u - 0.5) * 2));
  const easeIO = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  function morphPath(side, m) {
    let d = "";
    for (let i = 0; i <= INF.n; i++) {
      const s = i / INF.n, [x0, y0] = ring(side, s), [x1, y1] = lobe(side, s);
      d += (i ? "L" : "M") + lerp(x0, x1, m).toFixed(1) + " " + lerp(y0, y1, m).toFixed(1);
    }
    return d + "Z";
  }

  // The handover film loops every 7s. INFINITY = true brings back the OO → ∞ morph after
  // each film (the client's earlier idea); off per the storyboard spec, so the O never changes.
  const INFINITY = false;
  const FILM = 7000, CYCLE = FILM + (INFINITY ? 4400 : 0), BOOT = 2600;
  function infPhase(c) {
    if (!INFINITY || c < FILM) return [0, -1];
    if (c < FILM + 1200) return [easeIO((c - FILM) / 1200), -1];
    if (c < FILM + 3200) return [1, (c - FILM - 1200) / 2000];
    return [1 - easeIO((c - FILM - 3200) / 1200), -1];
  }

  function animateLogo(L, now) {
    if (!L.launchAt) return;
    const since = now - L.launchAt;
    const c = since > BOOT ? (since - BOOT) % CYCLE : -1;
    const [m, travel] = c >= 0 ? infPhase(c) : [0, -1];
    const detail = 1 - clamp(m * 3), cross = clamp(m * 6);
    // before the first loop the scene rests in its frame-0 pose (robot waiting, human off-stage)
    const film = c < 0 ? 0 : c < FILM ? c : -1;
    L.robot.style.opacity = film < 0 ? 1 - cross : detail;
    L.inner.forEach((g) => (g.style.opacity = detail));
    L.o1.style.opacity = 1 - cross;
    L.shell.style.opacity = 1 - cross;
    L.inf.style.opacity = cross;
    if (m > 0) {
      L.infL.setAttribute("d", morphPath(-1, m));
      L.infR.setAttribute("d", morphPath(1, m));
      L.infL.setAttribute("stroke-width", lerp(18, 14, m).toFixed(1));
      L.infR.setAttribute("stroke-width", lerp(12, 14, m).toFixed(1));
    }
    if (travel >= 0) {
      const u = easeIO(travel), [x, y] = onInf(u);
      let d = "";
      for (let i = 0; i <= 16; i++) {
        const [tx, ty] = onInf((u - 0.12 * (1 - i / 16) + 1) % 1);
        d += (i ? "L" : "M") + tx.toFixed(1) + " " + ty.toFixed(1);
      }
      L.tail.setAttribute("d", d);
      L.dot.setAttribute("cx", x.toFixed(1)); L.dot.setAttribute("cy", y.toFixed(1));
      L.dot.style.opacity = L.tail.style.opacity = String(Math.min(1, travel * 8, (1 - travel) * 8));
    } else {
      L.dot.style.opacity = L.tail.style.opacity = "0";
    }

    if (film >= 0) playFilm(L, film, now);
  }

  // Storyboard, t in ms (0 → 7000). Frame 7000 is identical to frame 0, so the loop is seamless.
  //  0–1s approach · 1–2s handover, human hand pulls back and waits · 2–3s scan at the centre
  //  3–4s processing (garment absorbed) · 4–4.6s it reappears clean · 4.3–5.6s robot hands it back
  //  5.9–7s the human hand leaves with the clean laundry
  function playFilm(L, t, now) {
    if (!L.ho) return;
    const sub = (x, a, b) => clamp((x - a) / (b - a));
    const WAIT = -60;
    // human hand
    let hx;
    if (t < 1700) hx = lerp(-170, 2, 1 - Math.pow(1 - sub(t, 0, 900), 3)) + 6 * easeIO(sub(t, 900, 1300));
    else if (t < 4300) hx = lerp(8, WAIT, easeIO(sub(t, 1700, 2500)));
    else if (t < 5900) hx = lerp(WAIT, 2, easeIO(sub(t, 4300, 5000)));
    else hx = lerp(2, -170, Math.pow(sub(t, 5900, 6800), 2));
    const hT = `translate(${f1(hx)} ${HO.y})`;
    L.hoH.setAttribute("transform", hT); L.hoHT.setAttribute("transform", hT);
    // thumb lifts to release (1.25–1.55s), closes on the clean garment (5.5–5.8s)
    const lift = easeIO(sub(t, 1250, 1550)) * (1 - easeIO(sub(t, 5500, 5800)));
    L.hThumb.setAttribute("transform", `rotate(${f1(-24 * lift)} -40 -5)`);

    // robot hand: to the centre for the scan (2.0–2.6s), back to its spot to hand over (4.3–5.0s)
    const shift = -22 * easeIO(sub(t, 2000, 2600)) * (1 - easeIO(sub(t, 4300, 5000)));
    const bob = Math.sin((t / FILM) * Math.PI * 2) * 0.6;
    const rx = HO.rx + shift, rT = `translate(${f1(rx)} ${f1(HO.y + bob)}) scale(-1 1)`;
    L.hoR.setAttribute("transform", rT); L.hoRF.setAttribute("transform", rT);

    // robot fingers: close to receive (1.1–1.6s), hold through processing, open to give back (5.0–5.4s)
    const grip = easeIO(sub(t, 1100, 1600)) * (1 - easeIO(sub(t, 5000, 5400)));
    const setF = (g, rig, a0, angs) => {
      const pts = chain(rig.base, a0, rig.segs, angs), d = poly(pts), [o, i] = g.querySelectorAll("path");
      o.setAttribute("d", d); o.style.strokeWidth = rig.w + 2.2;
      i.setAttribute("d", d); i.style.strokeWidth = rig.w;
      g.querySelectorAll(".ho-jt").forEach((c, k) => { c.setAttribute("cx", f1(pts[k][0])); c.setAttribute("cy", f1(pts[k][1])); });
    };
    HO.fingers.forEach((rig, k) => setF(L.hoFing[k], rig, 0, HO.open.map((v, i) => lerp(v, HO.hold[i], grip))));
    setF(L.hoThumb, HO.thumb, lerp(-0.75, -0.95, grip), [0, 0.3, 0]);

    // garment path: human → robot (1.0–1.6s) … robot → human (5.0–5.6s)
    const onRobot = [rx + 25.5, HO.y - 5 + bob], onHuman = [hx - 18, HO.y - 5];
    const give = easeIO(sub(t, 1000, 1600)), back = easeIO(sub(t, 5000, 5600));
    const k = t < 3000 ? give : 1 - back;
    const gx = lerp(onHuman[0], onRobot[0], k), gy = lerp(onHuman[1], onRobot[1], k) - 5 * Math.sin(Math.PI * k);
    // processing: sinks in and fades (3.1–3.6s), reappears clean (3.8–4.4s)
    const absorb = easeIO(sub(t, 3100, 3600)) * (1 - easeIO(sub(t, 3800, 4400)));
    L.cloth.setAttribute("transform", `translate(${f1(gx)} ${f1(gy + absorb * 3)})`);
    L.clothIn.setAttribute("transform", `translate(0 -5.5) scale(${f1(1 - absorb * 0.6)}) translate(0 5.5)`);
    L.cloth.style.opacity = String(1 - absorb);
    const scan = sub(t, 2300, 3100);
    const lit = Math.max(Math.sin(Math.PI * scan) * 0.6, Math.sin(Math.PI * sub(t, 3000, 3500)), Math.sin(Math.PI * sub(t, 3900, 4700)));
    L.clothF.style.stroke = lit > 0.01 ? `rgba(184,154,99,${f1(lit)})` : "";
    L.tag.style.opacity = String(smooth(4100, 4500, t) * (1 - smooth(6500, 6900, t)));

    // contact glows: at the robot palm (1.4–2.0s), at the human palm on the way back (5.4–6.0s)
    const tc = sub(t, 1400, 2000), tb = sub(t, 5400, 6000);
    const glowAt = tb > 0 ? [onHuman[0], onHuman[1] - 5] : [onRobot[0], onRobot[1] - 5], g = tb > 0 ? tb : tc;
    L.touch.setAttribute("cx", f1(glowAt[0])); L.touch.setAttribute("cy", f1(glowAt[1]));
    L.touch.setAttribute("r", f1(6 + g * 8));
    L.touch.style.opacity = g > 0 && g < 1 ? String(Math.sin(Math.PI * g) * 0.5) : "0";
    L.spark.style.opacity = "0";

    // scanning (2.3–3.1s): thin arc + HUD brackets
    const fx = onRobot[0], fy = onRobot[1];
    L.scan.setAttribute("cx", f1(fx)); L.scan.setAttribute("cy", f1(fy - 15 + easeIO(scan) * 15));
    L.scan.style.opacity = scan > 0 && scan < 1 ? String(Math.sin(Math.PI * scan) * 0.9) : "0";
    L.vline.style.opacity = "0";
    L.hud.setAttribute("transform", `translate(${f1(fx)} ${f1(fy - 1)})`);
    L.hud.style.opacity = String(smooth(2250, 2500, t) * (1 - smooth(4300, 4600, t)) * 0.85);

    // processing traces (3.1–4.0s)
    L.auto.setAttribute("transform", `translate(${f1(fx)} ${f1(fy)})`);
    L.auto.style.opacity = String(smooth(3100, 3300, t) * (1 - smooth(3700, 4050, t)));
    L.streaks.forEach((l, i) => (l.style.strokeDashoffset = f1((t - 3100) / 10 + i * 9)));
  }

  /* ------------------------------------------------------------------------
     7c. CITY HOLOGRAMS — monuments drawn as line art that build themselves
     ------------------------------------------------------------------------ */
  const crenels = (x0, x1, y) => { let d = ""; for (let x = x0; x + 4 <= x1; x += 8) d += `M${x} ${y}V${y - 6}H${x + 4}V${y}`; return d; };
  const MONUMENTS = {
    gateway: { vb: [220, 160], nodes: [[30, 26], [110, 36], [190, 26], [110, 100]], paths: [
      "M10 150H210", "M20 150V40Q30 22 40 40V60H90V50H130V60H180V40Q190 22 200 40V150", "M90 50Q110 30 130 50",
      "M20 75H200", "M85 150V100A25 25 0 0 1 135 100V150", "M45 150V118A10 10 0 0 1 65 118V150", "M155 150V118A10 10 0 0 1 175 118V150"] },
    shaniwarwada: { vb: [240, 140], nodes: [[120, 24], [22, 49], [218, 49], [120, 92]], paths: [
      "M10 130H230", "M10 130V55H35V130", "M205 130V55H230V130", "M35 70H95M145 70H205",
      crenels(37, 95, 70) + crenels(147, 205, 70), crenels(12, 35, 55) + crenels(207, 230, 55),
      "M95 130V38H145V130", "M108 130V92Q120 72 132 92V130", "M98 38L120 24L142 38", "M103 50h10v10h-10zM127 50h10v10h-10z"] },
    burjkhalifa: { vb: [120, 200], nodes: [[60, 2], [40, 150], [80, 150]], paths: [
      "M5 190H115", "M30 190V150H40V115H48V80H54V50H57V28H59L60 2L61 28H63V50H66V80H72V115H80V150H90V190Z",
      "M60 28V190", "M40 150H80M48 115H72M54 80H66"] },
    marinabay: { vb: [220, 160], nodes: [[12, 44], [212, 44], [112, 34]], paths: [
      "M5 150H215", "M32 150L42 44H62L64 150", "M92 150L102 44H122L124 150", "M152 150L162 44H182L184 150",
      "M12 44H212L205 34H22Z", "M38 90H63M98 90H123M158 90H183M36 120H64M96 120H124M156 120H184"] },
    indiagate: { vb: [160, 180], nodes: [[80, 8], [30, 40], [130, 40]], paths: [
      "M5 170H155", "M30 170V40H130V170", "M40 40V28H120V40", "M55 28V18H105V28", "M70 18Q80 4 90 18",
      "M60 170V100A20 20 0 0 1 100 100V170", "M30 60H130M30 72H130"] },
    eiffel: { vb: [140, 220], nodes: [[70, 4], [36, 160], [104, 160]], paths: [
      "M15 210H125", "M22 210Q50 140 62 80L66 30L70 4L74 30L78 80Q90 140 118 210", "M36 160H104",
      "M46 210Q70 172 94 210", "M56 100H84", "M64 50H76", "M42 160L60 100M98 160L80 100M60 100L66 50M80 100L74 50"] },
    bigben: { vb: [100, 220], nodes: [[50, 4], [50, 56]], paths: [
      "M15 210H85", "M35 210V72H65V210", "M30 72V40H70V72Z", "M60 56A10 10 0 1 1 40 56A10 10 0 1 1 60 56",
      "M50 56V48M50 56L55 59", "M33 40L36 30H64L67 40", "M36 30L50 4L64 30", "M43 84V200M50 84V200M57 84V200"] },
    opera: { vb: [240, 120], nodes: [[92, 40], [118, 30], [164, 48]], paths: [
      "M5 110H235", "M15 110V100H225V110", "M40 100Q58 28 104 100", "M82 100Q112 12 152 100", "M132 100Q162 32 196 100",
      "M58 100Q72 56 104 100", "M104 100Q122 44 152 100", "M156 100Q170 60 196 100"] }
  };
  // Where each city floats (% of the hero). m = phone slot; cities without one hide on phones.
  const SLOTS = [
    { l: 2.5, t: 17, w: 13, z: 1.2, m: { l: 4, t: 12, w: 22 } },
    { l: 4, t: 57, w: 15, z: 0.8, m: { l: 58, t: 48, w: 30 } },
    { l: 88, t: 13, w: 6.5, z: 1.4, m: { l: 82, t: 12, w: 11 } },
    { l: 82, t: 57, w: 14, z: 0.9, m: { l: 8, t: 48, w: 24 } },
    { l: 20, t: 13, w: 8, z: 0.6 },
    { l: 65, t: 9, w: 5.5, z: 0.7 },
    { l: 43, t: 68, w: 4.5, z: 0.5 },
    { l: 58, t: 66, w: 12, z: 0.6 }
  ];
  function renderCities(el, area) {
    if (!el) return;
    el.innerHTML = (C.heroCities || []).slice(0, SLOTS.length).map((c, i) => {
      const mon = MONUMENTS[c.monument];
      if (!mon) return "";
      const sl = SLOTS[i], [w, h] = mon.vb;
      const vars = `--i:${i};--l:${sl.l}%;--t:${sl.t}%;--w:${sl.w}vw;--z:${sl.z};--h:${h};--dur:${9 + (i % 4) * 2}s` +
        (sl.m ? `;--ml:${sl.m.l}%;--mt:${sl.m.t}%;--mw:${sl.m.w}vw` : "");
      return `<div class="city${sl.m ? "" : " city--wide-only"}" style="${vars}"><div class="city__float">
        <svg viewBox="0 0 ${w} ${h}">
          ${mon.paths.map((d, k) => `<path class="city__line" d="${d}" pathLength="1" style="--k:${k}"/>`).join("")}
          ${mon.nodes.map(([x, y], k) => `<circle class="city__node" cx="${x}" cy="${y}" r="2.4" style="--k:${k}"/>`).join("")}
          <rect class="city__scan" x="0" y="0" width="${w}" height="1.5"/>
        </svg>
        <div class="city__label mono"><b>${esc(c.city)}</b><span>${esc(c.coords)}</span>${c.tag ? `<em>${esc(c.tag)}</em>` : ""}</div>
      </div></div>`;
    }).join("");
    if (fine && !reduced) area.addEventListener("pointermove", (e) => {
      const r = area.getBoundingClientRect();
      el.style.setProperty("--mx", (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
      el.style.setProperty("--my", (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
    });
  }

  /* ------------------------------------------------------------------------
     7d. STAGES — the hero and the finale share fabric, logo and cities.
     Each launches the first time it is on screen (after the preloader).
     ------------------------------------------------------------------------ */
  const stages = [$(".hero"), $(".finale")].filter(Boolean).map((root, i) => {
    const st = {
      root, visible: i === 0, launched: false,
      fabric: createFabric($(".hero__fabric", root), root),
      logo: createLogo($("[data-logo='hero'] svg", root))
    };
    renderCities($(".hero__cities", root), root);
    new IntersectionObserver(([e]) => { st.visible = e.isIntersecting; maybeLaunch(st); }, { threshold: 0.3 }).observe(root);
    if (reduced) st.fabric.draw(0);
    return st;
  });
  function maybeLaunch(st) {
    if (st.launched || !st.visible || !document.body.classList.contains("is-ready")) return;
    st.launched = true;
    st.root.classList.add("is-live");
    if (st.logo) st.logo.launchAt = performance.now();
    setTimeout(() => st.root.classList.add("is-drawn"), reduced ? 0 : 2600); // drop dash seams once drawn
  }

  /* ------------------------------------------------------------------------
     8. MAIN LOOP — spins every robotic O; faster when you scroll (like a drum)
     ------------------------------------------------------------------------ */
  const spins = $$(".spin").map((g) => ({ g, s: +g.dataset.speed, cx: g.dataset.cx, cy: g.dataset.cy }));
  let angle = 0, prev = performance.now();
  function frame(now) {
    const dt = Math.min(50, now - prev); prev = now;
    velocity *= 0.9;
    const boost = 1 + Math.min(14, velocity * 0.08);
    angle += dt * 0.012 * boost;
    spins.forEach(({ g, s, cx, cy }) => g.setAttribute("transform", `rotate(${(angle * s).toFixed(2)} ${cx} ${cy})`));
    stages.forEach((st) => {
      if (!st.visible) return;
      st.fabric.draw(now);
      if (st.logo) animateLogo(st.logo, now);
    });
    if (cycleVisible) drawCycle(now);
    requestAnimationFrame(frame);
  }
  if (!reduced) requestAnimationFrame(frame); else drawCycle(0);

  /* ------------------------------------------------------------------------
     9. MENU, CURSOR, MAGNETIC BUTTONS, PILLAR LIGHT
     ------------------------------------------------------------------------ */
  const burger = $(".nav__burger"), menu = $(".menu");
  const setMenu = (open) => {
    burger.setAttribute("aria-expanded", open);
    menu.classList.toggle("is-open", open);
    menu.setAttribute("aria-hidden", !open);
    document.body.classList.toggle("menu-open", open);
    document.body.style.overflow = open ? "hidden" : "";
  };
  burger.addEventListener("click", () => setMenu(burger.getAttribute("aria-expanded") !== "true"));
  $$("a", menu).forEach((a) => a.addEventListener("click", () => setMenu(false)));

  if (fine && !reduced) {
    const cur = $(".cursor");
    let cx = innerWidth / 2, cy = innerHeight / 2, tx = cx, ty = cy;
    addEventListener("pointermove", (e) => { tx = e.clientX; ty = e.clientY; cur.classList.remove("is-hidden"); });
    document.addEventListener("pointerleave", () => cur.classList.add("is-hidden"));
    (function move() {
      cx = lerp(cx, tx, 0.2); cy = lerp(cy, ty, 0.2);
      cur.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      requestAnimationFrame(move);
    })();
    document.addEventListener("pointerover", (e) => cur.classList.toggle("is-hover", !!e.target.closest("a, button, label, .service, .update")));

    $$(".magnetic").forEach((el) => {
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.22}px, ${(e.clientY - r.top - r.height / 2) * 0.32}px)`;
      });
      el.addEventListener("pointerleave", () => { el.style.transform = ""; });
      el.style.transition = "transform .5s cubic-bezier(.2,.7,.1,1), color .45s";
    });
    $$(".pillar").forEach((el) => el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", e.clientX - r.left + "px");
      el.style.setProperty("--my", e.clientY - r.top + "px");
    }));
  } else {
    $(".cursor").remove();
  }

  /* ------------------------------------------------------------------------
     10. CONTACT FORM — opens a pre-filled WhatsApp chat (no server needed)
     ------------------------------------------------------------------------ */
  const form = $(".contact__form"), msg = $(".contact__msg");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const name = (f.get("name") || "").trim(), phone = (f.get("phone") || "").trim();
    form.elements.name.classList.toggle("is-invalid", !name);
    form.elements.phone.classList.toggle("is-invalid", phone.replace(/\D/g, "").length < 8);
    if (!name || phone.replace(/\D/g, "").length < 8) { msg.textContent = "Add your name and a valid phone number."; return; }
    const text = `Hi LOOP, I'm ${name} (${phone})${f.get("city") ? " from " + f.get("city") : ""}. I'm interested in: ${f.get("topic")}.`;
    window.open(`https://wa.me/${ct.whatsapp}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    msg.textContent = "Opening WhatsApp…";
    form.reset();
  });
})();
