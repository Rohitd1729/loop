/* ==========================================================================
   LOOP — 3D layer (Three.js r128)
   Two transparent WebGL canvases: the background one (behind the page) holds
   the 3D fabric and the floating thread-dust; the foreground one (above the
   page, clicks pass through) holds 3D objects pinned to page elements — the
   pillar icons, the wordmark orbit ring and the floating laundry. Every object follows the bounding box of
   its HTML anchor each frame, so the HTML layout stays the source of truth.
   If WebGL is unavailable nothing changes: the 2D site keeps working.
   ========================================================================== */
(() => {
  "use strict";
  if (!window.THREE) return;
  const T = THREE;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
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
  // background layer: lights for the floating laundry, and fog that fades far pieces into the page
  bg.fog = new T.Fog(0x0a0a0a, 44, 82);
  bg.add(new T.AmbientLight(0xffffff, 0.3));
  const bgKey = new T.DirectionalLight(0xfff4e6, 0.72); bgKey.position.set(-8, 12, 16); bg.add(bgKey);
  const bgRim = new T.PointLight(0xb89a63, 0.8, 140); bgRim.position.set(16, -8, 6); bg.add(bgRim);

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
    const lines = new T.LineSegments(geo, new T.LineBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
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

  /* ---------- 4a. floating laundry ("How it works" background) ----------
     T-shirts, shirts, jeans, socks, towels and front-load washers drift and tumble in depth
     behind the section. Garments are closed two-layer cloth meshes: front and back panels puff
     apart toward the middle and meet at the seams, with woven canvas textures (stitching,
     buttons, pockets); a vertex-shader wave keeps sleeves and hems fluttering. Fog fades the
     far ones into the page. Pinned to .cycle__sticky; nothing is drawn while it's off-screen. */
  function createFloatingLaundry(anchor, section) {
    if (!anchor || !section) return () => {};
    const group = new T.Group(); bg.add(group);
    const time = { value: 0 };
    const cv = (w, h, draw) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); return c; };
    const SPAN = 0.64, TW = 256, X = (x) => ((x + SPAN / 2) / SPAN) * TW, Y = (y) => ((SPAN / 2 - y) / SPAN) * TW;
    const path = (g, pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.stroke(); };

    // woven fabric: warp/weft lines plus optional twill, terry loops, ribbing, bands, stitched seams, buttons
    function fabric(base, o = {}) {
      const tex = new T.CanvasTexture(cv(TW, TW, (g) => {
        g.fillStyle = base; g.fillRect(0, 0, TW, TW);
        // a faint weave only — strong fine lines alias into stripes at this size
        for (let i = 0; i < TW; i += 2) { g.fillStyle = `rgba(0,0,0,${0.02 + Math.random() * 0.02})`; g.fillRect(i, 0, 1, TW); g.fillStyle = `rgba(255,255,255,${0.015 + Math.random() * 0.02})`; g.fillRect(0, i + 1, TW, 1); }
        if (o.twill) { g.strokeStyle = "rgba(255,255,255,.045)"; for (let i = -TW; i < TW; i += 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + TW, TW); g.stroke(); } }
        if (o.terry) for (let i = 0; i < 1800; i++) { g.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.06)"; g.beginPath(); g.arc(Math.random() * TW, Math.random() * TW, 1 + Math.random() * 1.3, 0, TAU); g.fill(); }
        (o.bands || []).forEach(([ya, yb, c]) => { g.fillStyle = c; g.fillRect(0, Y(ya), TW, Y(yb) - Y(ya)); });
        (o.ribs || []).forEach(([ya, yb]) => { g.fillStyle = "rgba(0,0,0,.22)"; for (let x = 0; x < TW; x += 3) g.fillRect(x, Y(ya), 1.5, Y(yb) - Y(ya)); });
        (o.patches || []).forEach(([cx, cy, rx, ry]) => { g.fillStyle = "rgba(0,0,0,.2)"; g.beginPath(); g.ellipse(X(cx), Y(cy), rx * TW / SPAN, ry * TW / SPAN, 0, 0, TAU); g.fill(); });
        g.setLineDash([4, 3]); g.lineWidth = 1.4; g.strokeStyle = o.stitch || "rgba(70,70,75,.55)";
        (o.seams || []).forEach((pts) => path(g, pts));
        g.setLineDash([]);
        (o.buttons || []).forEach(([x, y]) => { g.fillStyle = "#f2f2ef"; g.beginPath(); g.arc(X(x), Y(y), 3.2, 0, TAU); g.fill(); g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 1; g.stroke(); });
      }));
      tex.anisotropy = 4;
      return tex;
    }

    // garment outlines (units ≈ metres / 2, centred on the garment)
    const shape = (pts) => { const s = new T.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath(); return s; };
    const tee = new T.Shape();
    tee.moveTo(-0.075, 0.25); tee.quadraticCurveTo(0, 0.17, 0.075, 0.25); tee.lineTo(0.17, 0.225); tee.lineTo(0.29, 0.08); tee.lineTo(0.22, 0.0); tee.lineTo(0.16, 0.06);
    tee.lineTo(0.16, -0.26); tee.quadraticCurveTo(0, -0.28, -0.16, -0.26); tee.lineTo(-0.16, 0.06); tee.lineTo(-0.22, 0.0); tee.lineTo(-0.29, 0.08); tee.lineTo(-0.17, 0.225); tee.closePath();
    const shirt = shape([[-0.06, 0.27], [0, 0.2], [0.06, 0.27], [0.16, 0.24], [0.3, -0.13], [0.245, -0.165], [0.155, 0.04], [0.155, -0.27], [0, -0.29], [-0.155, -0.27], [-0.155, 0.04], [-0.245, -0.165], [-0.3, -0.13], [-0.16, 0.24]]);
    const jeans = shape([[-0.17, 0.28], [0.17, 0.28], [0.19, -0.3], [0.05, -0.3], [0, -0.05], [-0.05, -0.3], [-0.19, -0.3]]);
    const sock = new T.Shape();
    sock.moveTo(-0.105, 0.27); sock.quadraticCurveTo(0, 0.25, 0.105, 0.27); sock.lineTo(0.09, -0.08); sock.quadraticCurveTo(0.1, -0.16, 0.21, -0.2); sock.quadraticCurveTo(0.27, -0.23, 0.22, -0.28);
    sock.quadraticCurveTo(0.05, -0.31, -0.13, -0.27); sock.quadraticCurveTo(-0.18, -0.22, -0.11, -0.16); sock.closePath();
    const towel = new T.Shape();
    towel.moveTo(-0.2, 0.26); towel.quadraticCurveTo(-0.22, 0, -0.2, -0.27); towel.quadraticCurveTo(0, -0.29, 0.2, -0.27); towel.quadraticCurveTo(0.22, 0, 0.2, 0.26); towel.quadraticCurveTo(0, 0.28, -0.2, 0.26); towel.closePath();

    const pip = (pl, x, y) => { let c = false; for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) { const a = pl[i], b = pl[j]; if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
    const nearest = (pl, x, y) => {
      let bx = x, by = y, bd = 1e9;
      for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) {
        const a = pl[j], b = pl[i], dx = b.x - a.x, dy = b.y - a.y, k = clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)), px = a.x + dx * k, py = a.y + dy * k, dd = (px - x) ** 2 + (py - y) ** 2;
        if (dd < bd) { bd = dd; bx = px; by = py; }
      }
      return [bx, by];
    };

    // A garment: a grid clipped to the outline (outside corners snapped onto the edge), front
    // and back layers pushed apart by distance-to-edge so the piece has real volume.
    function garment(outline, tex, puff) {
      // a finer grid gives smoother edges (the outline is followed cell by cell); lighter on phones
      const pl = outline.getPoints(16), n = Math.round(SPAN / (small ? 0.03 : 0.012)), st = SPAN / n, g0 = -SPAN / 2;
      const idx = new Map(), vx = [], vy = [], tri = [];
      const gv = (i, j) => {
        const key = i * 1000 + j; let v = idx.get(key);
        if (v === undefined) { v = vx.length; idx.set(key, v); let x = g0 + i * st, y = g0 + j * st; if (!pip(pl, x, y)) [x, y] = nearest(pl, x, y); vx.push(x); vy.push(y); }
        return v;
      };
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        if (!pip(pl, g0 + (i + 0.5) * st, g0 + (j + 0.5) * st)) continue;
        const a = gv(i, j), b = gv(i + 1, j), c = gv(i + 1, j + 1), e = gv(i, j + 1); tri.push(a, b, c, a, c, e);
      }
      const nv = vx.length, pos = new Float32Array(nv * 6), uv = new Float32Array(nv * 4), flex = new Float32Array(nv * 2);
      for (let v = 0; v < nv; v++) {
        const x = vx[v], y = vy[v], [nx, ny] = nearest(pl, x, y), d = Math.hypot(x - nx, y - ny);
        let h = puff * (1 - (1 - Math.min(d / 0.07, 1)) ** 2);
        h *= 0.85 + 0.15 * Math.sin(x * 31 + y * 17) * Math.sin(y * 23 - x * 11); // soft wrinkles
        for (let s = 0; s < 2; s++) {
          const o = s * nv + v;
          pos.set([x, y, s ? -h : h], o * 3); uv.set([(x + SPAN / 2) / SPAN, (y + SPAN / 2) / SPAN], o * 2);
          flex[o] = Math.min(1, Math.hypot(x, y) / 0.32);
        }
      }
      const ind = new Uint16Array(tri.length * 2);
      for (let i = 0; i < tri.length; i += 3) { ind.set([tri[i], tri[i + 1], tri[i + 2]], i); ind.set([tri[i] + nv, tri[i + 2] + nv, tri[i + 1] + nv], tri.length + i); }
      const geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.BufferAttribute(pos, 3)); geo.setAttribute("uv", new T.BufferAttribute(uv, 2));
      geo.setAttribute("aFlex", new T.BufferAttribute(flex, 1)); geo.setIndex(new T.BufferAttribute(ind, 1)); geo.computeVertexNormals();
      // no bump map: the puffed geometry gives the shading; a fine-texture bump turns into stripes
      const mat = new T.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0, color: 0xcfcfcf, side: T.DoubleSide });
      const phase = Math.random() * TAU;
      mat.onBeforeCompile = (sh) => { // fabric flutter: travelling waves, strongest at sleeves and hems
        sh.uniforms.uTime = time; sh.uniforms.uPhase = { value: phase };
        sh.vertexShader = "uniform float uTime; uniform float uPhase; attribute float aFlex;\n" + sh.vertexShader.replace("#include <begin_vertex>",
          "#include <begin_vertex>\nfloat wv = sin(position.x * 9.0 + uTime * 1.7 + uPhase) * 0.6 + sin(position.y * 7.0 - uTime * 1.25 + uPhase * 1.7) * 0.4;\ntransformed.z += wv * 0.022 * aFlex;");
      };
      return new T.Mesh(geo, mat);
    }

    // front-load washer: rounded body, control panel + dial + brass display, chrome door ring,
    // perforated drum turning behind tinted glass, feet. Materials are shared between washers.
    let washerKit = null;
    function washer() {
      if (!washerKit) {
        const drumTex = new T.CanvasTexture(cv(256, 256, (g) => {
          const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, "#3a3d42"); gr.addColorStop(1, "#141619");
          g.fillStyle = gr; g.fillRect(0, 0, 256, 256); g.fillStyle = "rgba(0,0,0,.6)";
          for (let rr = 30; rr < 120; rr += 12) for (let a = 0; a < TAU; a += 10 / rr) { g.beginPath(); g.arc(128 + Math.cos(a) * rr, 128 + Math.sin(a) * rr, 2.2, 0, TAU); g.fill(); }
          g.strokeStyle = "rgba(200,203,208,.55)"; g.lineWidth = 10;
          for (let k = 0; k < 3; k++) { const a = (k * TAU) / 3; g.beginPath(); g.moveTo(128 + Math.cos(a) * 60, 128 + Math.sin(a) * 60); g.lineTo(128 + Math.cos(a) * 118, 128 + Math.sin(a) * 118); g.stroke(); }
        }));
        const W = 0.6, H = 0.8, D = 0.56, r = 0.06, bev = 0.015, s = new T.Shape(), x0 = -W / 2, y0 = -H / 2;
        s.moveTo(x0 + r, y0); s.lineTo(x0 + W - r, y0); s.quadraticCurveTo(x0 + W, y0, x0 + W, y0 + r); s.lineTo(x0 + W, y0 + H - r); s.quadraticCurveTo(x0 + W, y0 + H, x0 + W - r, y0 + H);
        s.lineTo(x0 + r, y0 + H); s.quadraticCurveTo(x0, y0 + H, x0, y0 + H - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
        const body = new T.ExtrudeGeometry(s, { depth: D, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 8 }); body.translate(0, 0, -D / 2);
        washerKit = {
          W, H, D, fz: D / 2 + bev, body,
          white: new T.MeshStandardMaterial({ color: 0xe6e5e1, roughness: 0.38, metalness: 0.08 }),
          chrome: new T.MeshStandardMaterial({ color: 0xd7d9dc, roughness: 0.22, metalness: 0.85 }),
          dark: new T.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.5, metalness: 0.2 }),
          drum: new T.MeshStandardMaterial({ map: drumTex, color: 0x9a9da2, roughness: 0.45, metalness: 0.55 }),
          glass: new T.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.5 }),
          lcd: new T.MeshBasicMaterial({ color: 0xb89a63 }),
          glint: new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })
        };
      }
      const k = washerKit, g = new T.Group(), add = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
      add(k.body, k.white, 0, 0, 0);
      add(new T.BoxGeometry(k.W * 0.92, 0.11, 0.012), k.dark, 0, k.H / 2 - 0.1, k.fz + 0.006);
      add(new T.CylinderGeometry(0.034, 0.034, 0.022, 32), k.chrome, -0.17, k.H / 2 - 0.1, k.fz + 0.02).rotation.x = Math.PI / 2;
      add(new T.PlaneGeometry(0.12, 0.034), k.lcd, 0.1, k.H / 2 - 0.1, k.fz + 0.0125);
      add(new T.TorusGeometry(0.19, 0.024, 16, 64), k.chrome, 0, -0.07, k.fz + 0.012);
      const drum = add(new T.CircleGeometry(0.175, 48), k.drum, 0, -0.07, k.fz + 0.004);
      add(new T.CircleGeometry(0.176, 48), k.glass, 0, -0.07, k.fz + 0.016);
      add(new T.TorusGeometry(0.13, 0.006, 6, 40, 1.1), k.glint, 0, -0.07, k.fz + 0.018).rotation.z = 2.1;
      [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => add(new T.CylinderGeometry(0.025, 0.03, 0.03, 16), k.dark, sx * (k.W / 2 - 0.07), -k.H / 2 - 0.015, sz * (k.D / 2 - 0.07))));
      g.userData.drum = drum;
      return g;
    }

    const make = {
      tee: () => garment(tee, fabric("#ece9e2", { seams: [[[-0.075, 0.25], [-0.04, 0.2], [0, 0.185], [0.04, 0.2], [0.075, 0.25]], [[-0.15, -0.235], [0.15, -0.235]], [[-0.21, 0.015], [-0.275, 0.085]], [[0.21, 0.015], [0.275, 0.085]]] }), 0.05),
      shirt: () => garment(shirt, fabric("#c9ccd1", { seams: [[[-0.06, 0.27], [0, 0.2], [0.06, 0.27]], [[0, 0.2], [0, -0.28]], [[-0.155, 0.17], [0.155, 0.17]], [[-0.29, -0.11], [-0.235, -0.15]], [[0.29, -0.11], [0.235, -0.15]]], buttons: [[0.012, 0.15], [0.012, 0.06], [0.012, -0.03], [0.012, -0.12], [0.012, -0.21]] }), 0.045),
      jeans: () => garment(jeans, fabric("#2c3036", { twill: true, stitch: "rgba(184,154,99,.8)", bands: [[0.28, 0.235, "rgba(0,0,0,.25)"]], seams: [[[-0.17, 0.235], [0.17, 0.235]], [[0.02, 0.235], [0.02, 0.08], [0, 0.05]], [[-0.18, 0.2], [-0.19, -0.29]], [[0.18, 0.2], [0.19, -0.29]], [[-0.185, -0.27], [-0.055, -0.27]], [[0.185, -0.27], [0.055, -0.27]], [[-0.16, 0.235], [-0.1, 0.13]], [[0.16, 0.235], [0.1, 0.13]]] }), 0.04),
      sock: () => garment(sock, fabric("#9b9ea3", { ribs: [[0.27, 0.16]], patches: [[-0.08, -0.2, 0.05, 0.05], [0.2, -0.25, 0.05, 0.035]], stitch: "rgba(235,235,235,.5)", seams: [[[-0.1, 0.16], [0.1, 0.16]]] }), 0.035),
      towel: () => garment(towel, fabric("#d9d5cd", { terry: true, bands: [[0.17, 0.13, "rgba(0,0,0,.18)"], [-0.13, -0.17, "rgba(0,0,0,.18)"]] }), 0.03),
      washer
    };
    // Pieces float only in the empty areas around the copy and the video — the band above them,
    // the band below and the side margins — re-measured from the live layout, so nothing sits
    // on the text at any screen size. [kind, zone, fx, fy (position inside the zone, 0…1),
    // kw, kh (size as a share of the zone's width / height), depth (0 near … −1.5 far, for fog)].
    const PLAN = [
      ["shirt", "right", 0.6, 0.24, 1.3, 0.34, 0.05], ["jeans", "right", 0.66, 0.74, 1.4, 0.36, 0],
      ["washer", "top", 0.56, 0.52, 0.2, 0.8, -0.6], ["tee", "bottom", 0.16, 0.6, 0.18, 1.1, -0.15],
      ["towel", "bottom", 0.82, 0.55, 0.16, 0.95, -0.9], ["sock", "top", 0.1, 0.55, 0.12, 0.8, -0.4],
      ["sock", "left", 0.4, 0.86, 1.2, 0.16, -1.1], ["washer", "bottom", 0.5, 0.62, 0.14, 0.9, -1.3],
      ["tee", "top", 0.86, 0.5, 0.12, 0.75, -1.5]
    ];
    const items = PLAN.map((plan, i) => {
      const obj = make[plan[0]](); group.add(obj);
      const box = new T.Box3().setFromObject(obj), sz = box.getSize(new T.Vector3());
      return { obj, plan, extent: Math.max(sz.x, sz.y), isWasher: plan[0] === "washer", ph: i * 1.7 + 0.4,
        spin: (i % 2 ? -1 : 1) * (0.12 + (i % 3) * 0.05), rx: (Math.random() - 0.5) * 0.5, rz: (Math.random() - 0.5) * 0.8, roll: 0 };
    });
    const textEl = $(".cycle__text", section), stageEl = $(".cycle__stage", section);
    let zones = null, frameN = 0;
    function measureZones(r) { // empty areas, in px relative to the sticky viewport's top-left
      const t = textEl.getBoundingClientRect(), s = stageEl.getBoundingClientRect(), W = r.width, H = r.height;
      const tx = { l: t.left - r.left - 14, t: t.top - r.top - 14, r: t.right - r.left + 14, b: t.bottom - r.top + 14 };
      const st = { l: s.left - r.left - 10, t: s.top - r.top - 10, r: s.right - r.left + 10, b: s.bottom - r.top + 40 }; // + step label
      const top = Math.max(0, Math.min(tx.t, st.t)), bottom = Math.min(H, Math.max(tx.b, st.b));
      zones = { top: [0, 0, W, top], bottom: [0, bottom, W, H], left: [0, top, Math.min(tx.l, st.l), bottom], right: [Math.max(tx.r, st.r), top, W, bottom] };
    }
    addEventListener("resize", () => { zones = null; });

    let spin = 1;
    return function update(t, dt) {
      const r = pin(group, anchor);
      if (!r) return;
      const H2 = r.height / 2, sc = H2 * wpp, tt = t * 0.001;
      group.scale.setScalar(sc);
      if (!zones || ++frameN % 30 === 0) measureZones(r); // the text column grows a little with each step
      const cr = section.getBoundingClientRect(), p = clamp(-cr.top / (cr.height - innerHeight));
      const wash = smooth(0.18, 0.3, p) * (1 - smooth(0.45, 0.56, p)); // tumble harder during "Robotic wash"
      spin = lerp(spin, 1 + wash * 2.2, 0.05);
      time.value = tt;
      items.forEach((it) => {
        const [, zn, fx, fy, kw, kh, z] = it.plan, Z = zones[zn], zw = Z[2] - Z[0], zh = Z[3] - Z[1];
        const size = Math.min(zw * kw, zh * kh, 300);
        it.obj.visible = zw > 30 && zh > 30 && size > 48; // no room here on this screen → skip the piece
        if (!it.obj.visible) return;
        // perspective at this depth, so a far piece still lands on its spot at its size (just dimmer)
        const f = DIST / (DIST - z * sc);
        const px = Z[0] + zw * fx + Math.sin(tt * 0.21 + it.ph) * 10;
        const py = Z[1] + zh * fy + Math.sin(tt * 0.33 + it.ph * 1.3) * 12 - (p - 0.5) * 60 * (1 + z * 0.5);
        it.obj.position.set((px - r.width / 2) / H2 / f, -(py - r.height / 2) / H2 / f, z);
        it.obj.scale.setScalar(size / H2 / f / it.extent);
        if (it.isWasher) { // washers sway but stay mostly front-on; the drum spins behind the glass
          it.obj.rotation.set(0.12 + Math.sin(tt * 0.3 + it.ph) * 0.08, Math.sin(tt * 0.22 + it.ph) * 0.4 * spin, it.rz * 0.25);
          it.obj.userData.drum.rotation.z -= dt * (0.8 + wash * 6);
        } else {           // garments sway and slowly roll but mostly face you, so they stay readable
          it.roll += it.spin * dt * spin * 0.5;
          it.obj.rotation.set(it.rx + Math.sin(tt * 0.4 + it.ph) * 0.25 * spin, Math.sin(tt * 0.27 + it.ph * 2) * 0.5, it.rz + it.roll);
        }
      });
      group.rotation.y = lerp(group.rotation.y, mouse.nx * 0.05, 0.04);
      group.rotation.x = lerp(group.rotation.x, mouse.ny * 0.03, 0.04);
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
    const ringMat = (opacity) => new T.MeshBasicMaterial({ color: IVORY, transparent: true, opacity, depthWrite: false, fog: false });
    const backHalf = new T.Mesh(new T.TorusGeometry(1, 0.0018, 6, 200, Math.PI), ringMat(0.32));
    const frontHalf = new T.Mesh(new T.TorusGeometry(1, 0.0018, 6, 200, Math.PI), ringMat(0.5));
    frontHalf.rotation.z = Math.PI;
    const backHalf2 = new T.Mesh(new T.TorusGeometry(1.035, 0.001, 6, 200, Math.PI), ringMat(0.16));
    const frontHalf2 = new T.Mesh(new T.TorusGeometry(1.035, 0.001, 6, 200, Math.PI), ringMat(0.26));
    frontHalf2.rotation.z = Math.PI;
    orbitBack.add(backHalf, backHalf2); orbitFront.add(frontHalf, frontHalf2);

    const comet = [orbitBack, orbitFront].map((group) => Array.from({ length: 12 }, (_, k) => {
      const sprite = new T.Sprite(new T.SpriteMaterial({ map: dotTex, color: k ? BRASS : 0xf4ead8, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
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

  /* ---------- 5. cards tilt toward the pointer ---------- */
  if (fine && !reduced) {
    let cur = null;
    const reset = (el) => { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); };
    document.addEventListener("pointermove", (e) => {
      const el = e.target.closest && e.target.closest(".pillar, .update, .franchise__panel");
      if (cur && cur !== el) reset(cur);
      cur = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--ry", (((e.clientX - r.left) / r.width - 0.5) * 10).toFixed(2) + "deg");
      el.style.setProperty("--rx", (-((e.clientY - r.top) / r.height - 0.5) * 8).toFixed(2) + "deg");
    });
  }

  /* ---------- loop ---------- */
  const updates = [
    ...$$(".hero, .finale").map(createFabric),
    ...$$(".hero, .finale").map(createLogoOrbitOnly),
    createDust(),
    createPillarIcons(),
    createFloatingLaundry($(".cycle__sticky"), $(".cycle"))
  ];
  // Compile every shader now, behind the preloader, rather than with a stutter the first time
  // a section (e.g. the floating laundry) scrolls into view.
  try { bgR.compile(bg, camera); fgR.compile(fg, camera); } catch (e) { /* compile lazily instead */ }
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
