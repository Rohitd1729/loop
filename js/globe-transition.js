/* One live globe travels from the hero wordmark into the global-network scene. */
(() => {
  "use strict";
  const globe = document.querySelector(".hero-globe");
  const hero = document.querySelector(".hero");
  const scene = document.querySelector(".global-network");
  const destination = document.querySelector(".global-network__globe-slot");
  if (!globe || !hero || !scene || !destination) return;

  // Keep the first O's exact footprint as the source anchor while the same canvas
  // is portalled to the viewport layer. No second WebGL renderer is created.
  const source = document.createElement("span");
  source.className = "hero-globe-anchor";
  source.setAttribute("aria-hidden", "true");
  globe.replaceWith(source);
  document.body.appendChild(globe);
  // The normal reveal selector depends on .is-live being an ancestor inside the
  // hero. The globe now lives in the viewport portal, so carry its visible state.
  globe.classList.add("is-live");

  let frame = 0;
  const clamp = (value) => Math.max(0, Math.min(1, value));
  const update = () => {
    frame = 0;
    const from = source.getBoundingClientRect();
    const to = destination.getBoundingClientRect();
    const viewport = window.innerHeight || document.documentElement.clientHeight;
    const progress = clamp((viewport - scene.getBoundingClientRect().top) / (viewport * .92));
    const centerX = from.left + from.width / 2 + (to.left + to.width / 2 - from.left - from.width / 2) * progress;
    const centerY = from.top + from.height / 2 + (to.top + to.height / 2 - from.top - from.height / 2) * progress;
    const scaleX = from.width ? from.width / to.width + (1 - from.width / to.width) * progress : 1;
    const scaleY = from.height ? from.height / to.height + (1 - from.height / to.height) * progress : 1;

    globe.style.width = `${to.width}px`;
    globe.style.height = `${to.height}px`;
    globe.style.transform = `translate3d(${centerX}px, ${centerY}px, 0) translate(-50%, -50%) scale(${scaleX}, ${scaleY})`;
    hero.classList.toggle("is-globe-leaving", progress > .035);
    scene.classList.toggle("is-arrived", progress > .94);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };

  Object.assign(globe.style, {
    position: "fixed", inset: "auto", left: "0", top: "0", zIndex: "55",
    margin: "0", transformOrigin: "center center", willChange: "transform, width, height"
  });
  update();
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  window.addEventListener("orientationchange", schedule, { passive: true });
  window.addEventListener("pageshow", schedule);
  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(schedule);
    observer.observe(source);
    observer.observe(destination);
  }
})();
