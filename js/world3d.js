/* ==========================================================================
   LOOP — 3D layer (Three.js r128)
   Two transparent WebGL canvases: the background one (behind the page) holds
   the 3D fabric and the floating thread-dust; the foreground one (above the
   page, clicks pass through) holds the wordmark orbit ring, pinned to the logo.
   It follows the bounding box of its HTML anchor each frame, so the HTML layout
   stays the source of truth. (Content icons are plain SVG in the page instead:
   pinned WebGL objects trail a frame behind native scrolling.)
   If WebGL is unavailable nothing changes: the 2D site keeps working.
   ========================================================================== */
(() => {
  "use strict";
  if (!window.THREE) return;
  // Touch devices skip this layer: two full-screen WebGL canvases redrawn every frame were the
  // main cost on phones, for subtle effects (dust, logo orbit). The page's 2D canvas fabric
  // takes over. Set by main.js.
  if (document.documentElement.classList.contains("is-lite")) return;
  const T = THREE;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const small = innerWidth < 760;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const TAU = Math.PI * 2;
  const easeIO = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const IVORY = new T.Color(0xece7df), BRASS = new T.Color(0xb89a63);

  /* ---------- renderers, camera, lights ---------- */
  function makeRenderer(cls) {
    let r;
    try { r = new T.WebGLRenderer({ antialias: true, alpha: true }); } catch (e) { return null; }
    r.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2));
    r.setSize(innerWidth, innerHeight);
    r.setClearColor(0x000000, 0);
    r.domElement.className = "world3d " + cls;
    r.domElement.setAttribute("aria-hidden", "true");
    document.body.appendChild(r.domElement);
    return r;
  }
  const bgR = makeRenderer("world3d--bg");
  if (!bgR) return;
  const fgR = makeRenderer("world3d--fg");
  if (!fgR) { bgR.domElement.remove(); return; }
  document.documentElement.classList.add("has-3d");

  const DIST = 40, FOV = 35;
  const camera = new T.PerspectiveCamera(FOV, innerWidth / innerHeight, 1, 200);
  camera.position.set(0, 0, DIST);
  let wpp = 0; // world units per CSS pixel on the z = 0 plane
  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    bgR.setSize(innerWidth, innerHeight);
    fgR.setSize(innerWidth, innerHeight);
    wpp = (2 * DIST * Math.tan((FOV / 2) * Math.PI / 180)) / innerHeight;
  }
  resize();
  addEventListener("resize", resize);

  const bg = new T.Scene(), fg = new T.Scene();
  fg.add(new T.AmbientLight(0xffffff, 0.55));
  const key = new T.DirectionalLight(0xfff6e8, 0.9);
  key.position.set(-6, 10, 14);
  fg.add(key);
  const warm = new T.PointLight(0xb89a63, 1.2, 80);
  warm.position.set(8, -4, 14);
  fg.add(warm);

  const mouse = { x: -1e4, y: -1e4, nx: 0, ny: 0 };
  addEventListener("pointermove", (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    mouse.nx = (e.clientX / innerWidth) * 2 - 1; mouse.ny = (e.clientY / innerHeight) * 2 - 1;
  });

  // Pin a group to the centre of an element's box; hide it when off-screen.
  function pin(group, el) {
    const r = el.getBoundingClientRect();
    const vis = r.width > 0 && r.bottom > -60 && r.top < innerHeight + 60;
    group.visible = vis;
    if (!vis) return null;
    group.position.set((r.left + r.width / 2 - innerWidth / 2) * wpp, -(r.top + r.height / 2 - innerHeight / 2) * wpp, 0);
    return r;
  }

  const dotTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new T.CanvasTexture(c);
  })();
  const circlePts = (r, z, seg = 128) =>
    new T.BufferGeometry().setFromPoints(Array.from({ length: seg + 1 }, (_, i) => {
      const a = (i / seg) * TAU;
      return new T.Vector3(Math.cos(a) * r, Math.sin(a) * r, z);
    }));
  const lineMat = (c, o) => new T.LineBasicMaterial({ color: c, transparent: true, opacity: o });

  /* ---------- 1. 3D fabric (hero + finale backgrounds) ---------- */
  function createFabric(anchor) {
    const rows = small ? 30 : 46, cols = small ? 48 : 90, TILT = 0.62;
    const n = rows * (cols - 1) * 2;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), row = new Float32Array(cols * 3);
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(pos, 3));
    geo.setAttribute("color", new T.BufferAttribute(col, 3));
    const lines = new T.LineSegments(geo, new T.LineBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
    lines.frustumCulled = false;
    const tilt = new T.Group(), group = new T.Group();
    tilt.rotation.x = -TILT;
    tilt.add(lines); group.add(tilt); bg.add(group);
    const rip = { u: 9, v: 9 };
    return function update(t) {
      const r = pin(group, anchor);
      if (!r) return;
      group.scale.set((r.width / 2) * wpp, (r.height / 2) * wpp, (r.height / 2) * wpp);
      let mu = 9, mv = 9;
      if (mouse.x > -1e3 && mouse.y > r.top && mouse.y < r.bottom) {
        mu = (mouse.x - (r.left + r.width / 2)) / (r.width / 2);
        mv = -(mouse.y - (r.top + r.height / 2)) / (r.height / 2) / Math.cos(TILT);
      }
      rip.u = lerp(rip.u, mu, 0.08); rip.v = lerp(rip.v, mv, 0.08);
      const asp = r.width / r.height;
      let k = 0;
      for (let i = 0; i < rows; i++) {
        const v = (i / (rows - 1)) * 2.6 - 1.3;
        const shade = 0.5 + 0.5 * Math.sin(i * 0.22 + t * 0.0004);
        const b = (0.05 + shade * 0.17) * (0.5 + 0.5 * (1 - (v + 1.3) / 2.6));
        for (let j = 0; j < cols; j++) {
          const u = (j / (cols - 1)) * 2.3 - 1.15;
          let z = Math.sin(u * 3.2 + t * 0.00055 + i * 0.16) * 0.06 + Math.sin(u * 8 - t * 0.0008 + i * 0.05) * 0.022;
          const du = (u - rip.u) * asp, dv = v - rip.v;
          z += Math.exp(-(du * du + dv * dv) / 0.035) * 0.2;
          row[j * 3] = u; row[j * 3 + 1] = v; row[j * 3 + 2] = z;
        }
        for (let j = 0; j < cols - 1; j++) {
          for (let e = 0; e < 2; e++) {
            const o = (j + e) * 3;
            pos[k] = row[o]; pos[k + 1] = row[o + 1]; pos[k + 2] = row[o + 2];
            col[k] = IVORY.r * b; col[k + 1] = IVORY.g * b; col[k + 2] = IVORY.b * b;
            k += 3;
          }
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    };
  }

  /* ---------- 2. floating thread-dust in depth (whole page) ---------- */
  function createDust() {
    const N = small ? 220 : 520, H = 70;
    const pos = new Float32Array(N * 2 * 3), col = new Float32Array(N * 2 * 3);
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 72, y = -45 + Math.random() * H, z = -30 + Math.random() * 34;
      const c = Math.random() < 0.2 ? BRASS : IVORY, b = Math.random() < 0.2 ? 0.9 : 0.35 + Math.random() * 0.3;
      for (let copy = 0; copy < 2; copy++) {
        const o = (copy * N + i) * 3;
        pos[o] = x; pos[o + 1] = y - copy * H; pos[o + 2] = z;
        col[o] = c.r * b; col[o + 1] = c.g * b; col[o + 2] = c.b * b;
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(pos, 3));
    geo.setAttribute("color", new T.BufferAttribute(col, 3));
    const pts = new T.Points(geo, new T.PointsMaterial({ size: 0.22, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    pts.frustumCulled = false;
    bg.add(pts);
    return function update(t) {
      pts.position.y = (scrollY * wpp * 0.35) % H;
      pts.position.x = Math.sin(t * 0.00005) * 1.2;
      pts.rotation.y = lerp(pts.rotation.y, mouse.nx * 0.04, 0.05);
      pts.rotation.x = lerp(pts.rotation.x, mouse.ny * 0.03, 0.05);
    };
  }

  /* ---------- 4b. the LOOP wordmark in 3D ----------
     An orbit ring sweeps around the wordmark (back half behind the page, front half in front),
     pinned to the flat SVG letters, which stay the source of truth. Earlier experimental
     in-O scenes (first-O precision fold, second-O washer door) were removed as unused. */
  function createLogoOrbitOnly(root) {
    const logoEl = $('[data-logo="hero"]', root), svg = logoEl && $("svg", logoEl);
    if (!svg) return () => {};

    const orbitBack = new T.Group(), orbitFront = new T.Group();
    bg.add(orbitBack); fg.add(orbitFront);
    const ringMat = (opacity) => new T.MeshBasicMaterial({ color: IVORY, transparent: true, opacity, depthWrite: false });
    const backHalf = new T.Mesh(new T.TorusGeometry(1, 0.0018, 6, 200, Math.PI), ringMat(0.32));
    const frontHalf = new T.Mesh(new T.TorusGeometry(1, 0.0018, 6, 200, Math.PI), ringMat(0.5));
    frontHalf.rotation.z = Math.PI;
    const backHalf2 = new T.Mesh(new T.TorusGeometry(1.035, 0.001, 6, 200, Math.PI), ringMat(0.16));
    const frontHalf2 = new T.Mesh(new T.TorusGeometry(1.035, 0.001, 6, 200, Math.PI), ringMat(0.26));
    frontHalf2.rotation.z = Math.PI;
    orbitBack.add(backHalf, backHalf2); orbitFront.add(frontHalf, frontHalf2);

    const comet = [orbitBack, orbitFront].map((group) => Array.from({ length: 12 }, (_, k) => {
      const sprite = new T.Sprite(new T.SpriteMaterial({ map: dotTex, color: k ? BRASS : 0xf4ead8, blending: T.AdditiveBlending, depthWrite: false }));
      sprite.scale.setScalar(k ? 0.03 * (1 - k / 14) : 0.045);
      group.add(sprite);
      return sprite;
    }));

    return function update(t) {
      const sr = pin(orbitFront, svg);
      orbitBack.visible = !!sr;
      if (!sr) return;
      orbitBack.position.copy(orbitFront.position);
      const radius = (sr.width / 2) * wpp * 1.07;
      [orbitBack, orbitFront].forEach((group) => {
        group.scale.setScalar(radius);
        group.rotation.set(-1.43, 0, -0.05);
      });
      const head = reduced ? 4.2 : t * 0.00032;
      comet.forEach((list, side) => list.forEach((sprite, j) => {
        const angle = head - j * 0.022;
        sprite.position.set(Math.cos(angle), Math.sin(angle), 0);
        sprite.visible = side === 1 ? Math.sin(angle) < 0 : Math.sin(angle) >= 0;
      }));
    };
  }

  /* ---------- loop ---------- */
  const updates = [
    ...$$(".hero, .finale").map(createFabric),
    ...$$(".hero, .finale").map(createLogoOrbitOnly),
    createDust()
  ];
  let prev = performance.now();
  let raf = 0;
  function frame(now) {
    raf = 0;
    if (document.hidden) return;
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    const t = reduced ? 0 : now;
    updates.forEach((u) => u(t, reduced ? 0 : dt));
    bgR.render(bg, camera);
    fgR.render(fg, camera);
    raf = requestAnimationFrame(frame);
  }
  const schedule = () => {
    if (!document.hidden && !raf) raf = requestAnimationFrame(frame);
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      return;
    }
    prev = performance.now();
    schedule();
  });
  schedule();
})();
