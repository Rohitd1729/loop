/* LOOP's geographic, country-addressable dot globe. Three.js r128. */
(() => {
  "use strict";
  let host = document.querySelector(".hero-globe");
  const canvas = host && host.querySelector("canvas");
  if (!host || !canvas || !window.THREE) { if (host) host.classList.add("is-fallback"); return; }

  const T = THREE, reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const R = 1, GOLD = 0xb99a66, $ = (s, root = document) => root.querySelector(s);
  let renderer, raf = 0, visible = false, disposed = false, last = 0, dragging = false;
  let previousX = 0, startX = 0, startY = 0, velocity = 0, mapPixels = null, mapWidth = 0, mapHeight = 0, countryById = new Map(), dotShader = null;
  const selectHandlers = new Set(), scene = new T.Scene();
  const camera = new T.PerspectiveCamera(32, 1, .1, 20); camera.position.z = 4.05;
  const earth = new T.Group(); scene.add(earth);

  // Layer 1: charcoal ocean shell and a restrained edge light.
  const ocean = new T.Mesh(new T.SphereGeometry(R, 52, 44), new T.MeshStandardMaterial({ color: 0x111211, metalness: .38, roughness: .46 }));
  earth.add(ocean);
  scene.add(new T.AmbientLight(0xaaa99f, .6));
  const key = new T.DirectionalLight(0xffffff, 1.6); key.position.set(-3, 2, 4); scene.add(key);
  const rim = new T.PointLight(GOLD, .7, 7); rim.position.set(2, -1, -2); scene.add(rim);

  try {
    renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); renderer.setClearColor(0x000000, 0);
  } catch (_) { host.classList.add("is-fallback"); return; }

  function resize() {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host); resize();
  const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; schedule(); }, { threshold: .01 });
  intersection.observe(host);

  // Stable geographic mapping used for both the point layer and future country picking.
  const mapImage = new Image();
  mapImage.onload = () => {
    if (disposed) return;
    const mapCanvas = document.createElement("canvas"); mapCanvas.width = mapImage.naturalWidth; mapCanvas.height = mapImage.naturalHeight;
    const mapContext = mapCanvas.getContext("2d", { willReadFrequently: true });
    mapContext.drawImage(mapImage, 0, 0); mapWidth = mapCanvas.width; mapHeight = mapCanvas.height;
    mapPixels = mapContext.getImageData(0, 0, mapWidth, mapHeight).data;
    mapCanvas.width = mapCanvas.height = 1;
    fetch("assets/globe-countries.json").then((response) => { if (!response.ok) throw new Error(response.status); return response.json(); })
      .then((data) => {
        if (disposed) return;
        countryById = new Map(data.countries.map((country) => [country.id, country]));
        createLandDots();
        createBorders();
        host.classList.remove("is-fallback"); schedule();
      }).catch(() => host.classList.add("is-fallback"));
  };
  mapImage.onerror = () => host.classList.add("is-fallback");
  mapImage.src = "assets/globe-country-ids.png";

  // Land dots use a sunflower spiral for stable, nearly even spacing from pole to pole.
  // Each point carries its Natural Earth country ID in a geometry attribute.
  function createLandDots() {
    const count = 60000, goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const positions = [], colors = [], countryIds = [], phases = [];
    for (let i = 0; i < count; i++) {
      const y = 1 - 2 * (i + .5) / count, ring = Math.sqrt(1 - y * y), theta = i * goldenAngle;
      const x = ring * Math.cos(theta), z = ring * Math.sin(theta), lat = Math.asin(y) * 180 / Math.PI;
      const lon = (Math.atan2(x, z) * 180 / Math.PI - 30 + 540) % 360 - 180;
      const px = Math.min(mapWidth - 1, Math.floor((lon + 180) / 360 * mapWidth));
      const py = Math.min(mapHeight - 1, Math.floor((90 - lat) / 180 * mapHeight));
      const offset = (py * mapWidth + px) * 4, id = mapPixels[offset] | (mapPixels[offset + 1] << 8);
      if (!id) continue;
      const r = 1.012;
      positions.push(x * r, y * r, z * r); countryIds.push(id); phases.push((i * 0.61803398875) % 1);
      // Mostly ivory, with a small number of quieter champagne-gold points.
      const gold = (i % 13) === 0, shade = gold ? .65 + (i % 4) * .07 : .76 + (i % 5) * .045;
      colors.push(shade, gold ? shade * .84 : shade * .84, gold ? shade * .58 : shade * .68);
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("aCountryId", new T.Float32BufferAttribute(countryIds, 1));
    geometry.setAttribute("aPhase", new T.Float32BufferAttribute(phases, 1));
    const material = new T.PointsMaterial({ color: 0xffffff, size: .018, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: .98, depthWrite: false });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uLoopTime = { value: 0 }; dotShader = shader;
      shader.vertexShader = "attribute float aPhase; varying float vLoopPhase;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvLoopPhase = aPhase;");
      shader.fragmentShader = "uniform float uLoopTime; varying float vLoopPhase;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\nfloat twinkle = 0.91 + 0.09 * sin(uLoopTime * 1.4 + vLoopPhase * 6.28318);\ndiffuseColor.rgb *= twinkle;");
    };
    material.userData.dotLayer = true;
    const dots = new T.Points(geometry, material); dots.frustumCulled = false; earth.add(dots);
  }

  // Layer 3: subtle country outlines, rasterized from the same 1:10m country dataset.
  function createBorders() {
    const image = new Image();
    image.onload = () => {
      if (disposed) return;
      const texture = new T.Texture(image); texture.needsUpdate = true;
      texture.wrapS = T.RepeatWrapping; texture.repeat.set(-1, 1); texture.offset.x = 7 / 6;
      const borderSphere = new T.Mesh(new T.SphereGeometry(1.006, 52, 44), new T.MeshBasicMaterial({ map: texture, transparent: true, opacity: .58, depthWrite: false, side: T.FrontSide }));
      earth.add(borderSphere); schedule();
    };
    image.src = "assets/globe-country-borders.png";
  }

  // LOOP route accents: configurable geographic endpoints, drawn as restrained great-circle arcs.
  const hubs = [
    { name: "Mumbai", lon: 72.8777, lat: 19.076 }, { name: "Pune", lon: 73.8567, lat: 18.5204 },
    { name: "Dubai", lon: 55.2708, lat: 25.2048 }, { name: "Singapore", lon: 103.8198, lat: 1.3521 }
  ];
  const toPoint = (lon, lat, radius) => {
    const la = lat * Math.PI / 180, lo = (lon + 30) * Math.PI / 180, c = Math.cos(la);
    return new T.Vector3(radius * c * Math.sin(lo), radius * Math.sin(la), radius * c * Math.cos(lo));
  };
  // Keep the city hubs as precise points; omit connecting arcs so no line crosses the Earth.
  const hubGeo = new T.BufferGeometry().setFromPoints(hubs.map((city) => toPoint(city.lon, city.lat, 1.022)));
  const hubMat = new T.PointsMaterial({ color: 0xe7e3da, size: .028, sizeAttenuation: true, transparent: true, opacity: .95, depthWrite: false });
  earth.add(new T.Points(hubGeo, hubMat));

  const raycaster = new T.Raycaster(), pointer = new T.Vector2(); raycaster.params.Points.threshold = .04;
  function countryAt(clientX, clientY) {
    if (!mapPixels) return null;
    const rect = host.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(ocean, false)[0]; if (!hit) return null;
    const local = earth.worldToLocal(hit.point.clone()), lat = Math.asin(Math.max(-1, Math.min(1, local.y / R))) * 180 / Math.PI;
    const lon = (Math.atan2(local.x, local.z) * 180 / Math.PI - 30 + 540) % 360 - 180;
    const px = Math.min(mapWidth - 1, Math.max(0, Math.floor((lon + 180) / 360 * mapWidth)));
    const py = Math.min(mapHeight - 1, Math.max(0, Math.floor((90 - lat) / 180 * mapHeight)));
    const offset = (py * mapWidth + px) * 4, id = mapPixels[offset] | (mapPixels[offset + 1] << 8);
    return countryById.get(id) || null;
  }
  const down = (e) => { if (e.button !== undefined && e.button !== 0) return; dragging = true; previousX = startX = e.clientX; startY = e.clientY; velocity = 0; host.setPointerCapture(e.pointerId); };
  const move = (e) => {
    if (!dragging) return;
    const dx = e.clientX - previousX; previousX = e.clientX; earth.rotation.y += dx * .008;
    velocity = reduced ? 0 : dx * .008 * 60; schedule();
  };
  const up = (e) => {
    if (!dragging) return; dragging = false;
    if (Math.hypot(e.clientX - startX, e.clientY - startY) < 6) {
      const country = countryAt(e.clientX, e.clientY);
      if (country) selectHandlers.forEach((handler) => handler(country));
      if (country) host.dispatchEvent(new CustomEvent("loopcountryselect", { bubbles: true, detail: country }));
    }
    if (Math.abs(velocity) > .001) schedule();
  };
  host.addEventListener("pointerdown", down); host.addEventListener("pointermove", move);
  host.addEventListener("pointerup", up); host.addEventListener("pointercancel", up); host.addEventListener("lostpointercapture", () => { dragging = false; });
  const onVisibility = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else schedule(); };
  document.addEventListener("visibilitychange", onVisibility);

  function schedule() { if (!raf && visible && !document.hidden && !disposed) raf = requestAnimationFrame(tick); }
  function tick(now) {
    raf = 0; if (disposed || !visible || document.hidden) return;
    const dt = Math.min(.05, last ? (now - last) / 1000 : .016); last = now;
    if (!dragging) { if (!reduced) earth.rotation.y += dt * .16; earth.rotation.y += velocity * dt; velocity *= Math.exp(-2.4 * dt); }
    if (dotShader) dotShader.uniforms.uLoopTime.value = now * .001;
    renderer.render(scene, camera);
    if (!reduced || dragging || Math.abs(velocity) > .001) schedule();
  }

  // The host itself can later be reparented into a larger viewport without rebuilding the globe.
  function moveTo(target, duration = 850) {
    if (!target || !(target instanceof Element)) return Promise.reject(new TypeError("moveTo expects a container element"));
    const from = host.getBoundingClientRect(); target.appendChild(host);
    const to = target.getBoundingClientRect();
    Object.assign(host.style, { position: "fixed", left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, margin: "0", zIndex: "20", transition: "none" });
    void host.offsetWidth;
    Object.assign(host.style, { transition: `left ${duration}ms cubic-bezier(.2,.7,.1,1), top ${duration}ms cubic-bezier(.2,.7,.1,1), width ${duration}ms cubic-bezier(.2,.7,.1,1), height ${duration}ms cubic-bezier(.2,.7,.1,1)`, left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` });
    resize(); schedule();
    return new Promise((resolve) => setTimeout(() => {
      Object.assign(host.style, { position: "absolute", inset: "0", left: "0", top: "0", width: "100%", height: "100%", margin: "0", zIndex: "2", transition: "" });
      resize(); resolve();
    }, duration));
  }
  window.LOOP_GLOBE = {
    moveTo,
    onCountrySelect(handler) { selectHandlers.add(handler); return () => selectHandlers.delete(handler); },
    pause() { visible = false; cancelAnimationFrame(raf); raf = 0; },
    resume() { visible = true; schedule(); },
    getCountryAt: countryAt,
    getOrientation() { return { x: earth.rotation.x, y: earth.rotation.y, z: earth.rotation.z }; },
    setOrientation({ x = earth.rotation.x, y = earth.rotation.y, z = earth.rotation.z } = {}) { earth.rotation.set(x, y, z); schedule(); },
    getCountryIndex() { return [...countryById.values()]; }
  };

  const onWebGLLost = (e) => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; host.classList.add("is-fallback"); };
  const onWebGLRestored = () => { host.classList.remove("is-fallback"); schedule(); };
  host.addEventListener("webglcontextlost", onWebGLLost); host.addEventListener("webglcontextrestored", onWebGLRestored);
  const observer = new MutationObserver(() => {
    if (host.isConnected) return;
    disposed = true; cancelAnimationFrame(raf); resizeObserver.disconnect(); intersection.disconnect(); observer.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    host.removeEventListener("pointerdown", down); host.removeEventListener("pointermove", move);
    host.removeEventListener("pointerup", up); host.removeEventListener("pointercancel", up);
    scene.traverse((object) => { if (object.geometry) object.geometry.dispose(); if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => { if (material.map) material.map.dispose(); material.dispose(); }); });
    renderer.dispose(); delete window.LOOP_GLOBE;
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
