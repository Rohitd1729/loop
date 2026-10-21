/* ==========================================================================
   LOOP — 3D layer (Three.js r128)
   Two transparent WebGL canvases: the background one (behind the page) holds
   the 3D fabric and the floating thread-dust; the foreground one (above the
   page, clicks pass through) holds 3D objects pinned to page elements — the
   pillar icons and the wordmark orbit ring. Every object follows the bounding box of
   its HTML anchor each frame, so the HTML layout stays the source of truth.
   If WebGL is unavailable nothing changes: the 2D site keeps working.
   ========================================================================== */
(() => {
  "use strict";
  if (!window.THREE) return;
  // Touch devices skip this layer: two full-screen WebGL canvases redrawn every frame were the
  // main cost on phones, for subtle effects (dust, 3D pillar icons, logo orbit). The page's 2D
  // fallbacks (canvas fabric, SVG pillar icons) take over. Set by main.js.
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

  /* ---------- 4. pillar icons as 3D objects ---------- */
  function createPillarIcons() {
    const wire = (c, o) => new T.MeshBasicMaterial({ color: c, wireframe: true, transparent: true, opacity: o });
    const brassSolid = () => new T.MeshStandardMaterial({ color: BRASS, metalness: 0.6, roughness: 0.3 });
    const makers = [
      () => { // robotic laundry tech: a front-loading washer with an active drum
        const g = new T.Group();
        const body = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(1.16, 1.38, 0.42)), lineMat(IVORY, 0.68));
        body.position.y = -0.04;
        const panel = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(0.92, 0.2, 0.012)), lineMat(IVORY, 0.48));
        panel.position.set(0, 0.49, 0.22);
        const dial = new T.Mesh(new T.TorusGeometry(0.065, 0.012, 6, 24), new T.MeshBasicMaterial({ color: BRASS }));
        dial.position.set(-0.31, 0.49, 0.24);
        const drum = new T.Group(); drum.position.set(0, -0.08, 0.24);
        drum.add(new T.Mesh(new T.TorusGeometry(0.4, 0.055, 8, 48), new T.MeshBasicMaterial({ color: IVORY, transparent: true, opacity: 0.68 })));
        drum.add(new T.Mesh(new T.TorusGeometry(0.31, 0.012, 6, 48), new T.MeshBasicMaterial({ color: BRASS, transparent: true, opacity: 0.9 })));
        drum.add(new T.Mesh(new T.CircleGeometry(0.3, 40), new T.MeshBasicMaterial({ color: 0x151412, transparent: true, opacity: 0.84 })));
        const sweep = new T.Mesh(new T.TorusGeometry(0.2, 0.009, 5, 40, Math.PI * 1.2), new T.MeshBasicMaterial({ color: IVORY, transparent: true, opacity: 0.55 }));
        sweep.position.z = 0.012; drum.add(sweep);
        g.add(body, panel, dial, drum);
        g.userData.tick = (t, sp) => {
          drum.rotation.z += 0.012 * sp;
          g.rotation.y = Math.sin(t * 0.0006) * 0.08;
          g.rotation.x = 0.06;
        };
        return g;
      },
      () => { // supplied sustainability mark with a dimensional leaf and orbit layered over it
        const g = new T.Group();
        const leafShape = new T.Shape();
        leafShape.moveTo(0, 0.78);
        leafShape.bezierCurveTo(-0.12, 0.54, -0.52, 0.2, -0.5, -0.08);
        leafShape.bezierCurveTo(-0.47, -0.42, -0.15, -0.68, 0, -0.8);
        leafShape.bezierCurveTo(0.15, -0.68, 0.47, -0.42, 0.5, -0.08);
        leafShape.bezierCurveTo(0.52, 0.2, 0.12, 0.54, 0, 0.78);
        const leafGeometry = new T.ShapeGeometry(leafShape, 28);
        const leaf = new T.Mesh(leafGeometry, new T.MeshBasicMaterial({ color: IVORY, transparent: true, opacity: 0.11, side: T.DoubleSide, depthWrite: false }));
        leaf.position.z = 0.055;
        const outline = new T.LineSegments(new T.EdgesGeometry(leafGeometry), lineMat(IVORY, 0.58)); outline.position.z = 0.07;
        const stem = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0.77, 0.09), new T.Vector3(0, -0.78, 0.09)]), lineMat(IVORY, 0.76));
        const veinPoints = [
          new T.Vector3(0, 0.34, 0.095), new T.Vector3(0.25, 0.61, 0.095),
          new T.Vector3(0, 0.16, 0.095), new T.Vector3(0.48, 0.02, 0.095),
          new T.Vector3(0, -0.12, 0.095), new T.Vector3(0.42, -0.38, 0.095),
          new T.Vector3(0, 0.03, 0.095), new T.Vector3(-0.4, -0.32, 0.095)
        ];
        const veins = new T.LineSegments(new T.BufferGeometry().setFromPoints(veinPoints), lineMat(BRASS, 0.82));
        const orbit = new T.Group();
        const ring = new T.Mesh(new T.TorusGeometry(0.98, 0.012, 6, 120), new T.MeshBasicMaterial({ color: BRASS, transparent: true, opacity: 0.72 }));
        const innerArc = new T.Mesh(new T.TorusGeometry(0.73, 0.006, 4, 96, Math.PI * 1.18), new T.MeshBasicMaterial({ color: BRASS, transparent: true, opacity: 0.72 }));
        innerArc.rotation.z = 0.45;
        const satellite = new T.Mesh(new T.SphereGeometry(0.055, 16, 12), brassSolid());
        const satelliteRing = new T.Mesh(new T.TorusGeometry(0.055, 0.012, 6, 24), new T.MeshBasicMaterial({ color: BRASS }));
        orbit.add(ring, innerArc, satellite, satelliteRing);
        orbit.rotation.set(0.12, 0.06, 0);
        g.add(leaf, outline, stem, veins, orbit);
        g.userData.tick = (t, sp) => {
          orbit.rotation.z += 0.0015 * sp;
          orbit.rotation.y = 0.06 + Math.sin(t * 0.0007) * 0.035;
          const a = t * 0.00035 * sp;
          satellite.position.set(Math.cos(a + Math.PI * 1.25) * 0.98, Math.sin(a + Math.PI * 1.25) * 0.98, 0.025);
          satelliteRing.position.set(Math.cos(a + Math.PI * 0.25) * 0.98, Math.sin(a + Math.PI * 0.25) * 0.98, 0.025);
          leaf.rotation.y = Math.sin(t * 0.00065) * 0.035;
        };
        return g;
      },
      () => { // global support: a globe with an orbiting satellite
        const g = new T.Group(), globe = new T.Mesh(new T.SphereGeometry(0.72, 12, 8), wire(IVORY, 0.24));
        const orbit = new T.Group(), ring = new T.Mesh(new T.TorusGeometry(0.98, 0.007, 6, 120), new T.MeshBasicMaterial({ color: BRASS }));
        const sat = new T.Mesh(new T.SphereGeometry(0.07, 12, 10), brassSolid());
        orbit.add(ring, sat);
        orbit.rotation.set(1.2, 0.3, 0);
        g.add(globe, orbit);
        g.userData.tick = (t, sp) => {
          globe.rotation.y += 0.004 * sp;
          const a = t * 0.0012 * sp;
          sat.position.set(Math.cos(a) * 0.98, Math.sin(a) * 0.98, 0);
        };
        return g;
      }
    ];
    const items = $$(".pillar__icon").map((el, i) => {
      const g = makers[i % makers.length]();
      fg.add(g);
      return { el, card: el.closest(".pillar"), g, sp: 1 };
    });
    return function update(t) {
      items.forEach((it) => {
        const r = pin(it.g, it.el);
        if (!r) return;
        it.g.scale.setScalar((Math.min(r.width, r.height) / 2) * wpp * 0.95);
        it.sp = lerp(it.sp, it.card && it.card.matches(":hover") ? 3.2 : 1, 0.06);
        it.g.userData.tick(t, reduced ? 0 : it.sp);
      });
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
    createDust(),
    createPillarIcons()
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
