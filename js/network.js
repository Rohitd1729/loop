/* LOOP network: an auto-playing city tour on the network-section globe.
   For each city the globe spins until its pin faces you, the pin pulses, a line
   draws out to a rounded frame, and the city name rises up *behind* its monument.
   City text comes from content.js (heroCities); monument art is the line-art set
   from main.js until real cut-out photos are supplied (set `image` on a city). */
(() => {
  "use strict";
  const section = document.querySelector(".global-network");
  if (!section) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Headline/intro reveal (previously driven by the globe travel).
  new IntersectionObserver(([e]) => { if (e.isIntersecting) section.classList.add("is-arrived"); }, { threshold: .2 }).observe(section);

  const globe = window.LOOP_GLOBE_NETWORK;
  const card = section.querySelector(".city-card");
  const box = card && card.querySelector(".city-card__box");
  const nameEl = card && card.querySelector(".city-card__name");
  const monEl = card && card.querySelector(".city-card__monument");
  const metaEl = card && card.querySelector(".city-card__meta");
  const link = section.querySelector(".network-connector");
  if (!globe || !card || !link) return;

  const MON = window.LOOP_MONUMENTS || {};
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const coords = (lat, lon) => `${Math.abs(lat).toFixed(2)}° ${lat < 0 ? "S" : "N"} · ${Math.abs(lon).toFixed(2)}° ${lon < 0 ? "W" : "E"}`;
  // City list comes from content.js (network.cities), via the globe so pins and cards always match.
  const tour = globe.cities.map((c, i) => Object.assign({}, c, { coords: c.coords || coords(c.lat, c.lon), i }));
  const srList = section.querySelector(".global-network__cities");
  if (srList) srList.textContent = "LOOP cities: " + tour.map((c) => `${c.city} (${c.tag || ""})`).join(", ");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const path = link.querySelector("path"), dot = link.querySelector("circle");

  function render(city) {
    const letters = [...city.city.toUpperCase()];
    nameEl.style.setProperty("--n", letters.length);
    nameEl.innerHTML = letters.map((ch, k) => ch === " " ? `<span class="sp" style="--k:${k}"></span>` : `<span style="--k:${k}">${esc(ch)}</span>`).join("");
    if (city.image) {
      monEl.innerHTML = `<img src="${esc(city.image)}" alt="">`;
    } else {
      const m = MON[city.monument];
      monEl.innerHTML = m ? `<svg viewBox="0 0 ${m.vb[0]} ${m.vb[1]}" preserveAspectRatio="xMidYMax meet">` +
        m.paths.map((d, k) => `<path d="${d}" pathLength="1" style="--k:${k}"/>`).join("") + `</svg>` : "";
    }
    metaEl.innerHTML = `<b>${esc(city.coords)}</b><span>${esc(city.tag)}</span>`;
  }

  // Elbowed leader line, F1-graphics style: out from the pin, then square into the frame.
  function connect(i) {
    const s = section.getBoundingClientRect(), p = globe.getCityScreen(i), a = box.getBoundingClientRect();
    link.setAttribute("viewBox", `0 0 ${s.width} ${s.height}`);
    link.setAttribute("width", s.width); link.setAttribute("height", s.height);
    const x1 = p.x - s.left, y1 = p.y - s.top;
    let x2, y2, ex, ey;
    if (a.right < p.x - 12) {          // card sits to the left of the pin (desktop)
      x2 = a.right - s.left; y2 = Math.min(Math.max(y1, a.top - s.top + 24), a.bottom - s.top - 24);
      ex = x1 - Math.min(60, (x1 - x2) * .4); ey = y2;
    } else {                            // card sits below the pin (phones)
      x2 = Math.min(Math.max(x1, a.left - s.left + 24), a.right - s.left - 24); y2 = a.top - s.top;
      ex = x2; ey = y1 + Math.min(40, (y2 - y1) * .4);
    }
    path.setAttribute("d", `M${x1.toFixed(1)} ${y1.toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`);
    dot.setAttribute("cx", x2.toFixed(1)); dot.setAttribute("cy", y2.toFixed(1));
  }

  let token = 0, running = false, current = -1;
  const hide = () => { section.classList.remove("is-linked"); card.classList.remove("is-in", "is-out"); };

  async function run() {
    const my = ++token; running = true;
    let k = Math.max(0, current);
    while (my === token) {
      const city = tour[k % tour.length];
      card.classList.add("is-reset"); hide(); render(city); void card.offsetWidth; card.classList.remove("is-reset");
      globe.setActiveCity(null);
      await globe.rotateToCity(city.i);
      if (my !== token) return;
      current = k;
      globe.setActiveCity(city.i);
      connect(city.i);
      section.classList.add("is-linked"); card.classList.add("is-in");
      await wait(reduced ? 5000 : 4400);
      if (my !== token) return;
      card.classList.add("is-out"); section.classList.remove("is-linked");
      await wait(reduced ? 0 : 600);
      k++;
    }
  }
  function stop() { token++; running = false; hide(); globe.setActiveCity(null); globe.setAutoSpin(true); }

  // Only tour while the section is on screen; resume where it left off.
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { if (!running) run(); } else if (running) stop();
  }, { threshold: .3 }).observe(section);

  // Dragging the globe breaks the leader line; it redraws when the next city locks in.
  section.querySelector(".network-globe").addEventListener("pointerdown", () => section.classList.remove("is-linked"));
  addEventListener("resize", () => { if (card.classList.contains("is-in") && current >= 0) connect(tour[current % tour.length].i); });
})();
