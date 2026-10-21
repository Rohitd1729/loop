/* ==========================================================================
   LOOP — WEBSITE CONTENT
   --------------------------------------------------------------------------
   Every word, number and update on the website lives in this one file.
   To change the site: edit the text between the quotes, save, refresh.

   Rules so nothing breaks:
   - Keep the quotes "..." around text.
   - Keep the comma at the end of each line / block.
   ========================================================================== */

window.LOOP_CONTENT = {

  hero: {
    eyebrow: "The robotic laundry revolution",
    tagline: "The Fabric Future",
    /* Looping video shown inside the first O of the big logo (black background, square).
       Replace the file to change the animation; set to "" for a plain ring. */
    o1Video: "assets/o1-handshake.mp4",
    headline: "Laundry, re-engineered for the next hundred years.",
    sub: "AI-powered machines, eco fabric care and a 24/7 automated system — designed so your clothes come back better than they left.",
    primary: { label: "Get early access", href: "#contact" },
    secondary: { label: "Own a LOOP franchise", href: "#franchise" }
  },

  /* Scrolling ticker */
  marquee: ["Premium", "Robotic", "Sustainable", "Global", "24/7 Automated", "Low Water", "Low Energy", "AI Powered"],

  /* Cities floating behind the big LOOP logo, drawn as robotic line art.
     Up to 8. The first 4 also show on phones.
     monument must be one of: gateway, shaniwarwada, burjkhalifa, marinabay,
     indiagate, eiffel, bigben, opera */
  heroCities: [
    { city: "Mumbai", monument: "gateway", coords: "18.92° N · 72.83° E", tag: "Launch" },
    { city: "Pune", monument: "shaniwarwada", coords: "18.52° N · 73.86° E", tag: "Launch" },
    { city: "Dubai", monument: "burjkhalifa", coords: "25.20° N · 55.27° E", tag: "Next" },
    { city: "Singapore", monument: "marinabay", coords: "1.28° N · 103.86° E", tag: "Next" },
    { city: "New Delhi", monument: "indiagate", coords: "28.61° N · 77.23° E", tag: "Global" },
    { city: "Paris", monument: "eiffel", coords: "48.86° N · 2.29° E", tag: "Global" },
    { city: "London", monument: "bigben", coords: "51.50° N · 0.12° W", tag: "Global" },
    { city: "Sydney", monument: "opera", coords: "33.86° S · 151.22° E", tag: "Global" }
  ],

  /* "One world" globe tour — the globe spins to each city in this order and shows
     its card (city name behind the monument). Add, remove or reorder freely.
     lat / lon: decimal degrees (south and west are negative).
     tag:       short status shown on the card.
     monument:  line-art placeholder — gateway, shaniwarwada, burjkhalifa, marinabay, indiagate,
                eiffel, bigben, opera, empire, cntower, goldengate, tokyotower, pearl, bankofchina
     image:     optional cut-out photo of the landmark (transparent background, no text in the image),
                e.g. "assets/cities/dubai.webp". When set it replaces the line-art. The city name is
                drawn by the website behind the photo, so it can animate. Tall vs wide landmarks are
                detected from the image shape automatically. Keep images small (WebP, ~800px). */
  network: {
    cities: [
      { city: "Mumbai", lat: 19.076, lon: 72.8777, tag: "Launch", monument: "gateway", image: "assets/cities/mumbai.webp" },
      { city: "Pune", lat: 18.5204, lon: 73.8567, tag: "Launch", monument: "shaniwarwada", image: "assets/cities/pune.webp" },
      { city: "Dubai", lat: 25.2048, lon: 55.2708, tag: "Next", monument: "burjkhalifa", image: "assets/cities/dubai.webp" },
      { city: "London", lat: 51.5072, lon: -0.1276, tag: "Expansion", monument: "bigben", image: "assets/cities/london.webp" },
      { city: "Paris", lat: 48.8566, lon: 2.3522, tag: "Expansion", monument: "eiffel", image: "assets/cities/paris.webp" },
      { city: "New York", lat: 40.7128, lon: -74.006, tag: "Expansion", monument: "empire", image: "assets/cities/new-york.webp" },
      { city: "Toronto", lat: 43.6532, lon: -79.3832, tag: "Expansion", monument: "cntower", image: "assets/cities/toronto.webp" },
      { city: "San Francisco", lat: 37.7749, lon: -122.4194, tag: "Expansion", monument: "goldengate", image: "assets/cities/san-francisco.webp" },
      { city: "Tokyo", lat: 35.6762, lon: 139.6503, tag: "Expansion", monument: "tokyotower", image: "assets/cities/tokyo.webp" },
      { city: "Shanghai", lat: 31.2304, lon: 121.4737, tag: "Expansion", monument: "pearl", image: "assets/cities/shanghai.webp" },
      { city: "Hong Kong", lat: 22.3193, lon: 114.1694, tag: "Expansion", monument: "bankofchina", image: "assets/cities/hong-kong.webp" },
      { city: "Singapore", lat: 1.3521, lon: 103.8198, tag: "Next", monument: "marinabay", image: "assets/cities/singapore.webp" },
      { city: "Sydney", lat: -33.8688, lon: 151.2093, tag: "Expansion", monument: "opera", image: "assets/cities/sydney.webp" }
    ]
  },

  /* "The Loop" — the four-step cycle with the morphing shape */
  cycle: {
    eyebrow: "How it works",
    title: "One loop. Four moves.",
    steps: [
      { title: "Pickup", text: "Schedule in seconds. Your bag is collected from your door and tagged to you." },
      { title: "Robotic wash", text: "AI-sorted by fabric and colour, then washed in self-cleaning machines tuned for each load." },
      { title: "Eco dry", text: "Low-water, low-energy drying that protects fibres instead of baking them." },
      { title: "Fold & return", text: "Pressed, folded, sealed and delivered back. The loop closes — until next time." }
    ]
  },

  /* Three brand pillars (from the brochure) */
  pillars: [
    { title: "Robotic laundry tech", text: "AI-guided wash cycles, self-cleaning machines and around-the-clock automated care.", code: "SYS-01" },
    { title: "Sustainable & efficient", text: "Low water, low energy, eco fabric care.", code: "ECO-02" },
    { title: "Global support", text: "Operations, training and marketing — 360° franchise support.", code: "NET-03" }
  ],

  /* Services list — edit freely */
  services: [
    { name: "Wash & Fold", text: "Everyday clothes, machine-perfect and folded to a standard." },
    { name: "Premium Dry Clean", text: "Suits, silks, sarees and delicates handled fibre-first." },
    { name: "Steam Press", text: "Crisp, crease-free finishing without scorched fabric." },
    { name: "Home Linen", text: "Bedsheets, curtains and towels cleaned at scale." },
    { name: "Express Loop", text: "Same-day turnaround when you need it back fast." }
  ],

  /* Big numbers. `value` must be a number; prefix/suffix are optional. */
  stats: [
    { prefix: "", value: 24, suffix: "/7", label: "Automated operation" },
    { prefix: "", value: 4, suffix: "", label: "Launch cities" },
    { prefix: "₹", value: 3.5, suffix: "L", decimals: 1, label: "Franchise investment" },
    { prefix: "", value: 9, suffix: " mo", label: "Target ROI window (6–9)" }
  ],

  store: {
    eyebrow: "The LOOP store",
    title: "One store format. Every city.",
    text: "Every LOOP store is built to a single specification: a glass-front retail space, commercial-grade automated machines and a staffed service counter. Customers get the same standard of care in Mumbai, Dubai or Singapore.",
    image: "assets/storefront.jpg"
  },

  franchise: {
    eyebrow: "Global franchise opportunity",
    title: "Join the Fabric Future.",
    text: "Partner with LOOP and run a tech-driven laundry built on a proven model.",
    includes: [
      "Turnkey store setup",
      "Premium equipment & tech",
      "Brand & marketing support",
      "Proven business model",
      "Ongoing R&D & innovation"
    ],
    investment: "₹3.5 Lakh",
    roi: "6–9 months",
    note: "Indicative figures. Final numbers depend on location and format.",
    cta: { label: "Apply for a franchise", href: "#contact" }
  },

  /* Updates and the top announcement bar are NOT here any more.
     The owner edits them from his phone at https://app.pagescms.org
     (they are stored in content/updates.json). */

  contact: {
    title: "Start the loop.",
    phones: ["+91 95956 00006", "+91 98200 87114"],
    whatsapp: "919595600006",          /* number used by the form, no + or spaces */
    emails: ["hello@loopfabric.com", "support@loopfabric.com"],
    website: "www.loopfabric.com",
    socials: [
      { label: "Instagram", handle: "@loop.fabricfuture", href: "https://instagram.com/loop.fabricfuture" },
      { label: "Facebook", handle: "/loopfabricfuture", href: "https://facebook.com/loopfabricfuture" },
      { label: "X", handle: "@loopfabric", href: "https://x.com/loopfabric" }
    ]
  },

  cities: ["Mumbai", "Pune", "Dubai", "Singapore", "Global"],

  footer: {
    values: ["Premium", "Robotic", "Global", "National", "International"],
    line: "© LOOP — All rights reserved. Unstoppable Legacy Brand Vision."
  }
};
