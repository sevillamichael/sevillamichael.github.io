// The page's code: draws everything from js/data.js and js/images.js.

// ── Set status ─────────────────────────────────────────────────────────
// "1-150, 152, 200-288" → Set{1..150, 152, 200..288}
function parseRanges(str) {
  const set = new Set();
  (str || "").split(",").forEach(part => {
    part = part.trim();
    const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) { for (let i = +m[1]; i <= +m[2]; i++) set.add(i); }
    else if (/^\d+$/.test(part)) set.add(+part);
  });
  return set;
}

// Total sticker count for a grid set (from groups, or explicit total)
const gridTotal = s => s.groups ? s.groups.reduce((a, g) => a + g.names.length, 0) : s.total;

// A set tracked as a numbered checklist rather than a single owned/not flag
const isGridSet = s => s.owned !== undefined && (s.total != null || s.groups);

// Stickers on their way (the coming range)
const comingOf = s => parseRanges(s.coming);

// Falta is what is neither in hand nor on its way, as everywhere on the site
const gridStateCount = (s, state) => {
  const owned = parseRanges(s.owned), coming = [...comingOf(s)].filter(n => !owned.has(n));
  return state === "complete" ? owned.size :
         state === "coming"   ? coming.length :
         gridTotal(s) - owned.size - coming.length;
};

// True when an entry declares its own state rather than deriving it from children
const hasOwnStatus = s => s.coming === true || s.complete !== undefined ||
                          (s.total != null && s.collected != null);

// A sheet entry shows its number of sheets, not stickers
const amountOf = s => s.sheets ?? s.total ?? "";
// An entry counts as its sheets (in Hojas), else as one
const unitsOf = n => n.sheets || 1;
const unitCount = list => list.reduce((n, e) => n + unitsOf(e), 0);

function setStatus(s) {
  // Number-range grid sets (impossible 1970-82 postales)
  if (isGridSet(s)) {
    const tot = gridTotal(s), owned = parseRanges(s.owned).size;
    return owned >= tot
      ? { state: "complete", detail: tot }
      : { state: "pending",  detail: `${owned}/${tot}` };
  }
  // An entry that states its own status wins over its items (2014's complete Set with a coming promo)
  if (Array.isArray(s.items) && s.items.length && !hasOwnStatus(s)) {
    const real = s.items;
    // When every item shares one state, the group shows it (all De camino reads ✈️, not ✗)
    if (real.length) {
      const states = new Set(real.map(it => setStatus(it).state));
      if (states.size === 1) {
        const only = [...states][0];
        if (only === "complete") return { state: "complete", detail: "" };
        if (only === "coming")   return { state: "coming",   detail: `${real.length}` };
        if (only === "pending")  return { state: "pending",  detail: `${real.length}` };
      }
    }
    const done = real.filter(it => setStatus(it).state === "complete").length;
    return done === real.length
      ? { state: "complete", detail: "" }
      : { state: "pending",  detail: `${done}/${real.length}` };
  }
  if (s.coming)             return { state: "coming",   detail: amountOf(s) };
  if (s.complete === true)  return { state: "complete", detail: amountOf(s) };
  if (s.complete === false) return { state: "pending",  detail: amountOf(s) };
  if (s.total != null && s.collected != null) {
    // Complete shows the total; in progress shows x/y (or the total when nothing's in)
    return s.collected >= s.total
      ? { state: "complete", detail: s.total }
      : { state: "pending",  detail: s.collected > 0 ? `${s.collected}/${s.total}` : s.total };
  }
  return { state: "unknown", detail: s.total ?? "—" };
}
// "none": no icon, normal style (the subtab implies the state); "unknown": dimmed, not tracked yet
const stateClass = st =>
  st === "complete" ? "is-confirmed" :
  st === "pending"  ? "is-pending"   :
  st === "coming"   ? "is-coming"    :
  st === "none"     ? ""             : "is-unknown";

// Screen-reader names for the ✓/✗/✈️ icons, which are CSS only
const STATE_NAME = { "is-confirmed": "Tengo", "is-pending": "Falta", "is-coming": "De camino" };
const srState = cls => (STATE_NAME[cls] ? `<span class="sr-only"> ${STATE_NAME[cls]}</span>` : "");

// A set's leaves for the stats: its items, or itself
const setLeaves = s => (Array.isArray(s.items) && s.items.length ? s.items : [s]);

// A node's children, its leaves, and its green count (a group counts only if it states its own status)
const kidsOf = n => (Array.isArray(n.items) ? n.items : []);
// Every leaf under a node: the stickers and sets themselves, never the groups
const leavesOf = n => { const k = kidsOf(n); return k.length ? k.flatMap(leavesOf) : [n]; };
function deepGreens(node) {
  const kids = kidsOf(node);
  if (!kids.length) return setStatus(node).state === "complete" ? 1 : 0;
  const own = hasOwnStatus(node) && setStatus(node).state === "complete" ? 1 : 0;
  return own + kids.reduce((n, k) => n + deepGreens(k), 0);
}
// Postales reads as a score: its green leaves out of all its leaves
const POSTALES = "Postales";
// "3" when all are in hand (the ✓ says the rest), else "2/3"
const ofAll = (n, total) => n === total ? String(total) : `${n}/${total}`;
// null when there is only one set to own — "1/1" says less than a plain check
const setsScore = it => {
  const leaves = leavesOf(it);
  const green  = leaves.filter(l => setStatus(l).state === "complete").length;
  return leaves.length > 1 ? ofAll(green, leaves.length) : null;
};

// A year's sets one by one, as its card counts them (a group with its own status counts too)
const entriesOf = n => {
  const kids = kidsOf(n);
  if (!kids.length) return [n];
  return [...(hasOwnStatus(n) ? [n] : []), ...kids.flatMap(entriesOf)];
};
const setEntries = album => {
  const p = album.postales;
  if (!p) return [];
  const first = kidsOf(p)[0];
  return [...(first ? entriesOf(first) : [p]),
          ...(album.sets || []).filter(s => !s.afterPostales)
            .flatMap(s => kidsOf(s).length ? kidsOf(s).flatMap(entriesOf) : [s])];
};

// A set's greens: its items (recursively), or itself when it has none
const setGreens = s => {
  const kids = kidsOf(s);
  return kids.length ? kids.reduce((n, k) => n + deepGreens(k), 0)
                     : (setStatus(s).state === "complete" ? 1 : 0);
};

// ── Todo card figures ──────────────────────────────────────────────────
// Each Todo card figure counts the green checks in one row of the Sets tab
const postalesSetGreens = p => {
  if (!p) return 0;
  const first = kidsOf(p)[0];
  return first ? deepGreens(first) : (setStatus(p).state === "complete" ? 1 : 0);
};
const VARIANTES_ID = "variantes", HOJAS_ID = "hojas";
// The row of sheets and Actualizaciones, and their photos' subtab
const HOJAS = "Hojas";
// Variantes: every green in the Variantes row (sets with a spot in some album)
const variantesGreens = album =>
  (album.sets || []).reduce((n, s) => n + (s.id === VARIANTES_ID ? setGreens(s) : 0), 0);
// Hojas: the sheets in hand, every green in the Hojas row adding its sheets (as the row does)
const hojasGreens = album => unitCount((album.sets || []).filter(s => s.id === HOJAS_ID)
  .flatMap(s => kidsOf(s).flatMap(entriesOf)).filter(e => setStatus(e).state === "complete"));
// Otros: every green outside Variantes, Hojas and the player sets
const otrosGreens = album =>
  (album.sets || []).reduce((n, s) =>
    n + (s.afterPostales || s.id === VARIANTES_ID || s.id === HOJAS_ID ? 0 : setGreens(s)), 0);

// ── Set ledger rows (shared by set-tab cards and per-year gallery) ─────
// A variant's colour dot after its name (screen readers get the colour as text)
const colorDot = dot => DOT_NAME[dot]
  ? `<span class="color-dot dot-${dot}" title="${DOT_NAME[dot]}" aria-hidden="true"></span>` +
    `<span class="sr-only"> (${DOT_NAME[dot]})</span>`
  : "";

function ledgerRow(label, st, dot) {
  return `<div class="card-count-row">
      <span class="count-label"><span class="count-label-text">${esc(label)}</span>${colorDot(dot)}</span>
      <span class="count-val ${stateClass(st.state)}">${st.detail}${srState(stateClass(st.state))}</span>
    </div>`;
}

// A row with a caret that opens a panel below it; panels nest
function expBlock(label, st, innerHtml, open, dot) {
  return `<div class="exp${open ? " open" : ""}">
      <div class="card-count-row">
        <span class="count-label"><span class="count-label-text">${esc(label)}</span>${colorDot(dot)}<button type="button" class="exp-toggle" aria-expanded="${open ? "true" : "false"}" aria-label="${esc(label)}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button></span>
        <span class="count-val ${stateClass(st.state)}">${st.detail}${srState(stateClass(st.state))}</span>
      </div>
      <div class="exp-panel">${innerHtml}</div>
    </div>`;
}

// Person names in reference lines shorten to an initial when they don't fit ("CC6 F. Valverde");
// plain: true opts a list out, and these words mark a line as a thing, not a person
const NOT_A_NAME = /^(badge|team|photo|emblem|escudo|flag|mascot|poster|champions|city|copa|mundial|cup)$/i;
// Surname particles are never shortened ("santa" keeps Santa Cruz whole)
const NAME_PARTICLES = new Set(["van","von","de","del","della","di","da","dos","das",
                                "du","la","le","el","den","der","bin","ibn","al","st.",
                                "santa","vanden","vander","vande","ten","ter"]);
// esc: makes text safe inside HTML; isCode: a leading code kept as is (CC6, No.10, 417, M6)
const esc = t => String(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;")
                          .replace(/</g, "&lt;").replace(/>/g, "&gt;");
const isCode = w => /\d/.test(w) || /^[A-ZÀ-Ý]{1,3}$/.test(w);
function shortenPart(part) {
  const m = part.match(/^(.*?)(\s*\([^)]*\))?$/);
  const words = m[1].trim().split(/\s+/), tail = m[2] || "";
  let i = 0;
  while (i < words.length && isCode(words[i])) i++;
  const name = words.slice(i);
  if (name.length < 2 || name.some(w => NOT_A_NAME.test(w))) return part;
  // every word up to the surname may become an initial
  for (let j = i; j < words.length - 1; j++) {
    const w = words[j];
    if (NAME_PARTICLES.has(w.toLowerCase()) || /^\p{L}\.$/u.test(w)) continue;
    words[j] = w[0] + ".";
  }
  return words.join(" ") + tail;
}
// Measures text in em with the site's font on a canvas, to know if a line fits its card
const emCanvas = document.createElement("canvas").getContext("2d");
let emFont = "";
const textEm = str => {
  emCanvas.font = emFont ||= `400 12px ${getComputedStyle(document.body).fontFamily}`;
  return emCanvas.measureText(str).width / 12;
};
// Room for a reference line: the card is ~154px wide, each nesting level 6px less, 12px text
const CARD_TEXT_PX = 154, PANEL_INDENT_PX = 6, LINE_FONT_PX = 12;
const lineFitsEm = depth => (CARD_TEXT_PX - depth * PANEL_INDENT_PX) / LINE_FONT_PX;
// Shortens one name only if it doesn't fit its room
const shortenName = (name, em) => {
  if (textEm(name) <= em) return name;
  const short = shortenPart(name);
  return short.length < name.length ? short : name;
};
const shortenLine = (line, depth = 3) => {
  if (textEm(line) <= lineFitsEm(depth)) return line;
  const short = line.split(" / ").map(shortenPart).join(" / ");
  return short.length < line.length ? short : line;
};
// Places that don't fit use their usual short form (full name in the tooltip)
const PLACE_SHORT = { "New York New Jersey": "NY New Jersey", "San Francisco Bay Area": "SF Bay Area" };
const fitPlace = (line, depth = 3) => (textEm(line) <= lineFitsEm(depth) ? line : PLACE_SHORT[line] || line);

// A group whose every entry is in hand shows one ✓; its rows show none
const allInHand = n => setStatus(n).state === "complete" &&
  kidsOf(n).every(k => kidsOf(k).length ? allInHand(k) : setStatus(k).state === "complete");

// Variantes, Hojas, Otros and player groups count their sets: Todo "3/5", Tengo "3", Falta "2/5", De camino "1"
const SCORED_ROWS = ["Variantes", HOJAS, "Otros"];
const rowEntries = it => kidsOf(it).flatMap(entriesOf);
const rowScore = (it, state) => {
  const entries = rowEntries(it), all = unitCount(entries);
  const count = st => unitCount(entries.filter(e => setStatus(e).state === st));
  if (all === 1 && state !== "coming") return "1";
  if (!state) return ofAll(count("complete"), all);
  if (state === "complete") return String(count("complete"));
  if (state === "pending") return `${count("pending")}/${all}`;
  return String(count("coming"));
};

// quiet: a group above already shows the ✓ for this row
function expItemHtml(it, state, depth = 1, openAll = false, inAct = false, quiet = false) {
  if (kidsOf(it).length) {
    const allIn = !quiet && allInHand(it);
    // Actualización opens in a state subtab, but its sections stay shut (too many names)
    const actInside = inAct || it.label === ACTUALIZACION;
    // Each child filters itself, so a subtab is Todo minus the rows not in that state
    const out = it.items.map(x => [x, expItemHtml(x, state, depth + 1, openAll, actInside, quiet || allIn)]).filter(([, html]) => html);
    // A group in Hojas sums the sheets nested in it
    const shown = unitCount(out.map(([x]) => x));
    const inner = out.map(([, html]) => html).join("");
    // Counted rows show their score; others their total, or nothing
    const scored = openAll || (depth === 1 && SCORED_ROWS.includes(it.label));
    const detail = (scored && rowScore(it, state)) || (it.countNested ? String(shown) : (it.total ?? ""));
    // Player tabs open their top groups in every subtab; nested groups start shut
    const playerOpen = openAll && depth === 1;
    if (!state) {
      // Only Postales shows x/y here; other groups show a count
      const score = it.label === POSTALES ? setsScore(it) : null;
      const lone  = scored && unitCount(rowEntries(it)) === 1 && setStatus(it).state === "complete";
      return expBlock(it.label, { state: quiet || lone ? "none" : setStatus(it).state, detail: score ?? detail }, inner, depth === 1, it.dot);
    }
    // In a subtab a group shows only if it's in that state (or all in hand, for Tengo); empty means no caret
    const inState  = (hasOwnStatus(it) && setStatus(it).state === state) ||
                     (state === "complete" && allInHand(it));
    const icon     = inState && !quiet && !(scored && unitCount(rowEntries(it)) === 1) ? state : "none";
    if (!inner) return inState ? ledgerRow(it.label, { state: icon, detail }, it.dot) : "";
    return expBlock(it.label, { state: icon, detail }, inner, openAll ? playerOpen : !inAct, it.dot);
  }
  if (state && setStatus(it).state !== state) return "";
  const st = quiet ? { ...setStatus(it), state: "none" } : setStatus(it);
  if (!it.sub || !it.sub.length) return ledgerRow(it.label, st, it.dot);
  const lines = it.sub.map(line => {
    // "419 A / B" is two players on one sticker: each name gets its own line
    const pair = it.plain ? null : line.match(/^(\d+)\s+(.+?) \/ (.+)$/);
    if (pair) {
      const em = lineFitsEm(depth + 1) - textEm(pair[1] + " ");
      const a = shortenName(pair[2], em), b = shortenName(pair[3], em);
      const cut = a !== pair[2] || b !== pair[3];
      return `<div class="exp-line exp-pair"${cut ? ` title="${esc(line)}"` : ""}>` +
             `<span>${pair[1]}</span><span>${esc(a)}<br />${esc(b)}</span></div>`;
    }
    const shown = it.plain ? fitPlace(line, depth + 1) : shortenLine(line, depth + 1);
    // A line with no short form shrinks to fit, down to 11px, then ends in "…"
    const room = lineFitsEm(depth + 1), em = textEm(shown);
    const px = Math.max(11, Math.floor(24 * room / em) / 2), cut = em * px > room * 12;
    const size = em > room ? ` style="font-size: ${px}px"` : "";
    return `<div class="exp-line${cut ? " is-cut" : ""}"${size}${shown !== line || cut ? ` title="${esc(line)}"` : ""}>${esc(shown)}</div>`;
  }).join("");
  // A subtab stops opening at a row with its own number and state; player tabs open everything
  return expBlock(it.label, st, lines, openAll && !inAct, it.dot);
}

// state (optional) keeps only the rows in that state
const setRowsHtml = (s, state, openAll = false) => {
  if (Array.isArray(s.items) && s.items.length) {
    return s.items.map(it => expItemHtml(it, state, 1, openAll)).filter(Boolean).join("");
  }
  // A 1970-82 checklist reports its sticker count in a subtab (Falta excludes De camino)
  if (state && isGridSet(s)) {
    const n = gridStateCount(s, state);
    return n ? ledgerRow(POSTALES, { state, detail: n }) : "";
  }
  if (state && setStatus(s).state !== state) return "";
  return ledgerRow(POSTALES, setStatus(s));
};

// The Variantes, Hojas and Otros rows are built from the year's sets, never copied
const ACTUALIZACION = "Actualización";
// Entries read A-Z unless keepOrder: true
const otrosSortedEntries = c => {
  const kids = c.items || [];
  const sorted = c.keepOrder ? kids
                             : [...kids].sort((a, b) => a.label.localeCompare(b.label, "es"));
  return sorted.map(k => (k.items ? { ...k, items: otrosSortedEntries(k) } : k));
};

const OTROS_MIRROR_LABEL = "Otros";
// Variantes and Hojas get their own rows above Otros; everything else goes under Otros
const OWN_ROWS = [VARIANTES_ID, HOJAS_ID];
const otrosMirrorRows = album => {
  const rows = [], otros = [];
  (album.sets || [])
    .filter(c => !c.afterPostales)
    .sort((a, b) => (OWN_ROWS.indexOf(a.id) + 1 || 99) - (OWN_ROWS.indexOf(b.id) + 1 || 99))
    .forEach(c => {
      // List each section's entries A-Z
      const entries = otrosSortedEntries(c);
      if (OWN_ROWS.includes(c.id)) rows.push({ label: c.label, countNested: true, items: entries });
      // A section named "Otros" puts its entries straight into the Otros row
      else if (c.label === OTROS_MIRROR_LABEL) otros.push(...entries);
      else otros.push({ label: c.label, countNested: true, items: entries });
    });
  if (otros.length) rows.push({ label: OTROS_MIRROR_LABEL, countNested: true, items: otros });
  return rows;
};

// Top-level rows read A-Z, with premium variants last in this order
const VARIANT_LAST = ["Swiss", "Platinum", "Gold", "Oryx", "United", "USA", "Extras"];
const variantRank = label => VARIANT_LAST.findIndex(v => new RegExp(`\\b${v}\\b`).test(label));
const orderedItems = items => [...items].sort((a, b) => {
  const ra = variantRank(a.label), rb = variantRank(b.label);
  if (ra < 0 && rb < 0) return a.label.localeCompare(b.label, "es");
  if (ra < 0) return -1;
  if (rb < 0) return 1;
  return ra - rb;
});

// A year's Postales rows: its own items (A-Z), then Variantes, Hojas and Otros
const postalesRows = (album, p) => [
  ...p.items.map(it =>
    Array.isArray(it.items) && it.items.length ? { ...it, items: orderedItems(it.items) } : it),
  ...otrosMirrorRows(album),
];

function setLedgerRows(album, key, state) {
  const parts = [];
  const s = setForFilter(album, key);
  if (s) {
    let target = s;
    if (key === "postales" && Array.isArray(s.items)) {
      target = { ...s, items: postalesRows(album, s) };
    } else if (Array.isArray(s.items) && s.items.length) {
      // A player set: order its top-level rows the same way
      target = { ...s, items: orderedItems(s.items) };
    }
    // Player sets are short, so they render fully expanded in every subtab
    const rows = setRowsHtml(target, state, !!s.afterPostales);
    if (rows) parts.push(rows);
  }
  return parts.join("");
}

const imageCounts = {};

// The full copy of a rescanned álbum or sobre is 1231 px tall (57% of the scanner's 2160)
const ITEM_FULL_H = 1231;
// A grid photo with its preview; when shown big, the browser picks the full copy instead
const galleryImg = (src, alt, sizes) => {
  const size = GRID_PREVIEWS[src];
  const preview = size ? src.replace(/\/([^/]+)$/, "/previews/$1") : src;
  const set = size && sizes ? ` data-srcset="${preview} ${size[0]}w, ${src} ${Math.round(size[0] * ITEM_FULL_H / size[1])}w" sizes="${sizes}"` : "";
  return `<img class="gallery-img" data-src="${preview}"${set}${size ? ` data-full="${src}" width="${size[0]}" height="${size[1]}"` : ""} alt="${alt}" loading="lazy" decoding="async" role="button" tabindex="0" />`;
};
// A year page's Álbumes / Sobres photos get their address when their tab is shown
const showSectionImages = section =>
  section.querySelectorAll("img[data-src]").forEach(img => {
    if (img.dataset.srcset) img.srcset = img.dataset.srcset;
    img.src = img.dataset.src;
    img.removeAttribute("data-src");
  });

// Shows a scan's front and back as two cut-outs without the black border (iw x ih image, b px border)
const cropped = (img, iw, ih, b, withBack = true) => {
  const fw = (iw - 3 * b) / 2, fh = ih - 2 * b, pc = v => `${+(v * 100).toFixed(4)}%`;
  const face = (x, el) => `<span class="photo-crop" style="--w: ${pc(iw / fw)}; --h: ${pc(ih / fh)}; --l: ${pc(-x / fw)}; --t: ${pc(-b / fh)}">${el}</span>`;
  // The back's copy is only a picture: the front's is the photo's button
  const back = img.replace('class="gallery-img"', 'class="gallery-img-back"')
    .replace(' role="button" tabindex="0"', ' aria-hidden="true"').replace(/ alt="[^"]*"/, ' alt=""');
  return `<span class="photo-pair" style="--f: ${fw} / ${fh}">${face(b, img)}${withBack ? face(2 * b + fw, back) : ""}</span>`;
};
// Album and sobre scans are 2160 px tall with an 80 px border
const itemWidth = src => { const s = GRID_PREVIEWS[src]; return s[0] * 2160 / s[1]; };

// Rows that fill the width, 4 per row on the web and 2 on phones; a short last row keeps a full row's size
function rowsHtml(items, shape, figure) {
  const n = items.length, webPad = n >= 4, phonePad = n >= 2;
  const sum = list => list.reduce((a, it) => a + shape(it), 0);
  const chunk = (list, k) => list.reduce((out, x, i) => (i % k ? out[out.length - 1].push(x) : out.push([x]), out), []);
  return chunk(items, 4).map(row => {
    const pairs = chunk(row, 2), avg = sum(row) / row.length;
    // The row's shapes as the web lays it out, empty spots included, for each photo's size
    const webSum = sum(row) + (webPad ? (row.length % 2 ? shape(row[row.length - 1]) : 0) + (row.length <= 2 ? 2 * avg : 0) : 0);
    const pair = two => {
      const phoneSum = sum(two) + (two.length === 1 && phonePad ? sum(two) : 0);
      // A lone photo's pair grows as two with its empty spot, or as one where that spot isn't shown
      const style = two.length === 1 && !webPad ? `--a: ${sum(two)}; --b: var(--fixed)` : `--a: ${two.length === 1 ? 2 * sum(two) : sum(two)}`;
      return `<div class="item-pair" style="${style}">${two.map(it => figure(it, shape(it) / phoneSum, shape(it) / webSum)).join("")}${two.length === 1 && phonePad
        ? `<span class="item-pad${webPad ? "" : " phone-only"}" style="--a: ${sum(two)}"></span>` : ""}</div>`;
    };
    return `<div class="item-row">${pairs.map(pair).join("")}${webPad && row.length <= 2
      ? `<div class="item-pair item-pad-pair" style="--a: ${2 * avg}"></div>` : ""}</div>`;
  }).join("");
}

// Wrapping rows (.flat-rows) sized for web and phone at once; cap limits a row with fewer photos than a full one
function flatRowsHtml(items, perRow, widths, figure, cap) {
  const fit = k => {
    const out = [];
    for (let i = 0; i < items.length; i += k) {
      const row = items.slice(i, i + k), n = items.length >= k ? k : row.length;
      const ws = widths(row), sum = ws.reduce((a, b) => a + b, 0) * n / row.length;
      row.forEach((it, j) => out.push([ws[j] / sum, n, cap && items.length < k ? cap(row, j) : null]));
    }
    return out;
  };
  const web = fit(perRow), phone = fit(2);
  const vars = (p, [s, n, c]) => `; --${p}s: ${s}; --${p}n: ${n}${c === null ? "" : `; --${p}c: ${c}`}`;
  return `<div class="flat-rows">${items.map((it, i) => figure(it, phone[i][0], web[i][0],
    vars("w", web[i]) + vars("p", phone[i]))).join("")}</div>`;
}

// Sobres: 3 per row on the web, 2 on phones; one lying sideways takes an upright one's place
const SOBRES_PER_ROW = 3;
const onItsSide = a => a > 2;
const sobreWidths = shape => row => {
  const upright = row.map(shape).filter(a => !onItsSide(a));
  const place = upright.length && upright.length < row.length ? upright.reduce((a, b) => a + b) / upright.length : 0;
  return row.map(it => place && onItsSide(shape(it)) ? place : shape(it));
};

// A year's sobres or albums in rows, names on top (every photo gets the line once one has a name)
function itemRows(paths, alt, caption = getVersionLabel, perRow = 4) {
  const named = paths.some(caption);
  const altOf = src => typeof alt === "function" ? alt(src) : alt;
  // A sobre's shape without its border and gap
  const shape = src => GRID_PREVIEWS[src] ? (itemWidth(src) - 240) / 2000 : 1.6;
  // The image itself is laid out bigger than its faces by this much
  const over = src => GRID_PREVIEWS[src] ? itemWidth(src) / (itemWidth(src) - 240) : 1;
  const img = (src, sizes) => GRID_PREVIEWS[src] ? cropped(galleryImg(src, altOf(src), sizes), itemWidth(src), 2160, 80) : galleryImg(src, altOf(src), sizes);
  const figure = (src, phone, web, sizes = "") => `<figure class="gallery-figure" style="--a: ${shape(src)}${sizes}">${named ? `<figcaption class="gallery-label">${caption(src) || ""}</figcaption>` : ""}${img(src,
    `(max-width: 480px) ${Math.ceil(100 * over(src) * phone)}vw, ${Math.ceil(1120 * over(src) * web)}px`)}</figure>`;
  return perRow === 4 ? rowsHtml(paths, shape, figure) : flatRowsHtml(paths, perRow, sobreWidths(shape), figure);
}

function getVersionLabel(path) {
  const base = path.replace(/\.[^.]+$/, "").split("/").pop();
  const parts = base.split("_");
  if (parts.length < 3) return null;
  return parts.slice(2).join(" ").replace(/-/g, " ").split(" ").map(w => LABEL_WORD[w] || w).join(" ");
}

// ── Card rendering ─────────────────────────────────────────────────────
// The "Total:" line under the subtabs
function renderTabCount(filterKey, subState) {
  const el = document.getElementById("tab-count");
  // Galería: counts the photos its subtab shows (a multi-sheet set counts once)
  if (filterKey === null) {
    const list = gallerySection(subState) ? null : subState === "sobres" ? "sobrePaths" : "albumPaths";
    const n = list ? ALBUMS.reduce((sum, a) => sum + ((IMAGE_LISTS[a.year] || {})[list] || []).length, 0)
      : gallerySetPhotos(subState).filter(ph => !(ph.page > 1)).length;
    el.hidden = !n;
    el.textContent = `Total: ${n}`;
    return;
  }
  // Tracker counts the sets the year cards count; a player tab counts its stickers
  const leaves = filterKey === "postales" ? ALBUMS.filter(inTracker).flatMap(setEntries)
    : filterKey ? ALBUMS.map(a => setForFilter(a, filterKey)).filter(s => s && s.afterPostales).flatMap(leavesOf)
    : [];
  // A player's Galería counts its photos, still-to-scan ones included
  if (subState === PHOTOS) {
    const n = playerGalleryPhotos(filterKey, shownPlayerGallery(filterKey)).length;
    el.hidden = !n;
    el.textContent = `Total: ${n}`;
    return;
  }
  el.hidden = !leaves.length;
  if (el.hidden) return;
  // Todo and De camino: "Total: N"; Tengo and Falta: "Total: n de N"
  const n = subState ? leaves.filter(l => setStatus(l).state === subState).length : leaves.length;
  el.textContent = subState === "complete" || subState === "pending"
    ? `Total: ${n} de ${leaves.length}`
    : `Total: ${n}`;
}

// ── Player photos (the Fotos subtab) ──────────────────────────────────
// A player's photos in checklist order, captioned by their row ("ARG 20 Made in Italy")
const PHOTO_WORD = { Extras: "Extra" };
// withMissing: stickers in hand without a photo get a "Falta escanear" spot
function playerPhotos(key, withMissing = false) {
  const out = [];
  ALBUMS.forEach(album => {
    const s = setForFilter(album, key);
    if (!s || !s.afterPostales) return;
    const walk = (n, path) => {
      if (kidsOf(n).length) return kidsOf(n).forEach(k => walk(k, [...path, n.label]));
      const name = [...path, n.caption || n.label].map(w => PHOTO_WORD[w] || w).join(" ");
      if (n.photo) out.push({ year: album.year, player: s.label, dot: n.dot, name,
                              src: `assets/players/${s.id}/${n.photo}` });
      else if (withMissing && setStatus(n).state === "complete") {
        out.push({ year: album.year, player: s.label, dot: n.dot, name, missing: true });
      }
    };
    orderedItems(kidsOf(s)).forEach(top => walk(top, []));
  });
  return out;
}

// A player's photos, oldest first, 4 per row (2 on phones); a year's first photo is its link target
function photoWallHtml(key) {
  const photos = playerPhotos(key, true);
  const firstOfYear = new Set();
  const figs = photos.map(p => {
    const first = !firstOfYear.has(p.year);
    firstOfYear.add(p.year);
    const caption = `${p.year} · ${p.name}`;
    const named   = `${caption}${p.dot ? ` (${DOT_NAME[p.dot]})` : ""}`;
    // The caption on top, as on every photo grid
    if (p.missing) return `<figure class="gallery-figure is-missing"${first ? ` id="fotos-${p.year}" tabindex="-1"` : ""}>
        <figcaption class="gallery-label">${esc(caption)}${colorDot(p.dot)}</figcaption>
        <div class="gallery-missing" role="img" aria-label="${esc(`${p.player} ${named}: falta escanear`)}"><span>Falta escanear</span></div>
      </figure>`;
    // 600 px preview in the grid, 1200 px photo in the viewer (scans are 1640 x 1080, 40 px border)
    return `<figure class="gallery-figure"${first ? ` id="fotos-${p.year}" tabindex="-1"` : ""}>
        <figcaption class="gallery-label">${esc(caption)}${colorDot(p.dot)}</figcaption>
        ${cropped(`<img class="gallery-img" src="${p.src.replace(/\/([^/]+)$/, "/previews/$1")}" data-full="${p.src}" alt="${esc(`${p.player} ${named}`)}" data-label="${esc(caption)}"${p.dot ? ` data-dot="${p.dot}"` : ""}
             width="600" height="395" loading="lazy" decoding="async" role="button" tabindex="0" />`, 1640, 1080, 40)}
      </figure>`;
  }).join("");
  return figs ? `<div class="${gridClass(photos.length)} player-wall">${figs}</div>` : "";
}

// A player's Galería: Postales, Álbumes and Hojas (album pages and sheets, photographed but not tracked)
const PLAYER_GALLERY = [{ key: "postales", label: POSTALES, word: "Postal" },
                        { key: "albumes",  label: "Álbumes", word: "Álbum" },
                        { key: "hojas",    label: HOJAS,     word: "Hoja" }];
let playerGallery = "postales"; // the section picked; carried to the next player that has it
function playerExtras(key, kind) {
  return ALBUMS.flatMap(album => {
    const s = setForFilter(album, key);
    return s && s.afterPostales ? (s[kind] || []).map(e => ({ year: album.year, player: s.label,
      name: [yearName(album.year), e.label].filter(Boolean).join(" · "), src: `assets/players/${s.id}/${kind}/${e.photo}`,
      thumb: `assets/players/${s.id}/${kind}/fronts/${e.photo}`, size: (SET_PREVIEWS[e.photo] || [])[0] })) : [];
  });
}
const playerGalleryPhotos = (key, kind) => kind === "postales" ? playerPhotos(key, true) : playerExtras(key, kind);
const playerGallerySections = key => PLAYER_GALLERY.filter(t => playerGalleryPhotos(key, t.key).length);
// The section shown: the one picked while this player has it, else its first
const shownPlayerGallery = key => {
  const sections = playerGallerySections(key);
  return (sections.find(t => t.key === playerGallery) || sections[0] || PLAYER_GALLERY[0]).key;
};
function renderPlayerGalleryTabs(key, subState) {
  const nav = document.getElementById("player-gallery-tabs");
  const sections = key && subState === PHOTOS ? playerGallerySections(key) : [];
  nav.hidden = sections.length < 2;
  const shown = nav.hidden ? null : shownPlayerGallery(key);
  nav.innerHTML = nav.hidden ? "" : sections.map(t => {
    const active = t.key === shown;
    return `<button class="view-tab player-gallery-btn${active ? " is-active" : ""}" data-gallery="${t.key}" type="button" aria-pressed="${active}">${t.label}</button>`;
  }).join("");
}
// Sheets and album pages lie like a year's sets: by their fronts, at sticker scale
function playerGalleryHtml(key) {
  const kind = shownPlayerGallery(key);
  if (kind === "postales") return photoWallHtml(key);
  const word = PLAYER_GALLERY.find(t => t.key === kind).word;
  return `<div class="gallery-images item-rows set-rows">${flatRowsHtml(playerExtras(key, kind), 4, setWidths,
    (ph, phone, web, vars) => setFigure(ph, `${ph.player} ${word}`, "", vars), setCap)}</div>`;
}

// The Galería: every album, sobre and set photo, oldest first, named with its year
const GALLERY_SUBS = [
  { state: null,     label: "Álbumes" },
  { state: "sobres", label: "Sobres" },
  // Then a subtab per Sets section, each once it has a photo
  { state: "postales",  label: POSTALES,  section: POSTALES },
  { state: "variantes", label: "Variantes", section: "Variantes" },
  { state: "hojas",     label: HOJAS,     section: HOJAS },
  { state: "otros",     label: "Otros",   section: OTROS_MIRROR_LABEL },
];
// The set section a Galería subtab shows, if it is one
const gallerySection = st => GALLERY_SUBS.find(t => t.state === st)?.section;
const gallerySetPhotos = st => ALBUMS.flatMap(al => setPhotos(al)
  .filter(ph => ph.section === gallerySection(st)).map(ph => ({ ...ph, year: al.year })));
const yearName = (y, album) => y === "story" ? (album ? "World Cup Story" : "Story") : String(y);
function galleryWallHtml(kind) {
  if (gallerySection(kind)) {
    return `<div class="gallery-images item-rows set-rows">${flatRowsHtml(gallerySetPhotos(kind), 4, setWidths,
      (ph, phone, web, vars) => setFigure(ph, `${gallerySection(kind)} ${yearName(ph.year)}`, `${yearName(ph.year)} · `, vars), setCap)}</div>`;
  }
  const list = kind === "sobres" ? "sobrePaths" : "albumPaths", word = kind === "sobres" ? "Sobre" : "Álbum";
  const yearOf = new Map(ALBUMS.flatMap(al => ((IMAGE_LISTS[al.year] || {})[list] || []).map(src => [src, al.year])));
  const name = src => [yearName(yearOf.get(src), kind !== "sobres"), getVersionLabel(src)].filter(Boolean).join(" · ");
  return `<div class="gallery-images item-rows">${itemRows([...yearOf.keys()], src => `${word} ${name(src)}`, name,
    kind === "sobres" ? SOBRES_PER_ROW : 4)}</div>`;
}

// "España 1982", or the host alone when it's already a full name
const albumTitle = album =>
  album.year === "story" || album.year === 2026 ? album.host : `${album.host} ${album.year}`;

// Tracker's card: the year's own sets (Set or Sets), then Variantes, Hojas and Otros; a subtab keeps only that state
function trackerSets(album, subState = null) {
  const p = album.postales;
  // Years with nothing in hand or coming (1970-78) leave their postales out
  if (!inTracker(album)) return { sets: "", rest: "" };
  const rows = p.items ? postalesRows(album, p) : [];
  const own  = p.items ? rows.slice(0, p.items.length) : [];
  // The sets themselves: a Postales group's prints, else its rows, else the year's one set
  const group = own.length === 1 && kidsOf(own[0]).length && !own[0].dot ? own[0] : null;
  const sets  = group ? kidsOf(group) : own.length ? own : [p];
  const states = sets.map(n => setStatus(n).state);
  const state  = states.every(st => st === "complete") ? "complete" : states.includes("pending") ? "pending" : "coming";
  const quiet  = state === "complete";
  const inner  = p.items
    ? sets.map(n => expItemHtml(n, null, 2, false, false, quiet)).join("")
    : ledgerRow(POSTALES, quiet ? { ...setStatus(p), state: "none" } : setStatus(p));
  const green  = states.filter(st => st === "complete").length;
  const rest   = rows.filter(it => !own.includes(it)).map(it => expItemHtml(it, subState, 1, false)).filter(Boolean).join("");
  if (subState) {
    // A 1970-82 checklist counts its stickers in that state (Tengo reads 365/427)
    if (isGridSet(p)) {
      const n = gridStateCount(p, subState);
      const st = subState === "complete" ? { state: "none", detail: `${n}/${gridTotal(p)}` } : { state: subState, detail: n };
      return { sets: n ? ledgerRow("Set", st) : "", rest };
    }
    if (sets.length === 1) {
      const st = setStatus(sets[0]);
      return { sets: st.state !== subState ? "" : ledgerRow("Set", subState === "complete" ? { state: "none", detail: "1" } : st), rest };
    }
    const shown = sets.filter(n => setStatus(n).state === subState);
    return { sets: shown.length ? expBlock(shown.length === 1 ? "Set" : "Sets", { state: "none", detail: shown.length },
      shown.map(n => expItemHtml(n, subState, 2)).join(""), true) : "", rest };
  }
  // A lone set: "1" once in hand, else its progress and state
  if (sets.length === 1) return { sets: ledgerRow("Set", quiet ? { state: "none", detail: "1" } : { state, detail: setStatus(sets[0]).detail }), rest };
  return { sets: expBlock("Sets", { state, detail: ofAll(green, sets.length) }, inner, true), rest };
}

// A year's sets count on Tracker once one is in hand or on its way
const inTracker = a => ["complete", "coming"].some(st => setLedgerRows(a, "postales", st) !== "");
const hasImages = a => { const c = IMAGE_LISTS[a.year]; return !!c && (c.albumPaths.length > 0 || c.sobrePaths.length > 0); };

function renderGrid(filterKey) {
  const subState = currentSubFilter;
  renderPlayerGalleryTabs(filterKey, subState);
  renderTabCount(filterKey, subState);
  // The Galería and a player's Galería show photos instead of year cards
  const gallery = filterKey === null;
  const photos  = gallery || subState === PHOTOS;
  const wall    = document.getElementById("photo-wall");
  wall.hidden    = !photos;
  wall.innerHTML = gallery ? galleryWallHtml(subState) : photos ? playerGalleryHtml(filterKey) : "";
  document.getElementById("albums-grid").hidden = photos;
  if (photos) showSectionImages(wall);
  if (photos) fitNames(wall);
  if (photos) return;
  // On a player's Todo, Tengo, Falta and De camino each year's logo links to that year in Fotos
  const photoYears = new Set(playerPhotos(filterKey).map(p => p.year));
  let albums = ALBUMS.filter(a => matchesFilter(a, filterKey));
  // Tracker lists a year only if its card has something in this subtab
  if (filterKey === "postales") albums = albums.filter(a => {
    const { sets, rest } = trackerSets(a, subState);
    return sets || rest || ((!subState || subState === "complete") && hasImages(a));
  });
  // Under a player's sub tab, only years with at least one row in that state
  else if (subState) albums = albums.filter(a => setLedgerRows(a, filterKey, subState) !== "");
  document.getElementById("albums-grid").innerHTML = albums.map(album => {
    const cardLabel = albumTitle(album);
    // The year's logo, loaded as its card comes into view
    const logoHtml = `<div class="card-logo" role="button" tabindex="0" aria-label="${esc(photoYears.has(album.year) ? `Galería ${album.year}` : cardLabel)}">
        ${LOGOS[album.year] ? `<img src="assets/logos/${LOGOS[album.year]}" alt="" loading="lazy" decoding="async" />` : ""}
      </div>`;
    let countsHtml;
    // Álbumes and Sobres, filled in by applyCount
    const lists = IMAGE_LISTS[album.year] || { albumPaths: [], sobrePaths: [] };
    const imageRow = (type, label, paths) => paths.length ? `<div class="card-count-row">
        <span class="count-label" data-label="${type}" data-year="${album.year}">${label}</span>
        <span class="count-val" data-type="${type}" data-year="${album.year}">—</span>
      </div>` : "";
    // Tracker: Álbumes and Sobres, then the year's sets, then the rest of the ledger
    if (filterKey === "postales") {
      const { sets, rest } = trackerSets(album, subState);
      // Álbumes and Sobres are in hand: Todo and Tengo list them
      const images = !subState || subState === "complete"
        ? imageRow("albums", "Álbumes", lists.albumPaths) + imageRow("sobres", "Sobres", lists.sobrePaths) : "";
      countsHtml = `<div class="card-counts ledger">${images}${sets}${rest}</div>`;
    } else {
      countsHtml = `<div class="card-counts ledger">${setLedgerRows(album, filterKey, subState)}</div>`;
    }
    return `<article class="album-card" data-year="${album.year}">
      ${logoHtml}
      ${countsHtml}
    </article>`;
  }).join("");
  // Fill in the Álbumes and Sobres counts
  albums.forEach(album => {
    const c = imageCounts[album.year];
    if (c) applyCount(album, c.albumPaths, c.sobrePaths);
  });
}

// ── Stats ──────────────────────────────────────────────────────────────
function updateStats() {
  let totalAlbums = 0, totalSobres = 0, totalSets = 0;
  let otrosConfirmed = 0, otrosTotal = 0, variantesConfirmed = 0, variantesTotal = 0, hojasConfirmed = 0, hojasTotal = 0;

  ALBUMS.forEach(a => {
    const c = imageCounts[a.year];
    if (c) {
      totalAlbums += c.albumPaths.length;
      totalSobres += c.sobrePaths.length;
    }
    // The header sums the cards, so they always agree
    totalSets += postalesSetGreens(a.postales);
    otrosConfirmed += otrosGreens(a);
    variantesConfirmed += variantesGreens(a);
    hojasConfirmed += hojasGreens(a);
    (a.sets || []).forEach(s => {
      if (s.afterPostales) return;
      // just gates whether the stat shows
      if (s.id === VARIANTES_ID) variantesTotal += setLeaves(s).length;
      else if (s.id === HOJAS_ID) hojasTotal += setLeaves(s).length;
      else otrosTotal += setLeaves(s).length;
    });
  });

  const stat = (val, label) =>
    `<div class="inv-stat">
      <span class="inv-stat-value">${val}</span>
      <span class="inv-stat-label">${label}</span>
    </div>`;

  // As on a Tracker card: Álbumes, Sobres, the album's own Sets, Variantes, Hojas and Otros
  document.getElementById("inv-stats").innerHTML = `
    <div class="inv-stats-row is-main">
      ${stat(totalAlbums, "Álbumes")}
      ${stat(totalSobres, "Sobres")}
      ${stat(totalSets, "Sets")}
      ${variantesTotal ? stat(variantesConfirmed, "Variantes") : ""}
      ${hojasTotal ? stat(hojasConfirmed, HOJAS) : ""}
      ${otrosTotal ? stat(otrosConfirmed, "Otros") : ""}
    </div>`;
}

// ── Gallery ────────────────────────────────────────────────────────────
let currentGalleryYear = null;
let currentGalleryTab  = null;
let currentSetAlbum    = null; // the year whose Sets tab is open, its tab label and subtab
let currentSetLabel    = "";
let currentSetSection  = null;
let currentGridSet     = null;
let gridFilter         = null; // null = all; else "is-confirmed" | "is-pending" | "is-coming"

// Render the numbered sticker grid for currentGridSet, honoring gridFilter
function renderStickerGrid() {
  const gset   = currentGridSet;
  const panel  = document.getElementById("gallery-set-panel");
  const headEl = document.getElementById("gallery-set-label");
  const owned  = parseRanges(gset.owned);
  const coming = comingOf(gset);
  const tot    = gridTotal(gset);
  const stateOf = num => owned.has(num) ? "is-confirmed" : coming.has(num) ? "is-coming" : "is-pending";
  // The count sits under the filter, so the heading stays hidden
  headEl.hidden = true;

  // Which states exist (for the filter buttons) and how many of each
  const present = new Set();
  const tally = { "is-confirmed": 0, "is-coming": 0, "is-pending": 0 };
  let k = 0;
  (gset.groups || [{ names: Array.from({ length: tot }) }]).forEach(g =>
    g.names.forEach(() => { const st = stateOf(++k); present.add(st); tally[st]++; }));
  // A state covering every sticker gets no button (it would repeat Todo)
  const FILTERS = [
    { key: null,           label: "Todo" },
    { key: "is-confirmed", label: "Tengo" },
    { key: "is-pending",   label: "Falta" },
    { key: "is-coming",    label: "De camino" },
  ].filter(f => f.key === null || (present.has(f.key) && tally[f.key] < tot));
  // Never leave a filter active without a button to turn it off
  if (gridFilter && !FILTERS.some(f => f.key === gridFilter)) gridFilter = null;
  // "Total: N", or "Total: n de N" for Tengo and Falta
  const count = !gridFilter ? `Total: ${tot}`
    : gridFilter === "is-coming" ? `Total: ${tally[gridFilter]}`
    : `Total: ${tally[gridFilter]} de ${tot}`;
  const bar = FILTERS.map(f =>
    `<button class="view-tab grid-filter-btn${f.key === gridFilter ? " is-active" : ""}" data-gf="${f.key ?? ""}" type="button" aria-pressed="${f.key === gridFilter}">${f.label}</button>`).join("");

  let n = 0;
  let body;
  if (gset.groups) {
    const chip = (num, nm) => {
      const st = stateOf(num);
      return gridFilter && st !== gridFilter ? "" : `<span class="chip ${st}"><span class="chip-n">${num}</span> ${esc(nm)}${srState(st)}</span>`;
    };
    // Groups sharing a category render as one row (1982's posters and stadiums alternate)
    const rows = [], byCat = new Map();
    gset.groups.forEach(g => {
      const chips = g.names.map(nm => chip(++n, nm)).join("");
      let row = byCat.get(g.cat);
      if (!row) byCat.set(g.cat, row = { cat: g.cat, chips: "" }), rows.push(row);
      row.chips += chips;
    });
    body = `<div class="sticker-rows">${rows.filter(r => r.chips).map(r =>
      `<div class="sticker-row"><div class="sticker-cat">${esc(r.cat)}</div><div class="sticker-chips">${r.chips}</div></div>`
    ).join("")}</div>`;
  } else {
    let cells = "";
    for (let i = 1; i <= tot; i++) {
      const st = stateOf(i);
      if (!gridFilter || st === gridFilter) cells += `<div class="grid-cell ${st}">${i}${srState(st)}</div>`;
    }
    body = `<div class="sticker-grid">${cells}</div>`;
  }
  panel.className = "";
  panel.innerHTML = `<div class="grid-filter">${bar}</div>` +
    `<p class="gallery-section-label">${count}</p>${body}`;
}

// A year's tabs: Álbumes, Sobres, then Postales (1970-82) or Sets
function galleryTabsFor(album, counts) {
  const tabs = [];
  if (counts.albumPaths.length) tabs.push({ key: "albumes", label: counts.albumPaths.length === 1 ? "Álbum" : "Álbumes" });
  if (counts.sobrePaths.length) tabs.push({ key: "sobres",  label: counts.sobrePaths.length === 1 ? "Sobre" : "Sobres" });
  // Postales for the 1970-82 checklist; Sets once a later year has a subtab to show
  if (album.postales && isGridSet(album.postales)) {
    tabs.push({ key: "postales", label: "Postales" });
  } else if (album.postales && setSectionsFor(album).length) {
    tabs.push({ key: "postales", label: "Sets" });
  }
  return tabs;
}

// A placeholder's size: a typical set of two rows of four
const MISSING_SET = [0.88, 0.597];

// A year's Sets subtabs, in this order
const SET_SECTIONS = [POSTALES, "Variantes", HOJAS, OTROS_MIRROR_LABEL];

// A year's set photos in Sets order, each with its section; withMissing adds "Falta escanear" spots
function setPhotos(album, withMissing = false) {
  const p = album.postales;
  if (!p || isGridSet(p)) return [];
  const own = p.items;
  const out = [];
  const isEntry = n => !kidsOf(n).length;
  const walk = (n, path, section, underPhoto) => {
    const here = [...path, n.caption || n.label];
    // A photo is named by its place inside its section ("CC México · Botella")
    const inner = here[0] === section ? here.slice(1) : here;
    const name = (inner.length ? inner : here).join(" · ");
    const dir = `assets/sets/${album.year}`;
    const dot = n.dot;
    const sheet = i => n.photo.replace(/\.jpg$/, `_${i + 1}.jpg`);
    // A set over 16 shows sheet by sheet (1/2, 2/2), each opening only that sheet
    if (n.photo && n.pages > 1) {
      const sizes = SET_PREVIEWS[n.photo] || [];
      for (let i = 0; i < n.pages; i++) out.push({
        src: `${dir}/${sheet(i)}`, name: `${name} ${i + 1}/${n.pages}`, page: i + 1, section, dot,
        thumb: `${dir}/fronts/${sheet(i)}`, size: sizes[i]
      });
    } else if (n.photo) out.push({
      src: `${dir}/${n.photo}`, name, section, dot, thumb: `${dir}/fronts/${n.photo}`, size: (SET_PREVIEWS[n.photo] || [])[0]
    });
    else if (withMissing && !underPhoto && isEntry(n) && setStatus(n).state === "complete") {
      out.push({ name, missing: true, section, dot });
    }
    if (!isEntry(n)) kidsOf(n).forEach(k => walk(k, here, section, underPhoto || !!n.photo));
  };
  // The album's own rows (Postales), then the Variantes and Otros rows
  const rows = postalesRows(album, p);
  rows.forEach((row, i) => walk(row, [], i >= own.length ? row.label : POSTALES, false));
  return out;
}

// Spells out CC and Mc ("Coca Cola México · Botella")
const longSetName = name => name.split(" · ")
  .map(part => part.replace(/^CC /, "Coca Cola ").replace(/^Mc /, "McDonald's ")).join(" · ");
// Fits every photo name on one line: long form if it fits, else shrink to 11px, then "…".
// Measured on a canvas, never read back from the page, so Safari doesn't flicker between sizes
const PHOTO_NAMES = ".item-rows .gallery-label, .player-wall .gallery-label";
const measurer = document.createElement("canvas").getContext("2d");
// A name's own size (12px), read once before a run sets one
const fullSize = new WeakMap();
// What a name shows: a dot's colour is spelled out for screen readers only
const shownText = el => [...el.childNodes].map(n => n.nodeType === Node.TEXT_NODE ? n.textContent
  : n.classList.contains("sr-only") ? "" : shownText(n)).join("");
function fitNames(root) {
  const fits = [...root.querySelectorAll(PHOTO_NAMES)].map(cap => {
    const css = getComputedStyle(cap);
    if (!fullSize.has(cap)) fullSize.set(cap, parseFloat(css.fontSize));
    // A colour dot keeps its size whatever the name's
    const dots = [...cap.querySelectorAll(".color-dot")].reduce((w, dot) => {
      const dc = getComputedStyle(dot);
      return w + dot.getBoundingClientRect().width + parseFloat(dc.marginLeft) + parseFloat(dc.marginRight);
    }, 0);
    const room = cap.clientWidth - dots - 1;
    return { cap, room, full: fullSize.get(cap), font: [css.fontStyle, css.fontWeight, css.fontFamily],
             track: css.letterSpacing === "normal" ? 0 : parseFloat(css.letterSpacing) / parseFloat(css.fontSize) };
  });
  fits.forEach(({ cap, room, full, font: [style, weight, family], track }) => {
    const wide = (text, px) => {
      measurer.font = `${style} ${weight} ${px}px ${family}`;
      return measurer.measureText(text).width + track * px * [...text].length;
    };
    const nameEl = cap.querySelector(".gallery-name[data-long]");
    if (nameEl) {
      const name = wide(nameEl.dataset.long, full) <= room ? nameEl.dataset.long : nameEl.dataset.short;
      if (nameEl.textContent !== name) nameEl.textContent = name;
    }
    const text = shownText(cap);
    let px = full;
    while (px > 11 && wide(text, px) > room) px -= 0.5;
    // Hidden, it has no room to measure: it keeps its full size
    const size = room > 0 && px < full ? `${px}px` : "";
    if (cap.style.fontSize !== size) cap.style.fontSize = size;
  });
}
{
  // Refit names only when a section's width changes
  const sections = ["gallery-albums-section", "gallery-sobres-section", "photo-wall"].map(id => document.getElementById(id));
  const widths = new WeakMap();
  let queued = false;
  const refit = entries => {
    const moved = !entries || entries.filter(e => widths.get(e.target) !== e.contentRect.width)
      .map(e => widths.set(e.target, e.contentRect.width)).length > 0;
    if (!moved || queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; sections.filter(sec => !sec.hidden).forEach(fitNames); });
  };
  sections.forEach(sec => new ResizeObserver(refit).observe(sec));
  document.fonts.ready.then(() => refit());
}

function renderGalleryTabs(tabs) {
  document.getElementById("gallery-tabs").innerHTML = tabs.map(t => {
    const active = t.key === currentGalleryTab;
    return `<button class="view-tab${active ? " is-active" : ""}" data-tab="${t.key}" type="button" aria-pressed="${active}">${t.label}</button>`;
  }).join("");
}

// A year page tab's count line, shown whatever the number, like every count on the site
function showCountLine(el, n) {
  el.hidden = false;
  el.textContent = `Total: ${n}`;
}

function gridClass(n) {
  if (n >= 4) return "gallery-images cols-4";
  if (n === 3) return "gallery-images cols-3";
  if (n === 2) return "gallery-images cols-2";
  return "gallery-images";
}

function showGalleryTab(key) {
  currentGalleryTab = key;
  const album  = ALBUMS.find(a => a.year === currentGalleryYear);
  const counts = imageCounts[currentGalleryYear] || { albumPaths: [], sobrePaths: [] };
  const tabs   = galleryTabsFor(album, counts);
  document.getElementById("gallery-albums-section").hidden = key !== "albumes" || !counts.albumPaths.length;
  document.getElementById("gallery-sobres-section").hidden = key !== "sobres"  || !counts.sobrePaths.length;
  ["gallery-albums-section", "gallery-sobres-section"].forEach(id => {
    const sec = document.getElementById(id);
    if (!sec.hidden) { showSectionImages(sec); fitNames(sec); }
  });
  const isSet = key !== "albumes" && key !== "sobres";
  document.getElementById("gallery-set-section").hidden = !isSet;
  if (isSet) {
    const tabDef  = tabs.find(t => t.key === key);
    const label   = tabDef ? tabDef.label : "";
    const headEl  = document.getElementById("gallery-set-label");
    const gset    = setForFilter(album, key);
    if (key === "postales" && gset && gset.owned !== undefined) {
      // Numbered sticker grid with a state filter (Todo / De camino / Tengo / Falta)
      currentGridSet = gset;
      // The filter carries over from the last checklist opened
      renderStickerGrid();
      renderGalleryTabs(tabs);
      return;
    }
    currentSetAlbum = album;
    currentSetLabel = label;
    headEl.hidden = true; // the count sits under the subtabs, as on a 1970-82 grid
    renderSetSection();
  }
  renderGalleryTabs(tabs);
}

// Sets tab: a subtab per section, its count and its sets; a year opens on the first subtab with a photo.
// Postales shows only once one of its sets has a photo
const PHOTO_ONLY_SECTIONS = [POSTALES];
// A set scanned sticker by sticker (stickers on a postales item; none yet)
const stickersOf = album => (album.postales.items || []).find(it => it.stickers);
const sectionHasPhotos = (album, sec) => setPhotos(album).some(ph => ph.section === sec) || (sec === POSTALES && !!stickersOf(album));
const setSectionsFor = album => {
  const found = [...new Set(setPhotos(album, true).map(ph => ph.section))]
    .filter(sec => !PHOTO_ONLY_SECTIONS.includes(sec) || sectionHasPhotos(album, sec));
  return SET_SECTIONS.filter(sec => found.includes(sec)).concat(found.filter(sec => !SET_SECTIONS.includes(sec)));
};
const defaultSetSection = album => {
  const sections = setSectionsFor(album);
  return sections.find(sec => sectionHasPhotos(album, sec)) || sections[0];
};
let setSectionYear   = null;  // the year the subtab was last shown for
let setSectionPinned = false; // an address named the subtab: keep it even without photos

function renderSetSection() {
  const album  = currentSetAlbum;
  const panel  = document.getElementById("gallery-set-panel");
  const photos = setPhotos(album, true);
  const sections = setSectionsFor(album);
  if (album.year !== setSectionYear) {
    // Arriving at a year: keep the subtab you were on when this year has photos in it
    const keep = sections.includes(currentSetSection) &&
                 (setSectionPinned || sectionHasPhotos(album, currentSetSection));
    if (!keep) currentSetSection = defaultSetSection(album);
    setSectionYear = album.year;
    setSectionPinned = false;
  } else if (!sections.includes(currentSetSection)) currentSetSection = defaultSetSection(album);
  const shown = photos.filter(ph => ph.section === currentSetSection);
  const bar = sections.map(sec => {
    const active = sec === currentSetSection;
    return `<button class="view-tab grid-filter-btn set-section-btn${active ? " is-active" : ""}" data-section="${esc(sec)}" type="button" aria-pressed="${active}">${esc(sec)}</button>`;
  }).join("");
  // Counts the subtab's sets (a set's second sheet is the same set)
  const n = shown.filter(ph => !(ph.page > 1)).length;
  const figure = (ph, phone, web, vars) => setFigure(ph, `${currentSetLabel} ${album.year}`, "", vars);
  panel.className = "";
  const set = currentSetSection === POSTALES && stickersOf(album);
  if (set) {
    panel.innerHTML = `<div class="grid-filter">${bar}</div>` +
      `<p class="gallery-section-label">Total: ${set.stickers.files.length} de ${set.total}</p>${stickerSheetsHtml(set.stickers)}`;
    return;
  }
  panel.innerHTML = `<div class="grid-filter">${bar}</div>` +
    `<p class="gallery-section-label">Total: ${n}</p>` +
    `<div class="gallery-images item-rows set-rows">${flatRowsHtml(shown, 4, setWidths, figure, setCap)}</div>`;
  fitNames(panel);
}

// Stickers in the 4x4 sheets they're kept in, each its number on top and its front only (the viewer shows both)
function stickerSheetsHtml({ dir, files }) {
  const sheets = [];
  for (let i = 0; i < files.length; i += 16) sheets.push(files.slice(i, i + 16));
  return `<div class="sticker-sheets">${sheets.map((sheet, s) => {
    const figs = sheet.map((f, j) => {
      const n = s * 16 + j + 1;
      return `<figure class="gallery-figure"><figcaption class="gallery-label">${n}</figcaption>
        ${cropped(`<img class="gallery-img" src="${dir}/previews/${f}" data-full="${dir}/${f}" data-label="Postal ${n}" alt="Postal ${n}"
             width="600" height="395" loading="lazy" decoding="async" role="button" tabindex="0" />`, 1640, 1080, 40, false)}
      </figure>`;
    }).join("");
    return `<div class="gallery-images sheet-grid">${figs}</div>`;
  }).join("")}</div>`;
}

// One set's preview, name on top (Coca Cola and McDonald's spelled out when they fit), sized in sheets
const sizedSet = ([w, h]) => `style="--w: ${w}; --h: ${h};"`;
const setSize = ph => (!ph.missing && ph.size) || MISSING_SET;
const setShape = ph => { const [w, h] = setSize(ph); return w / h; };
// A row of sets shares one sticker size and fills the width (capped at --row-max)
const setWidths = row => row.map(ph => setSize(ph)[0]);
const setCap = (row, j) => setSize(row[j])[0] / Math.max(...row.map(ph => setSize(ph)[1]));
function setFigure(ph, alt, prefix = "", vars = "") {
  const long  = longSetName(ph.name);
  const named = `${long}${ph.dot ? ` (${DOT_NAME[ph.dot]})` : ""}`;
  const caption = `<figcaption class="gallery-label"><span class="gallery-name"${long !== ph.name ? ` data-short="${esc(prefix + ph.name)}" data-long="${esc(prefix + long)}"` : ""}>${esc(prefix + ph.name)}</span>${colorDot(ph.dot)}</figcaption>`;
  if (ph.missing) return `<figure class="gallery-figure is-missing" style="--a: ${setShape(ph)}${vars}">
      ${caption}
      <div class="gallery-missing" ${sizedSet(MISSING_SET)} role="img" aria-label="${esc(`${named}: falta escanear`)}">Falta escanear</div>
    </figure>`;
  return `<figure class="gallery-figure" style="--a: ${setShape(ph)}${vars}">
      ${caption}
      <img class="gallery-img" src="${ph.thumb}" ${sizedSet(ph.size || MISSING_SET)} data-full="${ph.src}" data-label="${esc(prefix + long)}"${ph.dot ? ` data-dot="${ph.dot}"` : ""} alt="${esc(`${alt} · ${named}`)}" loading="lazy" decoding="async" role="button" tabindex="0" />
    </figure>`;
}

function updateGalleryStats(year) {
  const album  = ALBUMS.find(a => a.year === year);
  const counts = imageCounts[year] || { albumPaths: [], sobrePaths: [] };
  const albumsLabel = counts.albumPaths.length === 1 ? "Álbum" : "Álbumes";
  const sobresLabel = counts.sobrePaths.length === 1 ? "Sobre" : "Sobres";
  const stat = (val, label) =>
    `<div class="inv-stat">
      <span class="inv-stat-value">${val}</span>
      <span class="inv-stat-label">${label}</span>
    </div>`;
  // The same figures as the year's Tracker card; a 0 hides its stat
  const ownSets = postalesSetGreens(album.postales);
  const rest = [["Variantes", variantesGreens(album)], [HOJAS, hojasGreens(album)], ["Otros", otrosGreens(album)]]
    .filter(pair => pair[1] > 0).map(pair => stat(pair[1], pair[0])).join("");
  document.getElementById("inv-stats").innerHTML = `
    <div class="inv-stats-row">
      <div class="inv-stat">
        <span class="inv-stat-value">${counts.albumPaths.length}</span>
        <span class="inv-stat-label">${albumsLabel}</span>
      </div>
      <div class="inv-stat">
        <span class="inv-stat-value">${counts.sobrePaths.length}</span>
        <span class="inv-stat-label">${sobresLabel}</span>
      </div>
      ${ownSets ? stat(ownSets, ownSets === 1 ? "Set" : "Sets") : ""}
      ${rest}
    </div>`;
}

function navigableAlbums() {
  return ALBUMS.filter(a => {
    if (currentFilter && !matchesFilter(a, currentFilter)) return false;
    const c = imageCounts[a.year];
    return c && galleryTabsFor(a, c).length > 0;
  });
}

function navigateGallery(dir) {
  const nav = navigableAlbums();
  const to = nav[nav.findIndex(a => a.year === currentGalleryYear) + dir];
  if (!to) return; // the first and last years stop there, as Apple's arrows do
  // Stays on the same tab when the next year has it
  showGallery(to.year, currentGalleryTab);
  // Paging through years swaps the address, so Back still returns to the list
  setAddress(viewRoute(), "replace");
  window.scrollTo(0, 0); // another year is another page: start at its top
  // An arrow just dimmed at the end can't keep the focus: hand it to the other one
  if (document.activeElement && document.activeElement.disabled)
    document.getElementById(dir < 0 ? "gallery-next" : "gallery-prev").focus();
}

// Each arrow names the year it opens; it dims at the first or last year
function setYearArrows(nav, idx) {
  [["gallery-prev", "Anterior", nav[idx - 1]], ["gallery-next", "Siguiente", nav[idx + 1]]]
    .forEach(([id, word, to]) => {
      const btn = document.getElementById(id);
      btn.disabled = !to;
      const label = to ? `${word}: ${albumTitle(to)}` : word;
      btn.setAttribute("aria-label", label);
      btn.title = label;
    });
}

// The page's title, and the small one the title bar shows once it has stuck to the top
function setTitle(text) {
  document.getElementById("inv-title-text").textContent = text;
  document.getElementById("title-bar-text").textContent = text;
}

function showGallery(year, initialTab) {
  currentGalleryYear = year;
  const nav   = navigableAlbums();
  document.getElementById("gallery-nav").hidden = nav.length < 2;
  setYearArrows(nav, nav.findIndex(a => a.year === year));

  const album    = ALBUMS.find(a => a.year === year);
  const counts   = imageCounts[year] || { albumPaths: [], sobrePaths: [] };

  const titleEl = document.querySelector(".inv-title");
  titleEl.classList.add("is-gallery");
  setTitle(albumTitle(album));
  document.querySelector(".inv-version").hidden = true;

  const albumsSection = document.getElementById("gallery-albums-section");
  if (counts.albumPaths.length) {
    const an = counts.albumPaths.length;
    // One image: the tab already says Álbumes — skip the redundant heading
    const albumsLabelEl = albumsSection.querySelector(".gallery-section-label");
    showCountLine(albumsLabelEl, an);
    const el = document.getElementById("gallery-albums");
    el.className = "gallery-images item-rows";
    el.innerHTML = itemRows(counts.albumPaths, `Álbum ${year}`);
    albumsSection.hidden = false;
  } else {
    albumsSection.hidden = true;
  }

  const sobresSection = document.getElementById("gallery-sobres-section");
  if (counts.sobrePaths.length) {
    const sn = counts.sobrePaths.length;
    const sobresLabelEl = sobresSection.querySelector(".gallery-section-label");
    showCountLine(sobresLabelEl, sn);
    const el = document.getElementById("gallery-sobres");
    // Rows that fill the width (see itemRows)
    el.className = "gallery-images item-rows";
    el.innerHTML = itemRows(counts.sobrePaths, `Sobre ${year}`, undefined, SOBRES_PER_ROW);
    sobresSection.hidden = false;
  } else {
    sobresSection.hidden = true;
  }

  // Opens the requested tab if this year has it, else its first
  const tabs = galleryTabsFor(album, counts);
  // Every tab in the bar has something to show, so a requested one only has to exist
  const canLand = initialTab && tabs.some(t => t.key === initialTab);
  const start = canLand ? initialTab : tabs.length ? tabs[0].key : null;
  if (start) showGalleryTab(start);

  document.getElementById("view-tabs").hidden    = true;
  document.getElementById("sub-tabs").hidden     = true;
  document.getElementById("tab-count").hidden    = true;
  document.getElementById("albums-grid").hidden  = true;
  document.getElementById("photo-wall").hidden   = true;
  document.getElementById("gallery-view").hidden = false;
  document.getElementById("gallery-back").hidden = false;
  updateGalleryStats(year);
}

function hideGallery() {
  const year = currentGalleryYear;
  currentGalleryTab = null;
  document.getElementById("gallery-view").hidden = true;
  document.getElementById("gallery-back").hidden = true;
  document.getElementById("gallery-nav").hidden  = true;
  document.getElementById("view-tabs").hidden    = false;
  renderSubTabs();
  renderTabCount(currentFilter, currentSubFilter);
  document.getElementById("albums-grid").hidden  = false;
  const titleEl2 = document.querySelector(".inv-title");
  titleEl2.classList.remove("is-gallery");
  setTitle("Colección Panini");
  document.querySelector(".inv-version").hidden = false;
  updateStats();
  // Back to the year's card for keyboard users, else to the active tab
  (document.querySelector(`.album-card[data-year="${CSS.escape(String(year))}"] .card-logo`) ||
   document.querySelector("#view-tabs .is-active"))?.focus();
}

// ── Events ─────────────────────────────────────────────────────────────
// Keeps keyboard focus on a button that a redraw replaced
const keepFocusIn = (bar, attr) => {
  const el  = document.activeElement;
  const key = el && bar.contains(el) ? el.getAttribute(attr) : null;
  return () => {
    if (key !== null) bar.querySelector(`[${attr}="${CSS.escape(key)}"]`)?.focus();
  };
};

// On a player tab, a year card opens that year in the Galería when it has photos
const photoLinked = year =>
  currentSubFilter !== PHOTOS &&
  playerPhotos(currentFilter).some(p => p.year === year);

function showPhotosYear(year) {
  currentSubFilter = PHOTOS;
  playerGallery = "postales";
  renderSubTabs();
  renderGrid(currentFilter);
  const heading = document.getElementById(`fotos-${year}`);
  heading.focus({ preventScroll: true });
  heading.scrollIntoView({ block: "start" });
}

function openCard(card) {
  if (!card || card.classList.contains("is-empty")) return;
  const raw  = card.dataset.year;
  const year = /^\d+$/.test(raw) ? Number(raw) : raw;
  if (photoLinked(year)) {
    showPhotosYear(year);
    setAddress(`${viewRoute()}/${year}`);
    return;
  }
  // A year opens on its first tab (Álbum, Sobres or Sets, whichever it has first)
  showGallery(year, null);
  setAddress(viewRoute());
  // The year page starts at the top, with focus on its title
  window.scrollTo(0, 0);
  document.querySelector(".inv-title").focus({ preventScroll: true });
}

document.getElementById("albums-grid").addEventListener("click", e => {
  // Only the logo/image area navigates, so the count rows stay clickable
  const logo = e.target.closest(".card-logo");
  if (!logo) return;
  openCard(logo.closest(".album-card"));
});

document.getElementById("albums-grid").addEventListener("keydown", e => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const logo = e.target.closest(".card-logo");
  if (!logo) return;
  e.preventDefault();
  openCard(logo.closest(".album-card"));
});

// Back to the list from a year page, as a new step in the browser's history
function leaveGallery() {
  hideGallery();
  setAddress(viewRoute());
}

// Atrás goes back like the browser; a year opened by its address goes to its tab's list
function goBack() {
  if (history.state && history.state.inApp) history.back();
  else leaveGallery();
}

document.getElementById("gallery-back").addEventListener("click", goBack);
document.getElementById("gallery-prev").addEventListener("click", () => navigateGallery(-1));
document.getElementById("gallery-next").addEventListener("click", () => navigateGallery(1));
document.getElementById("gallery-set-panel").addEventListener("click", e => {
  const section = e.target.closest(".set-section-btn");
  if (section) {
    const refocus = keepFocusIn(e.currentTarget, "data-section");
    currentSetSection = section.dataset.section;
    renderSetSection();
    setAddress(viewRoute(), "replace");
    refocus();
    return;
  }
  const btn = e.target.closest(".grid-filter-btn");
  if (!btn) return;
  const refocus = keepFocusIn(e.currentTarget, "data-gf");
  gridFilter = btn.dataset.gf || null;
  renderStickerGrid();
  setAddress(viewRoute(), "replace");
  refocus();
});

document.getElementById("gallery-tabs").addEventListener("click", e => {
  const btn = e.target.closest(".view-tab");
  if (!btn) return;
  const refocus = keepFocusIn(e.currentTarget, "data-tab");
  showGalleryTab(btn.dataset.tab);
  setAddress(viewRoute(), "replace");
  refocus();
});

// ── View tabs: Galería, Tracker + one tab per player ────────────────────
const setKey = s => s.id || s.label;

// One tab per player, in order of first appearance
function playerColumns() {
  const cols = [];
  ALBUMS.forEach(a => (a.sets || []).forEach(s => {
    if (!s.afterPostales) return;
    if (!cols.some(c => c.key === setKey(s))) cols.push({ key: setKey(s), label: s.label });
  }));
  return cols;
}

const findSet = (album, key) => (album.sets || []).find(s => setKey(s) === key);

// Postales lives on the album itself; this treats it like any other set
const setForFilter = (album, key) =>
  key === "postales" ? album.postales : findSet(album, key);

const matchesFilter = (album, key) => !!setForFilter(album, key);

let currentFilter    = null; // null = Todo (source of truth)
let currentSubFilter = null; // coming | pending | complete | fotos | null

// Not a state: the subtab that shows a player's photos instead of the checklist
const PHOTOS = "fotos";
const SUB_TABS = [
  { state: null,       label: "Todo" },
  { state: "complete", label: "Tengo" },
  { state: "pending",  label: "Falta" },
  { state: "coming",   label: "De camino" },
  { state: PHOTOS,     label: "Galería" },
];
// Player subtab order: Galería, Todo, Tengo, Falta, De camino
const PLAYER_SUB_ORDER = [PHOTOS, null, "complete", "pending", "coming"];

// The states a tab has rows in (asks the renderer, since rows nest)
function tabStates(key) {
  const states = new Set();
  ["complete", "pending", "coming"].forEach(state => {
    if (ALBUMS.some(a => matchesFilter(a, key) && setLedgerRows(a, key, state))) states.add(state);
  });
  return states;
}

// Which subtabs a tab offers: its states, plus Fotos when it has photos
function subTabsFor(key) {
  if (key === null) return new Set(GALLERY_SUBS.map(t => t.state).filter(st =>
    st === "sobres" ? ALBUMS.some(a => (IMAGE_LISTS[a.year] || { sobrePaths: [] }).sobrePaths.length)
    : !!gallerySection(st) && gallerySetPhotos(st).length > 0));
  const avail = tabStates(key);
  if (playerPhotos(key).length || playerExtras(key, "albumes").length || playerExtras(key, "hojas").length) avail.add(PHOTOS);
  return avail;
}

function renderSubTabs() {
  const nav = document.getElementById("sub-tabs");
  const avail = subTabsFor(currentFilter);
  const order = currentFilter === null ? GALLERY_SUBS
    : playerColumns().some(c => c.key === currentFilter)
    ? PLAYER_SUB_ORDER.map(st => SUB_TABS.find(t => t.state === st))
    : SUB_TABS;
  // "All" (state null) is always present; then only the states that exist
  const tabs = order.filter(t => t.state === null || avail.has(t.state));
  nav.hidden = avail.size === 0 && currentFilter !== null;
  nav.innerHTML = tabs.map(t => {
    const active = t.state === currentSubFilter;
    return `<button class="view-tab sub-tab${active ? " is-active" : ""}" data-state="${t.state ?? ""}" type="button" aria-pressed="${active}">${t.label}</button>`;
  }).join("");
}

function renderTabs() {
  const tabBtn = t => {
    const active = t.key === currentFilter;
    return `<button class="view-tab${active ? " is-active" : ""}" data-set="${t.key ?? ""}" type="button" aria-pressed="${active}">${t.label}</button>`;
  };
  const main = [{ key: null, label: "Galería" }, { key: "postales", label: "Tracker" }];
  document.getElementById("view-tabs").innerHTML =
    main.concat(playerColumns()).map(tabBtn).join("");
}

document.getElementById("view-tabs").addEventListener("click", e => {
  const btn = e.target.closest(".view-tab");
  if (!btn) return;
  const refocus = keepFocusIn(e.currentTarget, "data-set");
  currentFilter = btn.dataset.set || null;
  // Keeps the state subtab when switching tabs, unless the new tab has nothing in that state
  if (currentSubFilter && !subTabsFor(currentFilter).has(currentSubFilter)) currentSubFilter = null;
  renderTabs();
  renderSubTabs();
  renderGrid(currentFilter);
  updateStats();
  setAddress(viewRoute());
  refocus();
});

// A Galería section swaps the address in place, as a year's Sets subtab does
document.getElementById("player-gallery-tabs").addEventListener("click", e => {
  const btn = e.target.closest(".player-gallery-btn");
  if (!btn) return;
  const refocus = keepFocusIn(e.currentTarget, "data-gallery");
  playerGallery = btn.dataset.gallery;
  renderGrid(currentFilter);
  setAddress(viewRoute(), "replace");
  refocus();
});

document.getElementById("sub-tabs").addEventListener("click", e => {
  const btn = e.target.closest(".sub-tab");
  if (!btn) return;
  const refocus = keepFocusIn(e.currentTarget, "data-state");
  currentSubFilter = btn.dataset.state || null;
  renderSubTabs();
  renderGrid(currentFilter);
  setAddress(viewRoute());
  refocus();
});

// ── Lightbox ───────────────────────────────────────────────────────────
const lightbox      = document.getElementById("lightbox");
const lightboxImg   = document.getElementById("lightbox-img");
const lbPrev        = document.getElementById("lightbox-prev");
const lbNext        = document.getElementById("lightbox-next");
const lbCounter     = document.getElementById("lightbox-counter");
const lbLabel       = document.getElementById("lightbox-label");
const lbPlace       = document.getElementById("lightbox-place");

let lbImages = [];
let lbIndex  = 0;
let lbReturnFocus = null;

// Starts loading an image the viewer is about to show (once per address)
const warmedImages = new Set();
function warmImage(src) {
  if (!src || warmedImages.has(src)) return;
  warmedImages.add(src);
  new Image().src = src;
}

function openLightbox(images, index) {
  lbImages = images;
  lbIndex  = index;
  lbPrev.hidden = lbNext.hidden = images.length <= 1;
  lbReturnFocus = document.activeElement;
  // Open first: the name is fitted to the room the open viewer gives it
  lightbox.classList.add("is-open");
  updateLightboxImage();
  lightbox.focus();
  // Freezes the page behind the viewer (root and body, for iOS Safari)
  document.documentElement.style.overflow = document.body.style.overflow = "hidden";
  // The page behind can't be reached by Tab or VoiceOver while the viewer is open
  document.querySelector("main").inert = document.getElementById("to-top").inert = true;
}

function updateLightboxImage() {
  lightboxImg.src = lbImages[lbIndex].src;
  lightboxImg.alt = lbImages[lbIndex].alt;
  lbCounter.textContent = `${lbIndex + 1} de ${lbImages.length}`;
  // The photos either side load meanwhile, so the arrows turn without a wait
  [-1, 1].forEach(d => warmImage(lbImages[lbIndex + d]?.src));
  // The first and last photos stop there, as in Photos: their arrow dims
  lbPrev.disabled = lbIndex === 0;
  lbNext.disabled = lbIndex === lbImages.length - 1;
  const { label, dot } = lbImages[lbIndex];
  // The caption's colour dot comes along (its name stays in the image's alt text)
  lbLabel.innerHTML = label ? `<span class="lightbox-name">${esc(label)}</span>${dot ? colorDot(dot) : ""}` : "";
  lbLabel.hidden = !label;
  fitViewerName();
  // From the Galería, the photo's World Cup, as Music's "Go to Album"
  const { place } = lbImages[lbIndex];
  lightbox.classList.toggle("has-place", !!place);
  lbPlace.hidden = !place;
  if (place) document.getElementById("lightbox-place-text").textContent = `Ver en ${albumTitle(ALBUMS.find(a => a.year === place.year))}`;
}

// A long name shrinks to fit the top bar, to 11px at the least, then ends in "…"
function fitViewerName() {
  const name = lbLabel.querySelector(".lightbox-name");
  if (!name) return;
  name.style.fontSize = "";
  let px = parseFloat(getComputedStyle(name).fontSize);
  while (px > 11 && name.scrollWidth > name.clientWidth) name.style.fontSize = `${px -= 0.5}px`;
}
window.addEventListener("resize", () => {
  if (lightbox.classList.contains("is-open")) fitViewerName();
});

function lightboxNav(dir) {
  const to = lbIndex + dir;
  if (to < 0 || to >= lbImages.length) return;
  lbIndex = to;
  updateLightboxImage();
  // An arrow just dimmed at the end can't keep the focus: hand it to the other one
  if (document.activeElement && document.activeElement.disabled) (dir < 0 ? lbNext : lbPrev).focus();
}

function closeLightbox() {
  lightbox.classList.remove("is-open");
  // Dropping the image (not src = "", which the browser reports as a failed load)
  lightboxImg.removeAttribute("src");
  document.documentElement.style.overflow = document.body.style.overflow = "";
  document.querySelector("main").inert = document.getElementById("to-top").inert = false;
  if (lbReturnFocus && typeof lbReturnFocus.focus === "function") lbReturnFocus.focus();
  lbReturnFocus = null;
}

// The file a photo shows in full (a preview's data-full, else its own address)
const photoPath = el => el.dataset.full || el.getAttribute("data-src") || el.getAttribute("src");
// Where a Galería photo sits: its World Cup, and the tab (and Sets subtab) that shows it
function placeOf(path) {
  for (const album of ALBUMS) {
    const lists = IMAGE_LISTS[album.year] || {};
    if ((lists.albumPaths || []).includes(path)) return { year: album.year, tab: "albumes", path };
    if ((lists.sobrePaths || []).includes(path)) return { year: album.year, tab: "sobres", path };
    const ph = setPhotos(album).find(ph => ph.src === path);
    if (ph) return { year: album.year, tab: "postales", section: ph.section, path };
  }
  return null;
}

// From the Galería viewer: opens the photo's World Cup and highlights it there
function goToPlace(place) {
  lbReturnFocus = null; // the photo it was opened from is left behind
  closeLightbox();
  currentSetSection = place.section || null;
  setSectionPinned  = !!place.section;
  if (!place.section) setSectionYear = null;
  showGallery(place.year, place.tab);
  setAddress(viewRoute());
  const img = [...document.querySelectorAll("#gallery-view .gallery-img")]
    .find(el => el.offsetParent && photoPath(el) === place.path);
  if (!img) return document.querySelector(".inv-title").focus();
  const lit = img.closest(".photo-pair") || img;
  img.focus({ preventScroll: true });
  lit.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  lit.classList.remove("is-found");
  void lit.offsetWidth; // so the light runs again on a photo just lit
  lit.classList.add("is-found");
  lit.addEventListener("animationend", () => lit.classList.remove("is-found"), { once: true });
}

function openLightboxFromImg(img) {
  const section = img.closest("#gallery-albums, #gallery-sobres, #gallery-set-panel, #photo-wall");
  const scope   = section || document.getElementById("gallery-view");
  const all     = [...scope.querySelectorAll(".gallery-img")];
  // Only the Galería's own photos lead somewhere: a year page is already their place
  const fromGaleria = scope.id === "photo-wall" && currentFilter === null;
  const images  = all.map(el => {
    const fig = el.closest(".gallery-figure");
    const cap = fig ? fig.querySelector(".gallery-label") : null;
    // Opens the full image (data-full) when there is one
    return { src: el.dataset.full || el.src, alt: el.alt || el.getAttribute("aria-label"), label: el.dataset.label || (cap ? cap.textContent : null), dot: el.dataset.dot,
             place: fromGaleria ? placeOf(photoPath(el)) : null };
  });
  openLightbox(images, all.indexOf(img));
}

// The year page and the Fotos wall both open their photos in the lightbox
["gallery-view", "photo-wall"].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener("click", e => {
    // The back of a photo (see cropped) opens it as the front does
    const img = e.target.closest(".gallery-img") || e.target.closest(".photo-pair")?.querySelector(".gallery-img");
    if (img) openLightboxFromImg(img);
  });
  el.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const img = e.target.closest(".gallery-img");
    if (!img) return;
    e.preventDefault();
    openLightboxFromImg(img);
  });
});

// Start loading a preview's full image on hover or focus, so the viewer opens at once
["gallery-set-panel", "photo-wall"].forEach(id => ["pointerover", "focusin"].forEach(type =>
  document.getElementById(id).addEventListener(type, e => {
    const img = e.target.closest(".gallery-img[data-full]");
    if (img) warmImage(img.dataset.full);
  })));

// Tapping around the photo closes the viewer; the photo and arrows don't
lightbox.addEventListener("click", e => {
  if (!e.target.closest(".lightbox-img, .lightbox-prev, .lightbox-next, .lightbox-place")) closeLightbox();
});
lbPlace.addEventListener("click", () => goToPlace(lbImages[lbIndex].place));
// Stops one-finger drags from moving the page behind (pinch-zoom still works)
lightbox.addEventListener("touchmove", e => {
  if (e.touches.length === 1 && !(window.visualViewport && visualViewport.scale > 1)) e.preventDefault();
}, { passive: false });
lbPrev.addEventListener("click", e => { e.stopPropagation(); lightboxNav(-1); });
lbNext.addEventListener("click", e => { e.stopPropagation(); lightboxNav(1); });

document.addEventListener("keydown", e => {
  // Cmd/Alt/Ctrl + arrow is the browser's own shortcut (Back), not ours
  if (e.metaKey || e.altKey || e.ctrlKey) return;
  if (lightbox.classList.contains("is-open")) {
    if (e.key === "Escape")     closeLightbox();
    if (e.key === "ArrowLeft")  lightboxNav(-1);
    if (e.key === "ArrowRight") lightboxNav(1);
  } else if (!document.getElementById("gallery-view").hidden) {
    if (e.key === "Escape")     goBack();
    if (e.key === "ArrowLeft")  navigateGallery(-1);
    if (e.key === "ArrowRight") navigateGallery(1);
  }
});

// ── Expand / collapse carets (inline set & version lists) ──────────────
// The whole row toggles, not just the small caret
document.addEventListener("click", e => {
  const row = e.target.closest(".exp > .card-count-row");
  if (!row) return;
  e.preventDefault();
  e.stopPropagation();
  const exp = row.parentElement;
  const open = exp.classList.toggle("open");
  const btn = row.querySelector(".exp-toggle");
  if (btn) btn.setAttribute("aria-expanded", String(open));
});

// ── Title bar ──────────────────────────────────────────────────────────
// The title row sticks to the top and turns into a small title once stuck
const titleBar = document.getElementById("title-bar");
new IntersectionObserver(([e]) => titleBar.classList.toggle("is-stuck", e.intersectionRatio < 1),
  { rootMargin: "-1px 0px 0px 0px", threshold: 1 }).observe(titleBar);

// ── Back to the top ────────────────────────────────────────────────────
// On a phone, a button to scroll back up once the tabs are out of view
{
  const toTop = document.getElementById("to-top");
  const tabsGone = () => [...document.querySelectorAll(".view-tabs, .grid-filter")]
    .filter(bar => bar.offsetParent).every(bar => bar.getBoundingClientRect().bottom < titleBar.getBoundingClientRect().bottom);
  let queued = false;
  addEventListener("scroll", () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; toTop.classList.toggle("is-shown", scrollY > 0 && tabsGone()); });
  }, { passive: true });
  toTop.addEventListener("click", () => {
    scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    document.querySelector(".inv-title").focus({ preventScroll: true });
  });
}

// ── Swipe navigation ───────────────────────────────────────────────────
// A sideways swipe on a year page goes to the year before or after
let swipeTouchStartX = 0, swipeTouchStartY = 0, swipeMulti = false;
document.addEventListener("touchstart", e => {
  // Two fingers (a pinch) or a zoomed-in page is not a swipe
  swipeMulti = e.touches.length > 1 || (swipeMulti && e.touches.length > 0);
  swipeTouchStartX = e.changedTouches[0].clientX;
  swipeTouchStartY = e.changedTouches[0].clientY;
}, { passive: true });
document.addEventListener("touchend", e => {
  if (swipeMulti || e.touches.length || (window.visualViewport && visualViewport.scale > 1.01)) return;
  const dx = e.changedTouches[0].clientX - swipeTouchStartX;
  const dy = e.changedTouches[0].clientY - swipeTouchStartY;
  // Mostly sideways only, so scrolling doesn't flip years
  if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  if (lightbox.classList.contains("is-open")) return;
  if (!document.getElementById("gallery-view").hidden) navigateGallery(dx < 0 ? 1 : -1);
}, { passive: true });

// ── Init ───────────────────────────────────────────────────────────────
function applyCount(album, albumPaths, sobrePaths) {
  imageCounts[album.year] = { albumPaths, sobrePaths };
  const card   = document.querySelector(`.album-card[data-year="${album.year}"]`);
  const aEl    = document.querySelector(`[data-type="albums"][data-year="${album.year}"]`);
  const pEl    = document.querySelector(`[data-type="sobres"][data-year="${album.year}"]`);
  const aLabel = document.querySelector(`[data-label="albums"][data-year="${album.year}"]`);
  const pLabel = document.querySelector(`[data-label="sobres"][data-year="${album.year}"]`);
  if (aEl) aEl.textContent = albumPaths.length;
  if (pEl) pEl.textContent = sobrePaths.length;
  if (aLabel) aLabel.textContent = albumPaths.length === 1 ? "Álbum" : "Álbumes";
  if (pLabel) pLabel.textContent = sobrePaths.length === 1 ? "Sobre" : "Sobres";
  if (card && !galleryTabsFor(album, imageCounts[album.year]).length) {
    card.classList.add("is-empty");
    card.setAttribute("tabindex", "-1"); // not interactive with nothing to show
  }
}

// Draws everything in one pass on load
function init() {
  renderTabs();
  renderSubTabs();
  renderGrid(currentFilter);
  ALBUMS.forEach(album => {
    const lists = IMAGE_LISTS[album.year] || { albumPaths: [], sobrePaths: [] };
    applyCount(album, lists.albumPaths, lists.sobrePaths);
  });
  updateStats();
}

// ── Addresses ──────────────────────────────────────────────────────────
// Every view has an address (?messi/galeria, ?2010/sets/variantes): after a "?" live, a "#" as a file
const MARK = location.protocol.startsWith("http") ? "?" : "#";
const SUB_SLUG = { complete: "tengo", pending: "falta", coming: "de-camino", [PHOTOS]: "galeria", sobres: "sobres", postales: "postales", variantes: "variantes", hojas: "hojas", otros: "otros" };
// The 1970-82 checklist's filters, by the same names
const GRID_SLUG = { "is-confirmed": "tengo", "is-pending": "falta", "is-coming": "de-camino" };
// "Mbappé" -> "mbappe"
const slugOf = label => label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
                             .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const tabSlug = key => key === null ? "" : key === "postales" ? "tracker"
  : slugOf((playerColumns().find(c => c.key === key) || { label: key }).label);

// The address of what is on screen. A year page leaves out its first tab.
function viewRoute() {
  const album = !document.getElementById("gallery-view").hidden &&
                ALBUMS.find(a => a.year === currentGalleryYear);
  if (album) {
    const counts = imageCounts[currentGalleryYear] || { albumPaths: [], sobrePaths: [] };
    const tabs   = galleryTabsFor(album, counts);
    const first  = (tabs[0] || {}).key;
    // A year's Sets tab is /2010/sets; the 1970-82 checklist stays /1982/postales
    const tab = tabs.find(t => t.key === currentGalleryTab);
    // A non-default Sets subtab or checklist filter is part of the address
    const grid = currentGalleryTab === "postales" && isGridSet(album.postales);
    const sections = currentGalleryTab === "postales" && !grid ? setSectionsFor(album) : [];
    const sub = grid ? (GRID_SLUG[gridFilter] || "")
      : sections.length && currentSetSection !== defaultSetSection(album) ? slugOf(currentSetSection) : "";
    return currentGalleryTab && (currentGalleryTab !== first || sub)
      ? [currentGalleryYear, currentGalleryTab === "postales" && tab ? slugOf(tab.label) : currentGalleryTab, sub].filter(Boolean).join("/")
      : String(currentGalleryYear);
  }
  // The subtab is part of the address
  const sub = currentSubFilter;
  // A player's Galería section other than Postales is part of it (/messi/galeria/albumes)
  const section = currentFilter && sub === PHOTOS ? shownPlayerGallery(currentFilter) : "postales";
  // The Galería is / (its Álbumes), /galeria/sobres, /galeria/variantes and so on
  return [tabSlug(currentFilter) || (sub ? "galeria" : ""), SUB_SLUG[sub], section === "postales" ? "" : section]
    .filter(Boolean).join("/");
}

const addressRoute = () =>
  decodeURIComponent(MARK === "?" ? location.search : location.hash).replace(/^[?#]\/*|\/+$/g, "");

// Put a route in the address bar: "push" adds a step to Back, "replace" does not
function setAddress(route, mode = "push") {
  if (route === addressRoute()) return;
  const url = route ? MARK + route : location.pathname;
  // Marks views opened in the page, so Atrás knows it can go back
  if (mode === "replace") history.replaceState(history.state, "", url);
  else history.pushState({ inApp: true }, "", url);
}

// Show the view an address names; false when it names none
function applyRoute(route) {
  const [first = "", second = "", third = ""] = route.split("/");
  const album = ALBUMS.find(a => String(a.year) === first);
  if (album) {
    // The Sets subtab or checklist filter the address names
    currentSetSection = setSectionsFor(album).find(sec => slugOf(sec) === third) || null;
    setSectionPinned = !!currentSetSection;
    if (!currentSetSection) setSectionYear = null; // no subtab named: the year's own default
    if (second === "postales") gridFilter = Object.keys(GRID_SLUG).find(k => GRID_SLUG[k] === third) || null;
    // /2010/sets is the postales tab; a singular /1990/sobre (an older address) is Sobres
    const TAB_ALIAS = { sets: "postales", sobre: "sobres", album: "albumes" };
    showGallery(album.year, TAB_ALIAS[second] || second || null);
    return true;
  }
  // /sets (Tracker's old name) still opens Tracker
  const key = first === "" || first === "galeria" ? null : first === "tracker" || first === "sets" ? "postales"
    : (playerColumns().find(c => slugOf(c.label) === first) || {}).key;
  if (key === undefined) return false;
  // /messi/fotos is the player's Galería's old address, and /galeria/sets its Variantes'
  const sub = second === "fotos" ? PHOTOS : key === null && second === "sets" ? "variantes"
    : Object.keys(SUB_SLUG).find(st => SUB_SLUG[st] === second) || null;
  currentFilter    = key;
  currentSubFilter = sub && subTabsFor(key).has(sub) ? sub : null;
  // The Galería section it names (/messi/galeria/hojas); a year there is in Postales
  if (key && currentSubFilter === PHOTOS) playerGallery = PLAYER_GALLERY.some(t => t.key === third) ? third : "postales";
  if (!document.getElementById("gallery-view").hidden) hideGallery();
  renderTabs();
  updateStats();
  if (currentSubFilter === PHOTOS && playerPhotos(key).some(ph => String(ph.year) === third)) {
    showPhotosYear(Number(third));
  } else {
    renderSubTabs();
    renderGrid(currentFilter);
  }
  return true;
}

// Back and Forward walk the views
const followAddress = () => {
  const route = addressRoute();
  if (route !== viewRoute() && !applyRoute(route)) applyRoute("");
};
window.addEventListener("popstate", followAddress);
window.addEventListener("hashchange", followAddress);

// Opens the view in the address, then tidies the address
function openAddress() {
  // (a player's Galería was Fotos: messi/fotos/2010 is messi/galeria/2010)
  const route  = addressRoute().replace(/^([^/]+)\/fotos(?=\/|$)/, "$1/galeria");
  if (route && !applyRoute(route)) applyRoute("");
  const shown  = viewRoute();
  const year   = route.split("/")[2];
  const atYear = currentSubFilter === PHOTOS && year && route === `${shown}/${year}`;
  // A player's photos opened at one year keep that year in the address
  setAddress(atYear ? route : shown, "replace");
  // Lands on that year once fonts and layout are ready
  if (atYear) {
    const land = () => {
      const html = document.documentElement;
      html.style.scrollBehavior = "auto";
      document.getElementById(`fotos-${year}`)?.scrollIntoView({ block: "start" });
      html.style.scrollBehavior = "";
    };
    window.addEventListener("load", () => document.fonts.ready.then(land), { once: true });
  }
}

init();
openAddress();

// PWA manifest: only over http(s); skipped on file://
if (location.protocol.startsWith("http")) {
  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = "manifest.json";
  document.head.appendChild(link);
  // The old service worker was removed: retire it in browsers that still have it
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
    if ("caches" in window) caches.delete("panini-v2");
  }
}
