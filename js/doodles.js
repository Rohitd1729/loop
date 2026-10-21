/* ==========================================================================
   LOOP — doodle layer
   White hand-drawn laundry doodles (shirts, socks, washers, bubbles…) floating very
   faintly behind the whole page. Pure SVG line art: no images, no 3D. Positions come
   from a seeded random grid so the layout is the same on every visit, and only the
   doodles near the viewport animate.
   ========================================================================== */
(() => {
  "use strict";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const c = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

  // Each doodle: path strings in a 100×100 box, drawn with a loose, hand-made line.
  const D = {
    tshirt: ["M30 18C35 22 41 24 50 24C59 24 65 22 70 18L88 30L80 44L71 39L72 84C58 87 42 87 28 84L29 39L20 44L12 30Z", "M41 19C44 26 56 26 59 19", "M32 78C44 80 56 80 68 78"],
    shirt: ["M33 16L42 12L50 20L58 12L67 16L86 28L94 64L84 66L76 40L74 88C58 90 42 90 26 88L24 40L16 66L6 64L14 28Z", "M42 12L44 24L50 20L56 24L58 12", "M50 22L50 88",
      c(50, 34, 1.6), c(50, 48, 1.6), c(50, 62, 1.6), c(50, 76, 1.6), "M59 36H69V45H59Z"],
    jeans: ["M30 10L70 10L76 90L58 90L51 40L49 40L42 90L24 90Z", "M30 18L70 18", "M50 18L50 34", "M33 18C35 26 40 28 44 28M67 18C65 26 60 28 56 28", "M27 82L41 82M59 82L73 82"],
    sock: ["M38 10L62 10L62 56C62 64 68 70 78 74C88 78 86 92 74 92L44 92C34 92 30 84 34 76L38 66Z", "M38 20L62 20", "M44 10V20M50 10V20M56 10V20", "M38 64C44 70 50 72 56 70", "M70 80C67 85 69 90 74 92"],
    dress: ["M38 10L44 10C46 16 54 16 56 10L62 10L66 34C60 38 58 42 60 46L84 90L16 90L40 46C42 42 40 38 34 34Z", "M38 46C46 49 54 49 62 46", "M30 74C40 78 60 78 70 74"],
    washer: ["M18 10L82 10Q88 10 88 16L88 86Q88 92 82 92L18 92Q12 92 12 86L12 16Q12 10 18 10Z", "M12 26L88 26", c(24, 18, 3.5), "M58 15H78V21H58Z",
      c(50, 58, 22), c(50, 58, 15), "M41 61C44 53 54 53 58 58C60 64 52 68 46 64", c(71, 41, 2.5), c(76, 35, 1.6), "M22 92V96M78 92V96"],
    basket: ["M14 42L86 42L78 90L22 90Z", "M10 42L90 42", "M25 54L75 54M27 66L73 66M29 78L71 78", "M38 42L36 90M50 42V90M62 42L64 90",
      "M20 42C24 30 34 28 40 34C44 22 58 22 62 32C68 26 80 30 80 42"],
    hanger: ["M50 32C50 26 56 24 56 18C56 11 44 11 44 18", "M50 32L12 64C8 68 10 72 16 72L84 72C90 72 92 68 88 64Z"],
    iron: ["M12 72C12 48 34 36 68 36L84 36C88 36 90 40 90 44L90 72Z", "M40 36C40 24 46 20 56 20L76 20C80 20 82 24 82 28L82 36", c(70, 54, 4), "M12 72L90 72",
      "M26 26C22 20 30 16 26 10M38 22C34 16 42 12 38 6"],
    bottle: ["M36 30L36 20L54 20L54 30C66 32 72 40 72 50L72 86C72 90 70 92 66 92L30 92C26 92 24 90 24 86L24 50C24 40 28 32 36 30Z", "M38 12H52V20H38Z",
      "M61 42C67 45 67 59 61 62", "M30 56H60V76H30Z", "M45 60C42 65 42 68 45 70C48 68 48 65 45 60Z"],
    clothespin: ["M42 6L48 6L46 94L40 94Z", "M52 6L58 6L60 94L54 94Z", c(50, 46, 6), "M44 40L56 52"],
    towels: ["M14 72H86V86H14Z", "M18 56H82V72H18Z", "M22 42H78V56H22Z", "M76 72C80 76 80 82 76 86M72 56C76 60 76 68 72 72M68 42C72 46 72 52 68 56"],
    bubbles: [c(40, 42, 14), c(66, 30, 8), c(68, 60, 10), c(30, 72, 6), "M32 36C34 32 38 30 42 30", "M63 56C64 54 66 53 68 53"],
    drop: ["M50 12C40 34 28 46 28 62C28 76 38 86 50 86C62 86 72 76 72 62C72 46 60 34 50 12Z", "M40 62C40 70 44 74 48 76"],
    sparkle: ["M50 12C52 40 60 48 88 50C60 52 52 60 50 88C48 60 40 52 12 50C40 48 48 40 50 12Z"],
    loop: ["M72 34A26 26 0 1 0 76 58", "M64 22L73 34L59 38"]
  };
  const kinds = Object.keys(D);
  const defs = `<svg width="0" height="0" style="position:absolute"><defs>` + kinds.map((k) =>
    `<symbol id="dd-${k}" viewBox="0 0 100 100">` + D[k].map((d) =>
      `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`).join("") +
    `</symbol>`).join("") + `</defs></svg>`;

  // seeded PRNG (mulberry32): the same scatter every visit
  const seeded = (a) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const layer = document.createElement("div");
  layer.className = "doodles";
  layer.setAttribute("aria-hidden", "true");
  document.body.prepend(layer);

  let io = null, lastW = 0, lastH = 0;
  function build() {
    const W = document.body.clientWidth, H = document.body.scrollHeight;
    if (Math.abs(W - lastW) < 2 && Math.abs(H - lastH) < 200) return; // nothing meaningful changed
    lastW = W; lastH = H;
    const R = seeded(1729), phone = W < 760;
    // keep the hero (and the announcement bar above it) and the closing footer clear
    const pageY = (el) => (el ? el.getBoundingClientRect().top + scrollY : 0);
    const hero = document.querySelector(".hero"), foot = document.querySelector(".footer");
    const clearTop = hero ? pageY(hero) + hero.offsetHeight : 0, clearBottom = foot ? pageY(foot) : H;
    // sections with their own solid backgrounds hide the layer: doodles there would only animate unseen
    const covered = [...document.querySelectorAll(".global-network, .store, .franchise")].map((el) => [pageY(el), pageY(el) + el.offsetHeight]);
    const cell = phone ? 170 : 250, sMin = phone ? 40 : 56, sMax = phone ? 70 : 104;
    let html = "", bag = [];
    // shuffle bag: every doodle type is used once (in random order) before any repeats
    const nextKind = () => {
      if (!bag.length) { bag = kinds.slice(); for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; } }
      return bag.pop();
    };
    // jittered grid: ~60% of cells get one doodle at a random spot, size and tilt
    for (let y = 0; y < H; y += cell) for (let x = 0; x < W; x += cell) {
      if (R() > 0.6) continue;
      const kind = nextKind(), s = sMin + R() * (sMax - sMin);
      const px = x + R() * (cell - s), py = y + R() * (cell - s);
      if (py < clearTop + 24 || py + s > clearBottom - 24) continue;
      if (covered.some(([a, b]) => py + s > a && py < b)) continue;
      const vars = `--x:${px.toFixed(0)}px;--y:${py.toFixed(0)}px;--s:${s.toFixed(0)}px;` +
        `--r:${((R() - 0.5) * 50).toFixed(1)}deg;--o:${(0.13 + R() * 0.12).toFixed(3)};` +
        `--d:${(9 + R() * 9).toFixed(1)}s;--dl:${(-R() * 18).toFixed(1)}s;` +
        `--fx:${((R() - 0.5) * 28).toFixed(0)}px;--fy:${((R() - 0.5) * 34).toFixed(0)}px;--fr:${((R() - 0.5) * 16).toFixed(1)}deg`;
      // the float animates the plain <i> wrapper (compositor-friendly), not the <svg> itself
      html += `<div class="doodle" style="${vars}"><i><svg viewBox="0 0 100 100"><use href="#dd-${kind}"/></svg></i></div>`;
    }
    layer.innerHTML = defs + html;
    if (reduced) return;
    if (io) io.disconnect();
    io = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle("is-on", e.isIntersecting)), { rootMargin: "200px 0px" });
    layer.querySelectorAll(".doodle").forEach((d) => io.observe(d));
  }

  // The page grows as content and images load: rebuild (same seed → same layout, extended).
  let timer = 0;
  new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(build, 250); }).observe(document.body);
  build();
})();
