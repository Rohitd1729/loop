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
     First O: a robot hand and a business hand shaking (3D, clipped to the O by a stencil).
     Second O: a front-load washing machine door: chrome ring, rubber gasket, domed glass,
     a reversing drum with baffles, tumbling clothes and sloshing water.
     Plus an orbit ring around the word and a pointer-driven depth tilt.
     The flat SVG letters stay the source of truth; 3D is pinned to their geometry. */
  const HANDSHAKE_MS = 6000;

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

    /* ===== first O: the handshake ===== */
    const o1 = new T.Group(), o1Tilt = new T.Group(), model = new T.Group(), shake = new T.Group();
    o1.add(mask(1), o1Tilt); o1Tilt.add(model); model.add(shake); fg.add(o1);
    model.scale.setScalar(1.6); model.position.set(0.06, -0.02, 0);
    const skin = M(std(0xd8bf9f, 0, 0.78, { envMapIntensity: 0.25 }), 1, 1);
    const suit = M(std(0x2b2b30, 0.1, 0.5, { envMapIntensity: 0.6 }), 1, 1);
    const shirt = M(std(0xf6f2ea, 0, 0.5, { envMapIntensity: 0.5 }), 1, 1);
    const steel = M(std(0xd9d3c9, 0.75, 0.24), 1, 1);
    const dark = M(std(0x45423e, 0.7, 0.35), 1, 1);
    const brass = M(std(BRASS, 0.85, 0.25, { emissive: 0x24190a }), 1, 1);
    const led = M(new T.MeshBasicMaterial({ color: 0xf0dcae }), 1, 1);
    const btn = M(std(0x8f8a82, 0.3, 0.4), 1, 1);
    const chain = (pts, r, mat, joint) => {
      const g = new T.Group();
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], c = new T.Mesh(new T.CylinderGeometry(r, r, a.distanceTo(b), 18), mat);
        c.position.copy(a).add(b).multiplyScalar(0.5);
        c.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
        g.add(c);
      }
      pts.forEach((p, i) => {
        const mid = i > 0 && i < pts.length - 1;
        g.add(mesh(new T.SphereGeometry(r * (mid ? 1.15 : 1), 18, 14), mid ? joint : mat, p.x, p.y, p.z));
      });
      return g;
    };
    const finger = (pts, r) => {
      const g = new T.Group(), end = pts[pts.length - 1];
      g.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 28, r, 14, false), skin));
      g.add(mesh(new T.SphereGeometry(r, 16, 12), skin, end.x, end.y, end.z), mesh(new T.SphereGeometry(r, 16, 12), skin, pts[0].x, pts[0].y, pts[0].z));
      return g;
    };
    const ringAt = (x, r, tube, mat, z = 0) => { const m = mesh(new T.TorusGeometry(r, tube, 12, 56), mat, x, 0, z); m.rotation.y = Math.PI / 2; return m; };

    // robot (from the left): segmented steel forearm, piston, LED strip, wrist, palm behind, thumb on top
    const robot = new T.Group();
    robot.add(
      mesh(alongX(new T.CylinderGeometry(0.14, 0.15, 0.72, 48)), steel, -1.15, 0, -0.08),
      mesh(alongX(new T.CylinderGeometry(0.122, 0.134, 0.46, 48)), steel, -0.56, 0, -0.08),
      ringAt(-0.785, 0.146, 0.018, dark, -0.08), ringAt(-1.25, 0.152, 0.006, dark, -0.08),
      ringAt(-0.33, 0.124, 0.013, brass, -0.08),
      mesh(alongX(new T.CylinderGeometry(0.022, 0.022, 0.72, 14)), dark, -0.8, -0.168, 0.0),
      mesh(new T.SphereGeometry(0.03, 14, 10), brass, -1.16, -0.168, 0.0), mesh(new T.SphereGeometry(0.03, 14, 10), brass, -0.44, -0.168, 0.0),
      mesh(new T.SphereGeometry(0.098, 28, 20), dark, -0.27, 0, -0.08),
      mesh(new T.BoxGeometry(0.3, 0.19, 0.12), steel, -0.06, -0.01, -0.17)
    );
    const strip = mesh(new T.BoxGeometry(0.32, 0.012, 0.024), led, -0.58, 0.088, 0.01);
    strip.rotation.x = -0.78;
    robot.add(strip);
    robot.add(chain([V(-0.2, 0.06, -0.06), V(-0.06, 0.125, 0.02), V(0.08, 0.13, 0.07)], 0.032, steel, brass));
    [-0.2, -0.14, -0.08].forEach((z) => robot.add(chain([V(0.05, -0.08, z), V(0.16, -0.13, z + 0.03), V(0.23, -0.06, z + 0.05)], 0.027, steel, brass)));

    // business person (from the right): suit sleeve, buttons, shirt cuff + cufflink, hand wrapping the robot palm
    const human = new T.Group();
    human.add(
      mesh(alongX(new T.CylinderGeometry(0.165, 0.172, 1.1, 48)), suit, 0.98, 0, 0),
      ringAt(0.43, 0.165, 0.012, suit),
      mesh(alongX(new T.CylinderGeometry(0.128, 0.128, 0.13, 40)), shirt, 0.375, 0, 0),
      mesh(new T.SphereGeometry(0.022, 14, 10), brass, 0.375, 0.0, 0.128),
      mesh(alongX(new T.CylinderGeometry(0.074, 0.086, 0.14, 28)), skin, 0.27, 0.0, 0)
    );
    [0.52, 0.58, 0.64].forEach((x) => human.add(mesh(new T.SphereGeometry(0.016, 12, 10), btn, x, -0.085, 0.142)));
    const back = mesh(new T.SphereGeometry(1, 40, 24), skin, 0.08, 0.02, 0);
    back.scale.set(0.2, 0.08, 0.13); back.rotation.z = -0.08;
    const knuckles = mesh(new T.SphereGeometry(1, 32, 20), skin, -0.06, 0.03, 0);
    knuckles.scale.set(0.06, 0.07, 0.125);
    human.add(back, knuckles);
    [[0.085, 0.029, 0.88], [0.03, 0.033, 1], [-0.025, 0.033, 0.97], [-0.075, 0.03, 0.86]].forEach(([z, r, l]) =>
      human.add(finger([V(-0.06, 0.035, z), V(-0.15, 0.03, z), V(-0.205, -0.03, z * 0.8), V(-0.205, -0.03 - 0.06 * l, z * 0.4 - 0.07), V(-0.18, -0.05 - 0.07 * l, -0.16)], r)));
    human.add(finger([V(0.12, 0.04, -0.1), V(0.02, 0.1, -0.15), V(-0.08, 0.11, -0.18)], 0.034));
    shake.add(robot, human);
    // brass glow at the grip, pulses with each pump
    const gripGlow = new T.Sprite(M(new T.SpriteMaterial({ map: dotTex, color: BRASS, blending: T.AdditiveBlending, depthWrite: false, depthTest: false }), 0.75, 1));
    gripGlow.scale.setScalar(0.55); gripGlow.position.set(0, 0.02, 0.2);
    shake.add(gripGlow);

    /* ===== second O: front-load machine door ===== */
    const o2 = new T.Group(), o2Tilt = new T.Group(), drum = new T.Group(), spin = new T.Group();
    o2.add(mask(2), o2Tilt); fg.add(o2);
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
    const gripMat = gripGlow.material, statusMat = status.material;
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

      /* handshake: arms slide in on launch, three firm pumps, then a calm hold while the view orbits */
      const u1 = pinO(o1, 275, 102);
      if (u1) {
        const tt = reduced ? 1500 : clock % HANDSHAKE_MS;
        const enter = 1 - Math.pow(1 - k, 3);
        robotSlide(-1, enter); robotSlide(1, enter);
        const su = clamp((tt - 500) / 1500), pump = su > 0 && su < 1 ? Math.sin(su * TAU * 1.5) * Math.sin(su * Math.PI) : 0;
        shake.position.y = pump * 0.075;
        shake.rotation.z = pump * 0.07;
        o1Tilt.rotation.set(0.14 + rx * 1.5, -0.12 + 0.2 * Math.sin((clock / 12000) * TAU) + ry * 1.5, 0);
        gripMat.opacity *= 0.25 + 0.75 * Math.abs(pump);
      }

      /* washing machine: drum turns, pauses and reverses like a real wash cycle */
      const u2 = pinO(o2, 530, 108);
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
    function robotSlide(side, enter) {
      (side < 0 ? robot : human).position.x = side * (1 - enter) * 1.6;
    }
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
    createPillarIcons()
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
