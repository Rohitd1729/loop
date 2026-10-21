/* LOOP's geographic, black-and-white dot globe. Three.js r128.
   A factory so the same build can power several instances (the hero wordmark's
   first O, and the large globe in the network section). Geographic data is loaded
   once and shared. Each instance exposes a small API, incl. a city-tour used by
   js/network.js to spin to each LOOP city in turn. */
(() => {
  "use strict";
  const hosts = [...document.querySelectorAll(".hero-globe, .network-globe")];
  if (!window.THREE) { hosts.forEach((h) => h.classList.add("is-fallback")); return; }

  const T = THREE, reduced = matchMedia("(prefers-reduced-motion: reduce)").matches, small = innerWidth < 760;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrap = (a) => { a %= Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2; if (a < -Math.PI) a += Math.PI * 2; return a; };

  // LOOP cities, in tour order (content.js → network.cities). lon/lat drive the pins and rotation targets.
  const listed = ((window.LOOP_CONTENT || {}).network || {}).cities;
  const CITIES = (Array.isArray(listed) && listed.length ? listed : [
    { city: "Mumbai", lon: 72.8777, lat: 19.076, tag: "Launch", monument: "gateway" },
    { city: "Pune", lon: 73.8567, lat: 18.5204, tag: "Launch", monument: "shaniwarwada" },
    { city: "Dubai", lon: 55.2708, lat: 25.2048, tag: "Next", monument: "burjkhalifa" },
    { city: "Singapore", lon: 103.8198, lat: 1.3521, tag: "Next", monument: "marinabay" }
  ]).filter((c) => c && c.city && isFinite(c.lat) && isFinite(c.lon)).map((c) => Object.assign({}, c, { name: c.city, lat: +c.lat, lon: +c.lon }));
  const toPoint = (lon, lat, radius) => {
    const la = lat * Math.PI / 180, lo = (lon + 30) * Math.PI / 180, c = Math.cos(la);
    return new T.Vector3(radius * c * Math.sin(lo), radius * Math.sin(la), radius * c * Math.cos(lo));
  };

  /* ---------- shared geographic data (loaded once) ---------- */
  let mapPixels = null, mapWidth = 0, mapHeight = 0, countryById = new Map();
  let geoState = "loading"; const geoWaiters = [];
  const onGeo = (cb) => { geoState === "ready" ? cb() : geoState === "loading" && geoWaiters.push(cb); };
  (function loadGeo() {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext("2d", { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
        mapWidth = c.width; mapHeight = c.height; mapPixels = ctx.getImageData(0, 0, mapWidth, mapHeight).data;
        c.width = c.height = 1;
      } catch (_) { geoState = "error"; return; }
      fetch("assets/globe-countries.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then((data) => { countryById = new Map(data.countries.map((x) => [x.id, x])); geoState = "ready"; geoWaiters.splice(0).forEach((cb) => cb()); })
        .catch(() => { geoState = "error"; });
    };
    img.onerror = () => { geoState = "error"; };
    img.src = "assets/globe-country-ids.png";
  })();

  let bordersImg = null, bordersState = "loading"; const borderWaiters = [];
  const onBorders = (cb) => { bordersState === "ready" ? cb(bordersImg) : bordersState === "loading" && borderWaiters.push(cb); };
  (function loadBorders() {
    const img = new Image();
    img.onload = () => { bordersImg = img; bordersState = "ready"; borderWaiters.splice(0).forEach((cb) => cb(img)); };
    img.onerror = () => { bordersState = "error"; };
    img.src = "assets/globe-country-borders.png";
  })();

  // Soft ring sprite used to pulse the active city pin.
  const ringTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
    g.strokeStyle = "rgba(255,255,255,1)"; g.lineWidth = 5; g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke();
    return new T.CanvasTexture(c);
  })();

  /* ---------- one globe instance ---------- */
  function createGlobe(host, opts = {}) {
    let canvas = host.querySelector("canvas");
    if (!canvas) { canvas = document.createElement("canvas"); canvas.className = "hero-globe__canvas"; canvas.setAttribute("aria-hidden", "true"); host.appendChild(canvas); }
    const R = 1, pointCount = opts.pointCount || (small ? 24000 : 60000);
    let renderer, raf = 0, visible = false, disposed = false, last = 0, dragging = false;
    let previousX = 0, startX = 0, startY = 0, velocity = 0, dotShader = null;
    let autoSpin = opts.autoSpin !== false, spinSpeed = opts.spinSpeed || 0.16;
    let target = null, onArrive = null;
    const selectHandlers = new Set();
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(32, 1, .1, 20); camera.position.z = 4.05; camera.updateMatrixWorld();
    const earth = new T.Group(); scene.add(earth);

    const ocean = new T.Mesh(new T.SphereGeometry(R, 52, 44), new T.MeshStandardMaterial({ color: 0x141414, metalness: .38, roughness: .46 }));
    earth.add(ocean);
    scene.add(new T.AmbientLight(0xb4b8bc, .72));
    const key = new T.DirectionalLight(0xffffff, 1.7); key.position.set(-3, 2, 4); scene.add(key);
    const rim = new T.PointLight(0xc2c6ca, .7, 7); rim.position.set(2, -1, -2); scene.add(rim);

    try {
      renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.25 : 1.5)); renderer.setClearColor(0x000000, 0);
    } catch (_) { host.classList.add("is-fallback"); return null; }

    function resize() {
      const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); schedule();
    }
    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host);
    const intersection = new IntersectionObserver(([e]) => { visible = e.isIntersecting; schedule(); }, { threshold: .01 });
    intersection.observe(host);

    function createLandDots() {
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      const positions = [], colors = [], countryIds = [], phases = [];
      for (let i = 0; i < pointCount; i++) {
        const y = 1 - 2 * (i + .5) / pointCount, ring = Math.sqrt(1 - y * y), theta = i * goldenAngle;
        const x = ring * Math.cos(theta), z = ring * Math.sin(theta), lat = Math.asin(y) * 180 / Math.PI;
        const lon = (Math.atan2(x, z) * 180 / Math.PI - 30 + 540) % 360 - 180;
        const px = Math.min(mapWidth - 1, Math.floor((lon + 180) / 360 * mapWidth));
        const py = Math.min(mapHeight - 1, Math.floor((90 - lat) / 180 * mapHeight));
        const off = (py * mapWidth + px) * 4, id = mapPixels[off] | (mapPixels[off + 1] << 8);
        if (!id) continue;
        const r = 1.012;
        positions.push(x * r, y * r, z * r); countryIds.push(id); phases.push((i * 0.61803398875) % 1);
        // Brighter, neutral black-and-white land dots; roughly every 11th point is pushed to full white.
        const bright = (i % 11) === 0, shade = bright ? 1 : .82 + (i % 5) * .036;
        colors.push(shade, shade, shade);
      }
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
      g.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
      g.setAttribute("aCountryId", new T.Float32BufferAttribute(countryIds, 1));
      g.setAttribute("aPhase", new T.Float32BufferAttribute(phases, 1));
      const material = new T.PointsMaterial({ color: 0xffffff, size: opts.dotSize || .02, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 1, depthWrite: false });
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uLoopTime = { value: 0 }; dotShader = shader;
        shader.vertexShader = "attribute float aPhase; varying float vLoopPhase;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvLoopPhase = aPhase;");
        shader.fragmentShader = "uniform float uLoopTime; varying float vLoopPhase;\n" + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\nfloat twinkle = 0.91 + 0.09 * sin(uLoopTime * 1.4 + vLoopPhase * 6.28318);\ndiffuseColor.rgb *= twinkle;");
      };
      const dots = new T.Points(g, material); dots.frustumCulled = false; earth.add(dots);
    }
    function createBorders(img) {
      const texture = new T.Texture(img); texture.needsUpdate = true;
      texture.wrapS = T.RepeatWrapping; texture.repeat.set(-1, 1); texture.offset.x = 7 / 6;
      const sphere = new T.Mesh(new T.SphereGeometry(1.006, 52, 44), new T.MeshBasicMaterial({ map: texture, transparent: true, opacity: .66, depthWrite: false, side: T.FrontSide }));
      earth.add(sphere); schedule();
    }

    // city pins + a pulsing ring on the active pin
    const pinGeo = new T.BufferGeometry().setFromPoints(CITIES.map((c) => toPoint(c.lon, c.lat, 1.022)));
    const pinMat = new T.PointsMaterial({ color: 0xffffff, size: opts.hubSize || .032, sizeAttenuation: true, transparent: true, opacity: 1, depthWrite: false });
    earth.add(new T.Points(pinGeo, pinMat));
    // one pulsing ring per city (shown while that city has a tile in js/network.js)
    const pinLocal = CITIES.map((c) => toPoint(c.lon, c.lat, 1.03));
    const pulses = pinLocal.map((p) => {
      const s = new T.Sprite(new T.SpriteMaterial({ map: ringTex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
      s.position.copy(p); s.visible = false; earth.add(s); return s;
    });
    const active = new Set(), frameCbs = new Set(), wv = new T.Vector3();
    const states = CITIES.map(() => ({ x: 0, y: 0, a: 0, front: false }));
    // starting pose: axis tilted toward the viewer, a chosen longitude facing front
    if (opts.tilt) earth.rotation.x = opts.tilt;
    if (opts.startLon != null) { const p = toPoint(opts.startLon, 0, 1); earth.rotation.y = -Math.atan2(p.x, p.z); }

    onGeo(() => { if (disposed) return; createLandDots(); host.classList.remove("is-fallback"); schedule(); });
    onBorders((img) => { if (!disposed && img) createBorders(img); });
    if (geoState === "error") host.classList.add("is-fallback");
    resize();

    /* ---------- picking ---------- */
    const raycaster = new T.Raycaster(), pointer = new T.Vector2(); raycaster.params.Points.threshold = .04;
    function countryAt(clientX, clientY) {
      if (!mapPixels) return null;
      const rect = host.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(ocean, false)[0]; if (!hit) return null;
      const local = earth.worldToLocal(hit.point.clone()), lat = Math.asin(clamp(local.y / R, -1, 1)) * 180 / Math.PI;
      const lon = (Math.atan2(local.x, local.z) * 180 / Math.PI - 30 + 540) % 360 - 180;
      const px = Math.min(mapWidth - 1, Math.max(0, Math.floor((lon + 180) / 360 * mapWidth)));
      const py = Math.min(mapHeight - 1, Math.max(0, Math.floor((90 - lat) / 180 * mapHeight)));
      const off = (py * mapWidth + px) * 4, id = mapPixels[off] | (mapPixels[off + 1] << 8);
      return countryById.get(id) || null;
    }

    /* ---------- drag ---------- */
    // A drag interrupts a tour rotation; on release the globe resumes heading to that city.
    let heldTarget = null;
    const down = (e) => { if (e.button !== undefined && e.button !== 0) return; dragging = true; if (target) heldTarget = target; target = null; previousX = startX = e.clientX; startY = e.clientY; velocity = 0; host.setPointerCapture(e.pointerId); };
    const move = (e) => { if (!dragging) return; const dx = e.clientX - previousX; previousX = e.clientX; earth.rotation.y += dx * .008; velocity = reduced ? 0 : dx * .008 * 60; schedule(); };
    const up = (e) => {
      if (!dragging) return; dragging = false;
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < 6) {
        const country = countryAt(e.clientX, e.clientY);
        if (country) { selectHandlers.forEach((h) => h(country)); host.dispatchEvent(new CustomEvent("loopcountryselect", { bubbles: true, detail: country })); }
      }
      if (heldTarget && onArrive) { target = heldTarget; velocity = 0; }
      heldTarget = null;
      schedule();
    };
    host.addEventListener("pointerdown", down); host.addEventListener("pointermove", move);
    host.addEventListener("pointerup", up); host.addEventListener("pointercancel", up); host.addEventListener("lostpointercapture", up);
    const onVisibility = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else schedule(); };
    document.addEventListener("visibilitychange", onVisibility);

    /* ---------- loop ---------- */
    function schedule() { if (!raf && visible && !document.hidden && !disposed) raf = requestAnimationFrame(tick); }
    function tick(now) {
      raf = 0; if (disposed || !visible || document.hidden) return;
      const dt = Math.min(.05, last ? (now - last) / 1000 : .016); last = now;
      if (dragging) { /* handled in move */ }
      else if (target) {
        const k = 1 - Math.exp(-5 * dt);
        earth.rotation.y += wrap(target.y - earth.rotation.y) * k;
        earth.rotation.x += (target.x - earth.rotation.x) * k;
        if (Math.abs(wrap(target.y - earth.rotation.y)) < .004 && Math.abs(target.x - earth.rotation.x) < .004) {
          earth.rotation.y = target.y; earth.rotation.x = target.x; target = null;
          const cb = onArrive; onArrive = null; if (cb) cb();
        }
      } else {
        if (autoSpin && !reduced) earth.rotation.y += dt * spinSpeed;
        earth.rotation.y += velocity * dt; velocity *= Math.exp(-2.4 * dt);
      }
      if (dotShader) dotShader.uniforms.uLoopTime.value = now * .001;
      // where every city pin is this frame: a = angle from the front meridian (−left … +right),
      // x/y = viewport position. Reported to onFrame listeners after the render.
      let rect = null;
      if (frameCbs.size || active.size) {
        earth.updateMatrixWorld();
        if (frameCbs.size) rect = host.getBoundingClientRect();
        for (let i = 0; i < CITIES.length; i++) {
          const st = states[i]; wv.copy(pinLocal[i]).applyMatrix4(earth.matrixWorld);
          st.a = Math.atan2(wv.x, wv.z); st.front = wv.z > 0;
          if (rect) { wv.project(camera); st.x = rect.left + (wv.x * .5 + .5) * rect.width; st.y = rect.top + (-wv.y * .5 + .5) * rect.height; }
        }
      }
      const beat = (Math.sin(now * .005) + 1) / 2;
      pulses.forEach((s, i) => {
        const on = active.has(i) && states[i].front;
        s.visible = on;
        if (on) { s.scale.setScalar(.07 + beat * .07); s.material.opacity = .3 + beat * .5; }
      });
      renderer.render(scene, camera);
      if (rect) frameCbs.forEach((cb) => cb(states, rect));
      const busy = !reduced ? (autoSpin || target || active.size > 0) : (dragging || target);
      if (busy || Math.abs(velocity) > .001) schedule();
    }

    /* ---------- tour helpers ---------- */
    function cityTarget(i) {
      const p = toPoint(CITIES[i].lon, CITIES[i].lat, 1);
      return { x: Math.asin(clamp(p.y, -1, 1)) * 0.9, y: -Math.atan2(p.x, p.z) };
    }
    function cityScreen(i) {
      earth.updateWorldMatrix(true, false);
      const w = toPoint(CITIES[i].lon, CITIES[i].lat, 1.03).applyMatrix4(earth.matrixWorld);
      const front = w.z > 0;
      const v = w.clone().project(camera);
      const rect = host.getBoundingClientRect();
      return { x: rect.left + (v.x * .5 + .5) * rect.width, y: rect.top + (-v.y * .5 + .5) * rect.height, front };
    }

    const onWebGLLost = (e) => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; host.classList.add("is-fallback"); };
    const onWebGLRestored = () => { host.classList.remove("is-fallback"); schedule(); };
    host.addEventListener("webglcontextlost", onWebGLLost); host.addEventListener("webglcontextrestored", onWebGLRestored);
    const mo = new MutationObserver(() => {
      if (host.isConnected) return;
      disposed = true; cancelAnimationFrame(raf); resizeObserver.disconnect(); intersection.disconnect(); mo.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); });
      renderer.dispose();
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return {
      cities: CITIES,
      onCountrySelect(h) { selectHandlers.add(h); return () => selectHandlers.delete(h); },
      pause() { visible = false; cancelAnimationFrame(raf); raf = 0; },
      resume() { visible = true; schedule(); },
      setAutoSpin(on) { autoSpin = on; schedule(); },
      // Spin the globe so city i faces the camera; resolves when it settles.
      rotateToCity(i, { spinWhileMoving = false } = {}) {
        return new Promise((resolve) => { autoSpin = spinWhileMoving; target = cityTarget(i); onArrive = resolve; schedule(); });
      },
      setActiveCities(list) { active.clear(); (list || []).forEach((i) => active.add(i)); schedule(); },
      // cb(states, hostRect) after every rendered frame; returns an unsubscribe function
      onFrame(cb) { frameCbs.add(cb); schedule(); return () => frameCbs.delete(cb); },
      getCityScreen: cityScreen,
      getCountryAt: countryAt,
      getOrientation() { return { x: earth.rotation.x, y: earth.rotation.y, z: earth.rotation.z }; },
      setOrientation({ x = earth.rotation.x, y = earth.rotation.y, z = earth.rotation.z } = {}) { earth.rotation.set(x, y, z); schedule(); }
    };
  }

  // Hero wordmark O: a compact brand-mark globe. Network section: the large tour globe.
  const heroHost = document.querySelector(".hero-globe");
  if (heroHost) window.LOOP_GLOBE = createGlobe(heroHost, { pointCount: small ? 9000 : 16000, dotSize: .024, hubSize: .04, spinSpeed: .14 });
  const netHost = document.querySelector(".network-globe");
  // spinSpeed .23 rad/s: a city crosses network.js's ±0.38 rad front window in ~3.4 s
  if (netHost) window.LOOP_GLOBE_NETWORK = createGlobe(netHost, { pointCount: small ? 24000 : 60000, dotSize: .02, hubSize: .034, spinSpeed: .23, tilt: .28, startLon: 84 });
})();
