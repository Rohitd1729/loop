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
      `<g class="${animated ? "ro-layer" : ""}" style="--d:${d};transform-box:view-box;transform-origin:${cx}px ${cy}px">` +
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

  function wordmark(animated) {
    const draw = (el, w, delay) =>
      animated
        ? el.replace("/>", ` class="stroke draw" pathLength="1" stroke-width="${w}" style="--d:${delay}"/>`)
        : el.replace("/>", ` class="stroke" stroke-width="${w}"/>`);
    return (
      `<svg class="logo-svg" viewBox="0 0 860 240" role="img" aria-label="LOOP">` +
      draw(`<path d="M9 0V231H125"/>`, 18, 0) +
      draw(`<circle cx="275" cy="120" r="111" transform="rotate(-90 275 120)"/>`, 18, 0.15) +
      roboticO(530, 120, animated) +
      draw(`<path d="M699 240V9H790A61.5 61.5 0 0 1 790 132H699"/>`, 18, 0.3) +
      `</svg>`
    );
  }

  $$("[data-logo]").forEach((el) => {
    const kind = el.dataset.logo;
    if (kind === "o") el.innerHTML = `<svg class="logo-svg" viewBox="0 0 244 244">${roboticO(122, 122, false)}</svg>`;
    else el.innerHTML = wordmark(kind === "hero" && !reduced);
  });

  /* ------------------------------------------------------------------------
     2. CONTENT — fill the page from content.js
     ------------------------------------------------------------------------ */
  $$("[data-c]").forEach((el) => { const v = get(el.dataset.c); if (v != null) el.textContent = v; });
  $$("[data-href]").forEach((el) => { const v = get(el.dataset.href); if (v) el.setAttribute("href", v); });
  $$("[data-src]").forEach((el) => { const v = get(el.dataset.src); if (v) el.src = v; });
  $$("[data-show]").forEach((el) => { if (!get(el.dataset.show)) el.remove(); });

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

  // Updates — newest first, "New" badge for the last 14 days
  const fmt = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const updates = [...(C.updates || [])].sort((a, b) => (a.date < b.date ? 1 : -1));
  $(".updates__rail").innerHTML = updates.map((u, i) => {
    const fresh = (Date.now() - new Date(u.date + "T00:00:00")) / 864e5 <= 14;
    const tag = u.link ? "a" : "article";
    return `<${tag} class="update reveal${fresh ? " is-new" : ""}" style="--i:${i}"${u.link ? ` href="${esc(u.link)}"` : ""}>
      ${u.image ? `<div class="update__media"><img src="${esc(u.image)}" alt="" loading="lazy"></div>` : ""}
      <div class="update__body">
        <div class="update__meta mono"><b>${esc(u.tag)}</b><time datetime="${esc(u.date)}">${fmt(u.date)}</time></div>
        <h3>${esc(u.title)}</h3><p>${esc(u.text)}</p>
      </div></${tag}>`;
  }).join("");
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

  function startReveals() {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
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
    setTimeout(() => { document.body.classList.add("is-ready"); startReveals(); }, reduced ? 0 : 450);
    setTimeout(() => document.body.classList.add("is-drawn"), reduced ? 0 : 2600); // drop dash seams once drawn
    setTimeout(() => pre && pre.setAttribute("hidden", ""), 1600);
  }
  requestAnimationFrame(preTick);
  setTimeout(finish, 6000); // never trap a visitor behind the loader

  /* ------------------------------------------------------------------------
     5. FABRIC — a field of threads that ripples under the cursor
     ------------------------------------------------------------------------ */
  const canvas = $(".hero__fabric"), ctx = canvas.getContext("2d");
  let cw = 0, ch = 0, heroVisible = true;
  const mouse = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4 };
  function sizeCanvas() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    cw = canvas.clientWidth; ch = canvas.clientHeight;
    canvas.width = cw * dpr; canvas.height = ch * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function drawFabric(t) {
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
  sizeCanvas();
  addEventListener("resize", sizeCanvas);
  $(".hero").addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.tx = e.clientX - r.left; mouse.ty = e.clientY - r.top;
  });
  $(".hero").addEventListener("pointerleave", () => { mouse.tx = mouse.ty = -1e4; });
  new IntersectionObserver(([e]) => (heroVisible = e.isIntersecting)).observe($(".hero"));
  if (reduced) drawFabric(0);

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
    if (heroVisible) drawFabric(now);
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
