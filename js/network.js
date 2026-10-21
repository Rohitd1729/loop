/* LOOP network: live city tiles on a continuously spinning globe.
   The globe never stops. Every frame it reports where each city pin is; a city that
   rotates into the front window gets one of four tile slots (city name behind its
   landmark) with a leader line that stays attached to the moving pin, and loses it
   as it rotates away. Neighbours (Mumbai + Pune, Tokyo / Shanghai / Hong Kong /
   Singapore) therefore show together. Cities come from content.js → network.cities. */
(() => {
  "use strict";
  const section = document.querySelector(".global-network");
  if (!section) return;

  // Headline/intro reveal.
  new IntersectionObserver(([e]) => { if (e.isIntersecting) section.classList.add("is-arrived"); }, { threshold: .2 }).observe(section);

  const globe = window.LOOP_GLOBE_NETWORK;
  const wrap = section.querySelector(".city-tiles");
  const svg = section.querySelector(".network-connector");
  if (!globe || !wrap || !svg) return;

  const MON = window.LOOP_MONUMENTS || {};
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const coords = (lat, lon) => `${Math.abs(lat).toFixed(2)}° ${lat < 0 ? "S" : "N"} · ${Math.abs(lon).toFixed(2)}° ${lon < 0 ? "W" : "E"}`;
  const cities = globe.cities.map((c, i) => Object.assign({}, c, { coords: c.coords || coords(c.lat, c.lon), i }));
  const srList = section.querySelector(".global-network__cities");
  if (srList) srList.textContent = "LOOP cities: " + cities.map((c) => `${c.city} (${c.tag || ""})`).join(", ");

  // Front window, in radians from the centre meridian. Pins move left → right (angle rises);
  // at the globe's spin speed a city stays inside ±WINDOW for ~3.4 s.
  const WINDOW = .38, EXIT = WINDOW + .03, LATE = WINDOW * .4, OUT_MS = 420;
  const NS = "http://www.w3.org/2000/svg";
  const stacked = matchMedia("(max-width: 1020px)"); // tiles above/below the globe (else beside it)

  // Four fixed slots: 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right.
  const slots = [0, 1, 2, 3].map((n) => {
    const el = document.createElement("div");
    el.className = "city-card"; el.dataset.slot = n;
    el.innerHTML = `<div class="city-card__box"><div class="city-card__frame"><div class="city-card__name"></div><div class="city-card__monument"></div></div>` +
      `<i class="cc cc--tl"></i><i class="cc cc--tr"></i><i class="cc cc--bl"></i><i class="cc cc--br"></i></div><p class="city-card__meta mono"></p>`;
    wrap.appendChild(el);
    const path = document.createElementNS(NS, "path"); path.setAttribute("pathLength", "1");
    const dot = document.createElementNS(NS, "circle"); dot.setAttribute("r", "2.5");
    svg.append(path, dot);
    return { el, box: el.querySelector(".city-card__box"), path, dot, city: -1, track: -1, until: 0, rect: null };
  });
  const slotOf = new Map(); // city index → slot

  function render(s, city) {
    const letters = [...city.city.toUpperCase()];
    const name = s.el.querySelector(".city-card__name"), mon = s.el.querySelector(".city-card__monument");
    name.style.setProperty("--n", letters.length);
    name.innerHTML = letters.map((ch, k) => ch === " " ? `<span class="sp" style="--k:${k}"></span>` : `<span style="--k:${k}">${esc(ch)}</span>`).join("");
    if (city.image) mon.innerHTML = `<img src="${esc(city.image)}" alt="">`;
    else {
      const m = MON[city.monument];
      mon.innerHTML = m ? `<svg viewBox="0 0 ${m.vb[0]} ${m.vb[1]}" preserveAspectRatio="xMidYMax meet">` +
        m.paths.map((d, k) => `<path d="${d}" pathLength="1" style="--k:${k}"/>`).join("") + `</svg>` : "";
    }
    s.el.querySelector(".city-card__meta").innerHTML = `<b>${esc(city.coords)}</b><span>${esc(city.tag)}</span>`;
  }

  // Tile boxes don't move with the globe, so measure them (relative to the section) only on layout change.
  function measure() {
    const sr = section.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${sr.width} ${sr.height}`); svg.setAttribute("width", sr.width); svg.setAttribute("height", sr.height);
    slots.forEach((s) => { const b = s.box.getBoundingClientRect(); s.rect = { l: b.left - sr.left, t: b.top - sr.top, r: b.right - sr.left, b: b.bottom - sr.top }; });
  }
  new ResizeObserver(measure).observe(section);
  addEventListener("resize", measure);
  measure();

  function show(ci, st, globeMidY) {
    // upper pins prefer the top row, lower pins the bottom row; left slot first
    const order = st.y < globeMidY ? [0, 1, 2, 3] : [2, 3, 0, 1];
    const s = order.map((n) => slots[n]).find((x) => x.city === -1);
    if (!s) return;
    s.city = ci; s.track = ci; slotOf.set(ci, s);
    s.el.classList.add("is-reset"); s.el.classList.remove("is-in", "is-out");
    render(s, cities[ci]); void s.el.offsetWidth; s.el.classList.remove("is-reset");
    s.el.classList.add("is-in"); s.path.classList.add("is-on"); s.dot.classList.add("is-on");
  }
  function hide(ci, now) {
    const s = slotOf.get(ci); if (!s) return;
    slotOf.delete(ci);
    s.city = -2; s.until = now + OUT_MS; // line keeps following the pin while it retracts
    s.el.classList.add("is-out"); s.path.classList.remove("is-on"); s.dot.classList.remove("is-on");
  }

  // Elbowed leader line from the (moving) pin into the tile's facing edge.
  function route(s, st, sr) {
    const R = s.rect; if (!R) return;
    const px = st.x - sr.left, py = st.y - sr.top;
    let ax, ay, ex, ey;
    if (!stacked.matches) { // tiles beside the globe: enter through the inner side edge
      const left = R.r <= px;
      ax = left ? R.r : R.l; ay = clamp(py, R.t + 10, R.b - 10);
      ex = ax + (left ? 1 : -1) * Math.min(44, Math.abs(px - ax) * .45); ey = ay;
    } else {                // tiles above / below the globe: enter through the top or bottom edge
      const above = R.b <= py;
      ay = above ? R.b : R.t; ax = clamp(px, R.l + 14, R.r - 14);
      ey = ay + (above ? 1 : -1) * Math.min(34, Math.abs(py - ay) * .45); ex = ax;
    }
    s.path.setAttribute("d", `M${px.toFixed(1)} ${py.toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}L${ax.toFixed(1)} ${ay.toFixed(1)}`);
    s.dot.setAttribute("cx", ax.toFixed(1)); s.dot.setAttribute("cy", ay.toFixed(1));
  }

  let activeKey = "";
  globe.onFrame((states, rect) => {
    const now = performance.now(), sr = section.getBoundingClientRect(), midY = rect.top + rect.height / 2;
    slots.forEach((s) => { if (s.city === -2 && now >= s.until) { s.city = -1; s.track = -1; s.el.classList.remove("is-in", "is-out"); } });
    states.forEach((st, i) => {
      const shown = slotOf.has(i);
      const inView = st.front && Math.abs(st.a) < (shown ? EXIT : WINDOW);
      if (inView && !shown && st.a < LATE) show(i, st, midY); // don't start a tile that's about to leave
      else if (!inView && shown) hide(i, now);
    });
    const key = [...slotOf.keys()].join(",");
    if (key !== activeKey) { activeKey = key; globe.setActiveCities([...slotOf.keys()]); }
    slots.forEach((s) => { if (s.track >= 0) route(s, states[s.track], sr); });
  });
})();
