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
    eyebrow: "The Robotic Laundry Revolution",
    tagline: "The Fabric Future",
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
    { title: "Robotic laundry tech", text: "AI-powered, self-cleaning, 24/7 automated systems.", code: "SYS-01" },
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
    eyebrow: "Store concept",
    title: "Engineered like a lab. Warm like home.",
    text: "Every LOOP store follows one design system — glass, black and light — so the brand feels the same in Mumbai, Dubai or Singapore.",
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
