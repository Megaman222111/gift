// Neyali’s Cozy Room — tiny pixel-art canvas game (no libraries).
// Controls: WASD / arrows. Click objects for dialogue.

/** @typedef {{x:number,y:number,w:number,h:number}} Rect */

const canvas = document.getElementById("game");
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));

// Crisp pixels.
ctx.imageSmoothingEnabled = false;

const W = canvas.width;
const H = canvas.height;

// ---------- Helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// Force an integer CSS scale so pixel text isn't blurry.
function applyPixelPerfectScale() {
  const shell = canvas.parentElement;
  const maxWidth = shell ? shell.clientWidth : window.innerWidth;
  // Leave a tiny breathing room for padding/borders.
  const available = Math.max(1, maxWidth - 8);
  const scale = clamp(Math.floor(available / W), 1, 8);
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
}

window.addEventListener("resize", applyPixelPerfectScale);
applyPixelPerfectScale();

/** @param {Rect} a @param {Rect} b */
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** @param {number} x @param {number} y @param {Rect} r */
function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function nowMs() {
  return performance.now();
}

function hexToRgb(hex) {
  const h = hex.replace("#", "").trim();
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgba(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// ---------- Input ----------
const keys = new Set();
window.addEventListener("keydown", (e) => {
  keys.add(e.key.toLowerCase());
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(e.key.toLowerCase())) {
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

// ---------- Dialogue ----------
const dialogue = {
  open: false,
  title: "",
  lines: /** @type {string[]} */ ([]),
  wrappedLines: /** @type {string[]} */ ([]),
  page: 0,
  maxLinesPerPage: 3,
  maxPage: 0,
  charFx: 0,
};

// ---------- Poem book (scrollable) ----------
const poemBook = {
  open: false,
  poemIndex: 0,
  scrollY: 0,
  maxScrollY: 0,
  wrapped: /** @type {string[]} */ ([]),
};

const poemsByMegh = [
  {
    title: "The Cutest of Them All",
    text:
      "When she walks with her cute little demeanour,\n" +
      "and she gets sassy and gets a little bit meaner,\n" +
      "And when I see her, when I hope that I'm not just a dreamer\n" +
      "I realize that she's just the cutest and prettiest of them all.\n"
  },
];

function openPoemBook() {
  poemBook.open = true;
  poemBook.poemIndex = clamp(poemBook.poemIndex, 0, poemsByMegh.length - 1);
  poemBook.scrollY = 0;
  recomputePoemWrap();
}

function closePoemBook() {
  poemBook.open = false;
}

function poemPanelRect() {
  // Slightly larger for a nicer layout.
  return { x: 16, y: 12, w: W - 32, h: H - 24 };
}

function poemSidebarRect() {
  const p = poemPanelRect();
  return { x: p.x + 10, y: p.y + 32, w: 86, h: p.h - 46 };
}

function poemViewportRect() {
  const p = poemPanelRect();
  const s = poemSidebarRect();
  // Main "page" area to the right of the sidebar.
  return { x: s.x + s.w + 10, y: s.y, w: (p.x + p.w - 10) - (s.x + s.w + 10), h: s.h };
}

function wrapTextForWidth(text, maxWidth) {
  const rawLines = (text ?? "").toString().split("\n");
  /** @type {string[]} */
  const out = [];
  for (const line of rawLines) {
    if (line.trim() === "") {
      out.push("");
      continue;
    }
    const parts = wrapLineToWidth(line, maxWidth);
    for (const p of parts) out.push(p);
  }
  return out;
}

function recomputePoemWrap() {
  ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  const v = poemViewportRect();
  const maxWidth = v.w - 8;
  const poem = poemsByMegh[poemBook.poemIndex];
  poemBook.wrapped = wrapTextForWidth(poem?.text ?? "", maxWidth);
  const lineHeight = 10;
  const contentH = poemBook.wrapped.length * lineHeight;
  poemBook.maxScrollY = Math.max(0, contentH - v.h);
  poemBook.scrollY = clamp(poemBook.scrollY, 0, poemBook.maxScrollY);
}

function setPoemIndex(i) {
  poemBook.poemIndex = clamp(i, 0, poemsByMegh.length - 1);
  poemBook.scrollY = 0;
  recomputePoemWrap();
}

window.addEventListener("resize", () => {
  if (poemBook.open) recomputePoemWrap();
});

// ---------- Arcade UI + mini games ----------
const arcadeUI = {
  open: false,
  screen: /** @type {"menu"|"snake"|"heartpop"|"butterfly"} */ ("menu"),
  scrollY: 0,
  maxScrollY: 0,
  // snake
  snake: {
    gridW: 20,
    gridH: 12,
    cell: 6,
    speed: 0.12, // seconds per step
    acc: 0,
    dir: { x: 1, y: 0 },
    nextDir: { x: 1, y: 0 },
    body: /** @type {{x:number,y:number}[]} */ ([]),
    food: { x: 10, y: 6 },
    alive: true,
    score: 0,
  },
  // heart pop
  heartPop: {
    score: 0,
    items: /** @type {{x:number,y:number,ttl:number}[]} */ ([]),
    spawnAcc: 0,
  },
  // butterfly catch
  butterfly: {
    score: 0,
    items: /** @type {{x:number,y:number,vx:number,vy:number}[]} */ ([]),
  },
};

function setArcadeScreen(screen) {
  arcadeUI.screen = screen;
  arcadeUI.scrollY = 0;
  arcadeUI.maxScrollY = 0;
}

function openArcade() {
  arcadeUI.open = true;
  setArcadeScreen("menu");
}

function closeArcade() {
  arcadeUI.open = false;
}

function resetSnake() {
  const s = arcadeUI.snake;
  s.acc = 0;
  s.dir = { x: 1, y: 0 };
  s.nextDir = { x: 1, y: 0 };
  s.body = [{ x: 7, y: 6 }, { x: 6, y: 6 }, { x: 5, y: 6 }];
  s.food = { x: 14, y: 6 };
  s.alive = true;
  s.score = 0;
}

function snakePlaceFood() {
  const s = arcadeUI.snake;
  for (let tries = 0; tries < 200; tries++) {
    const fx = (Math.random() * s.gridW) | 0;
    const fy = (Math.random() * s.gridH) | 0;
    if (!s.body.some((p) => p.x === fx && p.y === fy)) {
      s.food = { x: fx, y: fy };
      return;
    }
  }
}

function resetHeartPop() {
  arcadeUI.heartPop.score = 0;
  arcadeUI.heartPop.items = [];
  arcadeUI.heartPop.spawnAcc = 0;
}

function resetButterfly() {
  const b = arcadeUI.butterfly;
  b.score = 0;
  b.items = [];
  for (let i = 0; i < 4; i++) {
    b.items.push({
      x: 0.2 + Math.random() * 0.6,
      y: 0.2 + Math.random() * 0.6,
      vx: (Math.random() * 0.18 + 0.06) * (Math.random() > 0.5 ? 1 : -1),
      vy: (Math.random() * 0.18 + 0.06) * (Math.random() > 0.5 ? 1 : -1),
    });
  }
}

function arcadePanelRect() {
  return { x: 30, y: 26, w: W - 60, h: H - 52 };
}

function arcadeViewportRect() {
  const p = arcadePanelRect();
  // Below header/subtitle; leave a bit of padding.
  return { x: p.x + 12, y: p.y + 36, w: p.w - 24, h: p.h - 48 };
}

function arcadeButtonRect(ix, iy, w, h) {
  const p = arcadePanelRect();
  return { x: p.x + ix, y: p.y + iy, w, h };
}

function openDressToImpress() {
  // Use Roblox game search as a robust link.
  const url = "https://www.roblox.com/discover/?Keyword=Dress%20To%20Impress";
  try { window.open(url, "_blank", "noopener,noreferrer"); } catch {}
}

window.addEventListener("keydown", (e) => {
  if (poemBook.open) {
    const k = e.key.toLowerCase();
    if (k === "escape") { closePoemBook(); return; }
    if (k === "pagedown") { poemBook.scrollY = clamp(poemBook.scrollY + 18, 0, poemBook.maxScrollY); return; }
    if (k === "pageup") { poemBook.scrollY = clamp(poemBook.scrollY - 18, 0, poemBook.maxScrollY); return; }
    if (k === "arrowdown") { poemBook.scrollY = clamp(poemBook.scrollY + 10, 0, poemBook.maxScrollY); return; }
    if (k === "arrowup") { poemBook.scrollY = clamp(poemBook.scrollY - 10, 0, poemBook.maxScrollY); return; }
    return;
  }
  if (!arcadeUI.open) return;
  const k = e.key.toLowerCase();
  if (k === "escape") {
    if (arcadeUI.screen === "menu") closeArcade();
    else setArcadeScreen("menu");
    return;
  }

  if (k === "pagedown") {
    arcadeUI.scrollY = clamp(arcadeUI.scrollY + 18, 0, arcadeUI.maxScrollY);
    return;
  }
  if (k === "pageup") {
    arcadeUI.scrollY = clamp(arcadeUI.scrollY - 18, 0, arcadeUI.maxScrollY);
    return;
  }

  if (arcadeUI.screen !== "snake") return;
  const s = arcadeUI.snake;

  let nx = 0, ny = 0;
  if (k === "arrowup" || k === "w") { nx = 0; ny = -1; }
  if (k === "arrowdown" || k === "s") { nx = 0; ny = 1; }
  if (k === "arrowleft" || k === "a") { nx = -1; ny = 0; }
  if (k === "arrowright" || k === "d") { nx = 1; ny = 0; }
  if (nx === 0 && ny === 0) return;

  // Prevent instant reversal.
  if (s.dir.x + nx === 0 && s.dir.y + ny === 0) return;
  s.nextDir = { x: nx, y: ny };
});

canvas.addEventListener("wheel", (e) => {
  if (poemBook.open) {
    const dy = e.deltaY;
    poemBook.scrollY = clamp(poemBook.scrollY + (dy > 0 ? 12 : -12), 0, poemBook.maxScrollY);
    e.preventDefault();
    return;
  }
  if (arcadeUI.open) {
    // Scroll arcade content.
    const dy = e.deltaY;
    arcadeUI.scrollY = clamp(arcadeUI.scrollY + (dy > 0 ? 12 : -12), 0, arcadeUI.maxScrollY);
    e.preventDefault();
    return;
  }
}, { passive: false });

function dialogueMetrics() {
  const box = dialogueBoxRect();
  const padX = 12;
  const lineHeight = 10;
  const textStartY = box.y + 20;
  const footerH = 12;
  const maxWidth = box.w - padX * 2;
  const availableH = (box.y + box.h - footerH) - textStartY;
  const maxLinesPerPage = Math.max(1, Math.floor(availableH / lineHeight));
  return { box, padX, lineHeight, textStartY, footerH, maxWidth, maxLinesPerPage };
}

function wrapLineToWidth(line, maxWidth) {
  const txt = (line ?? "").toString();
  if (!txt) return [""];

  if (ctx.measureText(txt).width <= maxWidth) return [txt];

  const words = txt.split(/\s+/g).filter(Boolean);
  /** @type {string[]} */
  const out = [];
  let cur = "";

  const pushCur = () => {
    if (cur) out.push(cur);
    cur = "";
  };

  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth) {
      cur = test;
      continue;
    }

    // Current line is full; commit it.
    pushCur();

    // If a single word is too long, break it by characters.
    if (ctx.measureText(w).width > maxWidth) {
      let chunk = "";
      for (const ch of w) {
        const t = chunk + ch;
        if (ctx.measureText(t).width <= maxWidth) chunk = t;
        else {
          if (chunk) out.push(chunk);
          chunk = ch;
        }
      }
      cur = chunk;
    } else {
      cur = w;
    }
  }
  pushCur();
  return out.length ? out : [txt];
}

function wrapLinesToWidth(lines, maxWidth) {
  /** @type {string[]} */
  const wrapped = [];
  for (const line of lines) {
    const parts = wrapLineToWidth(line, maxWidth);
    for (const p of parts) wrapped.push(p);
  }
  return wrapped;
}

function openDialogue(title, lines) {
  dialogue.open = true;
  dialogue.title = title;
  dialogue.lines = lines.slice();
  // Match drawDialogue font for accurate measurements.
  ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  const m = dialogueMetrics();
  dialogue.wrappedLines = wrapLinesToWidth(dialogue.lines, m.maxWidth);
  dialogue.maxLinesPerPage = m.maxLinesPerPage;
  dialogue.maxPage = Math.max(0, Math.ceil(dialogue.wrappedLines.length / dialogue.maxLinesPerPage) - 1);
  dialogue.page = 0;
  dialogue.charFx = 0;
}

function closeDialogue() {
  dialogue.open = false;
}

function nextDialoguePage() {
  dialogue.page = clamp(dialogue.page + 1, 0, dialogue.maxPage);
  dialogue.charFx = 0;
}

// Close dialogue with Space/Esc; advance page if more.
window.addEventListener("keydown", (e) => {
  if (!dialogue.open) return;
  const k = e.key.toLowerCase();
  if (k === "escape") closeDialogue();
  if (k === " " || k === "enter") {
    if (dialogue.page < dialogue.maxPage) nextDialoguePage();
    else closeDialogue();
  }
});

// ---------- World ----------
const palette = {
  night: "#0c1024",
  roomShadow: "#0e1533",
  roomWall: "#2a2f57",
  roomWall2: "#323b6b",
  floor: "#1a2148",
  floor2: "#202a5a",
  rug1: "#5a2a7a",
  rug2: "#6f34a0",
  wood: "#7a4a2d",
  wood2: "#8b5633",
  wood3: "#a76a40",
  leaf: "#4bd46c",
  leaf2: "#2fb857",
  pot: "#d77a7a",
  pot2: "#b85a5a",
  frame: "#ffd89c",
  frame2: "#ffbe6d",
  heart: "#ff7bd1",
  heart2: "#ff4fbf",
  plush: "#b7f0ff",
  plush2: "#7ad8f2",
  sparkle: "#fdf2a6",
  ink: "#0b0f20",
  ink2: "#121a3a",
  text: "#f4f7ff",
  // Neyali outfit
  greenTop: "#9aa63a",   // olive
  greenTop2: "#7f8c2a",  // darker olive shade
  jeans: "#3a79ff",
  jeans2: "#2d5fe0",
  skin: "#ffcca8",
  hair: "#2a1b1b",
  blush: "#ff9bb3",
  // Room props
  bedSheet: "#ffd7ef",
  bedSheet2: "#ffb6de",
  bedFrame: "#8b5633",
  bedFrame2: "#a76a40",
  pillow: "#f4f7ff",
  pillow2: "#dfe7ff",
  stitchBlue: "#70c7ff",
  stitchBlue2: "#3da9f2",
  stitchEar: "#ff86c8",
  angelPink: "#ff86c8",
  angelPink2: "#ff5db3",
  angelWhite: "#fff7ff",
  angelWhite2: "#ffe3f3",
  gold: "#ffd36b",
  gold2: "#ffbe4f",
  arcade: "#7b46ff",
  arcade2: "#5f32d6",
  screen: "#2df6c2",
  posterA: "#ffd1ea",
  posterB: "#c9f2ff",
  posterC: "#fff6c9",
};

// Room bounds (walkable area).
const walkBounds = { x: 20, y: 34, w: W - 40, h: H - 54 };

/** @type {{id:string,name:string,rect:Rect,dialogue:()=>{title:string,lines:string[]},solid?:boolean,onClick?:()=>void,z?:number,album?:{name:string,spotifySearch:string,accent:string,accent2:string}}} */
const makeObject = (o) => o;

// Pre-generated "diploma cave" papers for the wall.
const diplomaPapers = (() => {
  /** @type {{x:number,y:number,w:number,h:number,pin:number,scrib:number}[]} */
  const papers = [];
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const count = 30;
  for (let i = 0; i < count; i++) {
    const w = 10 + Math.floor(rnd() * 9);
    const h = 8 + Math.floor(rnd() * 7);
    // Leave the right side of the wall for album posters.
    const wallRightForPapers = 168;
    const x = 18 + Math.floor(rnd() * Math.max(1, (wallRightForPapers - 18 - w)));
    const y = 26 + Math.floor(rnd() * 48);
    papers.push({
      x,
      y,
      w,
      h,
      pin: rnd() > 0.75 ? 1 : 0,
      scrib: 2 + Math.floor(rnd() * 4),
    });
  }
  return papers;
})();

const taylorAlbums = [
  // Studio albums (plus TVs as separate clickable covers).
  { key: "debut", name: "Taylor Swift (Debut)", query: "Taylor Swift", year: 2006, accent: "#c9f2ff", accent2: "#7ad8f2" },
  { key: "fearless", name: "Fearless", query: "Fearless Taylor Swift", year: 2008, accent: "#fff6c9", accent2: "#ffd36b" },
  { key: "fearless_tv", name: "Fearless (Taylor's Version)", query: "Fearless (Taylor's Version) Taylor Swift", year: 2021, tv: true, accent: "#fff6c9", accent2: "#ffbe4f" },
  { key: "speak_now", name: "Speak Now", query: "Speak Now Taylor Swift", year: 2010, accent: "#d9c9ff", accent2: "#b59cff" },
  { key: "speak_now_tv", name: "Speak Now (Taylor's Version)", query: "Speak Now (Taylor's Version) Taylor Swift", year: 2023, tv: true, accent: "#d9c9ff", accent2: "#9c79ff" },
  { key: "red", name: "Red", query: "Red Taylor Swift", year: 2012, accent: "#ff9aa9", accent2: "#ff5a6d" },
  { key: "red_tv", name: "Red (Taylor's Version)", query: "Red (Taylor's Version) Taylor Swift", year: 2021, tv: true, accent: "#ff9aa9", accent2: "#ff2f4f" },
  { key: "1989", name: "1989", query: "1989 Taylor Swift", year: 2014, accent: "#9fdcff", accent2: "#5fb3ff" },
  { key: "1989_tv", name: "1989 (Taylor's Version)", query: "1989 (Taylor's Version) Taylor Swift", year: 2023, tv: true, accent: "#9fdcff", accent2: "#3a79ff" },
  { key: "reputation", name: "Reputation", query: "Reputation Taylor Swift", year: 2017, accent: "#cfd3da", accent2: "#8c97a8" },
  { key: "lover", name: "Lover", query: "Lover Taylor Swift", year: 2019, accent: "#ffd1ea", accent2: "#ff86c8" },
  { key: "folklore", name: "Folklore", query: "Folklore Taylor Swift", year: 2020, accent: "#e6e6e6", accent2: "#bdbdbd" },
  { key: "evermore", name: "Evermore", query: "Evermore Taylor Swift", year: 2020, accent: "#ffd2a8", accent2: "#d9a77c" },
  { key: "midnights", name: "Midnights", query: "Midnights Taylor Swift", year: 2022, accent: "#aab6ff", accent2: "#6b7cff" },
  { key: "ttpd", name: "The Tortured Poets Department", query: "The Tortured Poets Department Taylor Swift", year: 2024, accent: "#f2efe8", accent2: "#c9c0b3" },
  { key: "showgirl", name: "The Life of a Showgirl", query: "The Life of a Showgirl Taylor Swift", year: 2025, accent: "#ffe3f3", accent2: "#ff86c8" },
];

function spotifySearchUrl(query) {
  return `https://open.spotify.com/search/${encodeURIComponent(query)}`;
}

function makeTaylorAlbumObjects() {
  // Grid area on right side of wall.
  const startX = 176;
  const startY = 26;
  const cell = 18; // 16px cover + 2px gap
  const cover = 16;
  const cols = 7;

  /** @type {ReturnType<typeof makeObject>[]} */
  const out = [];
  for (let i = 0; i < taylorAlbums.length; i++) {
    const a = taylorAlbums[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * cell;
    const y = startY + row * cell;
    out.push(makeObject({
      id: `ts_${i}`,
      name: `Taylor Swift — ${a.name}`,
      rect: { x, y, w: cover, h: cover },
      solid: false,
      z: -4,
      album: {
        name: a.name,
        spotifySearch: spotifySearchUrl(a.query ?? `${a.name} Taylor Swift`),
        accent: a.accent,
        accent2: a.accent2,
        key: a.key,
        year: a.year,
        tv: !!a.tv,
      },
      onClick: () => {
        try {
          window.open(spotifySearchUrl(a.query ?? `${a.name} Taylor Swift`), "_blank", "noopener,noreferrer");
        } catch {}
      },
      dialogue: () => ({
        title: "Taylor Swift Albums",
        lines: [
          `Opening Spotify search for: ${a.name}`,
          "Neyali’s taste is iconic.",
          "(If it didn’t open, your browser blocked popups—try clicking again.)",
        ],
      }),
    }));
  }

  return out;
}

const objects = [
  makeObject({
    id: "diplomaWall",
    name: "Diploma Cave Wall",
    // Click anywhere on the wall area; other objects override this because they're later in the list.
    rect: { x: 12, y: 18, w: W - 24, h: 68 },
    solid: false,
    z: -5,
    dialogue: () => ({
      title: "Diploma Cave Wall",
      lines: [
        "The performative AHH diploma cave. (Just saying), but it's tuff so I added it for the plot..."
      ],
    }),
  }),
  ...makeTaylorAlbumObjects(),
  makeObject({
    id: "plant",
    name: "Happy Plant",
    rect: { x: 36, y: 46, w: 26, h: 30 },
    solid: true,
    dialogue: () => ({
      title: "Happy Plant",
      lines: [
        "This plant is thriving because Neyali is so nurturing. (JK not JK ur a very nurturing typa person I love you so muchh...)"
      ],
    }),
  }),
  makeObject({
    id: "photo",
    name: "Photo Frame",
    rect: { x: 132, y: 44, w: 26, h: 22 },
    solid: true,
    dialogue: () => ({
      title: "Photo Frame",
      lines: [
        "A picture of Neyali smiling, I love your smile so much...",
        "She’s the kind of girlfriend who makes ordinary days feel special.",
      ]
    }),
  }),
  makeObject({
    id: "desk",
    name: "Little Desk",
    rect: { x: 198, y: 96, w: 66, h: 34 },
    solid: true,
    z: 0,
    dialogue: () => ({
      title: "Little Desk",
      lines: [
        "This desk is where she should be studying instead of her bed, but it's actually cluttered with random stuff instead.",
      ],
    }),
  }),
  makeObject({
    id: "necklace",
    name: "Butterfly Necklace",
    // Sits on the desk.
    rect: { x: 232, y: 90, w: 20, h: 12 },
    solid: false,
    z: 2,
    dialogue: () => ({
      title: "Butterfly Necklace",
      lines: [
        "A tiny butterfly necklace gifted with love by Megh. You look so pretty in it I'm glad I chose the right necklace.",
      ],
    }),
  }),
  makeObject({
    id: "bed",
    name: "Cozy Bed",
    rect: { x: 22, y: 128, w: 96, h: 36 },
    solid: true,
    z: 0,
    dialogue: () => ({
      title: "Cozy Bed",
      lines: [
        "A super cozy bed for a super cozy girlfriend.",
        "Neyali deserves all the rest that she has here. She also deserves sweet dreams, and gentle mornings.",
      ],
    }),
  }),
  makeObject({
    id: "nightstand",
    name: "Nightstand",
    rect: { x: 124, y: 134, w: 26, h: 26 },
    solid: true,
    z: 1,
    dialogue: () => ({
      title: "Nightstand",
      lines: [
        "Just a nightstand bruh.",
      ],
    }),
  }),
  makeObject({
    id: "poemBook",
    name: "Poem Book",
    rect: { x: 130, y: 132, w: 14, h: 10 },
    solid: false,
    z: 2,
    dialogue: () => ({
      title: "Poem Book",
      lines: [
        "A book of poems from Megh.",
        "Click to open and scroll through them.",
      ],
    }),
  }),
  makeObject({
    id: "stitch",
    name: "Stitch Plushie",
    // On top of the bed.
    rect: { x: 54, y: 130, w: 22, h: 16 },
    solid: false,
    z: 3,
    dialogue: () => ({
      title: "Stitch Plushie",
      lines: [
        "The goated Stitch plushie, it's legit so goated, and he's got a girlfriend as well now.",
      ],
    }),
  }),
  makeObject({
    id: "angel",
    name: "Angel Plushie",
    // Stitch's girlfriend, on the bed too.
    rect: { x: 78, y: 130, w: 20, h: 16 },
    solid: false,
    z: 3,
    dialogue: () => ({
      title: "Angel Plushie (Stitch's GF)",
      lines: [
        "Angel is here too—another sweet gift from the GOAT Megh",
      ],
    }),
  }),
  makeObject({
    id: "arcade",
    name: "Mini Arcade",
    rect: { x: 270, y: 110, w: 34, h: 52 },
    solid: true,
    z: 1,
    dialogue: () => ({
      title: "Mini Arcade",
      lines: [
        "Beep boop! The mini arcade is ready.",
        "Click it to open the arcade menu (Snake + other tiny games).",
        "Also includes a button for Dress To Impress (Roblox).",
      ],
    }),
  }),
  makeObject({
    id: "note",
    name: "Tiny Note",
    rect: { x: 150, y: 74, w: 18, h: 14 },
    solid: false,
    z: 2,
    dialogue: () => ({
      title: "Tiny Note",
      lines: [
        "Reminder: Neyali is an amazing girlfriend.",
        "She’s patient when you’re overwhelmed and happy when you’re excited.",
        "She loves and lives with her whole heart and makes Megh feel so special..",
        "She deserves all the good things that have ever come her way.",
      ],
    }),
  }),
];

// ---------- Player (Neyali) ----------
const player = {
  x: W / 2 - 6,
  y: H - 56,
  w: 12,
  h: 16,
  vx: 0,
  vy: 0,
  speed: 52, // px/sec
  facing: "down", // up/down/left/right
  walkT: 0,
};

function playerRectAt(nx, ny) {
  return { x: nx, y: ny, w: player.w, h: player.h };
}

function collidesSolid(r) {
  for (const o of objects) {
    if (!o.solid) continue;
    if (rectsOverlap(r, o.rect)) return true;
  }
  return false;
}

function movePlayer(dt) {
  if (dialogue.open || arcadeUI.open || poemBook.open) return;

  let ix = 0, iy = 0;
  if (keys.has("arrowleft") || keys.has("a")) ix -= 1;
  if (keys.has("arrowright") || keys.has("d")) ix += 1;
  if (keys.has("arrowup") || keys.has("w")) iy -= 1;
  if (keys.has("arrowdown") || keys.has("s")) iy += 1;

  // Normalize diagonal.
  const mag = Math.hypot(ix, iy) || 1;
  ix /= mag; iy /= mag;

  const sp = player.speed;
  const dx = ix * sp * dt;
  const dy = iy * sp * dt;

  if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
    player.walkT += dt * 8;
    if (Math.abs(ix) > Math.abs(iy)) player.facing = ix < 0 ? "left" : "right";
    else player.facing = iy < 0 ? "up" : "down";
  } else {
    player.walkT = lerp(player.walkT, 0, dt * 8);
  }

  // Axis-separated movement with bounds + object collision.
  let nx = player.x + dx;
  let ny = player.y;
  nx = clamp(nx, walkBounds.x, walkBounds.x + walkBounds.w - player.w);
  if (!collidesSolid(playerRectAt(nx, ny))) player.x = nx;

  nx = player.x;
  ny = player.y + dy;
  ny = clamp(ny, walkBounds.y, walkBounds.y + walkBounds.h - player.h);
  if (!collidesSolid(playerRectAt(nx, ny))) player.y = ny;
}

function nearestInteractable() {
  const pr = { x: player.x - 6, y: player.y - 6, w: player.w + 12, h: player.h + 12 };
  let best = null;
  let bestD = 1e9;
  for (const o of objects) {
    if (!rectsOverlap(pr, o.rect)) continue;
    const cx = o.rect.x + o.rect.w / 2;
    const cy = o.rect.y + o.rect.h / 2;
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    const d = Math.hypot(cx - px, cy - py);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

function canvasPointFromClient(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const sx = W / rect.width;
  const sy = H / rect.height;
  return {
    x: (clientX - rect.left) * sx,
    y: (clientY - rect.top) * sy,
  };
}

function handlePress(mx, my) {
  if (poemBook.open) {
    handlePoemBookClick(mx, my);
    return;
  }

  if (arcadeUI.open) {
    handleArcadeClick(mx, my);
    return;
  }

  if (dialogue.open) {
    // Clicking inside the dialogue advances or closes.
    const box = dialogueBoxRect();
    if (pointInRect(mx, my, box)) {
      if (dialogue.page < dialogue.maxPage) nextDialoguePage();
      else closeDialogue();
    } else {
      closeDialogue();
    }
    return;
  }

  // Prioritize top-most (later drawn) object if overlapping.
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (pointInRect(mx, my, o.rect)) {
      if (o.id === "arcade") {
        openArcade();
        return;
      }
      if (o.id === "poemBook") {
        openPoemBook();
        return;
      }
      if (typeof o.onClick === "function") o.onClick();
      const d = o.dialogue();
      openDialogue(d.title, d.lines);
      return;
    }
  }
}

canvas.addEventListener("click", (e) => {
  const p = canvasPointFromClient(e.clientX, e.clientY);
  handlePress(p.x, p.y);
});

// ---------- Pixel Drawing ----------
function px(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function outlineRect(r, c) {
  ctx.strokeStyle = c;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w), Math.round(r.h));
}

function drawBackground(t) {
  // Soft night gradient backdrop.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, palette.roomWall2);
  g.addColorStop(1, palette.night);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Wall panel.
  px(12, 18, W - 24, 68, palette.roomWall);
  px(12, 18, W - 24, 6, palette.roomWall2);
  px(12, 80, W - 24, 6, palette.roomShadow);

  // Diploma cave papers (wall).
  for (const p of diplomaPapers) {
    // Shadow
    px(p.x + 1, p.y + 1, p.w, p.h, rgba("#000000", 0.20));
    // Paper
    px(p.x, p.y, p.w, p.h, "#fffbe5");
    px(p.x + 1, p.y + 1, p.w - 2, p.h - 2, "#fff6c9");
    // Scribbles
    for (let i = 0; i < p.scrib; i++) {
      const yy = p.y + 2 + i * 2;
      if (yy >= p.y + p.h - 1) break;
      px(p.x + 2, yy, Math.max(2, p.w - 4 - (i % 2)), 1, rgba("#000000", 0.25));
    }
    // Pin
    if (p.pin) {
      px(p.x + (p.w / 2) | 0, p.y + 1, 1, 1, palette.heart2);
      px(p.x + ((p.w / 2) | 0) - 1, p.y + 2, 3, 1, palette.sparkle);
    }
  }

  // Floor.
  px(12, 86, W - 24, H - 98, palette.floor);
  // floor tiles
  for (let y = 88; y < H - 12; y += 12) {
    for (let x = 14; x < W - 14; x += 16) {
      const wob = (Math.sin((x + y) * 0.08 + t * 0.001) * 0.5) | 0;
      px(x + 2, y + 2 + wob, 12, 8, palette.floor2);
      px(x + 3, y + 3 + wob, 10, 6, rgba("#000000", 0.08));
    }
  }

  // Rug (cute heart).
  const rug = { x: 96, y: 118, w: 128, h: 44 };
  px(rug.x, rug.y, rug.w, rug.h, palette.rug1);
  px(rug.x + 3, rug.y + 3, rug.w - 6, rug.h - 6, palette.rug2);
  // heart in rug
  const hx = rug.x + 58, hy = rug.y + 12;
  px(hx + 2, hy + 6, 8, 8, palette.heart2);
  px(hx - 6, hy + 2, 10, 10, palette.heart);
  px(hx + 6, hy + 2, 10, 10, palette.heart);
  px(hx - 2, hy + 10, 14, 10, palette.heart2);

  // Border.
  outlineRect({ x: 12, y: 18, w: W - 24, h: H - 30 }, rgba("#ffffff", 0.10));
}

function drawPlant(o, t) {
  const r = o.rect;
  // Pot
  px(r.x + 7, r.y + 18, 12, 10, palette.pot2);
  px(r.x + 6, r.y + 16, 14, 4, palette.pot);
  px(r.x + 7, r.y + 20, 12, 7, palette.pot);
  // Leaves
  const bob = Math.sin(t * 0.004) * 1.2;
  px(r.x + 12, r.y + 6 + bob, 2, 12, palette.leaf2);
  px(r.x + 6, r.y + 8 + bob, 8, 4, palette.leaf);
  px(r.x + 12, r.y + 8 + bob, 8, 4, palette.leaf2);
  px(r.x + 4, r.y + 2 + bob, 7, 4, palette.leaf2);
  px(r.x + 11, r.y + 1 + bob, 9, 4, palette.leaf);
}

function drawPhoto(o) {
  const r = o.rect;
  px(r.x + 1, r.y + 1, r.w - 2, r.h - 2, palette.frame2);
  px(r.x + 3, r.y + 3, r.w - 6, r.h - 6, palette.frame);
  // inner picture
  px(r.x + 5, r.y + 5, r.w - 10, r.h - 10, "#1b2a5e");
  px(r.x + 7, r.y + 7, r.w - 14, r.h - 14, "#24387a");
  // tiny heart sparkle
  px(r.x + r.w - 8, r.y + 6, 2, 2, palette.sparkle);
  px(r.x + r.w - 10, r.y + 8, 2, 2, palette.sparkle);
}

function drawDesk(o) {
  const r = o.rect;
  // top
  px(r.x + 2, r.y + 6, r.w - 4, 10, palette.wood3);
  px(r.x + 3, r.y + 7, r.w - 6, 8, palette.wood2);
  // legs
  px(r.x + 6, r.y + 16, 8, r.h - 16, palette.wood);
  px(r.x + r.w - 14, r.y + 16, 8, r.h - 16, palette.wood);
  // drawer area
  px(r.x + 18, r.y + 18, r.w - 36, 14, palette.wood2);
  px(r.x + 20, r.y + 20, r.w - 40, 10, palette.wood3);
  px(r.x + r.w / 2 - 2, r.y + 24, 4, 2, palette.ink2);
  // cute mug
  px(r.x + 10, r.y + 2, 8, 6, "#ffd1e8");
  px(r.x + 18, r.y + 3, 3, 4, "#ffd1e8");
  px(r.x + 19, r.y + 4, 2, 2, "#ffffff");
}

function drawNecklace(o, t) {
  const r = o.rect;
  // Little chain + pendant.
  px(r.x + 3, r.y + 3, r.w - 6, 2, palette.gold2);
  px(r.x + 4, r.y + 4, r.w - 8, 1, palette.gold);
  // tiny butterfly pendant
  px(r.x + 8, r.y + 6, 2, 1, palette.gold);
  px(r.x + 12, r.y + 6, 2, 1, palette.gold);
  px(r.x + 10, r.y + 7, 2, 2, palette.gold2);
  px(r.x + 11, r.y + 8, 1, 1, palette.heart2);

  drawButterfliesAroundNecklace(o, t);
}

function drawButterfly(x, y, t, c1, c2) {
  // Tiny 5x3-ish butterfly with a flappy wing toggle.
  const flap = (Math.sin(t * 0.02 + x * 0.3 + y * 0.2) > 0) ? 1 : 0;
  // body
  px(x + 2, y + 1, 1, 1, c2);
  px(x + 2, y + 2, 1, 1, c2);
  // wings
  if (!flap) {
    px(x + 0, y + 1, 2, 1, c1);
    px(x + 3, y + 1, 2, 1, c1);
    px(x + 1, y + 0, 1, 1, c1);
    px(x + 3, y + 0, 1, 1, c1);
  } else {
    px(x + 0, y + 0, 2, 2, c1);
    px(x + 3, y + 0, 2, 2, c1);
  }
  // sparkle dot
  px(x + 2, y + 0, 1, 1, palette.sparkle);
}

function drawButterfliesAroundNecklace(o, t) {
  const r = o.rect;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const count = 4;
  for (let i = 0; i < count; i++) {
    const a = (t * 0.0012) + i * (Math.PI * 2 / count);
    const rad = 10 + (i % 2) * 4;
    const bx = Math.round(cx + Math.cos(a) * rad);
    const by = Math.round(cy + Math.sin(a * 1.3) * (rad * 0.6) - 8);
    drawButterfly(bx - 2, by - 1, t + i * 77, palette.heart, palette.heart2);
  }
}

function drawBed(o) {
  const r = o.rect;
  // Frame
  px(r.x + 1, r.y + 16, r.w - 2, r.h - 18, palette.bedFrame2);
  px(r.x + 2, r.y + 17, r.w - 4, r.h - 20, palette.bedFrame);
  // Mattress
  px(r.x + 6, r.y + 8, r.w - 12, r.h - 16, palette.bedSheet2);
  px(r.x + 7, r.y + 9, r.w - 14, r.h - 18, palette.bedSheet);
  // Pillow
  px(r.x + 10, r.y + 10, 22, 10, palette.pillow2);
  px(r.x + 11, r.y + 11, 20, 8, palette.pillow);
  // Cute stitched heart on sheet
  px(r.x + r.w - 26, r.y + 22, 8, 6, palette.heart2);
  px(r.x + r.w - 24, r.y + 20, 4, 10, palette.heart);
}

function drawNightstand(o) {
  const r = o.rect;
  // Body
  px(r.x + 1, r.y + 6, r.w - 2, r.h - 7, palette.wood2);
  px(r.x + 2, r.y + 7, r.w - 4, r.h - 9, palette.wood3);
  // Top
  px(r.x, r.y + 4, r.w, 4, palette.wood3);
  px(r.x + 1, r.y + 5, r.w - 2, 2, palette.wood2);
  // Drawer + knob
  px(r.x + 4, r.y + 12, r.w - 8, 8, palette.wood2);
  px(r.x + 5, r.y + 13, r.w - 10, 6, palette.wood3);
  px(r.x + (r.w / 2 | 0), r.y + 16, 2, 2, palette.ink2);
  // Legs
  px(r.x + 3, r.y + r.h - 2, 4, 2, palette.ink2);
  px(r.x + r.w - 7, r.y + r.h - 2, 4, 2, palette.ink2);
}

function drawPoemBookProp(o) {
  const r = o.rect;
  // Shadow
  px(r.x + 1, r.y + 1, r.w, r.h, rgba("#000000", 0.25));
  // Cover
  px(r.x, r.y, r.w, r.h, palette.rug2);
  px(r.x + 1, r.y + 1, r.w - 2, r.h - 2, palette.rug1);
  // Pages edge
  px(r.x + 2, r.y + 2, r.w - 4, 2, palette.pillow2);
  px(r.x + 2, r.y + 4, r.w - 4, 1, rgba("#000000", 0.15));
  // Tiny heart emblem
  px(r.x + r.w - 6, r.y + r.h - 6, 4, 4, palette.heart2);
  px(r.x + r.w - 5, r.y + r.h - 5, 2, 2, palette.heart);
}

function drawStitch(o, t) {
  const r = o.rect;
  const bob = Math.sin(t * 0.006) * 1.0;
  // body
  px(r.x + 5, r.y + 7 + bob, 12, 7, palette.stitchBlue2);
  px(r.x + 6, r.y + 8 + bob, 10, 5, palette.stitchBlue);
  // head
  px(r.x + 6, r.y + 2 + bob, 10, 6, palette.stitchBlue2);
  px(r.x + 7, r.y + 3 + bob, 8, 4, palette.stitchBlue);
  // ears
  px(r.x + 3, r.y + 2 + bob, 4, 6, palette.stitchBlue2);
  px(r.x + 3, r.y + 4 + bob, 3, 3, palette.stitchEar);
  px(r.x + 15, r.y + 2 + bob, 4, 6, palette.stitchBlue2);
  px(r.x + 16, r.y + 4 + bob, 3, 3, palette.stitchEar);
  // face
  px(r.x + 9, r.y + 5 + bob, 1, 1, palette.ink);
  px(r.x + 12, r.y + 5 + bob, 1, 1, palette.ink);
  px(r.x + 10, r.y + 6 + bob, 2, 1, palette.ink2);
  // tiny heart badge
  px(r.x + 10, r.y + 12 + bob, 2, 2, palette.heart2);
}

function drawAngel(o, t) {
  const r = o.rect;
  const bob = Math.sin(t * 0.006 + 1.7) * 1.0;
  // body
  px(r.x + 4, r.y + 8 + bob, 12, 6, palette.angelWhite2);
  px(r.x + 5, r.y + 9 + bob, 10, 4, palette.angelWhite);
  // head
  px(r.x + 5, r.y + 2 + bob, 10, 6, palette.angelPink2);
  px(r.x + 6, r.y + 3 + bob, 8, 4, palette.angelPink);
  // ears
  px(r.x + 3, r.y + 3 + bob, 3, 5, palette.angelPink2);
  px(r.x + 14, r.y + 3 + bob, 3, 5, palette.angelPink2);
  // face
  px(r.x + 8, r.y + 5 + bob, 1, 1, palette.ink);
  px(r.x + 11, r.y + 5 + bob, 1, 1, palette.ink);
  px(r.x + 9, r.y + 6 + bob, 2, 1, palette.heart2);
  // little bow-ish detail
  px(r.x + 9, r.y + 1 + bob, 2, 1, palette.heart);
  px(r.x + 8, r.y + 2 + bob, 4, 1, palette.sparkle);
}

function drawTaylorAlbum(o, t) {
  const r = o.rect;
  const a = o.album;
  if (!a) return;

  // Frame
  px(r.x + 1, r.y + 1, r.w, r.h, rgba("#000000", 0.22));
  px(r.x, r.y, r.w, r.h, rgba("#ffffff", 0.22));

  // Cover background (pixel blocks so it feels like a tiny cover).
  px(r.x + 1, r.y + 1, r.w - 2, r.h - 2, a.accent2);
  px(r.x + 2, r.y + 2, r.w - 4, r.h - 4, a.accent);

  // Per-album motif (simple, recognizable, and “pixelated cover-ish”).
  drawAlbumMotif(r, a, t);

  // Year tag (tiny)
  const year = (a.year ?? "").toString().slice(-2);
  if (year) {
    px(r.x + 2, r.y + r.h - 5, 6, 3, rgba("#000000", 0.20));
    ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    ctx.fillStyle = rgba("#000000", 0.45);
    ctx.textBaseline = "top";
    ctx.fillText(year, r.x + 2, r.y + r.h - 6);
  }

  // TV badge (if applicable)
  if (a.tv) {
    px(r.x + r.w - 7, r.y + r.h - 7, 6, 6, rgba("#ffffff", 0.18));
    px(r.x + r.w - 6, r.y + r.h - 6, 4, 4, palette.sparkle);
    px(r.x + r.w - 5, r.y + r.h - 5, 2, 2, palette.heart2);
  }
}

function drawAlbumMotif(r, a, t) {
  const k = a.key || "";
  const cx = r.x + 8;
  const cy = r.y + 8;
  const ink = rgba("#000000", 0.28);

  // Soft shimmer
  const tw = ((Math.sin(t * 0.01 + r.x * 0.7) + 1) * 1) | 0;
  px(r.x + 3 + tw, r.y + 3, 1, 1, palette.sparkle);

  if (k === "fearless" || k === "fearless_tv") {
    // Sparkles
    px(cx - 3, cy - 2, 1, 1, palette.sparkle);
    px(cx + 2, cy + 1, 1, 1, palette.sparkle);
    px(cx - 1, cy + 3, 1, 1, palette.sparkle);
    // little "crown" dot
    px(cx, cy - 1, 2, 1, palette.gold2);
    return;
  }
  if (k === "speak_now" || k === "speak_now_tv") {
    // Butterfly
    drawButterfly(cx - 3, cy - 2, t, palette.heart, palette.heart2);
    return;
  }
  if (k === "red" || k === "red_tv") {
    // Scarf stripe
    px(r.x + 3, cy + 1, r.w - 6, 2, rgba("#ffffff", 0.20));
    px(r.x + 3, cy + 3, r.w - 6, 1, ink);
    return;
  }
  if (k === "1989" || k === "1989_tv") {
    // Seagull-ish V
    px(cx - 3, cy + 1, 2, 1, rgba("#ffffff", 0.30));
    px(cx + 1, cy + 1, 2, 1, rgba("#ffffff", 0.30));
    px(cx - 1, cy + 2, 2, 1, rgba("#ffffff", 0.22));
    return;
  }
  if (k === "reputation") {
    // Snake-ish squiggle
    px(cx - 3, cy - 2, 6, 1, ink);
    px(cx + 2, cy - 1, 1, 3, ink);
    px(cx - 3, cy + 2, 6, 1, ink);
    px(cx - 3, cy - 1, 1, 3, ink);
    px(cx - 1, cy, 2, 1, palette.heart2);
    return;
  }
  if (k === "lover") {
    // Two hearts
    px(cx - 4, cy - 1, 4, 3, palette.heart);
    px(cx - 3, cy - 2, 2, 2, palette.heart2);
    px(cx + 1, cy - 1, 4, 3, palette.heart);
    px(cx + 2, cy - 2, 2, 2, palette.heart2);
    return;
  }
  if (k === "folklore") {
    // Trees
    px(cx - 4, cy + 1, 1, 3, ink);
    px(cx - 5, cy, 3, 1, ink);
    px(cx, cy + 1, 1, 3, ink);
    px(cx - 1, cy, 3, 1, ink);
    px(cx + 3, cy + 1, 1, 3, ink);
    px(cx + 2, cy, 3, 1, ink);
    return;
  }
  if (k === "evermore") {
    // Plaid-ish cross
    px(r.x + 3, cy - 1, r.w - 6, 1, rgba("#ffffff", 0.16));
    px(cx - 1, r.y + 3, 1, r.h - 6, rgba("#ffffff", 0.16));
    px(cx + 2, r.y + 3, 1, r.h - 6, ink);
    return;
  }
  if (k === "midnights") {
    // Stars
    px(cx - 3, cy - 2, 1, 1, palette.sparkle);
    px(cx + 2, cy + 1, 1, 1, palette.sparkle);
    px(cx - 1, cy + 3, 1, 1, palette.heart2);
    return;
  }
  if (k === "ttpd") {
    // Page lines
    px(r.x + 3, cy - 2, r.w - 6, 1, ink);
    px(r.x + 3, cy, r.w - 6, 1, ink);
    px(r.x + 3, cy + 2, r.w - 6, 1, ink);
    return;
  }
  if (k === "showgirl") {
    // Spotlight + sparkle
    px(cx - 1, r.y + 3, 2, 6, rgba("#ffffff", 0.22));
    px(cx - 3, r.y + 7, 6, 1, rgba("#ffffff", 0.18));
    px(cx + 3, cy - 2, 1, 1, palette.sparkle);
    return;
  }
  // debut/default: little swirl
  px(cx - 3, cy, 6, 1, rgba("#ffffff", 0.18));
  px(cx - 2, cy - 1, 4, 1, rgba("#ffffff", 0.14));
  px(cx - 1, cy + 1, 2, 1, rgba("#ffffff", 0.14));
}

function drawArcade(o, t) {
  const r = o.rect;
  // Cabinet
  px(r.x + 2, r.y + 6, r.w - 4, r.h - 8, palette.arcade2);
  px(r.x + 3, r.y + 7, r.w - 6, r.h - 10, palette.arcade);
  // Marquee
  px(r.x + 5, r.y + 6, r.w - 10, 6, palette.heart2);
  px(r.x + 6, r.y + 7, r.w - 12, 4, palette.heart);
  // Screen
  px(r.x + 7, r.y + 14, r.w - 14, 16, palette.ink2);
  px(r.x + 8, r.y + 15, r.w - 16, 14, palette.screen);
  // Simple pixels on screen
  const scan = Math.round((Math.sin(t * 0.01) + 1) * 3);
  px(r.x + 9, r.y + 16 + scan, r.w - 18, 1, rgba("#000000", 0.18));
  px(r.x + 10, r.y + 20, 6, 4, palette.sparkle);
  px(r.x + 18, r.y + 22, 6, 4, palette.heart);

  // Control panel
  px(r.x + 7, r.y + 32, r.w - 14, 10, palette.arcade2);
  px(r.x + 8, r.y + 33, r.w - 16, 8, palette.arcade);
  // joystick + buttons
  px(r.x + 11, r.y + 35, 2, 4, palette.ink);
  px(r.x + 10, r.y + 34, 4, 2, palette.heart2);
  px(r.x + r.w - 16, r.y + 35, 3, 3, palette.sparkle);
  px(r.x + r.w - 12, r.y + 36, 3, 3, palette.heart2);

  // Feet
  px(r.x + 6, r.y + r.h - 3, 6, 2, palette.ink2);
  px(r.x + r.w - 12, r.y + r.h - 3, 6, 2, palette.ink2);
}

function drawPlush(o, t) {
  const r = o.rect;
  const bob = Math.sin(t * 0.006) * 1.0;
  // body
  px(r.x + 6, r.y + 7 + bob, 18, 12, palette.plush2);
  px(r.x + 7, r.y + 8 + bob, 16, 10, palette.plush);
  // ears
  px(r.x + 6, r.y + 4 + bob, 5, 4, palette.plush2);
  px(r.x + 19, r.y + 4 + bob, 5, 4, palette.plush2);
  // face
  px(r.x + 12, r.y + 11 + bob, 2, 2, palette.ink);
  px(r.x + 16, r.y + 11 + bob, 2, 2, palette.ink);
  px(r.x + 14, r.y + 13 + bob, 2, 1, palette.heart2);
  // heart
  px(r.x + 10, r.y + 18 + bob, 10, 4, palette.heart);
  px(r.x + 12, r.y + 16 + bob, 6, 6, palette.heart2);
}

function drawNote(o) {
  const r = o.rect;
  px(r.x + 1, r.y + 1, r.w - 2, r.h - 2, "#fff6c9");
  px(r.x + 2, r.y + 2, r.w - 4, r.h - 4, "#fffbe5");
  px(r.x + 4, r.y + 5, r.w - 8, 1, rgba("#000000", 0.25));
  px(r.x + 4, r.y + 8, r.w - 8, 1, rgba("#000000", 0.25));
}

function drawObject(o, t) {
  if (o.id === "plant") drawPlant(o, t);
  else if (o.id === "photo") drawPhoto(o);
  else if (o.id === "desk") drawDesk(o);
  else if (o.id === "necklace") drawNecklace(o, t);
  else if (o.id === "bed") drawBed(o);
  else if (o.id === "nightstand") drawNightstand(o);
  else if (o.id === "poemBook") drawPoemBookProp(o);
  else if (o.id === "stitch") drawStitch(o, t);
  else if (o.id === "angel") drawAngel(o, t);
  else if (o.id === "arcade") drawArcade(o, t);
  else if (o.album) drawTaylorAlbum(o, t);
  else if (o.id === "plush") drawPlush(o, t);
  else if (o.id === "note") drawNote(o);
}

function drawNeyaliSprite(t) {
  const x = Math.round(player.x);
  const y = Math.round(player.y);
  const step = Math.round(Math.sin(player.walkT) * 1); // tiny walk bob
  const bob = (Math.abs(step) > 0 ? 0 : 1);

  // Shadow
  px(x + 2, y + player.h - 2, 8, 2, rgba("#000000", 0.25));

  // Jeans (legs)
  px(x + 3, y + 10 + bob, 3, 5, palette.jeans2);
  px(x + 6, y + 10 + bob, 3, 5, palette.jeans2);
  px(x + 3 + step, y + 11 + bob, 3, 4, palette.jeans);
  px(x + 6 - step, y + 11 + bob, 3, 4, palette.jeans);
  // Shoes
  px(x + 3 + step, y + 15 + bob, 3, 1, palette.ink2);
  px(x + 6 - step, y + 15 + bob, 3, 1, palette.ink2);

  // Green crop top (torso)
  px(x + 3, y + 7, 6, 4, palette.greenTop2);
  px(x + 3, y + 8, 6, 3, palette.greenTop);
  // tiny midriff highlight
  px(x + 4, y + 11, 4, 1, palette.skin);

  // Arms
  px(x + 2, y + 8, 1, 3, palette.skin);
  px(x + 9, y + 8, 1, 3, palette.skin);

  // Head
  px(x + 4, y + 1, 4, 5, palette.skin);
  // Hair (cute bob)
  px(x + 3, y + 0, 6, 2, palette.hair);
  px(x + 3, y + 2, 1, 3, palette.hair);
  px(x + 8, y + 2, 1, 3, palette.hair);
  // Face
  const blink = (Math.sin(t * 0.008) > 0.985) ? 1 : 0;
  if (!blink) {
    px(x + 5, y + 3, 1, 1, palette.ink);
    px(x + 7, y + 3, 1, 1, palette.ink);
  } else {
    px(x + 5, y + 3, 1, 1, palette.ink2);
    px(x + 7, y + 3, 1, 1, palette.ink2);
  }
  px(x + 6, y + 4, 1, 1, palette.heart2); // tiny smile dot
  // blush
  px(x + 4, y + 4, 1, 1, palette.blush);
  px(x + 8, y + 4, 1, 1, palette.blush);

  // Facing indicator (tiny hair tuft)
  if (player.facing === "left") px(x + 2, y + 1, 1, 2, palette.hair);
  if (player.facing === "right") px(x + 9, y + 1, 1, 2, palette.hair);
  if (player.facing === "up") px(x + 5, y + 0, 2, 1, palette.hair);
  if (player.facing === "down") px(x + 5, y + 6, 2, 1, palette.hair);
}

function drawSparkleHint(t) {
  if (dialogue.open) return;
  const o = nearestInteractable();
  if (!o) return;

  const cx = o.rect.x + o.rect.w / 2;
  const cy = o.rect.y - 4;
  const tw = Math.sin(t * 0.01) * 1.5;
  px(cx - 2, cy + tw, 1, 1, palette.sparkle);
  px(cx + 1, cy + 1 + tw, 1, 1, palette.sparkle);
  px(cx - 1, cy + 2 + tw, 1, 1, palette.sparkle);
  px(cx, cy + tw, 1, 1, palette.heart2);
}

function dialogueBoxRect() {
  // Taller box so wrapped text comfortably fits in-page.
  return { x: 16, y: H - 80, w: W - 32, h: 64 };
}

function drawDialogue(t) {
  if (!dialogue.open) return;
  const m = dialogueMetrics();
  const box = m.box;

  // Backdrop
  ctx.fillStyle = rgba(palette.ink, 0.55);
  ctx.fillRect(0, 0, W, H);

  // Box body (pixel style)
  px(box.x, box.y, box.w, box.h, rgba("#0b0f20", 0.92));
  px(box.x + 2, box.y + 2, box.w - 4, box.h - 4, rgba("#121a3a", 0.92));
  outlineRect(box, rgba("#ffffff", 0.25));

  // Title ribbon
  px(box.x + 8, box.y + 6, Math.min(140, box.w - 16), 10, rgba(palette.heart, 0.95));
  px(box.x + 9, box.y + 7, Math.min(138, box.w - 18), 8, rgba(palette.heart2, 0.95));

  // Text
  ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  ctx.fillStyle = palette.text;
  ctx.textBaseline = "top";

  ctx.fillText(dialogue.title, box.x + 12, box.y + 7);

  const start = dialogue.page * dialogue.maxLinesPerPage;
  const pageLines = dialogue.wrappedLines.slice(start, start + dialogue.maxLinesPerPage);

  // Slight typewriter-ish effect per page.
  dialogue.charFx = Math.min(dialogue.charFx + 0.9, 9999);
  const chars = Math.floor(dialogue.charFx);
  let shown = 0;

  let ty = m.textStartY;
  for (const line of pageLines) {
    let out = line;
    if (shown + out.length > chars) out = out.slice(0, Math.max(0, chars - shown));
    shown += line.length;
    ctx.fillText(out, box.x + 12, ty);
    ty += m.lineHeight;
  }

  // Footer hint
  const hint = dialogue.page < dialogue.maxPage ? "Click / Space: next" : "Click / Space / Esc: close";
  ctx.fillStyle = rgba(palette.text, 0.85);
  const pageLabel = `${dialogue.page + 1}/${dialogue.maxPage + 1}`;
  ctx.fillText(hint, box.x + box.w - 12 - ctx.measureText(hint).width, box.y + box.h - 12);
  ctx.fillText(pageLabel, box.x + 12, box.y + box.h - 12);
}

function drawMiniUI(t) {
  // Cute label above player (subtle).
  const label = "Neyali";
  ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  const tw = ctx.measureText(label).width;
  const x = Math.round(player.x + player.w / 2 - tw / 2);
  const y = Math.round(player.y - 10 + Math.sin(t * 0.006) * 0.8);
  px(x - 3, y - 1, tw + 6, 9, rgba("#000000", 0.25));
  ctx.fillStyle = rgba(palette.text, 0.95);
  ctx.fillText(label, x, y);
}

function updateArcade(dt) {
  if (!arcadeUI.open) return;

  if (arcadeUI.screen === "snake") {
    const s = arcadeUI.snake;
    if (!s.body.length) resetSnake();
    if (!s.alive) return;
    s.acc += dt;
    while (s.acc >= s.speed) {
      s.acc -= s.speed;
      s.dir = s.nextDir;
      const head = s.body[0];
      const nh = { x: head.x + s.dir.x, y: head.y + s.dir.y };

      // wall collision
      if (nh.x < 0 || nh.y < 0 || nh.x >= s.gridW || nh.y >= s.gridH) {
        s.alive = false;
        break;
      }
      // self collision
      if (s.body.some((p) => p.x === nh.x && p.y === nh.y)) {
        s.alive = false;
        break;
      }

      s.body.unshift(nh);
      const ate = nh.x === s.food.x && nh.y === s.food.y;
      if (ate) {
        s.score += 1;
        snakePlaceFood();
      } else {
        s.body.pop();
      }
    }
  }

  if (arcadeUI.screen === "heartpop") {
    const hp = arcadeUI.heartPop;
    hp.spawnAcc += dt;
    while (hp.spawnAcc >= 0.55) {
      hp.spawnAcc -= 0.55;
      hp.items.push({
        x: 0.15 + Math.random() * 0.70,
        y: 0.18 + Math.random() * 0.58,
        ttl: 2.2,
      });
    }
    for (const it of hp.items) it.ttl -= dt;
    hp.items = hp.items.filter((it) => it.ttl > 0);
  }

  if (arcadeUI.screen === "butterfly") {
    const b = arcadeUI.butterfly;
    if (!b.items.length) resetButterfly();
    for (const it of b.items) {
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      if (it.x < 0.12 || it.x > 0.88) it.vx *= -1;
      if (it.y < 0.16 || it.y > 0.80) it.vy *= -1;
      it.x = clamp(it.x, 0.12, 0.88);
      it.y = clamp(it.y, 0.16, 0.80);
    }
  }
}

function drawArcadeOverlay(t) {
  if (!arcadeUI.open) return;
  const p = arcadePanelRect();
  const v = arcadeViewportRect();

  // Backdrop
  ctx.fillStyle = rgba(palette.ink, 0.60);
  ctx.fillRect(0, 0, W, H);

  // Panel
  px(p.x, p.y, p.w, p.h, rgba("#0b0f20", 0.94));
  px(p.x + 2, p.y + 2, p.w - 4, p.h - 4, rgba("#121a3a", 0.94));
  outlineRect(p, rgba("#ffffff", 0.25));

  // Header
  px(p.x + 8, p.y + 8, p.w - 16, 12, rgba(palette.arcade, 0.95));
  px(p.x + 9, p.y + 9, p.w - 18, 10, rgba(palette.arcade2, 0.95));
  ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  ctx.fillStyle = palette.text;
  ctx.textBaseline = "top";
  ctx.fillText("Mini Arcade", p.x + 12, p.y + 10);

  const sub = arcadeUI.screen === "menu"
    ? "Pick a game (Esc closes)"
    : `${arcadeUI.screen.toUpperCase()}  (Esc: back)`;
  ctx.fillStyle = rgba(palette.text, 0.80);
  ctx.fillText(sub, p.x + 12, p.y + 24);

  if (arcadeUI.screen === "menu") {
    // Scrollable content area for the menu.
    ctx.save();
    ctx.beginPath();
    ctx.rect(v.x, v.y, v.w, v.h);
    ctx.clip();
    const contentH = drawArcadeMenu(t, v, arcadeUI.scrollY);
    arcadeUI.maxScrollY = Math.max(0, contentH - v.h);
    arcadeUI.scrollY = clamp(arcadeUI.scrollY, 0, arcadeUI.maxScrollY);
    ctx.restore();

    // Scrollbar (only if needed)
    if (arcadeUI.maxScrollY > 0) {
      const track = { x: v.x + v.w - 3, y: v.y, w: 2, h: v.h };
      px(track.x, track.y, track.w, track.h, rgba("#ffffff", 0.10));
      const thumbH = Math.max(6, Math.round((v.h / (v.h + arcadeUI.maxScrollY)) * v.h));
      const thumbY = Math.round(v.y + (arcadeUI.scrollY / arcadeUI.maxScrollY) * (v.h - thumbH));
      px(track.x, thumbY, track.w, thumbH, rgba(palette.sparkle, 0.70));
    }
  } else if (arcadeUI.screen === "snake") {
    arcadeUI.maxScrollY = 0;
    arcadeUI.scrollY = 0;
    drawSnakeGame(t);
  } else if (arcadeUI.screen === "heartpop") {
    arcadeUI.maxScrollY = 0;
    arcadeUI.scrollY = 0;
    drawHeartPopGame(t);
  } else if (arcadeUI.screen === "butterfly") {
    arcadeUI.maxScrollY = 0;
    arcadeUI.scrollY = 0;
    drawButterflyGame(t);
  }
}

function drawButton(r, label, accent) {
  px(r.x, r.y, r.w, r.h, rgba("#000000", 0.20));
  px(r.x + 1, r.y + 1, r.w - 2, r.h - 2, rgba("#ffffff", 0.10));
  px(r.x + 2, r.y + 2, r.w - 4, r.h - 4, accent);
  ctx.fillStyle = rgba("#000000", 0.55);
  ctx.fillText(label, r.x + 8, r.y + 6);
}

function drawArcadeMenu(t, v, scrollY) {
  // Returns total content height (for scroll).
  let y = -scrollY;
  const pad = 2;
  const bw = v.w - 6;
  const bx = v.x + 2;
  const bh = 18;
  const gap = 4;

  const b1 = { x: bx, y: v.y + y, w: bw, h: bh }; y += bh + gap;
  const b2 = { x: bx, y: v.y + y, w: bw, h: bh }; y += bh + gap;
  const b3 = { x: bx, y: v.y + y, w: bw, h: bh }; y += bh + gap;
  const b4 = { x: bx, y: v.y + y, w: bw, h: bh }; y += bh + gap + 6;

  ctx.fillStyle = rgba(palette.text, 0.90);
  drawButton(b1, "Snake (cute + tiny)", rgba(palette.heart2, 0.85));
  drawButton(b2, "Heart Pop (click hearts)", rgba(palette.rug2, 0.70));
  drawButton(b3, "Butterfly Catch (click butterflies)", rgba(palette.leaf2, 0.70));
  drawButton(b4, "Dress To Impress (Roblox link)", rgba(palette.gold2, 0.75));

  // Tip text (scrolls naturally below buttons)
  const tip1 = "Tip: Snake uses arrows/WASD";
  const tip2 = "Scroll with wheel / trackpad";
  ctx.fillStyle = rgba(palette.text, 0.75);
  ctx.fillText(tip1, v.x + 2, v.y + y);
  y += 10;
  ctx.fillText(tip2, v.x + 2, v.y + y);
  y += 10 + pad;

  // Total content height relative to viewport top (without scroll).
  const contentHeight = y + scrollY;
  return contentHeight;
}

function drawSnakeGame(t) {
  const p = arcadePanelRect();
  const s = arcadeUI.snake;
  const gx = p.x + 14;
  const gy = p.y + 40;
  const gw = s.gridW * s.cell;
  const gh = s.gridH * s.cell;

  // Board
  px(gx - 2, gy - 2, gw + 4, gh + 4, rgba("#000000", 0.25));
  px(gx - 1, gy - 1, gw + 2, gh + 2, rgba("#ffffff", 0.10));
  px(gx, gy, gw, gh, rgba("#0b1020", 0.80));

  // Food
  px(gx + s.food.x * s.cell + 1, gy + s.food.y * s.cell + 1, s.cell - 2, s.cell - 2, palette.heart2);
  px(gx + s.food.x * s.cell + 2, gy + s.food.y * s.cell + 2, s.cell - 4, s.cell - 4, palette.heart);

  // Snake
  for (let i = 0; i < s.body.length; i++) {
    const p0 = s.body[i];
    const c = i === 0 ? palette.leaf : palette.leaf2;
    px(gx + p0.x * s.cell + 1, gy + p0.y * s.cell + 1, s.cell - 2, s.cell - 2, c);
  }

  // Score
  ctx.fillStyle = rgba(palette.text, 0.90);
  ctx.fillText(`Score: ${s.score}`, gx + gw + 10, gy + 2);
  if (!s.alive) {
    ctx.fillStyle = rgba(palette.text, 0.95);
    ctx.fillText("Ouch! Click to restart.", gx + gw + 10, gy + 14);
  }
}

function drawHeartPopGame(t) {
  const p = arcadePanelRect();
  const hp = arcadeUI.heartPop;
  const area = { x: p.x + 14, y: p.y + 40, w: p.w - 28, h: p.h - 60 };

  px(area.x, area.y, area.w, area.h, rgba("#0b1020", 0.80));
  outlineRect(area, rgba("#ffffff", 0.18));

  for (const it of hp.items) {
    const x = area.x + Math.round(it.x * area.w);
    const y = area.y + Math.round(it.y * area.h);
    // tiny heart
    px(x, y + 1, 6, 4, palette.heart2);
    px(x + 1, y, 4, 2, palette.heart);
  }

  ctx.fillStyle = rgba(palette.text, 0.90);
  ctx.fillText(`Score: ${hp.score}`, area.x + 4, area.y + area.h + 6);
  ctx.fillStyle = rgba(palette.text, 0.75);
  ctx.fillText("Click hearts to pop!", area.x + 70, area.y + area.h + 6);
}

function drawButterflyGame(t) {
  const p = arcadePanelRect();
  const b = arcadeUI.butterfly;
  const area = { x: p.x + 14, y: p.y + 40, w: p.w - 28, h: p.h - 60 };

  px(area.x, area.y, area.w, area.h, rgba("#0b1020", 0.80));
  outlineRect(area, rgba("#ffffff", 0.18));

  for (const it of b.items) {
    const x = area.x + Math.round(it.x * area.w);
    const y = area.y + Math.round(it.y * area.h);
    drawButterfly(x - 2, y - 1, t, palette.heart, palette.heart2);
  }

  ctx.fillStyle = rgba(palette.text, 0.90);
  ctx.fillText(`Score: ${b.score}`, area.x + 4, area.y + area.h + 6);
  ctx.fillStyle = rgba(palette.text, 0.75);
  ctx.fillText("Click butterflies to catch!", area.x + 70, area.y + area.h + 6);
}

function handleArcadeClick(mx, my) {
  const p = arcadePanelRect();
  const v = arcadeViewportRect();
  if (!pointInRect(mx, my, p)) {
    closeArcade();
    return;
  }

  if (arcadeUI.screen === "menu") {
    // Compute button rects the same way as drawArcadeMenu (but without clipping).
    let y = -arcadeUI.scrollY;
    const bw = v.w - 6;
    const bx = v.x + 2;
    const bh = 18;
    const gap = 4;
    const b1 = { x: bx, y: v.y + y, w: bw, h: bh }; y += bh + gap;
    const b2 = { x: bx, y: v.y + y, w: bw, h: bh }; y += bh + gap;
    const b3 = { x: bx, y: v.y + y, w: bw, h: bh }; y += bh + gap;
    const b4 = { x: bx, y: v.y + y, w: bw, h: bh };

    if (pointInRect(mx, my, b1)) { resetSnake(); setArcadeScreen("snake"); return; }
    if (pointInRect(mx, my, b2)) { resetHeartPop(); setArcadeScreen("heartpop"); return; }
    if (pointInRect(mx, my, b3)) { resetButterfly(); setArcadeScreen("butterfly"); return; }
    if (pointInRect(mx, my, b4)) { openDressToImpress(); return; }
    return;
  }

  if (arcadeUI.screen === "snake") {
    const s = arcadeUI.snake;
    if (!s.alive) resetSnake();
    return;
  }

  if (arcadeUI.screen === "heartpop") {
    const hp = arcadeUI.heartPop;
    const area = { x: p.x + 14, y: p.y + 40, w: p.w - 28, h: p.h - 60 };
    for (let i = hp.items.length - 1; i >= 0; i--) {
      const it = hp.items[i];
      const x = area.x + Math.round(it.x * area.w);
      const y = area.y + Math.round(it.y * area.h);
      const hr = { x, y, w: 6, h: 6 };
      if (pointInRect(mx, my, hr)) {
        hp.items.splice(i, 1);
        hp.score += 1;
        return;
      }
    }
    return;
  }

  if (arcadeUI.screen === "butterfly") {
    const b = arcadeUI.butterfly;
    const area = { x: p.x + 14, y: p.y + 40, w: p.w - 28, h: p.h - 60 };
    for (let i = b.items.length - 1; i >= 0; i--) {
      const it = b.items[i];
      const x = area.x + Math.round(it.x * area.w);
      const y = area.y + Math.round(it.y * area.h);
      const br = { x: x - 4, y: y - 4, w: 8, h: 8 };
      if (pointInRect(mx, my, br)) {
        b.items.splice(i, 1);
        b.score += 1;
        if (b.items.length < 3) resetButterfly();
        return;
      }
    }
    return;
  }
}

function drawPoemBookOverlay(t) {
  if (!poemBook.open) return;
  const p = poemPanelRect();
  const side = poemSidebarRect();
  const v = poemViewportRect();
  const poem = poemsByMegh[poemBook.poemIndex] ?? { title: "Poems", text: "" };

  // Backdrop
  ctx.fillStyle = rgba(palette.ink, 0.62);
  ctx.fillRect(0, 0, W, H);

  // Panel (book-ish)
  px(p.x, p.y, p.w, p.h, rgba("#0b0f20", 0.94));
  px(p.x + 2, p.y + 2, p.w - 4, p.h - 4, rgba("#121a3a", 0.94));
  outlineRect(p, rgba("#ffffff", 0.22));
  // Inner paper border
  px(p.x + 6, p.y + 26, p.w - 12, p.h - 36, rgba("#fffbe5", 0.10));
  outlineRect({ x: p.x + 6, y: p.y + 26, w: p.w - 12, h: p.h - 36 }, rgba("#ffffff", 0.10));

  ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  ctx.fillStyle = palette.text;
  ctx.textBaseline = "top";
  ctx.fillText("Megh’s Poems", p.x + 10, p.y + 8);
  const pager = `${poemBook.poemIndex + 1}/${poemsByMegh.length}`;
  ctx.fillStyle = rgba(palette.text, 0.85);
  ctx.fillText(pager, p.x + p.w - 44, p.y + 8);
  // Close button
  const btnClose = { x: p.x + p.w - 22, y: p.y + 6, w: 14, h: 14 };
  px(btnClose.x, btnClose.y, btnClose.w, btnClose.h, rgba("#ffffff", 0.08));
  px(btnClose.x + 1, btnClose.y + 1, btnClose.w - 2, btnClose.h - 2, rgba("#000000", 0.18));
  ctx.fillStyle = rgba(palette.text, 0.90);
  ctx.fillText("X", btnClose.x + 5, btnClose.y + 4);

  // Sidebar (poem list)
  px(side.x, side.y, side.w, side.h, rgba("#000000", 0.18));
  px(side.x + 1, side.y + 1, side.w - 2, side.h - 2, rgba("#ffffff", 0.06));
  outlineRect(side, rgba("#ffffff", 0.12));

  ctx.fillStyle = rgba(palette.text, 0.85);
  ctx.fillText("Poems", side.x + 6, side.y + 4);
  let ty = side.y + 16;
  for (let i = 0; i < poemsByMegh.length; i++) {
    const active = i === poemBook.poemIndex;
    const row = { x: side.x + 4, y: ty - 1, w: side.w - 8, h: 10 };
    if (active) {
      px(row.x, row.y, row.w, row.h, rgba(palette.heart2, 0.30));
      outlineRect(row, rgba(palette.heart, 0.35));
    }
    const title = poemsByMegh[i].title.length > 16 ? poemsByMegh[i].title.slice(0, 16) + "…" : poemsByMegh[i].title;
    ctx.fillStyle = active ? rgba(palette.text, 0.95) : rgba(palette.text, 0.78);
    ctx.fillText(title, side.x + 6, ty);
    ty += 12;
  }

  // Page header (title + controls) above the content area
  const head = { x: v.x, y: v.y - 14, w: v.w, h: 12 };
  ctx.fillStyle = rgba(palette.text, 0.92);
  ctx.fillText(poem.title, head.x + 2, head.y + 2);
  // Prev/Next small buttons
  const btnPrev = { x: v.x + v.w - 76, y: head.y, w: 34, h: 12 };
  const btnNext = { x: v.x + v.w - 38, y: head.y, w: 34, h: 12 };
  drawButton(btnPrev, "Prev", rgba(palette.rug2, 0.55));
  drawButton(btnNext, "Next", rgba(palette.rug2, 0.55));

  // Content viewport (scrollable) — "paper" background
  px(v.x, v.y, v.w, v.h, rgba("#fffbe5", 0.10));
  outlineRect(v, rgba("#ffffff", 0.10));
  ctx.save();
  ctx.beginPath();
  ctx.rect(v.x, v.y, v.w, v.h);
  ctx.clip();

  const lineHeight = 10;
  let y = v.y + 4 - poemBook.scrollY;
  ctx.fillStyle = rgba(palette.text, 0.92);
  for (const line of poemBook.wrapped) {
    ctx.fillText(line, v.x + 4, y);
    y += lineHeight;
  }
  ctx.restore();

  // Scrollbar
  if (poemBook.maxScrollY > 0) {
    const track = { x: v.x + v.w - 4, y: v.y + 1, w: 3, h: v.h - 2 };
    px(track.x, track.y, track.w, track.h, rgba("#ffffff", 0.10));
    const thumbH = Math.max(10, Math.round((v.h / (v.h + poemBook.maxScrollY)) * v.h));
    const thumbY = Math.round(track.y + (poemBook.scrollY / poemBook.maxScrollY) * (track.h - thumbH));
    px(track.x, thumbY, track.w, thumbH, rgba(palette.sparkle, 0.70));
  }

  // Footer hint
  const hint = "Scroll: wheel/PgUp/PgDn • Click titles • Esc closes";
  ctx.fillStyle = rgba(palette.text, 0.70);
  ctx.fillText(hint, p.x + 10, p.y + p.h - 14);
}

function handlePoemBookClick(mx, my) {
  const p = poemPanelRect();
  const side = poemSidebarRect();
  const v = poemViewportRect();
  if (!pointInRect(mx, my, p)) {
    closePoemBook();
    return;
  }

  // Close button
  const btnClose = { x: p.x + p.w - 22, y: p.y + 6, w: 14, h: 14 };
  if (pointInRect(mx, my, btnClose)) { closePoemBook(); return; }

  // Prev/Next in the header above the content
  const headY = v.y - 14;
  const btnPrev = { x: v.x + v.w - 76, y: headY, w: 34, h: 12 };
  const btnNext = { x: v.x + v.w - 38, y: headY, w: 34, h: 12 };
  if (pointInRect(mx, my, btnPrev)) { setPoemIndex(poemBook.poemIndex - 1); return; }
  if (pointInRect(mx, my, btnNext)) { setPoemIndex(poemBook.poemIndex + 1); return; }

  // Sidebar poem selection
  if (pointInRect(mx, my, side)) {
    let ty = side.y + 16;
    for (let i = 0; i < poemsByMegh.length; i++) {
      const row = { x: side.x + 4, y: ty - 1, w: side.w - 8, h: 10 };
      if (pointInRect(mx, my, row)) { setPoemIndex(i); return; }
      ty += 12;
    }
  }
}

function draw() {
  const t = nowMs();
  drawBackground(t);

  // Draw objects in a simple back-to-front order based on y.
  const sorted = objects
    .slice()
    .sort((a, b) => ((a.z ?? 0) - (b.z ?? 0)) || ((a.rect.y + a.rect.h) - (b.rect.y + b.rect.h)));
  for (const o of sorted) drawObject(o, t);

  drawSparkleHint(t);
  drawNeyaliSprite(t);
  drawMiniUI(t);
  drawArcadeOverlay(t);
  drawPoemBookOverlay(t);
  drawDialogue(t);
}

// ---------- Main loop ----------
let last = nowMs();
function tick() {
  const t = nowMs();
  const dt = clamp((t - last) / 1000, 0, 0.05);
  last = t;

  updateArcade(dt);
  movePlayer(dt);
  draw();
  requestAnimationFrame(tick);
}

// Start.
openDialogue("Welcome!", [
  "This little game-type thing is my digital love letter to you",
  "Click objects around the room to see why I love you so much.",
  "Move: WASD / Arrows • Click objects • Close dialogue: Click / Space / Esc"
]);

tick();
