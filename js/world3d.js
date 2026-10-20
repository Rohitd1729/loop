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

  /* ---------- 3. the LOOP robotic wash drum ("How it works") ----------
     One reusable scene, four reversible scroll stages (p = 0..1 across the section):
       Pickup 0–.25 · Robotic wash .25–.5 · Eco dry .5–.75 · Fold & return .75–1 (hold)
     Scale: 1 unit = drum radius (0.78 = steel drum, 1.0 = door rim). Origin: drum centre. +Z = toward viewer.
     Framing: drum fills the .cycle__stage box; frame tilt y -0.30 / x 0.14 (±0.05 pointer parallax).
     Named nodes (window.LOOP_DRUM.root.getObjectByName): LOOP_Washer > Washer_Frame > Drum, Rotor,
       Rotor_Hub, Rotor_Axle, Rotor_Arm_0-3, Paddle_0-3, Door_Rim, Door_Gasket, Door_Glass,
       Garment_Shirt / _Trousers / _Sock_L / _Sock_R / _Towel, Lamp. Camera = shared scene camera.
     Cloth: procedural approximation (subdivided two-layer meshes; true hinge folds, bend, twist, ripples,
     inertial trailing) driven by a light 2-D tumble sim of each garment against the drum wall and paddles. */
  function createDrum(anchor, section) {
    const group = new T.Group(), tilt = new T.Group(), spin = new T.Group(), rotor = new T.Group();
    group.name = "LOOP_Washer"; tilt.name = "Washer_Frame"; spin.name = "Drum"; rotor.name = "Rotor";
    group.add(tilt); tilt.add(spin); tilt.add(rotor); fg.add(group);
    const lamp = new T.PointLight(0xfff1dc, 0.7, 0); lamp.name = "Lamp"; lamp.position.set(0.3, 0.5, 1.4); tilt.add(lamp);

    /* ----- procedural textures + materials ----- */
    const cv = (w, h, draw) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); return c; };
    const tex = (c, rx = 1, ry = 1) => { const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; return t; };
    let env = null; // soft studio reflections so brushed metal reads as metal
    try {
      const et = new T.CanvasTexture(cv(512, 256, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#35332f"); gr.addColorStop(0.5, "#111112"); gr.addColorStop(1, "#050505");
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        [[60, 40, 130, 50, "#f3eee4"], [300, 30, 150, 36, "#e9e4da"], [200, 120, 60, 90, "#8c7a55"], [440, 90, 50, 60, "#cfcac0"]].forEach(([x, y, a, b, c]) => { g.fillStyle = c; g.fillRect(x, y, a, b); });
      }));
      et.mapping = T.EquirectangularReflectionMapping;
      const pm = new T.PMREMGenerator(fgR); env = pm.fromEquirectangular(et).texture; pm.dispose(); et.dispose();
    } catch (e) { env = null; }
    const brushC = cv(256, 256, (g, w, h) => {
      g.fillStyle = "#808080"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) { g.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,.13)" : "rgba(0,0,0,.15)"; g.fillRect(Math.random() * w, Math.random() * h, 20 + Math.random() * 200, 1); }
    });
    const steel = (o = {}) => new T.MeshStandardMaterial(Object.assign({ color: 0xc9c6c0, metalness: 0.92, roughness: 0.38, bumpMap: tex(brushC, 1, 3), bumpScale: 0.6, envMap: env, envMapIntensity: 1.1 }, o));
    const graphite = new T.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.75, roughness: 0.5, envMap: env, envMapIntensity: 0.9 });
    const rubber = new T.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.78, metalness: 0.05 });
    const gold = new T.MeshStandardMaterial({ color: 0xb89a63, metalness: 0.9, roughness: 0.35, envMap: env });
    const led = new T.MeshBasicMaterial({ color: BRASS.clone() });
    const holeC = cv(128, 128, (g, w, h) => { // perforated sheet: evenly spaced holes with a lit lower rim
      g.fillStyle = "#bdbab4"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { g.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,.07)" : "rgba(0,0,0,.08)"; g.fillRect(Math.random() * w, Math.random() * h, 12 + Math.random() * 60, 1); }
      [[32, 32], [96, 32], [0, 96], [64, 96], [128, 96]].forEach(([x, y]) => {
        g.fillStyle = "#050506"; g.beginPath(); g.arc(x, y, 11, 0, TAU); g.fill();
        g.strokeStyle = "rgba(255,255,255,.4)"; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 12, 2.4, 4.4); g.stroke();
      });
    });
    const drumTex = tex(holeC, 30, 5);
    const rbox = (w, h, d, r = 0.012) => { // rounded-edge bar: soft, machined, never sharp
      const s = new T.Shape(), x = -w / 2, y = -h / 2;
      s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
      const g = new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2, curveSegments: 4 });
      g.translate(0, 0, -d / 2); return g;
    };
    const add = (parent, geo, mat, name, x = 0, y = 0, z = 0) => { const m = new T.Mesh(geo, mat); m.name = name; m.position.set(x, y, z); parent.add(m); return m; };
    const alongZ = (g) => { g.rotateX(Math.PI / 2); return g; };

    /* ----- door: rim, gasket, ticks, domed dark glass ----- */
    add(tilt, new T.TorusGeometry(1, 0.03, 16, 180), steel(), "Door_Rim", 0, 0, 0.5);
    add(tilt, new T.TorusGeometry(0.9, 0.008, 8, 160), new T.MeshBasicMaterial({ color: BRASS }), "Door_Accent", 0, 0, 0.5);
    add(tilt, new T.TorusGeometry(0.855, 0.07, 16, 120), rubber, "Door_Gasket", 0, 0, 0.43);
    const tickPts = [];
    for (let i = 0; i < 72; i++) { const a = (i / 72) * TAU, r0 = i % 6 ? 0.935 : 0.915; tickPts.push(new T.Vector3(Math.cos(a) * r0, Math.sin(a) * r0, 0.5), new T.Vector3(Math.cos(a) * 0.97, Math.sin(a) * 0.97, 0.5)); }
    tilt.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(tickPts), lineMat(IVORY, 0.45)));
    const dome = new T.SphereGeometry(3, 56, 10, 0, TAU, 0, Math.asin(0.78 / 3)); dome.rotateX(Math.PI / 2); dome.translate(0, 0, -2.427);
    const glass = add(tilt, dome, new T.MeshPhysicalMaterial({ color: 0x0b0e11, metalness: 0, roughness: 0.06, transparent: true, opacity: 0.2, envMap: env, envMapIntensity: 1.3, depthWrite: false, side: T.DoubleSide }), "Door_Glass");
    glass.renderOrder = 5;
    const glint = new T.Line(new T.BufferGeometry().setFromPoints(Array.from({ length: 30 }, (_, i) => { const a = 2.2 + (i / 29) * 0.9; return new T.Vector3(Math.cos(a) * 0.66, Math.sin(a) * 0.66, 0.58); })), lineMat(IVORY, 0.4));
    tilt.add(glint);

    /* ----- drum (spins): perforated shell, lips, back plate, bearing, water film ----- */
    add(spin, alongZ(new T.CylinderGeometry(0.78, 0.78, 0.9, 96, 1, true)), steel({ map: drumTex, bumpMap: drumTex, bumpScale: 2, side: T.BackSide, metalness: 0.8, roughness: 0.45 }), "Drum_Shell");
    add(spin, new T.TorusGeometry(0.78, 0.022, 12, 120), steel(), "Drum_Lip_Front", 0, 0, 0.45);
    add(spin, new T.TorusGeometry(0.78, 0.022, 12, 120), steel(), "Drum_Lip_Back", 0, 0, -0.45);
    add(spin, new T.CircleGeometry(0.78, 64), graphite, "Drum_Back_Plate", 0, 0, -0.452);
    [0.5, 0.33].forEach((r, i) => add(spin, new T.TorusGeometry(r, 0.008, 8, 96), steel(), "Drum_Back_Ring_" + i, 0, 0, -0.44));
    add(spin, alongZ(new T.CylinderGeometry(0.17, 0.17, 0.06, 40)), graphite, "Drum_Bearing", 0, 0, -0.43);
    add(spin, new T.TorusGeometry(0.17, 0.008, 8, 48), gold, "Drum_Bearing_Ring", 0, 0, -0.4);
    const streak = tex(cv(256, 64, (g, w) => { for (let i = 0; i < 70; i++) { const x = Math.random() * w, y = Math.random() * 64, l = 10 + Math.random() * 40, gr = g.createLinearGradient(x, y, x + l, y); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, "rgba(255,255,255,.7)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(x, y, l, 1.5); } }), 4, 1);
    const filmMat = new T.MeshBasicMaterial({ map: streak, color: 0xdfeaf0, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.BackSide });
    add(spin, alongZ(new T.CylinderGeometry(0.772, 0.772, 0.86, 64, 1, true)), filmMat, "Water_Film");

    /* ----- robotic rotor: coaxial with the drum, own speed. hub + axle + 4 arms + 4 curved lifters ----- */
    add(rotor, alongZ(new T.CylinderGeometry(0.035, 0.035, 0.14, 24)), steel(), "Rotor_Axle", 0, 0, -0.44);
    add(rotor, alongZ(new T.CylinderGeometry(0.12, 0.12, 0.12, 40)), graphite, "Rotor_Hub", 0, 0, -0.37);
    add(rotor, alongZ(new T.CylinderGeometry(0.085, 0.085, 0.03, 40)), steel(), "Rotor_Hub_Cap", 0, 0, -0.3);
    add(rotor, new T.TorusGeometry(0.1, 0.007, 8, 48), gold, "Rotor_Hub_Ring", 0, 0, -0.31);
    for (let k = 0; k < 4; k++) { // indicator lights inset in the hub cap
      const a = k * Math.PI / 2 + Math.PI / 4, l = add(rotor, new T.SphereGeometry(0.013, 12, 8), led, "Rotor_Light_" + k, Math.cos(a) * 0.055, Math.sin(a) * 0.055, -0.283); l.scale.z = 0.5;
      const b = add(rotor, alongZ(new T.CylinderGeometry(0.013, 0.013, 0.02, 6)), steel(), "Rotor_Hub_Bolt_" + k, Math.cos(a) * 0.1, Math.sin(a) * 0.1, -0.305);
    }
    const ps = new T.Shape(), pcx = 0.74, pcy = 0.3; // curved lifter profile: scoop faces the direction of travel
    ps.absarc(pcx, pcy, 0.325, Math.PI, 1.5 * Math.PI, false); ps.absarc(pcx, pcy, 0.275, 1.5 * Math.PI, Math.PI, true);
    const padGeo = new T.ExtrudeGeometry(ps, { depth: 0.62, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 3, curveSegments: 20 });
    padGeo.translate(0, 0, -0.38);
    const armGeo = rbox(0.58, 0.06, 0.04), braceGeo = rbox(0.28, 0.03, 0.03), ledBar = new T.BoxGeometry(0.05, 0.012, 0.006);
    for (let k = 0; k < 4; k++) {
      const arm = new T.Group(); arm.name = "Rotor_Arm_" + k; arm.rotation.z = k * Math.PI / 2; rotor.add(arm);
      add(arm, armGeo, steel(), "Arm_Bar", 0.41, 0, -0.36);
      add(arm, alongZ(new T.CylinderGeometry(0.045, 0.045, 0.07, 24)), steel(), "Arm_Joint", 0.7, 0, -0.36);
      add(arm, alongZ(new T.CylinderGeometry(0.02, 0.02, 0.012, 6)), gold, "Arm_Joint_Bolt", 0.7, 0, -0.32);
      [0.3, 0.52].forEach((x, i) => add(arm, alongZ(new T.CylinderGeometry(0.014, 0.014, 0.02, 6)), steel(), "Arm_Bolt_" + i, x, 0, -0.335));
      add(arm, ledBar, led, "Arm_Light", 0.45, 0, -0.337);
      const br = add(arm, braceGeo, graphite, "Arm_Brace", 0.55, 0.09, -0.34); br.rotation.z = 0.55;
      add(arm, padGeo, graphite, "Paddle_" + k);
      add(arm, ledBar, led, "Paddle_Light_" + k, 0.66, 0.24, 0.22).rotation.z = 0.9;
    }

    /* ----- garments: two-layer subdivided cloth meshes with woven + stitched textures ----- */
    const SPAN = 0.64, WV = 256, X = (x) => ((x + SPAN / 2) / SPAN) * WV, Y = (y) => ((SPAN / 2 - y) / SPAN) * WV;
    const fabric = (base, seams, o = {}) => cv(WV, WV, (g) => {
      g.fillStyle = base; g.fillRect(0, 0, WV, WV);
      for (let i = 0; i < WV; i += 2) { g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.05})`; g.fillRect(i, 0, 1, WV); g.fillStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.05})`; g.fillRect(0, i + 1, WV, 1); }
      if (o.terry) for (let i = 0; i < 2600; i++) { g.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.12)"; g.beginPath(); g.arc(Math.random() * WV, Math.random() * WV, 1 + Math.random() * 1.3, 0, TAU); g.fill(); }
      (o.ribs || []).forEach(([ya, yb]) => { for (let x = 0; x < WV; x += 3) { g.fillStyle = "rgba(0,0,0,.22)"; g.fillRect(x, Y(ya), 1.5, Y(yb) - Y(ya)); } });
      (o.patches || []).forEach(([cx, cy, rx, ry]) => { g.fillStyle = "rgba(0,0,0,.2)"; g.beginPath(); g.ellipse(X(cx), Y(cy), rx * WV / SPAN, ry * WV / SPAN, 0, 0, TAU); g.fill(); });
      g.setLineDash([4, 3]); g.lineWidth = 1.4; g.strokeStyle = o.stitch || "rgba(70,70,75,.6)";
      seams.forEach((pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.stroke(); });
    });
    const poly = (pts) => { const s = new T.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath(); return s; };
    const shirt = new T.Shape();
    shirt.moveTo(-0.075, 0.25); shirt.quadraticCurveTo(0, 0.15, 0.075, 0.25); shirt.lineTo(0.17, 0.225); shirt.lineTo(0.285, 0.075); shirt.lineTo(0.215, 0.0); shirt.lineTo(0.16, 0.06);
    shirt.lineTo(0.16, -0.26); shirt.quadraticCurveTo(0, -0.29, -0.16, -0.26); shirt.lineTo(-0.16, 0.06); shirt.lineTo(-0.215, 0.0); shirt.lineTo(-0.285, 0.075); shirt.lineTo(-0.17, 0.225); shirt.closePath();
    const sock = new T.Shape();
    sock.moveTo(-0.105, 0.27); sock.quadraticCurveTo(0, 0.25, 0.105, 0.27); sock.lineTo(0.09, -0.08); sock.quadraticCurveTo(0.1, -0.16, 0.21, -0.2); sock.quadraticCurveTo(0.27, -0.23, 0.22, -0.28);
    sock.quadraticCurveTo(0.05, -0.31, -0.13, -0.27); sock.quadraticCurveTo(-0.18, -0.22, -0.11, -0.16); sock.closePath();
    const towel = new T.Shape();
    towel.moveTo(-0.2, 0.26); towel.quadraticCurveTo(-0.22, 0, -0.2, -0.27); towel.quadraticCurveTo(0, -0.29, 0.2, -0.27); towel.quadraticCurveTo(0.22, 0, 0.2, 0.26); towel.quadraticCurveTo(0, 0.28, -0.2, 0.26); towel.closePath();
    const sockSeams = [[[-0.1, 0.16], [0.1, 0.16]], [[-0.1, 0.05], [0.085, 0.05]]];
    // type: 0 shirt, 1 trousers, 2 sock, 3 towel. folds are [pointX, pointY, normalX, normalY] on the flat garment.
    const DEFS = [
      { name: "Garment_Shirt", type: 0, shape: shirt, lane: 0.12, rz0: 0.15, sp: 1,
        tex: fabric("#f1f1ef", [[[-0.075, 0.25], [-0.04, 0.19], [0, 0.17], [0.04, 0.19], [0.075, 0.25]], [[-0.075, 0.25], [-0.17, 0.225]], [[0.075, 0.25], [0.17, 0.225]], [[-0.16, 0.06], [-0.16, -0.26]], [[0.16, 0.06], [0.16, -0.26]], [[-0.15, -0.23], [0.15, -0.23]], [[-0.15, -0.215], [0.15, -0.215]], [[-0.205, 0.012], [-0.272, 0.083]], [[0.205, 0.012], [0.272, 0.083]]]),
        mask: (x, y) => Math.max(smooth(0.16, 0.27, Math.abs(x)), smooth(-0.16, -0.27, y)),
        folds: [[-0.16, 0, -1, 0], [0.16, 0, 1, 0], [0, -0.015, 0, -1]], stack: [0, -0.33, 0.2, -0.4, 0] },
      { name: "Garment_Trousers", type: 1, shape: poly([[-0.19, 0.27], [0.19, 0.27], [0.17, -0.28], [0.045, -0.28], [0, -0.045], [-0.045, -0.28], [-0.17, -0.28]]), lane: 0, rz0: -0.1, sp: 0.9,
        tex: fabric("#1c1d1f", [[[-0.19, 0.2], [0.19, 0.2]], [[0, 0.2], [0, -0.04]], [[-0.18, 0.2], [-0.17, -0.27]], [[0.18, 0.2], [0.17, -0.27]], [[-0.165, -0.25], [-0.048, -0.25]], [[0.165, -0.25], [0.048, -0.25]]], { stitch: "rgba(200,200,205,.4)", ribs: [[0.27, 0.2]] }),
        mask: (x, y) => smooth(-0.1, -0.28, y), folds: [[0, 0, 1, 0], [0, 0, 0, -1]], stack: [0, -0.4, 0.15, -0.4, 0] },
      { name: "Garment_Sock_L", type: 2, shape: sock, lane: 0.08, rz0: 0.5, sp: 1.2, tex: fabric("#8f9195", sockSeams, { ribs: [[0.27, 0.16]], patches: [[-0.08, -0.2, 0.05, 0.05], [0.2, -0.25, 0.05, 0.035]], stitch: "rgba(235,235,235,.5)" }),
        mask: (x, y) => Math.max(smooth(0.15, 0.27, y) * 0.5, y < -0.12 ? smooth(0.08, 0.24, x) : 0), folds: [[0, -0.09, 0, -1], [0.04, 0, 1, 0]], stack: [-0.1, -0.27, 0.22, -0.4, 0.05] },
      { name: "Garment_Sock_R", type: 2, shape: sock, lane: -0.06, rz0: -0.6, sp: 0.8, tex: fabric("#b9babd", sockSeams, { ribs: [[0.27, 0.16]], patches: [[-0.08, -0.2, 0.05, 0.05], [0.2, -0.25, 0.05, 0.035]] }),
        mask: (x, y) => Math.max(smooth(0.15, 0.27, y) * 0.5, y < -0.12 ? smooth(0.08, 0.24, x) : 0), folds: [[0, -0.09, 0, -1], [0.04, 0, 1, 0]], stack: [0.1, -0.27, 0.22, -0.4, -0.05] },
      { name: "Garment_Towel", type: 3, shape: towel, lane: -0.12, rz0: 0.3, sp: 0.7, tex: fabric("#5a5c61", [[[-0.17, 0.22], [0.17, 0.22], [0.17, -0.24], [-0.17, -0.24], [-0.17, 0.22]], [[-0.2, 0.15], [0.2, 0.15]], [[-0.2, 0.12], [0.2, 0.12]]], { terry: true, stitch: "rgba(225,225,225,.35)" }),
        mask: (x, y) => smooth(1.0, 1.9, Math.abs(x) / 0.2 + Math.abs(y) / 0.27), folds: [[0, -0.09, 0, -1], [0, 0.09, 0, 1], [0, 0, 1, 0]], stack: [0, -0.46, 0.1, -0.4, 0] }
    ];
    const pip = (pl, x, y) => { let c = false; for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) { const a = pl[i], b = pl[j]; if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
    const nearest = (pl, x, y) => {
      let bx = x, by = y, bd = 1e9;
      for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) {
        const a = pl[j], b = pl[i], dx = b.x - a.x, dy = b.y - a.y, t = clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)), px = a.x + dx * t, py = a.y + dy * t, dd = (px - x) ** 2 + (py - y) ** 2;
        if (dd < bd) { bd = dd; bx = px; by = py; }
      }
      return [bx, by];
    };
    const TMP = [0, 0, 0];
    function foldPt(d, f, x, y, z, o) { // rounded hinge folds, applied in order
      for (let j = 0; j < d.folds.length; j++) {
        const fj = f[j]; if (fj <= 0) continue;
        const F = d.folds[j], dd = (x - F[0]) * F[2] + (y - F[1]) * F[3];
        if (dd <= 0) continue;
        const w = Math.min(1, dd / 0.05), th = Math.PI * fj * w * w * (3 - 2 * w), co = Math.cos(th), si = Math.sin(th);
        const nn = dd * co - z * si, zz = dd * si + z * co + 0.012 * fj * w, tt = -(x - F[0]) * F[3] + (y - F[1]) * F[2];
        x = F[0] - F[3] * tt + F[2] * nn; y = F[1] + F[2] * tt + F[3] * nn; z = zz;
      }
      o[0] = x; o[1] = y; o[2] = z;
    }
    function makeCloth(d, idx) {
      const pl = d.shape.getPoints(10), n = Math.round(SPAN / (small ? 0.038 : 0.027)), st = SPAN / n, g0 = -SPAN / 2;
      const map = new Map(), vx = [], vy = [], tri = [];
      const gv = (i, j) => { const k = i * 1000 + j; let v = map.get(k); if (v === undefined) { v = vx.length; map.set(k, v); let x = g0 + i * st, y = g0 + j * st; if (!pip(pl, x, y)) [x, y] = nearest(pl, x, y); vx.push(x); vy.push(y); } return v; };
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        if (!pip(pl, g0 + (i + 0.5) * st, g0 + (j + 0.5) * st)) continue;
        const a = gv(i, j), b = gv(i + 1, j), c = gv(i + 1, j + 1), e = gv(i, j + 1); tri.push(a, b, c, a, c, e);
      }
      const nv = vx.length, N = nv * 2, TH = 0.007, bx = new Float32Array(N), by = new Float32Array(N), bz = new Float32Array(N), mask = new Float32Array(N), uv = new Float32Array(N * 2);
      for (let v = 0; v < N; v++) {
        const s = v < nv ? 1 : -1, k = v % nv;
        bx[v] = vx[k]; by[v] = vy[k]; bz[v] = s * TH; mask[v] = d.mask(vx[k], vy[k]); uv[v * 2] = (vx[k] + SPAN / 2) / SPAN; uv[v * 2 + 1] = (vy[k] + SPAN / 2) / SPAN;
      }
      const ind = new (N > 65535 ? Uint32Array : Uint16Array)(tri.length * 2);
      for (let i = 0; i < tri.length; i += 3) { ind.set([tri[i], tri[i + 1], tri[i + 2]], i); ind.set([tri[i] + nv, tri[i + 2] + nv, tri[i + 1] + nv], tri.length + i); }
      const geo = new T.BufferGeometry(), pos = new Float32Array(N * 3);
      geo.setAttribute("position", new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage)); geo.setAttribute("uv", new T.BufferAttribute(uv, 2)); geo.setIndex(new T.BufferAttribute(ind, 1));
      const t = new T.CanvasTexture(d.tex); t.anisotropy = 4;
      const mesh = new T.Mesh(geo, new T.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 1.6, roughness: 0.95, metalness: 0, side: T.DoubleSide }));
      mesh.name = d.name; mesh.frustumCulled = false; mesh.scale.setScalar(0.9); tilt.add(mesh);
      const c = { def: d, mesh, geo, pos, N, bx, by, bz, mask, ph: idx * 1.9 + 0.4, sp: d.sp, off: [0, 0], lag: [0, 0, 0], lagV: [0, 0, 0], lv: [0, 0, 0] };
      let x0 = 9, x1 = -9, y0 = 9, y1 = -9; // centre of the folded bundle so the stack sits where intended
      for (let v = 0; v < N; v++) { foldPt(d, [1, 1, 1], bx[v], by[v], bz[v], TMP); x0 = Math.min(x0, TMP[0]); x1 = Math.max(x1, TMP[0]); y0 = Math.min(y0, TMP[1]); y1 = Math.max(y1, TMP[1]); }
      c.off = [-(x0 + x1) / 2, -(y0 + y1) / 2];
      return c;
    }
    // This presentation focuses on the washer hardware; omit garment meshes and their per-frame cloth simulation.
    const C = [];
    function deform(c, t, act, air, f, fa, lg) {
      const d = c.def, P = c.pos, gl = 1 - fa, tt = t * 0.001, ph = c.ph, ty = d.type;
      const kx = act * 0.9 * Math.sin(tt * 0.8 + ph) * gl, ky = act * 1.25 * Math.sin(tt * 0.6 + ph * 1.3) * gl, tw = act * 1.5 * Math.sin(tt * 0.7 + ph * 2) * gl;
      const kL = ty === 1 ? act * (0.5 + 0.5 * Math.sin(tt * 1.1 + ph)) * gl : 0, kR = ty === 1 ? act * (0.5 + 0.5 * Math.sin(tt * 0.9 + ph + 1.7)) * gl : 0;
      for (let v = 0; v < c.N; v++) {
        const bx = c.bx[v], by = c.by[v], m = c.mask[v];
        let x = bx, y = by, z = c.bz[v];
        if (fa > 0) { foldPt(d, f, x, y, z, TMP); x = TMP[0] + c.off[0] * fa; y = TMP[1] + c.off[1] * fa; z = TMP[2]; }
        if (gl > 0.001) {
          z += 0.5 * (kx * x * x + ky * y * y);
          if (tw > 0.01 || tw < -0.01) { const q = tw * y, cs = Math.cos(q), sn = Math.sin(q), x2 = x * cs + z * sn; z = z * cs - x * sn; x = x2; }
          if (ty === 1) { const dk = -0.06 - y; if (dk > 0) { const wk = Math.min(1, dk / 0.06), a = (x < 0 ? kL : kR) * wk * wk * (3 - 2 * wk), cs = Math.cos(a), sn = Math.sin(a); y = -0.06 - dk * cs; z += dk * sn; } } // knees bend
          const ed = Math.min(1, (Math.abs(bx) + Math.abs(by)) / 0.45);
          const wv = Math.sin(bx * 17 + tt * 4.2 * c.sp + ph) * 0.6 + Math.sin(by * 13 - tt * 3.5 * c.sp + ph * 1.7) * 0.5;
          z += (0.3 + 0.7 * ed + m) * wv * 0.05 * act * gl + m * air * Math.sin(tt * 9 + bx * 22 + ph) * 0.03 * gl; // ripples + airflow flutter
          x += lg[0] * m * gl; y += lg[1] * m * gl; z += lg[2] * m * gl; // hems / sleeves trail
        }
        P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
      }
      c.geo.attributes.position.needsUpdate = true; c.geo.computeVertexNormals();
    }

    /* ----- water droplets + warm airflow (kept inside the drum, understated) ----- */
    const PN = 90, wpos = new Float32Array(PN * 3), apos = new Float32Array(60 * 3);
    const mkPts = (arr, col) => { const g = new T.BufferGeometry(); g.setAttribute("position", new T.BufferAttribute(arr, 3)); const m = new T.PointsMaterial({ size: 0.04, map: dotTex, color: col, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }); const p = new T.Points(g, m); p.frustumCulled = false; tilt.add(p); return p; };
    const drops = mkPts(wpos, 0xdfeaf0), airP = mkPts(apos, BRASS);
    drops.name = "Water_Droplets"; airP.name = "Airflow";

    /* ----- tumble sim state ----- */
    const RC = 0.52, HOME = [[-0.32, -0.18], [0.04, -0.36], [0.34, -0.16], [0.3, -0.42], [-0.2, -0.44]];
    const B = C.map((c, i) => ({ x: HOME[i][0], y: HOME[i][1], vx: 0, vy: 0, pvx: 0, pvy: 0, rz: c.def.rz0, wz: 0 }));
    const st = { angle: 0, rot: 0, wd: 0.12, wr: 0.1 };
    const ramp = (a, p) => { const x = clamp(p * 4 - 0.5, 0, 3), i = Math.min(3, Math.floor(x)), f = smooth(0, 1, x - i); return lerp(a[i], a[Math.min(3, i + 1)], f); };
    const qi = new T.Quaternion(), v3 = new T.Vector3();
    window.LOOP_DRUM = {
      root: group, camera, units: "1 = drum radius, origin = drum centre, +Z toward viewer",
      stages: [{ name: "Pickup", p: [0, 0.25] }, { name: "Robotic wash", p: [0.25, 0.5] }, { name: "Eco dry", p: [0.5, 0.75] }, { name: "Fold & return", p: [0.75, 1] }],
      exportGLB(cb) { if (!T.GLTFExporter) return console.warn("Load three/examples GLTFExporter (r128) to export."); new T.GLTFExporter().parse(group, cb, { binary: true }); }
    };

    return function update(t, dt) {
      const r = pin(group, anchor);
      if (!r) return;
      const s = (Math.min(r.width, r.height) / 2) * wpp * 0.84;
      const cr = section.getBoundingClientRect();
      const p = clamp(-cr.top / (cr.height - innerHeight)), R = (a) => ramp(a, p), tt = t * 0.001;
      const zoom = R([1.3, 1.08, 1.08, 1]);
      group.scale.setScalar(s * zoom); drops.material.size = 0.04 * s * zoom; airP.material.size = 0.045 * s * zoom;
      const kk = 1 - Math.exp(-dt * 3.5);
      st.wd = lerp(st.wd, R([0.12, 4.2, 1.8, 0]), kk); st.wr = lerp(st.wr, R([0.1, 5.0, 1.7, 0]), kk); // strongest rotation during robotic wash; settle for fold / return
      st.angle += st.wd * dt; st.rot += st.wr * dt;
      spin.rotation.z = st.angle; rotor.rotation.z = st.rot;
      tilt.rotation.y = -0.48 + p * 0.9 + mouse.nx * 0.04; tilt.rotation.x = 0.14 + mouse.ny * 0.04;
      const act = R([0.3, 1, 0.65, 0.2]), air = R([0, 0, 1, 0]), wash = R([0, 1, 0.25, 0]), gA = R([1.4, 3.8, 2.1, 3.2]), dragK = R([2.2, 0.7, 0.45, 1.8]);
      const pickW = 1 - smooth(0.1, 0.24, p), wS = smooth(0, 0.55, clamp(p * 4 - 3)), u3 = clamp(p * 4 - 3);
      led.color.copy(BRASS).multiplyScalar((0.3 + 0.7 * smooth(0, 0.3, Math.abs(st.wr) / 2.4)) * (0.75 + 0.25 * Math.sin(tt * 4)));

      const SUB = 2, h = dt / SUB;
      for (let q = 0; q < SUB && h > 0; q++) {
        for (let i = 0; i < B.length; i++) {
          const b = B[i];
          b.vy -= gA * h; if (air > 0 && (i === 0 || i === 2 || i === 3)) b.vy += air * 0.9 * h; // airflow lifts the light pieces
          const dg = Math.exp(-dragK * h); b.vx *= dg; b.vy *= dg;
          if (pickW > 0.001) { b.vx += (HOME[i][0] + 0.03 * Math.sin(tt * 0.7 + i * 1.9) - b.x) * 7 * pickW * h; b.vy += (HOME[i][1] + 0.025 * Math.sin(tt * 0.9 + i * 2.3) - b.y) * 7 * pickW * h; }
          const rr = Math.hypot(b.x, b.y), th = Math.atan2(b.y, b.x);
          if (Math.abs(st.wr) > 0.15 && rr > 0.3) for (let k = 0; k < 4; k++) { // paddles scoop and lift whatever sits ahead of them
            let dd = th - (st.rot + k * Math.PI / 2); dd -= TAU * Math.round(dd / TAU);
            if (dd > 0.04 && dd < 0.65) { const kv = clamp(16 * Math.min(1, (0.65 - dd) / 0.3) * Math.min(1, (dd - 0.04) / 0.1) * h); b.vx += (-b.y * st.wr - b.vx) * kv; b.vy += (b.x * st.wr - b.vy) * kv; }
          }
          if (rr > RC - 0.05 && Math.abs(st.wd) > 0.02) { const nx = b.x / rr, ny = b.y / rr, dv = (st.wd * rr - (b.vx * -ny + b.vy * nx)) * clamp(8 * h); b.vx += -ny * dv; b.vy += nx * dv; } // wall friction drags the load
          const ex = b.x / 0.36, ey = b.y / 0.25, e2 = ex * ex + ey * ey;
          if (e2 < 1) { const pu = (1 - Math.sqrt(e2)) * 18 * h / (rr + 0.02); b.vx += b.x * pu; b.vy += b.y * pu; } // keep the step number clear
          b.x += b.vx * h; b.y += b.vy * h;
          const r2 = Math.hypot(b.x, b.y);
          if (r2 > RC) { const nx = b.x / r2, ny = b.y / r2, vr = b.vx * nx + b.vy * ny; b.x = nx * RC; b.y = ny * RC; if (vr > 0) { b.vx -= nx * vr * 1.15; b.vy -= ny * vr * 1.15; } }
        }
        for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
          const dx = B[i].x - B[j].x, dy = B[i].y - B[j].y, ds = Math.hypot(dx, dy);
          if (ds < 0.27 && ds > 1e-4) { const pu = (0.27 - ds) * 6 * h / ds; B[i].vx += dx * pu; B[i].vy += dy * pu; B[j].vx -= dx * pu; B[j].vy -= dy * pu; }
        }
      }

      C.forEach((c, i) => {
        const b = B[i], d = c.def, m = c.mesh, K = d.stack;
        const f = d.folds.map((_, j) => smooth(0.03 * i + 0.15 * j, 0.03 * i + 0.15 * j + 0.3, u3)), fa = f.reduce((x, y) => x + y, 0) / f.length;
        if (dt > 0) {
          const ax = (b.vx - b.pvx) / dt, ay = (b.vy - b.pvy) / dt; b.pvx = b.vx; b.pvy = b.vy;
          const tgt = (-b.vx * 1.5 + (Math.hypot(b.x, b.y) > RC - 0.08 ? st.wd * 0.5 : 0)) * act;
          b.wz = lerp(b.wz, tgt, 1 - Math.exp(-dt * 2)); b.rz += b.wz * dt;
          b.rz = d.rz0 + ((b.rz - d.rz0 + Math.PI) % TAU + TAU) % TAU - Math.PI;
          const calm = 1 - smooth(0.25, 0.6, act); b.rz += (d.rz0 - b.rz) * calm * dt * 1.5;
          qi.copy(m.quaternion).invert();
          v3.set(ax, ay + gA * 0.6, 0).applyQuaternion(qi); // trailing: inertial spring in the garment's own frame
          for (let k = 0; k < 3; k++) { const a = k === 0 ? v3.x : k === 1 ? v3.y : v3.z; c.lagV[k] += (-a * 0.9 - 90 * c.lag[k] - 12 * c.lagV[k]) * dt; c.lag[k] = clamp(c.lag[k] + c.lagV[k] * dt, -0.08, 0.08); }
        }
        const rx = Math.sin(tt * 0.9 + c.ph) * 0.55 * act, ry = Math.cos(tt * 0.7 + c.ph * 1.3) * 0.5 * act, lane = d.lane + 0.03 * Math.sin(tt * 0.8 + c.ph * 2);
        m.position.set(lerp(b.x, K[0], wS), lerp(b.y, K[1], wS), lerp(lane, K[2], wS));
        m.rotation.set(lerp(rx, K[3], wS), lerp(ry, 0, wS), lerp(b.rz, K[4], wS));
        c.lv[0] = c.lag[0] * 1.6; c.lv[1] = c.lag[1] * 1.6; c.lv[2] = c.lag[2] * 1.6;
        if (!small || (Math.floor(t / 16) + i) % 2 === 0) deform(c, t, act, air, f, fa, c.lv);
      });

      filmMat.opacity = wash * 0.3; streak.offset.x -= st.wd * dt * 0.05;
      drops.material.opacity = wash * 0.8; airP.material.opacity = air * 0.5;
      for (let k = 0; k < PN; k++) { const a = st.angle * (1.05 + (k % 5) * 0.05) + k * 2.4, rr = 0.62 + ((k * 7) % 11) / 11 * 0.12; wpos[k * 3] = Math.cos(a) * rr; wpos[k * 3 + 1] = Math.sin(a) * rr - ((tt * 0.3 + k * 0.17) % 1) * 0.04; wpos[k * 3 + 2] = ((k * 13) % 17) / 17 * 0.8 - 0.4; }
      for (let k = 0; k < 60; k++) { apos[k * 3] = ((k * 7) % 13) / 13 * 1.0 - 0.5; apos[k * 3 + 1] = ((tt * 0.12 + k * 0.137) % 1) * 1.1 - 0.55; apos[k * 3 + 2] = ((k * 11) % 17) / 17 * 0.7 - 0.3; }
      drops.geometry.attributes.position.needsUpdate = true; airP.geometry.attributes.position.needsUpdate = true;
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

  /* ---------- 4c. retired store scene ----------
     The storefront now uses its static photograph; this legacy builder is kept out of
     the render loop so the section has no 3D model or scroll-driven store animation. */
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
