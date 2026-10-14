/* ==========================================================================
   LOOP — 3D layer (Three.js r128)
   Two transparent WebGL canvases: the background one (behind the page) holds
   the 3D fabric and the floating thread-dust; the foreground one (above the
   page, clicks pass through) holds 3D objects pinned to page elements — the
   wash drum and the pillar icons. Every object follows the bounding box of
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
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
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

  /* ---------- 3. the wash drum ("How it works") ---------- */
  function createDrum(anchor, section) {
    const group = new T.Group(), tilt = new T.Group(), spin = new T.Group();
    group.add(tilt); tilt.add(spin); fg.add(group);
    const metal = new T.MeshStandardMaterial({ color: 0xbfb8ac, metalness: 0.2, roughness: 0.55 });
    const bezel = new T.Mesh(new T.TorusGeometry(1, 0.016, 12, 180), metal);
    bezel.position.z = 0.46;
    tilt.add(bezel);
    const inner = new T.Mesh(new T.TorusGeometry(0.9, 0.008, 8, 160), new T.MeshBasicMaterial({ color: BRASS }));
    inner.position.z = 0.46;
    tilt.add(inner);
    const tickPts = [];
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * TAU, r0 = i % 6 ? 0.935 : 0.915;
      tickPts.push(new T.Vector3(Math.cos(a) * r0, Math.sin(a) * r0, 0.46), new T.Vector3(Math.cos(a) * 0.97, Math.sin(a) * 0.97, 0.46));
    }
    tilt.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(tickPts), lineMat(IVORY, 0.45)));
    // glass door
    const glass = new T.Mesh(new T.CircleGeometry(0.78, 64), new T.MeshBasicMaterial({ color: IVORY, transparent: true, opacity: 0.035, depthWrite: false }));
    glass.position.z = 0.455;
    tilt.add(glass);
    const glint = new T.Line(new T.BufferGeometry().setFromPoints(Array.from({ length: 30 }, (_, i) => {
      const a = 2.2 + (i / 29) * 0.9;
      return new T.Vector3(Math.cos(a) * 0.66, Math.sin(a) * 0.66, 0.46);
    })), lineMat(IVORY, 0.5));
    tilt.add(glint);
    // the drum itself (spins): rims, perforations, baffles, back plate
    spin.add(new T.Line(circlePts(0.78, 0.45), lineMat(IVORY, 0.8)));
    spin.add(new T.Line(circlePts(0.78, -0.45), lineMat(IVORY, 0.45)));
    spin.add(new T.Line(circlePts(0.5, -0.45, 96), lineMat(IVORY, 0.25)));
    spin.add(new T.Line(circlePts(0.22, -0.45, 64), lineMat(BRASS, 0.6)));
    const struct = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      struct.push(new T.Vector3(Math.cos(a) * 0.22, Math.sin(a) * 0.22, -0.45), new T.Vector3(Math.cos(a) * 0.78, Math.sin(a) * 0.78, -0.45));
    }
    for (let i = 0; i < 3; i++) { // baffles along the depth
      const a = (i / 3) * TAU + 0.5;
      for (const rr of [0.78, 0.66]) struct.push(new T.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, -0.45), new T.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, 0.45));
      struct.push(new T.Vector3(Math.cos(a) * 0.66, Math.sin(a) * 0.66, 0.45), new T.Vector3(Math.cos(a) * 0.78, Math.sin(a) * 0.78, 0.45));
    }
    spin.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(struct), lineMat(IVORY, 0.4)));
    const holes = [];
    for (let i = 0; i < 44; i++) for (let d = 0; d < 7; d++) {
      const a = (i / 44) * TAU + (d % 2) * 0.07;
      holes.push(new T.Vector3(Math.cos(a) * 0.78, Math.sin(a) * 0.78, -0.38 + d * 0.127));
    }
    const holeMat = new T.PointsMaterial({ size: 0.05, map: dotTex, color: IVORY, transparent: true, opacity: 0.55, depthWrite: false });
    spin.add(new T.Points(new T.BufferGeometry().setFromPoints(holes), holeMat));

    // garments: soft bent cloth pieces
    const cloths = [0, 1, 2, 3].map((i) => {
      const geo = new T.PlaneGeometry(0.28, 0.2, 9, 6);
      const mesh = new T.Mesh(geo, new T.MeshStandardMaterial({ color: i % 2 ? 0xf4efe6 : 0xe2dbcf, roughness: 0.92, side: T.DoubleSide, flatShading: true }));
      mesh.userData.base = Float32Array.from(geo.attributes.position.array);
      tilt.add(mesh);
      return mesh;
    });
    // water / warm air particles
    const PN = 130, ppos = new Float32Array(PN * 3);
    const pgeo = new T.BufferGeometry();
    pgeo.setAttribute("position", new T.BufferAttribute(ppos, 3));
    const pmat = new T.PointsMaterial({ size: 0.04, map: dotTex, color: IVORY, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending });
    const parts = new T.Points(pgeo, pmat);
    parts.frustumCulled = false;
    tilt.add(parts);

    const SPEED = [0.5, 4.6, 1.8, 0.18], GRAV = [0.85, 0.05, 0.45, 0.9];
    const st = { angle: 0, speed: 0.5, grav: 0.85 };
    return function update(t, dt) {
      const r = pin(group, anchor);
      if (!r) return;
      const s = (Math.min(r.width, r.height) / 2) * wpp * 0.84;
      group.scale.setScalar(s);
      holeMat.size = 0.05 * s; pmat.size = 0.045 * s;
      const cr = section.getBoundingClientRect();
      const p = clamp(-cr.top / (cr.height - innerHeight));
      const seg = p * 4, step = Math.min(3, Math.floor(seg)), u = step === 3 ? clamp(seg - 3) : seg - step;
      st.speed = lerp(st.speed, SPEED[step], 0.04);
      st.grav = lerp(st.grav, GRAV[step], 0.05);
      st.angle += st.speed * dt;
      spin.rotation.z = st.angle;
      tilt.rotation.y = -0.6 + p * 1.0 + mouse.nx * 0.08;
      tilt.rotation.x = 0.32 - p * 0.18 + mouse.ny * 0.06;
      warm.intensity = 1.2 + (step === 2 ? 1.4 * Math.sin(Math.PI * u) : 0);

      cloths.forEach((m, i) => {
        const a = st.angle * 0.9 + (i * Math.PI) / 2, rad = 0.5 + 0.08 * Math.sin(st.angle * 1.7 + i * 2);
        let x = Math.cos(a) * rad, y = Math.sin(a) * rad, z = (i - 1.5) * 0.17;
        x = lerp(x, (i - 1.5) * 0.18, st.grav);
        y = lerp(y, -0.5 + 0.03 * Math.sin(t * 0.002 + i), st.grav);
        const drop = step === 0 ? smooth(i * 0.14, i * 0.14 + 0.45, u) : 1;  // pickup: garments drop in
        y += (1 - drop) * 1.3;
        const f = step === 3 ? smooth(0.12 + i * 0.08, 0.55 + i * 0.08, u) : 0; // fold & return: stack in front
        x = lerp(x, 0, f); y = lerp(y, -0.32 + i * 0.07, f); z = lerp(z, 0.98, f);
        m.position.set(x, y, z);
        m.rotation.set(lerp(st.angle * 1.3 + i, -1.25, f), lerp(st.angle * 0.7 + i * 2, 0, f), lerp(i * 0.8, 0, f));
        m.scale.set(lerp(1, 0.82, f) * Math.max(0.001, drop), lerp(1, 0.7, f) * Math.max(0.001, drop), 1);
        const amp = lerp(0.05, 0.004, f) * (step === 1 ? 1.3 : 1), b = m.userData.base, pa = m.geometry.attributes.position.array;
        for (let k = 0; k < pa.length; k += 3) {
          pa[k + 2] = Math.sin(b[k] * 9 + t * 0.004 + i) * amp + Math.cos(b[k + 1] * 7 + t * 0.003) * amp * 0.5;
        }
        m.geometry.attributes.position.needsUpdate = true;
        m.geometry.computeVertexNormals();
      });

      const wash = step === 1 ? smooth(0, 0.2, u) * (1 - smooth(0.85, 1, u)) : 0;
      const dry = step === 2 ? smooth(0, 0.2, u) * (1 - smooth(0.85, 1, u)) : 0;
      pmat.opacity = Math.max(wash, dry) * 0.9;
      pmat.color.copy(dry > wash ? BRASS : IVORY);
      for (let k = 0; k < PN; k++) {
        const a = st.angle * (1.1 + (k % 5) * 0.08) + k * 2.4, rr = 0.15 + ((k * 7) % 11) / 11 * 0.58;
        const rise = dry > wash ? (((t * 0.00025 + k * 0.137) % 1) * 1.3 - 0.65) : 0;
        ppos[k * 3] = Math.cos(a) * rr;
        ppos[k * 3 + 1] = dry > wash ? rise : Math.sin(a) * rr;
        ppos[k * 3 + 2] = ((k * 13) % 17) / 17 * 0.8 - 0.4;
      }
      pgeo.attributes.position.needsUpdate = true;
    };
  }

  /* ---------- 4. pillar icons as 3D objects ---------- */
  function createPillarIcons() {
    const wire = (c, o) => new T.MeshBasicMaterial({ color: c, wireframe: true, transparent: true, opacity: o });
    const brassSolid = () => new T.MeshStandardMaterial({ color: BRASS, metalness: 0.6, roughness: 0.3 });
    const makers = [
      () => { // robotic laundry tech: a geared drum with a brass core
        const g = new T.Group(), ring = new T.Mesh(new T.TorusGeometry(0.36, 0.015, 6, 60), new T.MeshBasicMaterial({ color: BRASS }));
        g.add(new T.Mesh(new T.TorusGeometry(0.62, 0.17, 6, 24), wire(IVORY, 0.26)), ring, new T.Mesh(new T.SphereGeometry(0.12, 16, 12), brassSolid()));
        const teeth = [];
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * TAU;
          teeth.push(new T.Vector3(Math.cos(a) * 0.8, Math.sin(a) * 0.8, 0), new T.Vector3(Math.cos(a) * 0.92, Math.sin(a) * 0.92, 0));
        }
        g.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(teeth), lineMat(IVORY, 0.45)));
        g.userData.tick = (t, sp) => { g.rotation.x = 0.55 + Math.sin(t * 0.0007) * 0.2; g.rotation.z += 0.004 * sp; ring.rotation.x = t * 0.002 * sp; };
        return g;
      },
      () => { // sustainable: a water droplet with a ripple
        const g = new T.Group(), prof = [];
        for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI; prof.push(new T.Vector2(0.62 * Math.sin(a) * Math.sin(a / 2), Math.cos(a) * 0.95)); }
        const drop = new T.Mesh(new T.LatheGeometry(prof, 12), wire(IVORY, 0.26));
        const core = new T.Mesh(new T.SphereGeometry(0.13, 16, 12), brassSolid());
        const ripple = new T.Mesh(new T.TorusGeometry(0.5, 0.008, 6, 64), new T.MeshBasicMaterial({ color: BRASS, transparent: true }));
        ripple.rotation.x = Math.PI / 2;
        ripple.position.y = -0.98;
        g.add(drop, core, ripple);
        g.userData.tick = (t, sp) => {
          drop.rotation.y += 0.006 * sp;
          core.position.y = -0.35 + Math.sin(t * 0.002) * 0.08;
          const k = (t * 0.0006 * sp) % 1;
          ripple.scale.setScalar(0.4 + k * 1.2); ripple.material.opacity = 1 - k;
          g.rotation.x = 0.25;
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
     First O: "precision fold": a business hand hands over a garment, the robot folds, scans and takes it in.
     Second O: a front-load washing machine door: chrome ring, rubber gasket, domed glass,
     a reversing drum with baffles, tumbling clothes and sloshing water.
     Plus an orbit ring around the word and a pointer-driven depth tilt.
     The flat SVG letters stay the source of truth; 3D is pinned to their geometry. */
  

  // a soft studio environment so steel and chrome have something to reflect
  const studioEnv = (() => {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = "#0d0d0d"; g.fillRect(0, 0, 512, 256);
    const band = (y, h, a) => {
      const gr = g.createLinearGradient(0, y - h, 0, y + h);
      gr.addColorStop(0, "rgba(255,250,240,0)"); gr.addColorStop(0.5, `rgba(255,250,240,${a})`); gr.addColorStop(1, "rgba(255,250,240,0)");
      g.fillStyle = gr; g.fillRect(0, y - h, 512, 2 * h);
    };
    band(40, 34, 0.9); band(118, 10, 0.55); band(200, 40, 0.18);
    g.fillStyle = "rgba(255,248,236,.95)"; g.fillRect(60, 70, 90, 40); g.fillRect(330, 60, 120, 30);
    const warmSpot = g.createRadialGradient(400, 170, 0, 400, 170, 90);
    warmSpot.addColorStop(0, "rgba(184,154,99,.7)"); warmSpot.addColorStop(1, "rgba(184,154,99,0)");
    g.fillStyle = warmSpot; g.fillRect(300, 80, 200, 176);
    const tex = new T.CanvasTexture(c);
    tex.mapping = T.EquirectangularReflectionMapping;
    const pm = new T.PMREMGenerator(fgR), env = pm.fromEquirectangular(tex).texture;
    pm.dispose();
    return env;
  })();

  // Code-built scenes inside the Os are off: the first O plays artwork video (hero.o1Video),
  // the second O is the original arc reactor. O1_SCENE / O2_SCENE bring back the 3D scenes.
  const O1_SCENE = false, O2_SCENE = false;

  function createLogo3D(root) {
    const logoEl = $('[data-logo="hero"]', root), svg = logoEl && $("svg", logoEl);
    if (!svg) return () => {};
    const fadeEl = $(".hero__inner", root); // the hero fades its logo on scroll; follow it
    const mats = [];
    // every material fades with the launch + scroll; `ref` limits it to the inside of an O
    const M = (mat, base = 1, ref = 0) => {
      mat.transparent = true;
      mat.userData.base = base;
      if (ref) { mat.stencilWrite = true; mat.stencilRef = ref; mat.stencilFunc = T.EqualStencilFunc; }
      mats.push(mat);
      return mat;
    };
    const std = (color, metalness, roughness, extra = {}) =>
      new T.MeshStandardMaterial(Object.assign({ color, metalness, roughness, envMap: studioEnv, envMapIntensity: 1 }, extra));
    const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); return m; };
    const alongX = (geo) => { geo.rotateZ(Math.PI / 2); return geo; };
    const V = (x, y, z) => new T.Vector3(x, y, z);
    function mask(ref) {
      const m = new T.Mesh(new T.CircleGeometry(1, 120), new T.MeshBasicMaterial({
        colorWrite: false, depthWrite: false, depthTest: false,
        stencilWrite: true, stencilRef: ref, stencilFunc: T.AlwaysStencilFunc, stencilZPass: T.ReplaceStencilOp
      }));
      m.renderOrder = -10;
      return m;
    }
    // pin a group to one O of the wordmark (viewBox 860×240, centres y=120), scaled to its inner radius
    function pinO(group, cx, innerR) {
      const r = svg.getBoundingClientRect(), s = r.width / 860;
      const vis = r.width > 0 && r.bottom > -60 && r.top < innerHeight + 60;
      group.visible = vis;
      if (!vis) return 0;
      group.position.set((r.left + cx * s - innerWidth / 2) * wpp, -(r.top + 120 * s - innerHeight / 2) * wpp, 0);
      const u = innerR * s * wpp;
      group.scale.setScalar(u);
      return u;
    }

    /* ===== first O: precision fold (client storyboard) =====
       0–0.8s approach · 0.8–1.5s handover · 1.5–2.5s precision fold · 2.5–3.5s smart scan
       3.5–4.2s system intake · 4.2–5s reset. Frame 5000 equals frame 0, so the loop is seamless. */
    const o1 = new T.Group(), o1Tilt = new T.Group(), scene1 = new T.Group();
    o1.add(mask(1), o1Tilt); o1Tilt.add(scene1); if (O1_SCENE) fg.add(o1);
    scene1.scale.setScalar(1.85); scene1.position.y = 0.04;
    const ivoryR = M(std(0xbdb8b0, 0.1, 0.3, { envMapIntensity: 0.7 }), 1, 1);
    const jointD = M(std(0x3a3835, 0.6, 0.4), 1, 1);
    const brassF = M(std(BRASS, 0.85, 0.25, { emissive: 0x24190a }), 1, 1);
    const skinF = M(std(0xb08866, 0, 0.6, { envMapIntensity: 0.3 }), 1, 1);
    const suitF = M(std(0x1c1c20, 0.1, 0.5, { envMapIntensity: 0.5 }), 1, 1);
    const cuffF = M(std(0xd0cbc3, 0, 0.5, { envMapIntensity: 0.4 }), 1, 1);
    const clothF = M(std(0xcfc8bb, 0, 0.88, { side: T.DoubleSide, envMapIntensity: 0.3 }), 1, 1);
    const stackF = M(std(0xcfc8bb, 0, 0.88, { envMapIntensity: 0.3 }), 1, 1);
    const stackSeam = M(new T.LineBasicMaterial({ color: 0x8f877a }), 0.9, 1);
    const glowMat = (c, base) => M(new T.MeshBasicMaterial({ color: c, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }), base, 1);
    const slab = (w, d, h, rad, mat) => { // rounded rectangle in x–z, thickness h along y, centred on the origin
      const sh = new T.Shape(), x0 = -w / 2, y0 = -d / 2, bev = h * 0.35;
      sh.moveTo(x0 + rad, y0); sh.lineTo(x0 + w - rad, y0); sh.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + rad);
      sh.lineTo(x0 + w, y0 + d - rad); sh.quadraticCurveTo(x0 + w, y0 + d, x0 + w - rad, y0 + d); sh.lineTo(x0 + rad, y0 + d);
      sh.quadraticCurveTo(x0, y0 + d, x0, y0 + d - rad); sh.lineTo(x0, y0 + rad); sh.quadraticCurveTo(x0, y0, x0 + rad, y0);
      const g = new T.ExtrudeGeometry(sh, { depth: h - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.8, bevelSegments: 5, curveSegments: 10 });
      g.translate(0, 0, -(h - 2 * bev) / 2); g.rotateX(-Math.PI / 2);
      return new T.Mesh(g, mat);
    };
    const UP = V(0, 1, 0), segGeo = new T.CylinderGeometry(1, 1, 1, 16), sphGeo = new T.SphereGeometry(1, 18, 14);
    // a jointed chain (finger): segments + joint spheres, re-posed every frame from a list of points
    function makeChain(n, r, segMat, jointMat, parent) {
      const segs = [], joints = [], d = V(0, 0, 0);
      for (let i = 0; i < n; i++) { const c = new T.Mesh(segGeo, segMat); parent.add(c); segs.push(c); }
      for (let i = 0; i <= n; i++) { const j = new T.Mesh(sphGeo, i === n ? segMat : jointMat); j.scale.setScalar(r * (i === n ? 1 : 1.12)); parent.add(j); joints.push(j); }
      return (pts) => {
        for (let i = 0; i < n; i++) {
          const a = pts[i], b = pts[i + 1], c = segs[i];
          c.position.copy(a).add(b).multiplyScalar(0.5);
          d.copy(b).sub(a); const len = d.length();
          c.quaternion.setFromUnitVectors(UP, d.normalize());
          c.scale.set(r, len, r);
        }
        pts.forEach((q, i) => joints[i].position.copy(q));
      };
    }
    const along = (geo, dir, mat, dist) => { const m = new T.Mesh(geo, mat); m.quaternion.setFromUnitVectors(UP, dir); m.position.copy(dir).multiplyScalar(dist); return m; };

    // robot hand, palm up, fingers pointing left (origin = palm centre)
    const robotH = new T.Group(); scene1.add(robotH);
    robotH.add(slab(0.24, 0.2, 0.05, 0.05, ivoryR));
    robotH.add(mesh(new T.CylinderGeometry(0.03, 0.03, 0.006, 28), brassF, 0.02, 0.026, 0));
    robotH.add(mesh(new T.CylinderGeometry(0.018, 0.018, 0.008, 24), jointD, 0.02, 0.028, 0));
    robotH.add(mesh(new T.SphereGeometry(0.058, 24, 18), jointD, 0.14, 0, 0));
    const wristRing = mesh(new T.TorusGeometry(0.064, 0.009, 10, 40), brassF, 0.175, 0, 0); wristRing.rotation.y = Math.PI / 2;
    const band = mesh(new T.TorusGeometry(0.08, 0.006, 8, 40), jointD, 0.5, 0, 0); band.rotation.y = Math.PI / 2;
    robotH.add(wristRing, band, mesh(new T.CylinderGeometry(0.07, 0.086, 1.2, 36).rotateZ(Math.PI / 2), ivoryR, 0.78, 0, 0));
    const RF = [[-0.07, 0.85], [-0.023, 1], [0.023, 0.97], [0.07, 0.88]];
    const fingerSet = RF.map(() => makeChain(3, 0.019, ivoryR, brassF, robotH));
    const thumbSet = makeChain(2, 0.021, ivoryR, brassF, robotH);
    function setRobotFingers(g) {
      RF.forEach(([z, l], i) => {
        let A = 0, q = V(-0.12, 0.004, z);
        const pts = [q];
        [0.072, 0.056, 0.046].forEach((len, j) => {
          A += lerp([0.08, 0.14, 0.1][j], [0.55, 0.85, 0.7][j], g);
          q = q.clone().add(V(-Math.cos(A) * len * l, Math.sin(A) * len * l, 0)); pts.push(q);
        });
        fingerSet[i](pts);
      });
      const t0 = V(-0.07, 0, 0.105), t1 = t0.clone().add(V(-0.042, 0.012 + 0.03 * g, 0.05)), t2 = t1.clone().add(V(-0.046, 0.01 + 0.035 * g, 0.012 - 0.03 * g));
      thumbSet([t0, t1, t2]);
    }

    // business hand pinching the garment from above (origin = pinch point)
    const humanH = new T.Group(); scene1.add(humanH);
    const AD = V(-1, 0.42, 0).normalize();
    humanH.add(
      along(new T.CylinderGeometry(0.078, 0.082, 1.2, 36), AD, suitF, 1.02),
      along(new T.CylinderGeometry(0.063, 0.063, 0.075, 32), AD, cuffF, 0.375),
      along(new T.CylinderGeometry(0.045, 0.05, 0.12, 24), AD, skinF, 0.29)
    );
    const link = mesh(new T.SphereGeometry(0.012, 12, 10), brassF); link.position.copy(AD).multiplyScalar(0.375).add(V(0, 0, 0.063)); humanH.add(link);
    [[0.42, 0.012], [0.46, 0.012], [0.5, 0.012]].forEach(([d]) => { const b = mesh(new T.SphereGeometry(0.01, 10, 8), cuffF); b.position.copy(AD).multiplyScalar(d).add(V(0, -0.05, 0.06)); humanH.add(b); });
    const backHand = mesh(sphGeo, skinF, -0.13, 0.078, 0); backHand.scale.set(0.11, 0.042, 0.085); backHand.rotation.z = -0.42; humanH.add(backHand);
    const tube = (pts, r) => {
      const g = new T.Group(), a = pts[0], b = pts[pts.length - 1];
      g.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 20, r, 12, false), skinF));
      g.add(mesh(new T.SphereGeometry(r, 14, 10), skinF, a.x, a.y, a.z), mesh(new T.SphereGeometry(r, 14, 10), skinF, b.x, b.y, b.z));
      return g;
    };
    [-0.055, -0.018, 0.02, 0.055].forEach((z, i) =>
      humanH.add(tube([V(-0.06, 0.078, z), V(-0.012, 0.062, z * 0.85), V(0.008, 0.026, z * 0.55), V(0.002, 0.004, z * 0.35)], i === 3 ? 0.016 : 0.019)));
    humanH.add(tube([V(-0.14, 0.03, 0.066), V(-0.07, 0.0, 0.06), V(-0.014, -0.012, 0.03)], 0.022));

    // the garment: a cloth sheet whose vertices are posed every frame (hang → lie → fold, fold)
    const CN = 20, CW = 0.36, CD = 0.32;
    const clothGeo = new T.PlaneGeometry(1, 1, CN, CN), cpos = clothGeo.attributes.position.array;
    const cloth = new T.Mesh(clothGeo, clothF); cloth.frustumCulled = false; scene1.add(cloth);
    function clothFrame(tt, P, Q) {
      const give = easeIO(clamp((tt - 1000) / 600));
      const f1 = easeIO(clamp((tt - 1650) / 380)), f2 = easeIO(clamp((tt - 2070) / 380));
      const th1 = Math.PI * f1 * 0.985, th2 = Math.PI * f2 * 0.985;
      for (let iy = 0; iy <= CN; iy++) for (let ix = 0; ix <= CN; ix++) {
        const u = ix / CN, s2 = iy / CN, o = (iy * (CN + 1) + ix) * 3;
        // hanging from the pinch: narrow at the fingers, flared and rippling below
        const hx = P.x + (u - 0.5) * CW * lerp(0.2, 1, Math.pow(s2, 0.75)) + Math.sin(clock * 0.003) * 0.015 * s2;
        const hy = P.y - s2 * CD * 0.95;
        const hz = P.z + Math.sin(u * TAU * 1.5 + clock * 0.004) * 0.025 * s2 + (u - 0.5) * 0.04 * s2;
        // lying on the palm (held edge at the back), then folded twice
        let xr = (u - 0.5) * CW, zr = (s2 - 0.5) * CD;
        const droop = (1 - f1) * (Math.pow(Math.max(0, Math.abs(xr) - 0.13), 2) + Math.pow(Math.max(0, Math.abs(zr) - 0.11), 2)) * 4;
        let y = 0.03 - droop + Math.sin(xr * 20 + zr * 14) * 0.004 * (1 - f1);
        if (xr > 0) { const x0 = xr; xr = x0 * Math.cos(th1); y += x0 * Math.sin(th1) + 0.008 * f1; }
        if (zr > 0) { const z0 = zr; zr = z0 * Math.cos(th2); y += z0 * Math.sin(th2) + 0.008 * f2; }
        xr += (CW / 4) * f1; zr += (CD / 4) * f2;
        cpos[o] = lerp(hx, Q.x + xr, give);
        cpos[o + 1] = lerp(hy, Q.y + y, give) + Math.sin(Math.PI * give) * 0.06 * (0.5 + s2);
        cpos[o + 2] = lerp(hz, Q.z + zr, give);
      }
      clothGeo.attributes.position.needsUpdate = true;
      clothGeo.computeVertexNormals();
    }
    // the folded garment (swapped in once the sheet is folded)
    const stackG = new T.Group(); scene1.add(stackG);
    stackG.add(slab(CW / 2, CD / 2, 0.034, 0.018, stackF));
    [-0.006, 0.006].forEach((y) => stackG.add(new T.Line(new T.BufferGeometry().setFromPoints([V(-CW / 4 + 0.012, y, CD / 4 + 0.001), V(CW / 4 - 0.012, y, CD / 4 + 0.001)]), stackSeam)));

    // effects: handover glow, fold arrows, scan ring, HUD brackets, light traces
    const touchGlow = new T.Sprite(M(new T.SpriteMaterial({ map: dotTex, color: 0xf0dcae, blending: T.AdditiveBlending, depthWrite: false }), 0.85, 1));
    scene1.add(touchGlow);
    const arrowMat = glowMat(0xd9bd85, 0.9), arrows = new T.Group();
    [0.35, 0.35 + Math.PI].forEach((a0) => {
      const arc = new T.Mesh(new T.TorusGeometry(0.2, 0.004, 6, 48, 1.6), arrowMat); arc.rotation.z = a0;
      const head = new T.Mesh(new T.ConeGeometry(0.014, 0.034, 12), arrowMat);
      head.position.set(Math.cos(a0) * 0.2, Math.sin(a0) * 0.2, 0); head.rotation.z = a0 + Math.PI; // points clockwise
      arrows.add(arc, head);
    });
    scene1.add(arrows);
    const scanMat = glowMat(0xf0dcae, 1), scanRing = new T.Mesh(new T.TorusGeometry(0.16, 0.0035, 6, 72), scanMat);
    scanRing.rotation.x = Math.PI / 2; scene1.add(scanRing);
    const hudMat = M(new T.LineBasicMaterial({ color: BRASS }), 0.9, 1), hp = [], bw = 0.15, bh = 0.08, bl = 0.035;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => hp.push(V(sx * bw, sy * bh, 0), V(sx * (bw - bl), sy * bh, 0), V(sx * bw, sy * bh, 0), V(sx * bw, sy * (bh - bl), 0)));
    const hud = new T.LineSegments(new T.BufferGeometry().setFromPoints(hp), hudMat); scene1.add(hud);
    const beamTex = (() => {
      const c = document.createElement("canvas"); c.width = 4; c.height = 128;
      const g = c.getContext("2d"), gr = g.createLinearGradient(0, 128, 0, 0);
      gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.15, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
      return new T.CanvasTexture(c);
    })();
    const beamMat = M(new T.MeshBasicMaterial({ map: beamTex, color: 0xd9bd85, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }), 1, 1);
    const beams = new T.Group();
    [[-0.12, 0.02, 0.006], [-0.07, -0.04, 0.01], [-0.025, 0.05, 0.004], [0.02, -0.02, 0.012], [0.065, 0.04, 0.006], [0.11, -0.03, 0.009], [0.0, 0.0, 0.016]].forEach(([x, z, w]) => {
      const b = new T.Mesh(new T.PlaneGeometry(w, 0.9), beamMat); b.position.set(x, 0.45, z); beams.add(b);
    });
    scene1.add(beams);

    /* ===== second O: front-load machine door ===== */
    const o2 = new T.Group(), o2Tilt = new T.Group(), drum = new T.Group(), spin = new T.Group();
    o2.add(mask(2), o2Tilt); if (O2_SCENE) fg.add(o2);
    const chrome = M(std(0xeee9e0, 0.9, 0.16), 1, 2);
    const rubber = M(std(0x2f2d2b, 0.05, 0.85, { envMapIntensity: 0.3 }), 1, 2);
    const drumSteel = M(std(0xb4aea5, 0.85, 0.32, { side: T.DoubleSide }), 1, 2);
    const backSteel = M(std(0x3a3835, 0.6, 0.55, { envMapIntensity: 0.35 }), 1, 2);
    const brass2 = M(std(BRASS, 0.85, 0.25, { emissive: 0x24190a }), 1, 2);
    o2Tilt.add(mesh(new T.TorusGeometry(0.9, 0.068, 28, 140), chrome));
    o2Tilt.add(mesh(new T.TorusGeometry(0.8, 0.045, 18, 120), rubber, 0, 0, -0.05));
    o2Tilt.add(mesh(new T.BoxGeometry(0.06, 0.24, 0.06), chrome, 0.955, 0, 0.04));
    const status = new T.Sprite(M(new T.SpriteMaterial({ map: dotTex, color: 0xf0dcae, blending: T.AdditiveBlending, depthWrite: false }), 1, 2));
    status.scale.setScalar(0.12); status.position.set(0, 0.9, 0.09);
    o2Tilt.add(status);

    drum.position.z = -0.06; o2Tilt.add(drum); drum.add(spin);
    const shell = mesh(new T.CylinderGeometry(0.77, 0.56, 0.7, 72, 1, true), drumSteel, 0, 0, -0.35);
    shell.rotation.x = Math.PI / 2; // wide end faces the glass, narrow end recedes: built-in perspective
    spin.add(shell, mesh(new T.CircleGeometry(0.56, 72), backSteel, 0, 0, -0.7));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.5, baffle = mesh(new T.BoxGeometry(0.1, 0.07, 0.6), drumSteel, Math.cos(a) * 0.62, Math.sin(a) * 0.62, -0.36);
      baffle.rotation.z = a;
      spin.add(baffle);
    }
    spin.add(mesh(new T.CylinderGeometry(0.06, 0.06, 0.03, 24).rotateX(Math.PI / 2), brass2, 0, 0, -0.68));
    const holes = [];
    for (let j = 0; j < 8; j++) for (let i = 0; i < 54; i++) {
      const k = (j + 0.5) / 8, a = (i / 54) * TAU + (j % 2) * 0.06, rr = lerp(0.77, 0.56, k) * 0.985;
      holes.push(V(Math.cos(a) * rr, Math.sin(a) * rr, -k * 0.7));
    }
    const holeMat = M(new T.PointsMaterial({ map: dotTex, color: 0x1a1918, depthWrite: false }), 0.9, 2);
    spin.add(new T.Points(new T.BufferGeometry().setFromPoints(holes), holeMat));

    // clothes: carried up the wall by the drum, released near the top, fall back (simple physics)
    const RW = 0.5, clothCols = [0xf4efe6, 0xddd5c8, 0x2c2c31, 0xf4efe6, 0xc9b48a];
    const cloths = clothCols.map((c, i) => {
      const geo = new T.PlaneGeometry(0.36, 0.25, 9, 6);
      const m = new T.Mesh(geo, M(std(c, 0, 0.9, { side: T.DoubleSide, flatShading: true, envMapIntensity: 0.4 }), 1, 2));
      m.userData = { base: Float32Array.from(geo.attributes.position.array), a: -Math.PI / 2 + (i - 2) * 0.35, x: 0, y: 0, vx: 0, vy: 0, carried: true, rel: 0.05 + ((i * 0.37) % 1) * 0.3, z: -0.16 - i * 0.1 };
      drum.add(m);
      return m;
    });

    // water: a strip between the drum bottom and a sloshing surface, plus bubbles
    const WN = 48, WR = 0.75, wpos = new Float32Array((WN + 1) * 2 * 3), widx = [];
    for (let i = 0; i < WN; i++) { const a = i * 2; widx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const wgeo = new T.BufferGeometry();
    wgeo.setAttribute("position", new T.BufferAttribute(wpos, 3));
    wgeo.setIndex(widx);
    const water = new T.Mesh(wgeo, M(new T.MeshBasicMaterial({ color: 0xdfe6e8, depthWrite: false, side: T.DoubleSide }), 0.16, 2));
    water.frustumCulled = false; water.position.z = -0.02;
    const spos = new Float32Array((WN + 1) * 3), sgeo = new T.BufferGeometry();
    sgeo.setAttribute("position", new T.BufferAttribute(spos, 3));
    const surface = new T.Line(sgeo, M(new T.LineBasicMaterial({ color: 0xf4f6f6 }), 0.55, 2));
    surface.frustumCulled = false; surface.position.z = -0.015;
    const BN = 36, bpos = new Float32Array(BN * 3), bgeo = new T.BufferGeometry(), bseed = Array.from({ length: BN }, () => [Math.random() * 2 - 1, Math.random(), 0.4 + Math.random()]);
    bgeo.setAttribute("position", new T.BufferAttribute(bpos, 3));
    const bubbleMat = M(new T.PointsMaterial({ map: dotTex, color: 0xffffff, depthWrite: false, blending: T.AdditiveBlending }), 0.7, 2);
    const bubbles = new T.Points(bgeo, bubbleMat);
    bubbles.frustumCulled = false; bubbles.position.z = -0.03;
    o2Tilt.add(water, surface, bubbles);

    // domed glass + glints
    const R = 1.6, cap = Math.asin(0.8 / R);
    const glass = mesh(new T.SphereGeometry(R, 64, 16, 0, TAU, 0, cap), M(std(0xffffff, 0, 0.05, { depthWrite: false, envMapIntensity: 1.6 }), 0.14, 2), 0, 0, -R * Math.cos(cap));
    glass.rotation.x = Math.PI / 2;
    o2Tilt.add(glass);
    const glintMat = M(new T.MeshBasicMaterial({ color: 0xffffff, depthWrite: false }), 0.5, 2);
    const g1 = mesh(new T.TorusGeometry(0.64, 0.012, 6, 48, 0.95), glintMat, 0, 0, 0.17); g1.rotation.z = 2.2;
    const g2 = mesh(new T.TorusGeometry(0.54, 0.007, 6, 40, 0.45), glintMat, 0, 0, 0.19); g2.rotation.z = 2.35;
    o2Tilt.add(g1, g2);

    /* ===== orbit ring around the whole word (back half behind the page, front half in front) ===== */
    const orbitBack = new T.Group(), orbitFront = new T.Group();
    bg.add(orbitBack); fg.add(orbitFront);
    const ringMat = (base) => M(new T.MeshBasicMaterial({ color: IVORY, depthWrite: false }), base);
    const backHalf = new T.Mesh(new T.TorusGeometry(1, 0.0018, 6, 200, Math.PI), ringMat(0.32));
    const frontHalf = new T.Mesh(new T.TorusGeometry(1, 0.0018, 6, 200, Math.PI), ringMat(0.5));
    frontHalf.rotation.z = Math.PI;
    const backHalf2 = new T.Mesh(new T.TorusGeometry(1.035, 0.001, 6, 200, Math.PI), ringMat(0.16));
    const frontHalf2 = new T.Mesh(new T.TorusGeometry(1.035, 0.001, 6, 200, Math.PI), ringMat(0.26));
    frontHalf2.rotation.z = Math.PI;
    orbitBack.add(backHalf, backHalf2); orbitFront.add(frontHalf, frontHalf2);
    const comet = [orbitBack, orbitFront].map((grp) => Array.from({ length: 12 }, (_, k) => {
      const s = new T.Sprite(M(new T.SpriteMaterial({ map: dotTex, color: k ? BRASS : 0xf4ead8, blending: T.AdditiveBlending, depthWrite: false }), 1 - k / 12));
      s.scale.setScalar(k ? 0.03 * (1 - k / 14) : 0.045);
      grp.add(s);
      return s;
    }));

    const tilt = { x: 0, y: 0 };
    let launchAt = -1, drumAngle = 0, clock = 0;
    const statusMat = status.material;
    return function update(t, dt) {
      const live = root.classList.contains("is-live");
      if (live && launchAt < 0) launchAt = performance.now();
      const since = launchAt < 0 ? 0 : performance.now() - launchAt;
      const k = reduced ? (live ? 1 : 0) : smooth(400, 1800, since); // builds with the launch
      const fade = clamp(fadeEl ? parseFloat(fadeEl.style.opacity || "1") : 1);
      mats.forEach((m) => (m.opacity = m.userData.base * k * fade));

      const near = fine && !reduced && mouse.x > -1e3;
      tilt.x = lerp(tilt.x, near ? -mouse.ny * 5 : 0, 0.06);
      tilt.y = lerp(tilt.y, near ? mouse.nx * 7 : 0, 0.06);
      logoEl.style.transform = `perspective(1400px) rotateX(${tilt.x.toFixed(2)}deg) rotateY(${tilt.y.toFixed(2)}deg)`;
      const rx = (tilt.x * Math.PI) / 180, ry = (tilt.y * Math.PI) / 180;
      clock += dt * 1000;

      const u1 = O1_SCENE ? pinO(o1, 275, 102) : 0;
      if (u1) {
        const tt = reduced ? 2950 : clock % 5000, sub = (a0, b0) => clamp((tt - a0) / (b0 - a0));
        const enter = 1 - Math.pow(1 - k, 3);
        o1Tilt.rotation.set(0.36 + rx * 1.5, -0.12 + Math.sin((clock / 10000) * TAU) * 0.1 + ry * 1.5, 0);
        // business hand: approach, small reach, then withdraw off-stage once it has let go
        const hx = lerp(-1.25, -0.1, 1 - Math.pow(1 - sub(0, 800), 3)) + 0.06 * easeIO(sub(800, 1150)) - 1.25 * easeIO(sub(1500, 2400));
        humanH.position.set(hx, 0.3 - 0.04 * easeIO(sub(800, 1150)), 0.02);
        // robot: idle sway, brings the garment to the centre for the scan, returns for the reset
        const bring = easeIO(sub(2400, 2800)) * (1 - easeIO(sub(4200, 4900)));
        const bob = Math.sin((tt / 5000) * TAU) * 0.008;
        robotH.position.set(lerp(0.2, 0.04, bring) + (1 - enter) * 1.3, -0.22 + 0.04 * bring + bob, 0);
        // fingers: open → receive → small precise fold movements → present → open
        const recv = easeIO(sub(1250, 1600)), work = sub(1600, 2500), present = easeIO(sub(2500, 2800)), relax = easeIO(sub(4200, 4800));
        setRobotFingers(recv * (1 - present) * (0.42 + (work > 0 && work < 1 ? 0.22 * Math.sin(work * TAU * 2) : 0)) + 0.12 * present * (1 - relax));
        const P = humanH.position, Q = robotH.position;
        const folded = tt >= 2480;
        cloth.visible = !folded;
        if (!folded) clothFrame(tt, P, Q);
        // folded garment: lifts for the scan, then rises into the light and dissolves
        const ie = Math.pow(sub(3500, 4200), 2);
        stackG.visible = folded && tt < 4200;
        stackG.position.set(Q.x, Q.y + 0.047 + easeIO(sub(2480, 2800)) * 0.09 + 0.6 * ie, Q.z);
        stackG.scale.setScalar(Math.max(0.001, 1 - 0.55 * ie));
        stackF.opacity *= 1 - ie; stackSeam.opacity *= 1 - ie;
        const glintT = sub(2950, 3450);
        stackF.emissive.setRGB(0.25 * Math.sin(Math.PI * glintT), 0.18 * Math.sin(Math.PI * glintT), 0.06 * Math.sin(Math.PI * glintT));
        // handover glow (1.5–2.1s)
        const c1 = sub(1500, 2100);
        touchGlow.position.set(Q.x, Q.y + 0.06, Q.z + 0.05); touchGlow.scale.setScalar(0.1 + 0.18 * c1);
        touchGlow.material.opacity *= c1 > 0 && c1 < 1 ? Math.sin(Math.PI * c1) : 0;
        // fold arrows (1.6–2.5s)
        const fa = sub(1600, 2500);
        arrows.position.set(Q.x, Q.y + 0.08, Q.z + 0.03); arrows.rotation.z = -fa * 2.4;
        arrowMat.opacity *= fa > 0 && fa < 1 ? Math.sin(Math.PI * fa) : 0;
        // smart scan (2.6–3.5s)
        const sc = sub(2600, 3500), scV = sc > 0 && sc < 1 ? Math.sin(Math.PI * sc) : 0, sp = stackG.position;
        scanRing.position.set(sp.x, sp.y - 0.03 + (0.5 - 0.5 * Math.cos(sc * TAU * 2)) * 0.065, sp.z);
        scanMat.opacity *= scV;
        hud.position.set(sp.x, sp.y, sp.z + 0.1); hudMat.opacity *= scV;
        // light traces: faint during the scan, strong while the garment is taken in (3.45–4.3s)
        const intakeV = tt > 3450 && tt < 4300 ? Math.sin(Math.PI * (tt - 3450) / 850) : 0;
        beams.position.set(sp.x, Q.y + 0.05, sp.z);
        beams.children.forEach((bm, i) => (bm.position.y = 0.45 + Math.sin(clock * 0.004 + i * 1.7) * 0.03));
        beamMat.opacity *= Math.max(scV * 0.3, intakeV);
      }

      /* washing machine: drum turns, pauses and reverses like a real wash cycle */
      const u2 = O2_SCENE ? pinO(o2, 530, 108) : 0;
      if (u2) {
        o2Tilt.rotation.set(rx * 2.2, ry * 2.2, 0);
        holeMat.size = 0.028 * u2; bubbleMat.size = 0.03 * u2;
        const v = reduced ? 0 : 2.6 * clamp(Math.sin((clock / 9000) * TAU) * 2.4, -1, 1);
        drumAngle += v * dt;
        spin.rotation.z = drumAngle;
        statusMat.opacity *= 0.55 + 0.45 * Math.sin(clock * 0.004);
        cloths.forEach((m, i) => {
          const s = m.userData;
          if (s.carried) {
            s.a += v * dt;
            const settle = 1 - Math.min(1, Math.abs(v) / 1.2); // slow drum: clothes slide back down
            s.a += Math.atan2(Math.sin(-Math.PI / 2 + (i - 2) * 0.18 - s.a), Math.cos(-Math.PI / 2 + (i - 2) * 0.18 - s.a)) * dt * 3 * settle;
            s.x = Math.cos(s.a) * RW; s.y = Math.sin(s.a) * RW;
            if (Math.abs(v) > 0.6 && s.y > s.rel) {
              s.carried = false;
              s.vx = -Math.sin(s.a) * v * RW; s.vy = Math.cos(s.a) * v * RW;
            }
          } else {
            s.vy -= 3.4 * dt;
            s.x += s.vx * dt; s.y += s.vy * dt;
            if (s.x * s.x + s.y * s.y > RW * RW) { s.a = Math.atan2(s.y, s.x); s.carried = true; }
          }
          m.position.set(s.x, s.y, s.z);
          m.rotation.z += (s.carried ? v * 0.8 : 3) * dt;
          m.rotation.x = Math.sin(clock * 0.002 + i) * 0.9;
          m.rotation.y = Math.cos(clock * 0.0017 + i * 2) * 0.7;
          const amp = 0.045, b = s.base, pa = m.geometry.attributes.position.array;
          for (let q = 0; q < pa.length; q += 3) pa[q + 2] = Math.sin(b[q] * 10 + clock * 0.005 + i) * amp + Math.cos(b[q + 1] * 8 + clock * 0.004) * amp * 0.6;
          m.geometry.attributes.position.needsUpdate = true;
          m.geometry.computeVertexNormals();
        });
        for (let i = 0; i <= WN; i++) {
          const x = -WR + (i / WN) * 2 * WR, bottom = -Math.sqrt(Math.max(0, WR * WR - x * x));
          const top = Math.max(bottom, -0.4 + 0.035 * Math.sin(x * 5 + clock * 0.004) + 0.02 * Math.sin(x * 11 - clock * 0.006) + 0.09 * (v / 2.6) * x);
          wpos.set([x, top, 0, x, bottom, 0], i * 6);
          spos.set([x, top, 0], i * 3);
        }
        wgeo.attributes.position.needsUpdate = true; sgeo.attributes.position.needsUpdate = true;
        bseed.forEach(([bx, ph, sp], i) => {
          const x = bx * 0.6, y0 = -Math.sqrt(Math.max(0, WR * WR - x * x)), yS = -0.42;
          const f = ((clock * 0.00025 * sp + ph) % 1);
          bpos.set([x + Math.sin(clock * 0.003 + i) * 0.015, lerp(y0, yS, f), 0], i * 3);
        });
        bgeo.attributes.position.needsUpdate = true;
      }

      /* orbit ring */
      const sr = pin(orbitFront, svg);
      orbitBack.visible = !!sr;
      if (!sr) return;
      orbitBack.position.copy(orbitFront.position);
      const Rr = (sr.width / 2) * wpp * 1.07 * (0.85 + 0.15 * k);
      [orbitBack, orbitFront].forEach((g) => { g.scale.setScalar(Rr); g.rotation.set(-1.43 + rx * 0.4, ry * 0.8, -0.05); });
      const head = reduced ? 4.2 : t * 0.00032;
      comet.forEach((list, side) => list.forEach((s, j) => {
        const a = head - j * 0.022;
        s.position.set(Math.cos(a), Math.sin(a), 0);
        s.visible = side === 1 ? Math.sin(a) < 0 : Math.sin(a) >= 0;
      }));
    };
  }

  /* ---------- 4c. the LOOP store, as a scroll-driven 3D model ----------
     Scroll: the store turns from a three-quarter view to face you, the facade and sign
     light up, the glass doors slide open, the machines inside start spinning, and the
     camera pushes in. Black, glass and white light only. */
  function createStore(anchor, section) {
    const group = new T.Group(), model = new T.Group();
    group.add(model); fg.add(group);
    const woodTex = (() => { // walnut: vertical slats with soft grain
      const c = document.createElement("canvas"); c.width = 512; c.height = 256;
      const g = c.getContext("2d"); g.fillStyle = "#4a2f1e"; g.fillRect(0, 0, 512, 256);
      for (let x = 0; x < 512; x += 32) {
        const gr = g.createLinearGradient(x, 0, x + 32, 0);
        gr.addColorStop(0, "rgba(0,0,0,.35)"); gr.addColorStop(0.15, "rgba(120,78,46,.35)"); gr.addColorStop(0.85, "rgba(90,58,34,.2)"); gr.addColorStop(1, "rgba(0,0,0,.45)");
        g.fillStyle = gr; g.fillRect(x, 0, 32, 256);
        for (let k = 0; k < 6; k++) { g.strokeStyle = `rgba(30,18,10,${0.15 + Math.random() * 0.2})`; g.beginPath(); const xx = x + 4 + Math.random() * 24; g.moveTo(xx, 0); g.bezierCurveTo(xx + 4, 80, xx - 4, 170, xx + 2, 256); g.stroke(); }
      }
      return new T.CanvasTexture(c);
    })();
    const marbleTex = (() => { // warm cream marble with fine veins
      const c = document.createElement("canvas"); c.width = 512; c.height = 512;
      const g = c.getContext("2d"); g.fillStyle = "#e9e2d6"; g.fillRect(0, 0, 512, 512);
      for (let k = 0; k < 14; k++) {
        g.strokeStyle = `rgba(150,130,110,${0.12 + Math.random() * 0.2})`; g.lineWidth = 0.6 + Math.random() * 1.6;
        g.beginPath(); let x = Math.random() * 512, y = 0; g.moveTo(x, y);
        while (y < 512) { x += (Math.random() - 0.5) * 60; y += 30 + Math.random() * 40; g.lineTo(x, y); }
        g.stroke();
      }
      const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(2, 1); return t;
    })();
    const mat = {
      black: new T.MeshStandardMaterial({ color: 0x0e0d0c, metalness: 0.5, roughness: 0.3, envMap: studioEnv, envMapIntensity: 0.7 }),
      frame: new T.MeshStandardMaterial({ color: 0xc9a86a, metalness: 0.95, roughness: 0.22, envMap: studioEnv, envMapIntensity: 1.2 }),
      floor: new T.MeshStandardMaterial({ map: marbleTex, color: 0xb8b0a4, metalness: 0.05, roughness: 0.18, envMap: studioEnv, envMapIntensity: 0.6 }),
      wall: new T.MeshStandardMaterial({ map: woodTex, color: 0x9a8a7c, roughness: 0.55, emissive: 0x3a2412, emissiveIntensity: 0 }),
      side: new T.MeshStandardMaterial({ color: 0x8f8476, roughness: 0.7, emissive: 0xffe2b8, emissiveIntensity: 0 }),
      steel: new T.MeshStandardMaterial({ color: 0xc9bea9, metalness: 0.55, roughness: 0.3, envMap: studioEnv, envMapIntensity: 0.9 }),
      dark: new T.MeshStandardMaterial({ color: 0x1a1816, metalness: 0.5, roughness: 0.3, envMap: studioEnv }),
      gold: new T.MeshStandardMaterial({ color: 0xc9a86a, metalness: 0.95, roughness: 0.2, envMap: studioEnv, envMapIntensity: 1.3, emissive: 0x2a1c08 }),
      glass: new T.MeshStandardMaterial({ color: 0xfff4e2, metalness: 0.2, roughness: 0.05, envMap: studioEnv, envMapIntensity: 1.4, transparent: true, opacity: 0.12, depthWrite: false }),
      porthole: new T.MeshStandardMaterial({ color: 0x2b2620, metalness: 0.3, roughness: 0.1, envMap: studioEnv, envMapIntensity: 1.2 }),
      led: new T.MeshBasicMaterial({ color: 0xf3d9a4 }),
      leaf: new T.MeshStandardMaterial({ color: 0x3e5a3a, roughness: 0.7, side: T.DoubleSide }),
      cloth: new T.MeshStandardMaterial({ color: 0xf2ece2, roughness: 0.9, side: T.DoubleSide })
    };
    const box = (w, h, d, m, x, y, z) => mesh(new T.BoxGeometry(w, h, d), m, x, y, z);
    const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new T.Mesh(g, m); o.position.set(x, y, z); model.add(o); return o; };
    const W = 2, FY = -0.6, OY = 0.28, TOP = 0.74, ZF = 0.45, ZB = -0.45;

    // shell: fascia, pillars, roof, plinth
    box(W, TOP - OY, 0.92, mat.black, 0, (TOP + OY) / 2, 0);
    box(0.12, OY - FY, 0.92, mat.black, -W / 2 + 0.06, (OY + FY) / 2, 0);
    box(0.12, OY - FY, 0.92, mat.black, W / 2 - 0.06, (OY + FY) / 2, 0);
    box(W + 0.16, 0.05, 1.05, mat.frame, 0, FY - 0.025, 0.04);
    // interior: floor, back wall (lights up), ceiling strips, side walls
    box(W - 0.24, 0.01, 0.9, mat.floor, 0, FY + 0.005, 0);
    box(W - 0.24, OY - FY, 0.02, mat.wall, 0, (OY + FY) / 2, ZB + 0.01);
    box(0.02, OY - FY, 0.9, mat.side, -W / 2 + 0.13, (OY + FY) / 2, 0);
    box(0.02, OY - FY, 0.9, mat.side, W / 2 - 0.13, (OY + FY) / 2, 0);
    const strips = [-0.25, 0.05, 0.3].map((z) => box(W - 0.4, 0.008, 0.02, mat.led, 0, OY - 0.01, z));
    // sign: LOOP + tagline on the fascia, drawn to a canvas texture
    const signCanvas = document.createElement("canvas");
    signCanvas.width = 1024; signCanvas.height = 240;
    const signTex = new T.CanvasTexture(signCanvas);
    const drawSign = () => {
      const g = signCanvas.getContext("2d");
      g.fillStyle = "#000"; g.fillRect(0, 0, 1024, 240);
      g.fillStyle = "#f6f0e6"; g.textAlign = "center"; g.textBaseline = "middle";
      g.font = '200 150px "Jost", "Futura", sans-serif';
      if (g.letterSpacing !== undefined) g.letterSpacing = "6px";
      g.fillText("LOOP", 512, 98);
      g.fillStyle = "#c9a86a"; g.fillRect(452, 168, 120, 2);
      g.font = '400 30px "Jost", "Futura", sans-serif';
      if (g.letterSpacing !== undefined) g.letterSpacing = "8px";
      g.fillStyle = "#d8b878"; g.fillText("The Fabric Future", 512, 206);
      signTex.needsUpdate = true;
    };
    drawSign();
    if (document.fonts) document.fonts.load('200 150px "Jost"').then(drawSign).catch(() => {});
    const signMat = new T.MeshBasicMaterial({ map: signTex, color: 0xffffff });
    mesh(new T.PlaneGeometry(1.5, 0.35), signMat, 0, (TOP + OY) / 2, ZF + 0.012);
    // LED outline around the facade
    const ol = 0.012, oz = ZF + 0.02;
    [[0, TOP + 0.02, W + 0.04, ol], [0, OY - 0.005, W - 0.24, ol]].forEach(([x, y, w, h]) => box(w, h, 0.01, mat.led, x, y, oz));
    [-1, 1].forEach((s) => box(ol, TOP - FY + 0.02, 0.01, mat.led, s * (W / 2 + 0.02), (TOP + FY) / 2 + 0.01, oz));
    // glass front: fixed panes + two sliding doors with black frames and bar handles
    const pane = (w, x) => {
      const g = new T.Group();
      g.add(new T.Mesh(new T.BoxGeometry(w, OY - FY - 0.02, 0.008), mat.glass));
      [[0, (OY - FY) / 2 - 0.02, w, 0.018], [0, -(OY - FY) / 2 + 0.02, w, 0.03]].forEach(([px, py, pw, ph]) => { const m = new T.Mesh(new T.BoxGeometry(pw, ph, 0.02), mat.frame); m.position.set(px, py, 0); g.add(m); });
      [-1, 1].forEach((s) => { const m = new T.Mesh(new T.BoxGeometry(0.018, OY - FY - 0.02, 0.02), mat.frame); m.position.set(s * w / 2, 0, 0); g.add(m); });
      g.position.set(x, (OY + FY) / 2, ZF - 0.04);
      model.add(g);
      return g;
    };
    pane(0.46, -0.65); pane(0.46, 0.65);
    const doors = [-1, 1].map((s) => {
      const d = pane(0.21, s * 0.105);
      const h = new T.Mesh(new T.BoxGeometry(0.01, 0.34, 0.012), mat.frame);
      h.position.set(-s * 0.085, 0, 0.02); d.add(h);
      return d;
    });
    // washers along the left wall and the back wall, drums spin when the store comes alive
    const drums = [];
    const washer = (x, y, z, ry) => {
      const g = new T.Group();
      g.add(new T.Mesh(new T.BoxGeometry(0.2, 0.22, 0.19), mat.steel));
      const ring = new T.Mesh(new T.TorusGeometry(0.068, 0.012, 12, 40), mat.gold); ring.position.z = 0.1; g.add(ring);
      const glass = new T.Mesh(new T.CircleGeometry(0.06, 32), mat.porthole); glass.position.z = 0.1; g.add(glass);
      const drum = new T.Group(); drum.position.z = 0.095;
      const c = new T.Mesh(new T.PlaneGeometry(0.05, 0.035), mat.cloth); c.position.set(0.02, -0.015, 0.002); drum.add(c);
      const c2 = new T.Mesh(new T.PlaneGeometry(0.04, 0.03), mat.cloth); c2.position.set(-0.022, 0.012, 0.003); c2.rotation.z = 0.7; drum.add(c2);
      g.add(drum); drums.push(drum);
      g.position.set(x, y, z); g.rotation.y = ry;
      model.add(g);
    };
    [[-0.32, 0], [-0.08, 0], [0.16, 0]].forEach(([z]) => { washer(-0.76, FY + 0.11, z, Math.PI / 2); washer(-0.76, FY + 0.335, z, Math.PI / 2); });
    [-0.3, -0.06].forEach((x) => washer(x, FY + 0.11, ZB + 0.12, 0));
    // counter island + shelves on the right
    box(0.42, 0.19, 0.2, mat.dark, 0.36, FY + 0.095, 0.02);
    box(0.44, 0.012, 0.22, mat.floor, 0.36, FY + 0.196, 0.02);
    box(0.42, 0.006, 0.006, mat.gold, 0.36, FY + 0.19, 0.122);
    // pendant lights over the counter
    [0.24, 0.48].forEach((x) => {
      box(0.003, 0.2, 0.003, mat.gold, x, OY - 0.11, 0.02);
      const shade = mesh(new T.ConeGeometry(0.035, 0.04, 24, 1, true), mat.gold, x, OY - 0.22, 0.02); shade.material.side = T.DoubleSide;
      mesh(new T.SphereGeometry(0.012, 12, 10), mat.led, x, OY - 0.235, 0.02);
    });
    // plant in a black pot at the front right
    mesh(new T.CylinderGeometry(0.045, 0.035, 0.09, 24), mat.dark, 0.72, FY + 0.045, 0.3);
    for (let i = 0; i < 9; i++) {
      const lf = mesh(new T.PlaneGeometry(0.035, 0.16), mat.leaf, 0.72, FY + 0.16, 0.3);
      lf.rotation.set(0.35 * Math.cos(i * 2.4), i * 0.7, 0.45 * Math.sin(i * 1.7));
    }
    [0.0, 0.16].forEach((dy) => {
      box(0.02, 0.012, 0.5, mat.dark, W / 2 - 0.16, FY + 0.42 + dy, -0.12);
      [-0.3, -0.18, -0.06, 0.06].forEach((z, i) => box(0.06, 0.06 + (i % 2) * 0.03, 0.07, i % 3 ? mat.floor : mat.steel, W / 2 - 0.19, FY + 0.46 + dy + (i % 2) * 0.015, z));
    });
    // interior light (moves with the model)
    const inside = new T.PointLight(0xffd9a6, 0, 3.2, 2);
    // warm light spilling out onto the pavement
    const spill = new T.Mesh(new T.PlaneGeometry(1.9, 0.7), new T.MeshBasicMaterial({ map: dotTex, color: 0xf3c98a, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
    spill.rotation.x = -Math.PI / 2; spill.position.set(0, FY + 0.003, ZF + 0.3); model.add(spill);
    inside.position.set(0, OY - 0.12, 0.05); model.add(inside);

    const sub = (x, a, b) => clamp((x - a) / (b - a));
    let tilt = 0, spin = 0;
    return function update(t, dt) {
      const r = pin(group, anchor);
      if (!r) return;
      const cr = section.getBoundingClientRect();
      const p = reduced ? 0.7 : clamp(-cr.top / (cr.height - innerHeight));
      const turn = easeIO(sub(p, 0, 0.5)), lit = smooth(0.04, 0.22, p), open = easeIO(sub(p, 0.36, 0.58)), alive = smooth(0.6, 0.78, p), push = easeIO(sub(p, 0.66, 1));
      // flicker while the sign switches on, then steady
      const flick = p > 0.04 && p < 0.2 ? (Math.sin(t * 0.05) > 0.2 ? 1 : 0.35) : 1;
      const on = (0.12 + 0.88 * lit) * flick;
      signMat.color.setScalar(on); mat.led.color.setScalar(on);
      mat.wall.emissiveIntensity = 0.1 + 0.35 * lit + 0.15 * alive; mat.side.emissiveIntensity = 0.01 + 0.04 * lit;
      spill.material.opacity = 0.5 * lit * flick;
      inside.intensity = (0.15 + 0.7 * lit) * flick;
      strips.forEach((s) => (s.visible = lit > 0.3));
      doors.forEach((d, i) => (d.position.x = (i ? 1 : -1) * (0.105 + open * 0.22)));
      spin += dt * (1 + alive * 9);
      drums.forEach((d, i) => (d.rotation.z = spin * (i % 2 ? 1 : -1.1)));
      tilt = lerp(tilt, fine ? mouse.nx * 0.1 : 0, 0.05);
      model.rotation.set(0.12 + push * 0.04, lerp(-0.72, 0, turn) + tilt + Math.sin(t * 0.0005) * 0.03 * (1 - push), 0);
      model.position.set(0, -0.05 - push * 0.04, 0);
      group.scale.setScalar((Math.min(r.width / 2, r.height / 1.45)) * wpp * 0.88 * (1 + push * 0.1));
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
    ...$$(".hero, .finale").map(createLogo3D),
    createDust(),
    ...($(".cycle__stage") ? [createDrum($(".cycle__stage"), $(".cycle"))] : []),
    createPillarIcons(),
    ...($(".store__stage") ? [createStore($(".store__stage"), $(".store"))] : [])
  ];
  let prev = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    const t = reduced ? 0 : now;
    updates.forEach((u) => u(t, reduced ? 0 : dt));
    bgR.render(bg, camera);
    fgR.render(fg, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
