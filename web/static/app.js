// gripswap configurator front end. The kit is a list of items, each a housing or an insert.
// One item is selected: the 3D view shows it (alone or with a partner for a fit check),
// the editor below changes it.
const $ = (id) => document.getElementById(id);
const COLORS = { housing: 0xd9d3c7, insert_edge: 0x7a74e8, insert_pocket: 0x7a74e8, insert_flip: 0x7a74e8, insert_roller: 0x7a74e8,
                 roller: 0xe0a463, axle: 0xd8d8d8, carabiner: 0x8996a3 };
const LINE = 0x1d1c1a;   // outlines on sharp edges: they make the engraved text, slots and windows readable

let cat = null, framed = false, seq = 0;
let mode = "simple";
// the storage keys keep the old name, opengrips, so a saved mode and theme survive the rename
try { mode = localStorage.getItem("opengrips-mode") || "simple"; } catch (e) { /* storage blocked */ }
const kit = { items: [], sel: 0 };   // items is replaced on Undo, so nothing keeps a reference to it
const cur = () => kit.items[kit.sel];
let partnerKey = "auto";   // "none", "auto" (first match in the kit), "kit:<n>" or "std:<part>"

// ---------- scene
// without WebGL or three.js the page still works: the kit, the editor and the downloads need no 3D
const viewer = $("viewer");
const meshes = {};
let renderer = null, scene, camera, controls, model, loader;

function sceneColor() {
  scene.background = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue("--scene").trim());
  requestRender();
}

// draw a frame only when something changed (three.js manual, "Rendering on demand"). While the
// orbit damping eases out, controls.update() fires "change" and keeps asking for the next frame.
let renderRequested = false;
function requestRender() {
  if (!renderer || renderRequested) return;
  renderRequested = true;
  requestAnimationFrame(() => { renderRequested = false; controls.update(); renderer.render(scene, camera); });
}

// the "Shown in" picker and Fit sit over the top of the view; on a short phone view they would
// cover the model, so the view is centred in the space under them and frame() fits the model there
function overlay() {
  const vb = viewer.querySelector(".vbtns");
  return vb.offsetTop + vb.offsetHeight + 6;
}

function resize() {
  const w = viewer.clientWidth, h = viewer.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  camera.setViewOffset(w, h, 0, -overlay() / 2, w, h);   // also updates the projection
  requestRender();
}

try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  viewer.prepend(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6f6a60, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 0.95); sun.position.set(200, 400, 300); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.3); fill.position.set(-300, 100, -200); scene.add(fill);
  model = new THREE.Group(); model.rotation.x = -Math.PI / 2; scene.add(model);   // OpenSCAD Z-up to three Y-up
  loader = new THREE.STLLoader();
  sceneColor();
  new ResizeObserver(resize).observe(viewer);
  controls.addEventListener("change", requestRender);
} catch (e) {
  if (renderer) renderer.domElement.remove();
  renderer = null;
  viewer.classList.add("no3d");
  viewer.insertAdjacentHTML("afterbegin", `<p class="no3d-msg">3D preview unavailable. You can still build your kit and download it.</p>`);
}

function frame() {
  const box = new THREE.Box3();
  Object.values(meshes).forEach((m) => box.expandByObject(m));
  if (box.isEmpty()) return;
  const c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
  const t = Math.tan((camera.fov * Math.PI) / 360), free = 1 - overlay() / viewer.clientHeight;
  const d = r / Math.min(t * free, t * camera.aspect) * 1.05;   // narrow phone screens: the width limits
  controls.target.copy(c);
  camera.position.copy(c).add(new THREE.Vector3(0.75, 0.55, 1.2).normalize().multiplyScalar(d));
  controls.update();
}

// #status shows the progress; screen readers hear only the end of a render (#say), not every step
function status(text, err) {
  const s = $("status"); s.hidden = !text; s.textContent = text || ""; s.classList.toggle("err", !!err);
  if (err) say(text);
}
function say(text) { $("say").textContent = text; }

// the moment a setting changes, until the new parts are in: dim the model, show a spinner over it.
// A change that comes from the cache is in within a frame or two; the short delay keeps it from flashing.
let busyTimer = null;
function busy(on) {
  clearTimeout(busyTimer);
  if (on && renderer) busyTimer = setTimeout(() => { viewer.classList.add("busy"); $("busy").hidden = false; }, 120);
  else { viewer.classList.remove("busy"); $("busy").hidden = true; }
}

// ---------- catalog helpers
const insertDef = (id) => cat.inserts.find((i) => i.id === id);
const defaults = (params) => Object.fromEntries(params.map((p) => [p.name, p.default]));
const defOf = (it) => (it.type === "housing" ? cat.housing : insertDef(it.insertId));
// a part with "when" is in only while those settings have one of those values (the fuzzy modifier and
// the 3MF with a slicer pattern)
const partsOf = (it) => defOf(it).parts.filter((p) => Object.entries(p.when || {}).every(([n, vs]) => vs.includes(it.values[n])));
// the picked option of a choice setting
const optOf = (it, n) => defOf(it).params.find((q) => q.name === n)?.options.find((o) => o.value === it.values[n]);
// a slicer pattern: its fuzzy skin noise type, and thickness and point distance; else null
function slicerTexture(it) {
  const o = optOf(it, "texture");
  return o?.slicer ? { noise: o.noise, skin: optOf(it, "texture_size").skin } : null;
}
// a part that prints from its own STL, not a slicer modifier or a 3MF made of other parts
const printed = (q) => !q.modifier && !q.threemf;
// a part's note: its own, or for the fuzzy modifier what to set in the slicer
const noteOf = (it, p) => p.modifier ? `fuzzy skin ${slicerTexture(it).skin[0]} mm thick, points ${slicerTexture(it).skin[1]} mm apart` : p.settings;

function newHousing(values) { return { type: "housing", values: Object.assign(defaults(cat.housing.params), values || {}) }; }
function newInsert(id, values) {
  return { type: "insert", insertId: id, values: Object.assign(defaults(insertDef(id).params), values || {}) };
}

// The page shows a short title and a detail line: the kind and size, then the shape and texture.
// File names keep the full name, so each download says exactly what it is.
const pocketWord = (n, w) => `${n > 1 ? n + " × " : ""}${{ 22: "mono", 40: "two-finger", 58: "three-finger" }[w] || `${w} mm`}`;
function titleOf(it) {
  const v = it.values;
  if (it.type === "housing") return "Housing";
  if (it.insertId === "edge") return `${v.slot_d} mm edge`;
  if (it.insertId === "pocket") { const s = `${pocketWord(v.pocket_n, v.pocket_w)} pocket, ${v.slot_d} mm`; return s[0].toUpperCase() + s.slice(1); }
  if (it.insertId === "flip") {
    const word = (k) => v[k + "_kind"] === "edge" ? "edge" : pocketWord(v[k + "_pn"], v[k + "_pw"]);
    const [a, b] = [word("top"), word("bot")];
    return a === b ? `Two-sided ${v.top_d} / ${v.bot_d} mm ${a === "edge" ? "edges" : a}` : `Two-sided ${v.top_d} mm ${a} / ${v.bot_d} mm ${b}`;
  }
  return baseName(it);
}
function detailOf(it) {
  const v = it.values;
  if (it.type === "housing" || it.insertId === "roller") return "";
  const ang = (a) => a > 0 ? `incut ${a}°` : a < 0 ? `sloper ${-a}°` : "";
  let shape = [];
  if (it.insertId === "flip") {
    const grip = (k) => v[k + "_kind"] === "edge" ? [v[k + "_ergo"] ? "ergo" : "", ang(v[k + "_angle"])].filter(Boolean).join(" ") : "";
    const [t, b] = [grip("top"), grip("bot")];
    shape = t === b ? [t && `${t} both`] : [t && `top ${t}`, b && `bottom ${b}`];
  } else shape = [it.insertId === "edge" && v.ergo ? "ergo" : "", ang(v.edge_angle)];
  const o = optOf(it, "texture");
  return [...shape, o && o.value !== "none" ? `${o.label.toLowerCase()} ${v.texture_size}` : ""].filter(Boolean).join(" · ");
}

// the full name, for files: everything in the title and the details
function nameOf(it) {
  const o = it.type === "insert" && optOf(it, "texture");
  return baseName(it) + (o && o.value !== "none" ? ` ${o.label.toLowerCase()} ${it.values.texture_size}` : "");
}
function baseName(it) {
  const v = it.values;
  if (it.type === "housing") return "Housing";
  const ang = v.edge_angle > 0 ? ` incut ${v.edge_angle}°` : v.edge_angle < 0 ? ` sloper ${-v.edge_angle}°` : "";
  if (it.insertId === "edge") return `${v.slot_d} mm${v.ergo ? " ergo" : ""} edge${ang}`;
  const pockets = (n, w) => `${n > 1 ? n + " × " : ""}${{ 22: "mono", 40: "two-finger", 58: "three-finger" }[w] || `${w} mm`} pocket`;
  if (it.insertId === "flip") {
    const grip = (k) => `${v[k + "_d"]} mm ${v[k + "_kind"] === "edge" ? (v[k + "_ergo"] ? "ergo edge" : "edge") + (v[k + "_angle"] ? ` incut ${v[k + "_angle"]}°` : "")
                                                                       : pockets(v[k + "_pn"], v[k + "_pw"])}`;
    return `Two-sided, ${grip("top")} / ${grip("bot")}`;
  }
  if (it.insertId === "pocket") {
    const name = `${pockets(v.pocket_n, v.pocket_w)}, ${v.slot_d} mm${ang}`;
    return name[0].toUpperCase() + name.slice(1);
  }
  return `${v.roll_type === "straight" ? "Straight" : "Unlevel"} roller, ${v.roll_d} mm`;
}

// only the values that differ from the defaults, so equal parts share one cache entry
function ownParams(it) {
  return Object.fromEntries(defOf(it).params.filter((p) => it.values[p.name] !== p.default).map((p) => [p.name, it.values[p.name]]));
}

// a setting of one housing or insert: two inserts can share a name with different ranges
const specIn = (def, n) => def.params.find((p) => p.name === n);
// a row of pockets fits in the insert: count * width + (count - 1) * wall <= max
const spanMax = (s, v) => Math.floor((s.max - (v[s.names[0]] - 1) * v[s.names[2]]) / v[s.names[0]]);
// make a pocket row fit: narrower pockets first, then a thinner wall once they are at their least
function fitSpan(s, v, def) {
  const [n, w, g] = s.names;
  if (v[w] > spanMax(s, v)) v[w] = Math.max(specIn(def, w).min, spanMax(s, v));
  if (v[n] > 1 && v[n] * v[w] + (v[n] - 1) * v[g] > s.max) v[g] = Math.floor((s.max - v[n] * v[w]) / (v[n] - 1));
}

// ---------- rendering: OpenSCAD runs in a worker (render.js), the STLs stay in memory
// Known parameters of this housing or insert (def), with values inside their range only, so a bad
// value never reaches OpenSCAD. Defaults are left out, so equal shapes share one cache entry.
function cleanParams(values, def) {
  const out = {};
  Object.entries(values).forEach(([name, v]) => {
    const p = specIn(def, name);
    if (!p) throw new Error(`unknown parameter: ${name}`);
    if (p.type === "number") {
      if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${name} must be a number`);
      if (v < p.min || v > p.max) throw new Error(`${name} must be between ${p.min} and ${p.max}`);
    } else if (!p.options.some((o) => o.value === v)) throw new Error(`${name} has no option ${v}`);
    if (v !== p.default && !p.options?.find((o) => o.value === v)?.slicer) out[name] = v;   // a slicer pattern gives the same STL
  });
  def.params.forEach((p) => { if (p.scad_with && !(p.scad_with in out)) delete out[p.name]; });
  const q = Object.assign(defaults(def.params), out);
  (def.spans || []).forEach((s) => {
    if (q[s.names[1]] > spanMax(s, q)) throw new Error("The pockets are wider than the insert. Use fewer or narrower pockets.");
  });
  return out;
}

// the file name comes from the item name, so the list shows what lands in the downloads folder.
// An item with more than one printed part adds the part name, and so do a slicer modifier and a 3MF.
const slug = (s) => s.toLowerCase().replaceAll("×", "x").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
// a second item with the same name gets -2, and so on
function fileOf(it, p) {
  const base = slug(nameOf(it)), n = kit.items.slice(0, kit.items.indexOf(it)).filter((x) => slug(nameOf(x)) === base).length;
  const named = !printed(p) || partsOf(it).filter(printed).length > 1;
  return base + (n ? `-${n + 1}` : "") + (named ? "-" + slug(p.name) : "") + (p.threemf ? ".3mf" : ".stl");
}

const worker = new Worker("render.js", { type: "module" });
const waiting = {};
let jobId = 0, broken = null, warm = false;
worker.onmessage = ({ data }) => {
  const w = waiting[data.id]; delete waiting[data.id];
  if (!w) return;   // already failed by onerror
  if (data.error) w.reject(new Error(data.error)); else { warm = true; w.resolve(data.stl); }
};
// the worker script did not load (an old browser without module workers): every job fails, now and later
worker.onerror = (e) => {
  e.preventDefault();
  broken = new Error("This browser cannot run the 3D renderer. Try a current Firefox, Chrome or Safari.");
  Object.keys(waiting).forEach((id) => { waiting[id].reject(broken); delete waiting[id]; });
};

const stls = new Map();   // key: part and clean parameters; value: a promise of the STL bytes
const KEEP = 60;          // STLs kept, about 0.3 MB each: enough to go back and forth between items
// print: turn the part the way it prints and put it on the bed (for_print in gripswap.scad).
// params come from cleanParams.
async function stl(part, clean, print = false) {
  if (broken) throw broken;
  const key = JSON.stringify([part, print, Object.keys(clean).sort().map((k) => [k, clean[k]])]);
  let job = stls.get(key);
  if (!job) {
    job = new Promise((resolve, reject) => {
      waiting[++jobId] = { resolve, reject };
      worker.postMessage({ id: jobId, part, params: print ? { ...clean, for_print: true } : clean });
    }).catch((e) => { if (stls.get(key) === job) stls.delete(key); throw e; });   // a failed render is tried again next time
  }
  stls.delete(key); stls.set(key, job);   // the last used goes last, the oldest goes first
  if (stls.size > KEEP) stls.delete(stls.keys().next().value);
  return job;
}

function saveBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

// ---------- fit-check partner: what the selected item is shown with
function partnerOptions(it) {
  // group: "kit" (your kit) or "std" (standard parts); the dropdown shows them under those headings
  const opts = [{ key: "none", label: "Nothing, just this" }];
  kit.items.forEach((x, n) => { if (x.type !== it.type) opts.push({ key: `kit:${n}`, group: "kit", label: titleOf(x), item: x }); });
  if (it.type === "insert") opts.push({ key: "std:housing", group: "std", label: "Housing", item: newHousing() });
  else opts.push({ key: "std:edge", group: "std", label: "20 mm edge", item: newInsert("edge") });
  return opts;
}

function partnerPick(it) {
  const opts = partnerOptions(it);
  const key = partnerKey === "auto" ? (opts[1] || opts[0]).key : partnerKey;
  return opts.find((o) => o.key === key) || opts[0];
}
const partner = (it) => partnerPick(it).item || null;

function renderPartner() {
  const it = cur(), sel = $("partner");
  $("partner-box").hidden = !it; if (!it) return;
  $("partner-lbl").textContent = it.type === "insert" ? "Shown in" : "Shown with";
  const opts = partnerOptions(it), opt = (o) => `<option value="${o.key}">${o.label}</option>`;
  const group = (g, title) => { const os = opts.filter((o) => o.group === g); return os.length ? `<optgroup label="${title}">${os.map(opt).join("")}</optgroup>` : ""; };
  sel.innerHTML = opts.filter((o) => !o.group).map(opt).join("") + group("kit", "Your kit") + group("std", "Standard");
  sel.value = partnerPick(it).key;
}

// ---------- editor
function shown(p, group) {
  const rule = (group.show_if || {})[p.name];
  return !rule || [rule[1]].flat().includes(cur().values[rule[0]]);
}

// small line pictures for choices, by the catalog's "icon" name: an edge seen from the side,
// a pocket seen from the front
const ICON = {
  flat: '<path d="M3 7v11M3 12h14a3 3 0 0 1 3 3v3"/>',
  ergo: '<path d="M3 7v11M3 12h4q5 3 10 0a3 3 0 0 1 3 3v3"/>',
  incut: '<path d="M3 7v11M3 14l14-3a3 3 0 0 1 3 3v4"/>',
  sloper: '<path d="M3 7v11M3 9q12 0 17 9"/>',
  mono: '<rect x="2" y="6" width="20" height="12" rx="2"/><rect x="9" y="9" width="6" height="6" rx="2"/>',
  two: '<rect x="2" y="6" width="20" height="12" rx="2"/><rect x="7" y="9" width="10" height="6" rx="2"/>',
  three: '<rect x="2" y="6" width="20" height="12" rx="2"/><rect x="5" y="9" width="14" height="6" rx="2"/>',
};
const icon = (k) => ICON[k] ? `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>` : "";

// a setting's help line hides behind an "i" button after its label (W3C APG disclosure). The line
// opens under the label. Open lines stay open when the editor redraws, by the setting's key.
const openTips = new Set();
const tipHtml = (label, help) => help ? `<button type="button" class="info" aria-expanded="false" aria-label="About ${label}">` +
  `<span aria-hidden="true">i</span></button>` : "";
const helpHtml = (help) => help ? `<p class="help" hidden>${help}</p>` : "";
let tipN = 0;
function wireTip(wrap, key) {
  const b = wrap.querySelector(".info"), line = wrap.querySelector(".help");
  if (!b) return;
  line.id = `help-${++tipN}`; b.setAttribute("aria-controls", line.id);
  const show = (open) => { b.setAttribute("aria-expanded", open); line.hidden = !open; };
  show(openTips.has(key));
  b.onclick = () => { const open = line.hidden; open ? openTips.add(key) : openTips.delete(key); show(open); };
}

// a choice: one bar of options, [{label, blurb, icon, active, pick}]. A radio group for the keyboard
// (W3C APG radio group): Tab stops on the checked option only, the arrow keys move and pick.
// Only the picked option's line (blurb) shows, under the bar; none picked is "Custom".
let noteN = 0;
function optionButtons(label, options, help, key = label) {
  const wrap = document.createElement("div"); wrap.className = "param"; wrap.dataset.key = key;
  wrap.innerHTML = `<div class="lrow"><label>${label}</label>${tipHtml(label, help)}</div>${helpHtml(help)}` +
    `<div class="opts" role="radiogroup" aria-label="${label}"></div>` + (options.some((o) => o.blurb) ? `<p class="note"></p>` : "");
  wireTip(wrap, key);
  options.forEach((o) => {
    const b = document.createElement("button");
    b.setAttribute("role", "radio"); b.setAttribute("aria-checked", !!o.active);
    b.innerHTML = `${icon(o.icon)}<span>${o.label}</span>`;
    b.onclick = () => {
      wrap.querySelectorAll(".opts button").forEach((x) => x.setAttribute("aria-checked", x === b));
      wrap.roving();
      o.pick();
    };
    wrap.querySelector(".opts").append(b);
  });
  const bs = [...wrap.querySelectorAll(".opts button")], note = wrap.querySelector(".note");
  // a screen reader reads the note with the group
  if (note) { note.id = `note-${++noteN}`; wrap.querySelector(".opts").setAttribute("aria-describedby", note.id); }
  // the checked option takes the Tab stop; with none checked, the first one. The note follows it.
  wrap.roving = () => {
    const i = bs.findIndex((x) => x.getAttribute("aria-checked") === "true");
    bs.forEach((x, n) => { x.tabIndex = n === Math.max(i, 0) ? 0 : -1; });
    if (note) note.innerHTML = i < 0 ? "<b>Custom:</b> set by the sliders below." : options[i].blurb ? `<b>${options[i].label}:</b> ${options[i].blurb}.` : "";
  };
  wrap.roving();
  wrap.querySelector(".opts").addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;   // browser shortcuts, such as Alt+Left for back
    const i = bs.indexOf(document.activeElement), n = bs.length;
    const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: n - 1 }[e.key];
    if (i < 0 || to === undefined) return;
    e.preventDefault();
    const b = bs[(to + n) % n];
    b.focus(); b.click();
  });
  return wrap;
}

// "Reset" next to a setting while it differs from its default
function resetButton(p, reset) {
  const b = document.createElement("button");
  b.className = "reset"; b.textContent = "Reset";
  b.setAttribute("aria-label", `Reset ${p.label}`);
  b.hidden = cur().values[p.name] === p.default;
  b.onclick = (e) => { e.preventDefault(); reset(); };
  return b;
}

function control(p, group) {
  const vals = cur().values;
  if (p.type === "choice" && p.options.length <= 3) {
    const w = optionButtons(p.label, p.options.map((o) => {
      const m = o.label.match(/^(.*?)\s*\((.*)\)$/) || [null, o.label, ""];
      return { label: m[1], blurb: m[2], icon: o.icon, active: vals[p.name] === o.value,
               pick: () => { vals[p.name] = o.value; gripFocus ||= p.focus === "grip"; buildEditor(); edited(); } };   // a grip kind changes the rows under it
    }), p.help, p.name);
    w.querySelector(".lrow").append(resetButton(p, () => { vals[p.name] = p.default; buildEditor(); edited(); }));
    w.dataset.name = p.name; w.hidden = !shown(p, group);
    return w;
  }
  const wrap = document.createElement("div");
  wrap.className = "param"; wrap.hidden = !shown(p, group); wrap.dataset.name = p.name;
  const id = "p-" + p.name;
  if (p.type === "number") {
    wrap.innerHTML = `<div class="lrow"><label for="${id}">${p.label}</label>${tipHtml(p.label, p.help)}<span class="val"><output></output></span></div>
      ${helpHtml(p.help)}<div class="slider"><button class="step" aria-label="Less ${p.label}">−</button>
      <input id="${id}" type="range" min="${p.min}" max="${p.max}" step="${p.step}">
      <button class="step" aria-label="More ${p.label}">+</button></div>`;
    const input = wrap.querySelector("input"), out = wrap.querySelector("output");
    const [less, more] = wrap.querySelectorAll(".step");
    input.value = vals[p.name];
    const show = () => { out.textContent = `${input.value}${p.unit ? " " + p.unit : ""}`; reset.hidden = vals[p.name] === p.default; };
    const set = (v) => {
      input.value = Math.min(Number(input.max), Math.max(p.min, v));
      vals[p.name] = Number(input.value); show(); fitPockets(); edited();
    };
    const reset = resetButton(p, () => set(p.default));
    out.before(reset);
    show();
    input.addEventListener("input", () => set(Number(input.value)));
    less.onclick = () => set(Number(input.value) - p.step);
    more.onclick = () => set(Number(input.value) + p.step);
  } else {
    // options with a "group" sit under its heading; an option with "about" gets a line under the menu
    const opts = p.options.filter((o) => !(o.modeled && noEdge(cur()))), item = (o) => `<option value="${o.value}">${o.label}</option>`;
    const groups = [...new Set(opts.map((o) => o.group))];
    wrap.innerHTML = `<div class="lrow"><label for="${id}">${p.label}</label>${tipHtml(p.label, p.help)}</div>${helpHtml(p.help)}<select id="${id}">` +
      (opts.every((o) => o.group) ? groups.map((g) => `<optgroup label="${g}">${opts.filter((o) => o.group === g).map(item).join("")}</optgroup>`).join("") : opts.map(item).join("")) +
      "</select>" + (opts.some((o) => o.about) ? `<p class="note" id="about-${p.name}"></p>` : "");
    const sel = wrap.querySelector("select"), about = wrap.querySelector(".note");
    if (about) sel.setAttribute("aria-describedby", about.id);
    const describe = () => { const o = opts.find((q) => q.value === sel.value); if (about) about.innerHTML = o?.about ? `<b>${o.label}:</b> ${o.about}` : ""; };
    sel.value = vals[p.name]; describe();
    const pick = (v) => { vals[p.name] = sel.value = v; describe(); gripFocus ||= p.focus === "grip"; reset.hidden = v === p.default; refreshVisibility(); edited(); };
    const reset = resetButton(p, () => pick(p.default));
    wrap.querySelector(".lrow").append(reset);
    sel.addEventListener("change", () => pick(sel.value));
    if (p.name === "texture") {
      wrap.insertAdjacentHTML("beforeend", `<p class="hint tex-try">Not sure? Print the <button type="button" class="inline">texture test</button> and feel each one.</p>`);
      wrap.querySelector(".tex-try button").onclick = downloadTextureTest;
    }
  }
  wireTip(wrap, p.name);
  return wrap;
}

// any later change closes an Undo offer, so Undo never brings back a kit older than the last edit
function edited() {
  if ($("toast").querySelector("button")) $("toast").hidden = true;
  syncs.forEach((f) => f());
  renderNames(); changed(); saveKit();
  const all = $("reset-all");
  if (all && cur()) all.hidden = !Object.keys(ownParams(cur())).length;
}

// pockets: the width slider's maximum follows the count and the wall, so the pockets always fit
function fitPockets() {
  const it = cur();
  if (!it) return;
  (defOf(it).spans || []).forEach((s) => {
    const v = it.values, def = defOf(it);
    fitSpan(s, v, def);
    s.names.slice(1).forEach((n) => {
      const input = document.querySelector("#p-" + n);
      if (!input) return;
      if (n === s.names[1]) input.max = Math.max(specIn(def, n).min, spanMax(s, v));
      input.value = v[n]; input.closest(".param").querySelector("output").textContent = `${v[n]} mm`;
      input.closest(".param").querySelector(".reset").hidden = v[n] === specIn(def, n).default;
    });
  });
}

function refreshVisibility() {
  document.querySelectorAll("#editor .param[data-name]").forEach((el) => {
    el.hidden = !shown(specIn(defOf(cur()), el.dataset.name), defOf(cur()));
  });
}

// the editor shows the selected item only. Simple: the main choices. Advanced: every setting.
let syncs = [];   // re-mark the Shape, Fingers or Roller buttons after a slider moves

// a rebuild replaces every control, so keyboard focus would fall back to the page. Note where it
// was (its row, and its place in the row), and put it back on the new control there.
function focusSpot() {
  const a = document.activeElement;
  if (!a || !$("edit-section").contains(a)) return null;   // the editor and the All settings switch over it
  const row = a.closest(".param");
  return { id: a.id, row: row && (row.dataset.name || row.dataset.key),
           n: row ? [...row.querySelectorAll("button, input, select")].indexOf(a) : -1 };
}
function restoreFocus(f) {
  if (!f) return;
  const box = $("editor"), seen = (el) => el && !el.hidden && el.getClientRects().length;
  const row = f.row && [...box.querySelectorAll(".param")].find((r) => (r.dataset.name || r.dataset.key) === f.row);
  // a Reset button hides once used: then the row's checked option, or its first control
  const el = [f.id && $(f.id), row && row.querySelectorAll("button, input, select")[f.n],
              row && row.querySelector('[aria-checked="true"]'), row && row.querySelector("button, input, select"),
              $("mode-switch")].find(seen);
  if (el) el.focus();
}

// the settings of one housing or insert, as the cards in its catalog entry. Simple mode shows the
// main settings; All settings adds the rest under "More settings" in each card. choiceFor(card):
// the one-tap choice (Shape, Fingers or Roller) of a card marked choice, or null; it goes first,
// or after the card's choice_after setting. skip: settings the page sets another way.
function buildCards(box, def, choiceFor, skip = () => false) {
  def.cards.forEach((c) => {
    const ps = c.params.map((n) => specIn(def, n)).filter((p) => !skip(p));
    const main = ps.filter((p) => p.simple), more = mode === "advanced" ? ps.filter((p) => !p.simple) : [];
    const choiceEl = c.choice && choiceFor ? choiceFor(c) : null;
    if (!main.length && !more.length && !choiceEl) return;
    const card = document.createElement("section");
    card.className = "ecard";
    card.innerHTML = `<h3>${c.title}${c.sub ? `<small>${c.sub}</small>` : ""}</h3>`;
    if (choiceEl && !c.choice_after) card.append(choiceEl);
    main.forEach((p) => { card.append(control(p, def)); if (choiceEl && p.name === c.choice_after) card.append(choiceEl); });
    if (more.length) {
      card.insertAdjacentHTML("beforeend", `<h4 class="more-h">More settings</h4>`);
      more.forEach((p) => card.append(control(p, def)));
    }
    box.append(card);
  });
}

// a modeled pattern needs an edge: a two-sided insert with pockets on both sides gets none
const noEdge = (it) => it.insertId === "flip" && it.values.top_kind !== "edge" && it.values.bot_kind !== "edge";

function buildEditor() {
  const spot = focusSpot();
  const box = $("editor"); box.innerHTML = "";
  const it = cur();
  syncs = [];
  $("mode-spot").innerHTML = "";
  if (!it) { box.innerHTML = `<p class="hint">Your kit is empty. Add an insert or a housing above.</p>`; return; }
  if (noEdge(it) && optOf(it, "texture")?.modeled) { it.values.texture = "none"; saveKit(); }   // the last edge became a pocket
  // Simple or every setting: a switch, it applies at once (W3C APG switch pattern)
  const sw = document.createElement("button");
  sw.id = "mode-switch"; sw.className = "switch"; sw.setAttribute("role", "switch");
  sw.setAttribute("aria-checked", mode === "advanced");
  sw.innerHTML = `<span class="track" aria-hidden="true"><span class="knob"></span></span>All settings`;
  sw.onclick = () => { setMode(mode === "simple" ? "advanced" : "simple"); };
  $("mode-spot").append(sw);   // in the heading row, beside the name
  if (it.type === "housing") buildCards(box, cat.housing);
  else buildInsertEditor(box, it);
  // every setting back to its default; an insert keeps its kind
  const all = document.createElement("button");
  all.id = "reset-all"; all.textContent = "Reset all to defaults";
  all.hidden = !Object.keys(ownParams(it)).length;
  all.onclick = () => {
    const done = undoable(`${nameOf(it)}: every setting is back to its default.`);
    kit.items[kit.sel] = it.type === "housing" ? newHousing() : newInsert(it.insertId);
    buildEditor(); edited(); done();
  };
  box.append(all);
  restoreFocus(spot);
}

// a one-tap choice (Shape, Fingers or Roller) that sets several values at once. prefix: a grip of a
// two-sided insert ("top_"), whose values carry it. Depth and lip radius are only a starting
// point: the slider changes them without changing the shape.
function oneTap(sc, prefix, key) {
  const vals = () => cur().values;
  const on = (o) => Object.entries(o.values).every(([k, v]) => ["slot_d", "grip_r", "r"].includes(k) || vals()[prefix + k] === v);
  const w = optionButtons(sc.label, sc.options.map((o) => ({ label: o.label, blurb: o.blurb, icon: o.icon, active: on(o),
    pick: () => { Object.entries(o.values).forEach(([k, v]) => { vals()[prefix + k] = v; }); buildEditor(); edited(); } })), "", key);
  if (sc.help) w.insertAdjacentHTML("beforeend", `<p class="rule">${sc.help}</p>`);
  const bs = w.querySelectorAll(".opts button");
  syncs.push(() => { sc.options.forEach((o, n) => bs[n].setAttribute("aria-checked", on(o))); w.roving(); });
  return w;
}

// the two-sided insert, and the one-sided kinds it is made from
const twoDef = () => cat.inserts.find((i) => i.two_sided_of);

// one side to two: the item's settings become the top grip's, inside the two-sided ranges.
// Returns the new item and what had to change to fit.
function toTwoSided(it) {
  const two = twoDef(), t = newInsert(two.id), v = it.values, w = t.values, cut = [];
  const say = (n, x, y) => { const p = specIn(two, n); cut.push(`${p.label.replace(/^Top /, "").toLowerCase()} ${x} to ${y}${p.unit ? " " + p.unit : ""}`); };
  const put = (n, x, quiet) => {
    const p = specIn(two, n), y = Math.min(p.max, Math.max(p.min, x));
    if (y !== x && !quiet) say(n, x, y);
    w[n] = y;
  };
  w.top_kind = it.insertId;
  put("top_d", v.slot_d); put("top_r", v.grip_r);
  if (it.insertId === "edge") {
    put("top_ergo", v.ergo); put("top_angle", v.edge_angle, true); put("top_w", v.slot_w);
    if (w.top_angle !== v.edge_angle) cut.push(`angle ${v.edge_angle}° to ${w.top_angle}°`);   // a sloper has no two-sided form
  }
  else {
    put("top_pn", v.pocket_n); put("top_pr", v.pocket_r); put("top_pw", v.pocket_w, true); put("top_pgap", v.pocket_gap, true);
    fitSpan(two.spans[0], w, two);
    if (w.top_pw !== v.pocket_w) say("top_pw", v.pocket_w, w.top_pw);
    if (w.top_pgap !== v.pocket_gap) say("top_pgap", v.pocket_gap, w.top_pgap);
  }
  w.texture = v.texture; w.texture_size = v.texture_size;
  if (it.insertId === "pocket" && v.edge_angle) cut.push(`angle ${v.edge_angle}° to 0°`);
  // each grip of a two-sided insert takes half the height
  const h = specIn(defOf(it), "slot_h");
  if (h && v.slot_h !== h.default) cut.push(`slot height ${v.slot_h} mm to half the insert`);
  return { it: t, cut };
}

// two sides to one: the top grip becomes the insert, the bottom grip goes
function toOneSided(it) {
  const v = it.values;
  return v.top_kind === "edge"
    ? newInsert("edge", { slot_d: v.top_d, grip_r: v.top_r, ergo: v.top_ergo, edge_angle: v.top_angle, slot_w: v.top_w, texture: v.texture, texture_size: v.texture_size })
    : newInsert("pocket", { slot_d: v.top_d, grip_r: v.top_r, pocket_n: v.top_pn, pocket_w: v.top_pw, pocket_gap: v.top_pgap, pocket_r: v.top_pr,
                            texture: ["lines", "knurl", "dots"].includes(v.texture) ? "none" : v.texture, texture_size: v.texture_size });   // pockets have no modeled patterns
}

function setSides(n) {
  const it = cur(), name = nameOf(it);
  if ((n === 2) === (it.insertId === twoDef().id)) return;
  const { it: next, cut } = n === 2 ? toTwoSided(it) : { it: toOneSided(it), cut: [] };
  const done = undoable(n === 2 ? `${name} is now two-sided.` + (cut.length ? ` To fit, the ${cut.join(", ")}.` : "")
                                : `${name} is now one-sided. The bottom grip is gone.`);
  kit.items[kit.sel] = next; buildEditor(); edited(); done();
}

function buildInsertEditor(box, it) {
  const def = insertDef(it.insertId), two = twoDef(), isTwo = it.insertId === two.id;
  const shownKind = isTwo ? it.values.top_kind : it.insertId;   // a two-sided insert shows as its top grip's kind
  const pickKind = (id) => {
    if (id === shownKind) return;
    // a two-sided insert keeps both grips when its top grip turns from edge to pockets or back
    if (isTwo && two.two_sided_of.includes(id)) { cur().values.top_kind = id; buildEditor(); edited(); return; }
    const done = undoable(`${nameOf(cur())} is now ${insertDef(id).name.toLowerCase()}.`, true);
    kit.items[kit.sel] = newInsert(id); buildEditor(); edited(); done();
  };
  const kindDef = insertDef(shownKind);
  // one short word each, in one row; the line under it says what the picked insert is
  const kinds = optionButtons("Insert", cat.inserts.filter((i) => !i.two_sided_of).map((i) => ({
    label: i.name, active: i.id === shownKind, pick: () => pickKind(i.id) })), `${kindDef.name}: ${kindDef.blurb}.`);
  const head = document.createElement("section");
  head.className = "ecard"; head.innerHTML = `<h3 class="sr">Insert</h3>`; head.append(kinds);
  if (two.two_sided_of.includes(shownKind))
    head.append(optionButtons("Sides", [{ label: "One", active: !isTwo, pick: () => setSides(1) },
                                        { label: "Two", active: isTwo, pick: () => setSides(2) }],
                              "Two adds a second grip on the underside. Turn the insert over to swap."));
  box.append(head);
  if (isTwo) {
    // each grip card has the one-tap choice of its kind; the Insert row sets the top grip's kind
    const side = (c) => c.params[0].split("_")[0];
    const choiceFor = (c) => oneTap(two.side_choices[it.values[side(c) + "_kind"]], side(c) + "_", `${side(c)}-choice`);
    buildCards(box, def, choiceFor, (p) => p.name === "top_kind");
  } else {
    const sc = def.simple_choice;
    // a choice that the buttons above already set (Unlevel or Straight) is not shown twice
    const covered = (p) => p.type === "choice" && sc && sc.options.every((o) => p.name in o.values);
    buildCards(box, def, () => (sc ? oneTap(sc, "", sc.label) : null), covered);
  }
  fitPockets();
}

// ---------- kit list
// sticky: the toast stays until the next one or until hideToast(the number toast returned).
// undo: an Undo button that calls it. An Undo offer has no time limit (WCAG 2.2.1): it stays
// until the next edit, × or Escape.
let toastTimer = null, toastNo = 0;
function toast(text, sticky, undo) {
  const t = $("toast"); t.textContent = text; t.hidden = false;
  if (undo) {
    const b = document.createElement("button"); b.textContent = "Undo";
    b.onclick = () => { undo(); closeToast(); };
    const x = document.createElement("button"); x.textContent = "×"; x.setAttribute("aria-label", "Close");
    x.onclick = closeToast;
    t.append(b, x);
  }
  clearTimeout(toastTimer); if (!sticky && !undo) toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
  return ++toastNo;
}
// a toast that closes with the focus on its button would leave the focus nowhere: put it on the
// picked option in the editor
function closeToast() {
  const t = $("toast"), had = t.contains(document.activeElement);
  t.hidden = true;
  if (had) ($("editor").querySelector('[aria-checked="true"]') || $("editor").querySelector("button"))?.focus();
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("toast").hidden) closeToast(); });
function hideToast(no) { if (no === toastNo) $("toast").hidden = true; }

// a copy of the kit before a change that loses settings, for Undo. Several insert kinds in a row on
// one item (chain), with the Undo offer still open, keep the oldest copy: Undo goes back to before
// the first change.
let undoCopy = null;
function undoable(text, chain = false) {
  const open = !$("toast").hidden && $("toast").querySelector("button");
  if (!(chain && open && undoCopy && undoCopy.chain && undoCopy.sel === kit.sel))
    undoCopy = { items: JSON.parse(JSON.stringify(kit.items)), sel: kit.sel, chain };
  const { items, sel } = undoCopy;
  return () => toast(text, false, () => { kit.items = items; kit.sel = sel; partnerKey = "auto"; buildEditor(); edited(); });
}

function select(n) { kit.sel = n; partnerKey = "auto"; buildEditor(); edited(); }

function addItem(it) {
  kit.items.push(it); kit.sel = kit.items.length - 1; partnerKey = "auto";
  buildEditor(); edited();
  // phones: the editor is far below the kit list, so go to it
  if (innerWidth < 900) $("edit-section").scrollIntoView({ behavior: "smooth" });
  toast(`Added ${nameOf(it)}.`);
}

function renderKit() {
  const box = $("kit"), had = box.contains(document.activeElement); box.innerHTML = "";
  kit.items.forEach((it, n) => {
    const card = document.createElement("div");
    card.className = "card" + (n === kit.sel ? " on" : "");
    const main = document.createElement("button");
    main.className = "card-main"; main.setAttribute("aria-pressed", n === kit.sel);
    main.innerHTML = `<small>${it.type === "housing" ? "Housing" : "Insert"}</small><strong>${titleOf(it)}</strong>` +
      (detailOf(it) ? `<small>${detailOf(it)}</small>` : "");
    main.title = "Show and change this item";
    main.onclick = () => select(n);
    const copy = document.createElement("button");
    copy.className = "tool"; copy.textContent = "Copy"; copy.setAttribute("aria-label", `Copy ${nameOf(it)}`);
    copy.onclick = () => addItem(JSON.parse(JSON.stringify(it)));
    const rm = document.createElement("button");
    rm.className = "tool"; rm.textContent = "×"; rm.setAttribute("aria-label", `Remove ${nameOf(it)}`);
    rm.onclick = () => {
      const done = undoable(`Removed ${nameOf(it)}.`);
      kit.items.splice(n, 1);
      kit.sel = Math.max(0, Math.min(kit.sel - (n < kit.sel ? 1 : 0), kit.items.length - 1));
      partnerKey = "auto"; buildEditor(); edited(); done();
    };
    card.append(main, copy, rm);
    box.append(card);
  });
  // the redraw removes the focused button: the keyboard goes on from the picked item
  if (had) box.querySelectorAll(".card-main")[kit.sel]?.focus();
}

// everything that shows a name or the kit: list, editor title, partner list, 3D caption, downloads
function renderNames() {
  renderKit(); renderPartner();
  const it = cur();
  $("edit-title").textContent = it ? titleOf(it) : "nothing selected";
  const p = it && partner(it);
  $("showing").textContent = !it ? "" : p ? `${titleOf(it)} ${it.type === "insert" ? "in" : "with"} ${titleOf(p)}` : titleOf(it);
  buildDownloads();
}

// ---------- preview
let timer = null;
let gripFocus = false;   // a texture setting changed: once the new parts are in, the view turns to the grip

// Turn the view to the grip of the insert: from the front and a little below, close enough to see a
// texture. The grip is the roof of the first opening in the front face, found from the top down,
// half way back. The camera glides there.
function lookAtGrip() {
  const m = ["insert_edge", "insert_pocket", "insert_flip"].map((k) => meshes[k]).find(Boolean);
  if (!m) return;
  const mesh = m.children[0], bb = mesh.geometry.boundingBox || (mesh.geometry.computeBoundingBox(), mesh.geometry.boundingBox);
  model.updateMatrixWorld();
  const ray = new THREE.Raycaster(), dir = new THREE.Vector3(0, 1, 0).transformDirection(model.matrixWorld);
  // the middle first; off the middle only where a wall stands there (two or three pockets)
  let grip = null;
  for (const x of [0, 8, -8, 16, -16, 24, -24]) {
    for (let z = bb.max.z - 0.5; z > bb.min.z && !grip; z -= 0.5) {
      ray.set(model.localToWorld(new THREE.Vector3(x, bb.min.y - 5, z)), dir);
      const hit = ray.intersectObject(mesh)[0], y = hit ? model.worldToLocal(hit.point.clone()).y : Infinity;
      if (y > bb.min.y + 4) grip = new THREE.Vector3(x, Math.min(y, bb.max.y) / 2, z);
    }
    if (grip) break;
  }
  if (!grip) return;
  const to = model.localToWorld(grip.clone()), from = model.localToWorld(grip.clone().add(new THREE.Vector3(-0.3, -1, -0.55).setLength(70)));
  const p0 = camera.position.clone(), t0 = controls.target.clone(), start = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - start) / 450), e = k * k * (3 - 2 * k);
    camera.position.lerpVectors(p0, from, e); controls.target.lerpVectors(t0, to, e); requestRender();
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function changed(now) {
  busy(true);
  clearTimeout(timer);
  timer = setTimeout(update, now ? 0 : 500);
}

// ---------- fuzzy texture in the preview
// The slicer makes the texture, so the STL is smooth. The preview marks the faces inside the
// modifier and draws bumps of the picked size on them in the shader: an approximation, not the
// slicer's real result.

// true if p is inside the closed mesh tris (flat xyz triangles): count the hits of one ray
function inside(px, py, pz, tris) {
  const dx = 1, dy = 0.0137, dz = 0.0071;   // the ray, skewed so it does not run along a mesh edge
  let hits = 0;
  for (let i = 0; i < tris.length; i += 9) {
    const ax = tris[i], ay = tris[i + 1], az = tris[i + 2];
    const e1x = tris[i + 3] - ax, e1y = tris[i + 4] - ay, e1z = tris[i + 5] - az;
    const e2x = tris[i + 6] - ax, e2y = tris[i + 7] - ay, e2z = tris[i + 8] - az;
    const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
    const a = e1x * hx + e1y * hy + e1z * hz;
    if (Math.abs(a) < 1e-12) continue;
    const sx = px - ax, sy = py - ay, sz = pz - az;
    const u = (sx * hx + sy * hy + sz * hz) / a;
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = (dx * qx + dy * qy + dz * qz) / a;
    if (v < 0 || u + v > 1) continue;
    if ((e2x * qx + e2y * qy + e2z * qz) / a > 0) hits++;
  }
  return hits % 2 === 1;
}

// per vertex of geo: 1 on the faces that lie on the modifier band, else 0
function fuzzMask(geo, band) {
  const pos = geo.attributes.position.array, tris = band.attributes.position.array;
  band.computeBoundingBox();
  const bb = band.boundingBox;
  const mask = new Float32Array(pos.length / 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
  for (let i = 0; i < pos.length; i += 9) {
    a.fromArray(pos, i); b.fromArray(pos, i + 3); c.fromArray(pos, i + 6);
    n.subVectors(c, b).cross(e.subVectors(b, a)).normalize();
    // a point 0.3 mm into the material, under the middle of the face
    const p = a.add(b).add(c).divideScalar(3).addScaledVector(n, 0.3);
    if (bb.containsPoint(p) && inside(p.x, p.y, p.z, tris)) mask.fill(1, i / 3, i / 3 + 3);
  }
  return mask;
}
const masks = new WeakMap();   // key: the insert's STL bytes; the band comes from the same settings

// Bumps on the marked faces: noise in the part's own millimetres, pd across and one 0.2 mm print
// layer along y (inserts print on their backs), t high. Zoomed in, that is the real size. Zoomed out,
// the bumps grow in steps of two, so they stay a few pixels wide and the texture still shows. The
// marked faces also glow a soft amber, so the area shows in the shade of the slot.
// kind: 0 classic, 1 cells (Voronoi), 2 marble (ridged); cells and marble use the slicers' 1 mm noise scale
const NOISE_KIND = { classic: 0, voronoi: 1, ridgedmulti: 2 };
function fuzzMaterial(mat, t, pd, kind = 0) {
  mat.extensions = { derivatives: true };   // dFdx and fwidth on WebGL1
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.fuzzT = { value: t }; sh.uniforms.fuzzPd = { value: pd }; sh.uniforms.fuzzKind = { value: kind };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float fuzz;\nvarying float vFuzz;\nvarying vec3 vObj;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFuzz = fuzz;\nvObj = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
varying float vFuzz;
varying vec3 vObj;
uniform float fuzzT, fuzzPd, fuzzKind;
float fzHash(vec3 c) { return fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float fzNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fzHash(i), fzHash(i + vec3(1, 0, 0)), f.x), mix(fzHash(i + vec3(0, 1, 0)), fzHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(fzHash(i + vec3(0, 0, 1)), fzHash(i + vec3(1, 0, 1)), f.x), mix(fzHash(i + vec3(0, 1, 1)), fzHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fzCells(vec3 p) {
  vec3 i = floor(p); float best = 9.0, id = 0.0;
  for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) for (int c = -1; c <= 1; c++) {
    vec3 g = i + vec3(a, b, c), q = g + vec3(fzHash(g), fzHash(g + 3.1), fzHash(g + 7.7));
    float d = length(p - q);
    if (d < best) { best = d; id = fzHash(g + 11.3); }
  }
  return id;
}
float fzMarble(vec3 p) {
  float n = 0.0, a = 0.5;
  for (int o = 0; o < 4; o++) { n += a * fzNoise(p); p *= 2.0; a *= 0.5; }
  float r = 1.0 - abs(2.0 * n / 0.9375 - 1.0);
  return r * r;
}
float fzPattern(vec3 p) { return fuzzKind < 0.5 ? fzNoise(p) : fuzzKind < 1.5 ? fzCells(p) : fzMarble(p); }
vec3 fzPerturb(vec3 pos, vec3 n, float h) {
  vec3 sx = dFdx(pos), sy = dFdy(pos);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - g);
}`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
if (vFuzz > 0.5) {
  // the step: 0 while one bump is 3 pixels or more, then 1 for every halving, blended between steps
  float lod = max(log2(3.0 * length(fwidth(vObj)) / fuzzPd), 0.0), l0 = floor(lod), s0 = exp2(l0);
  vec3 cell = fuzzKind < 0.5 ? vec3(fuzzPd, 0.2, fuzzPd) : vec3(1.0);
  float h = fuzzT * mix(s0 * fzPattern(vObj / (cell * s0)), 2.0 * s0 * fzPattern(vObj / (cell * 2.0 * s0) + 17.0), lod - l0);
  normal = fzPerturb(-vViewPosition, normal, h);
}`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
if (vFuzz > 0.5) totalEmissiveRadiance += vec3(0.16, 0.09, 0.0);`);
  };
}

async function loadMesh(job, my) {
  const [bytes, bandBytes] = await Promise.all([stl(job.part, job.params), job.fuzz && stl(job.fuzz.part, job.params)]);
  if (my !== seq) return;
  const geo = loader.parse(bytes);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: COLORS[job.part] || 0x888888, roughness: 0.75,
                                               metalness: job.part === "axle" || job.part === "carabiner" ? 0.4 : 0.05 });
  if (bandBytes) {
    if (!masks.has(bytes)) masks.set(bytes, fuzzMask(geo, loader.parse(bandBytes)));
    geo.setAttribute("fuzz", new THREE.BufferAttribute(masks.get(bytes), 1));
    fuzzMaterial(mat, ...job.fuzz.skin, job.fuzz.kind);
  }
  if (job.ghost) { mat.transparent = true; mat.opacity = 0.3; mat.depthWrite = false; }
  if (meshes[job.part]) drop(job.part);
  const m = new THREE.Group();
  m.add(new THREE.Mesh(geo, mat));
  // round faces meet at less than 30 degrees, so only real corners get a line
  m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30),
        new THREE.LineBasicMaterial({ color: LINE, transparent: true, opacity: job.ghost ? 0.2 : 0.55 })));
  meshes[job.part] = m; model.add(m);
  requestRender();
}

function drop(k) {
  model.remove(meshes[k]);
  meshes[k].children.forEach((c) => { c.geometry.dispose(); c.material.dispose(); });
  delete meshes[k];
  requestRender();
}

async function update() {
  const my = ++seq, it = cur();
  const jobs = [];
  try { if (it) {
    const p = partner(it);
    const h = it.type === "housing" ? it : p;
    const ins = it.type === "insert" ? it : p;
    // the insert lines up with the floor of the housing it is shown in
    if (ins) {
      // the fuzzy modifier is not drawn, it marks where the insert gets bumps
      const tm = partsOf(ins).find((q) => q.threemf), st = tm && slicerTexture(ins);
      partsOf(ins).filter(printed).forEach((q) => jobs.push({ part: q.part, params: Object.assign(cleanParams(ownParams(ins), defOf(ins)),
                                                                           h ? cleanParams({ floor_t: h.values.floor_t }, cat.housing) : {}),
                                                                         fuzz: st && { part: tm.threemf[1], skin: st.skin, kind: NOISE_KIND[st.noise] } }));
    }
    if (h) {
      const params = cleanParams(ownParams(h), cat.housing);
      jobs.push({ part: "housing", params, ghost: it.type === "insert" });   // see-through around an insert
      jobs.push({ part: "carabiner", params });
    }
  } } catch (e) { status(e.message, true); busy(false); return; }
  const keep = jobs.map((j) => j.part);
  Object.keys(meshes).forEach((k) => {
    if (!keep.includes(k)) drop(k);
  });
  if (!jobs.length || !renderer) { status(""); busy(false); return; }
  let done = 0, failed = false;   // after a failure the error stays, the parts still loading do not overwrite it
  const progress = () => status(`Rendering ${done + 1} of ${jobs.length}…` + (warm ? "" : " (the first time loads the 11 MB renderer)"));
  progress();
  try {
    await Promise.all(jobs.map((j) => loadMesh(j, my).then(() => { done++; if (my === seq && !failed && done < jobs.length) progress(); })));
    if (my !== seq) return;
    status(""); busy(false); say("Preview updated.");
    if (!framed) { frame(); framed = true; }
    if (gripFocus) { gripFocus = false; lookAtGrip(); }
  } catch (e) {
    failed = true; gripFocus = false;
    if (my === seq) { status(e.message, true); busy(false); }
  }
}

// ---------- downloads
const DL_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/></svg>`;
// a test print button spins until its zip is saved
async function busyWhile(b, f) {
  if (b.classList.contains("busy")) return;   // a second tap must not stop the spinner of the first
  b.classList.add("busy");
  try { await f(); } finally { b.classList.remove("busy"); }
}
function buildDownloads() {
  const dl = $("downloads");
  dl.innerHTML = kit.items.length ? `<p class="warn">Not load-tested yet. Check every part before each session, and keep your feet clear of the weight.</p>
    <p class="hint">Ticked files go in the zip, the arrow saves one file. PETG, ready to slice.
    <a href="print.html" target="_blank" rel="noopener">Printing guide</a></p>` : "";
  // the test prints come before any kit, so they show on an empty kit too
  dl.insertAdjacentHTML("beforeend", `<div class="tests"><h3>Test prints · print these first</h3><div class="tgrid">
    <button type="button" class="tcard" id="fit-dl"><span><strong>Fit test</strong><small>Does an insert slide in?</small></span>${DL_ICON}</button>
    <button type="button" class="tcard" id="tex-dl"><span><strong>Texture test</strong><small>Feel every grip pattern</small></span>${DL_ICON}</button></div></div>`);
  $("fit-dl").onclick = (e) => busyWhile(e.currentTarget, downloadFitTest);
  $("tex-dl").onclick = (e) => busyWhile(e.currentTarget, downloadTextureTest);
  kit.items.forEach((it) => {
    const box = document.createElement("div"); box.className = "ditem";
    it.skip = it.skip || {};   // parts left out of the zip, by part name; a plain object so that Copy keeps it
    partsOf(it).forEach((p, i) => {
      const row = document.createElement("div"); row.className = "dfile";
      const file = fileOf(it, p), detail = detailOf(it);
      row.innerHTML = `<label title="${file}"><input type="checkbox"${it.skip[p.part] ? "" : " checked"}>
        <span><strong>${titleOf(it)}${i ? ` · ${p.name}` : ""}</strong>${detail ? `<small>${detail}</small>` : ""}
        <small>${p.threemf ? "3MF" : "STL"} · ${noteOf(it, p)} · ${p.supports}</small></span></label>
        <button type="button" title="Download only ${file}" aria-label="Download only ${file}">${DL_ICON}</button>`;
      row.querySelector("input").onchange = (e) => { it.skip[p.part] = !e.target.checked; kitButton(); };
      row.querySelector("button").onclick = (e) => downloadPart(p, it, e.currentTarget);
      box.append(row);
    });
    dl.append(box);
  });
  const nh = kit.items.filter((x) => x.type === "housing").length, ni = kit.items.length - nh;
  $("kit-summary").textContent = `Kit: ${ni} insert${ni === 1 ? "" : "s"}, ${nh} housing${nh === 1 ? "" : "s"}`;
  $("kit-count").textContent = `(${kit.items.length})`;
  kitButton();
  buildNeed();
}

// the ticked files: all of them is the whole kit, fewer is a count
function picked() { return kit.items.flatMap((it, n) => partsOf(it).filter((p) => !it.skip[p.part]).map((p) => ({ it, n, p }))); }
let zipping = false;
function kitButton() {
  if (zipping) return;
  const n = picked().length, all = kit.items.reduce((s, it) => s + partsOf(it).length, 0);
  $("b-kit").textContent = n === all ? "Download zip" : !n ? "No files picked" : `Download zip (${n} file${n === 1 ? "" : "s"})`;
  $("b-kit").disabled = !n;
}

// the bytes of one download: the STL as it prints, or a 3MF of the insert and its fuzzy modifier
// with the picked texture set on the modifier ("all" is Contour and hole: the grip prints as a hole)
async function fileData(p, it) {
  const params = cleanParams(ownParams(it), defOf(it));
  if (!p.threemf) return new Uint8Array(await stl(p.part, params, true));
  const [ins, mod] = await Promise.all(p.threemf.map((q) => stl(q, params, true)));
  const { noise, skin: [t, pd] } = slicerTexture(it);
  return make3mf(nameOf(it), [
    { name: nameOf(it), stl: ins, type: "normal_part" },
    { name: "Fuzzy texture", stl: mod, type: "modifier_part",
      settings: { fuzzy_skin: "all", fuzzy_skin_thickness: t, fuzzy_skin_point_distance: pd, fuzzy_skin_noise_type: noise } }], p.print);
}

// the button spins and ignores more taps until the file is saved
async function downloadPart(p, it, b) {
  b.disabled = true; b.classList.add("busy");
  const no = toast(`Preparing ${fileOf(it, p)}…`, true);
  try {
    saveBlob(new Blob([await fileData(p, it)], { type: p.threemf ? "model/3mf" : "model/stl" }), fileOf(it, p));
    hideToast(no);
  } catch (e) {
    toast("The file failed: " + e.message);
  } finally {
    b.disabled = false; b.classList.remove("busy");
  }
}

// the hardware and the steps for the parts in the kit only
function buildNeed() {
  const housings = kit.items.filter((x) => x.type === "housing"), inserts = kit.items.filter((x) => x.type === "insert");
  const roller = inserts.some((x) => x.insertId === "roller"), flip = inserts.some((x) => x.insertId === "flip");
  const need = ["A steel screwgate carabiner and a loading pin or sling for the weights. The carabiner bar must be thinner than the hole (Hole size, on the housing)."];
  if (roller) need.push("For the roller: a 12 mm steel rod or dowel, cut to 100 mm, works as the axle, or print it.");
  const steps = [];
  if (roller) steps.push("Roller: drop the roller between the cheeks, push the axle through both cheeks and the roller.");
  if (inserts.length) steps.push("Slide the insert into the housing from the back until it clicks over the stop in the floor.",
                                 "To swap: press the stop down at the back, push the insert out the back with your fingers in the slot, slide the next one in.");
  if (flip) steps.push("Two-sided insert: to use the other grip, take it out, turn it over and slide it back in.");
  if (housings.length) steps.push("Clip the carabiner to the anchor plate under the housing. Check it before every session.");
  const list = (xs) => `<ul>${xs.map((x) => `<li>${x}</li>`).join("")}</ul>`;
  $("need").innerHTML = `<details><summary>Hardware and assembly</summary><strong>You also need</strong>${list(need)}`
    + (steps.length ? `<strong>Put it together</strong>${list(steps)}` : "") + `</details>`;
}

// the printing guide and the files it shows, for each zip, so the guide opens offline. Its links
// back to the configurator point to the site. A guide that does not load leaves the zip without it.
async function guideFiles() {
  try {
    const get = async (f) => { const r = await fetch(f); if (!r.ok) throw new Error(f); return r; };
    const html = (await (await get("print.html")).text()).replaceAll('href="./"', 'href="https://awalvie.github.io/gripswap/"');
    const assets = ["icon.svg", ...new Set([...html.matchAll(/src="(img\/[^"]+)"/g)].map((m) => m[1]))];
    const data = await Promise.all(assets.map(async (f) => new Uint8Array(await (await get(f)).arrayBuffer())));
    return [{ name: "printing-guide.html", data: new TextEncoder().encode(html) }, ...assets.map((name, i) => ({ name, data: data[i] }))];
  } catch (e) {
    return [];
  }
}

// NN-file.stl: the item number keeps equal parts of two items apart
async function downloadKit() {
  const b = $("b-kit");
  zipping = true; b.disabled = true; b.textContent = "Preparing…";
  const no = toast("Preparing the zip. New parts take a moment each.", true);
  try {
    const files = picked().map(({ it, n, p }) => {
      const name = String(n + 1).padStart(2, "0") + "-" + fileOf(it, p);
      return fileData(p, it).then((data) => ({ name, data }));
    });
    saveBlob(await makeZip([...await Promise.all(files), ...await guideFiles()]), "gripswap-kit.zip");
    hideToast(no);
  } catch (e) {
    toast("The zip failed: " + e.message);
  } finally {
    zipping = false; kitButton();
  }
}

// the fit test parts, as they print, in one zip
let fitting = false;
async function downloadFitTest() {
  if (fitting) return;
  fitting = true;
  const no = toast("Preparing the fit test zip…", true);
  try {
    const files = cat.fit_test.map((p) => stl(p.part, {}, true).then((data) => ({ name: `fit-test-${slug(p.name)}.stl`, data: new Uint8Array(data) })));
    saveBlob(await makeZip([...await Promise.all(files), ...await guideFiles()]), "gripswap-fit-test.zip");
    hideToast(no);
  } catch (e) {
    toast("The zip failed: " + e.message);
  } finally {
    fitting = false;
  }
}

// the texture test: the modeled patterns in one STL, and the slicer patterns in a 3MF for Bambu
// Studio and Orca, one modifier per tab with its own fuzzy skin, in one zip
let texturing = false;
async function downloadTextureTest() {
  if (texturing) return;
  texturing = true;
  const no = toast("Preparing the texture test zip…", true);
  try {
    const t = cat.texture_test, edge = cat.inserts.find((i) => i.id === "edge").params;
    const sliced = t.sliced.map((v) => edge.find((p) => p.name === "texture").options.find((o) => o.value === v));
    const sizes = edge.find((p) => p.name === "texture_size").options;
    const tabs = sliced.flatMap((o) => sizes.map((s) => ({ o, s })));   // row by row, as tex_i in src/texture_test.scad
    const [modeled, smooth, ...mods] = await Promise.all([stl(t.modeled, {}, true), stl(t.smooth, {}, true),
      ...tabs.map((_, i) => stl(t.modifier, { tex_i: i }, true))]);
    const threemf = await make3mf("Texture test", [{ name: "Texture test", stl: smooth, type: "normal_part" },
      ...tabs.map(({ o, s }, i) => ({ name: `${o.label} ${s.label.replace(/\s*\(.*\)$/, "")}`, stl: mods[i], type: "modifier_part",
        settings: { fuzzy_skin: "all", fuzzy_skin_thickness: s.skin[0], fuzzy_skin_point_distance: s.skin[1], fuzzy_skin_noise_type: o.noise } }))], t.print);
    saveBlob(await makeZip([{ name: "texture-test.stl", data: new Uint8Array(modeled) },
      { name: "texture-test-bambu-orca.3mf", data: threemf }, ...await guideFiles()]), "gripswap-texture-test.zip");
    hideToast(no);
  } catch (e) {
    toast("The zip failed: " + e.message);
  } finally {
    texturing = false;
  }
}

// ---------- the kit in the page link: a reload keeps it, and a copied link shares it
// #k= holds the selected index and each item with only the values that differ from the defaults
// a slider calls this on every step, so the link is written once the steps stop
let saveTimer = null;
function saveKit() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const items = kit.items.map((it) => (it.type === "housing" ? { h: ownParams(it) } : { i: it.insertId, v: ownParams(it) }));
    try { history.replaceState(null, "", "#k=" + encodeURIComponent(JSON.stringify({ s: kit.sel, items }))); } catch (e) { /* the link is a convenience */ }
  }, 300);
}
// a link that does not parse gives the default kit. A value outside today's range (from an older
// link) moves to the nearest end, a choice the page no longer has goes back to its default, and an
// insert the page no longer has is dropped; the rest of the kit stays.
function loadKit() {
  try {
    const m = location.hash.match(/^#k=(.+)$/);
    if (!m) return false;
    const k = JSON.parse(decodeURIComponent(m[1]));
    if (!k.items.length || k.items.length > 30) return false;
    // each item takes only its own settings, each inside its range
    let fixed = false;
    const fit = (p, v) => {
      const out = p.type === "number" ? (Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : p.default)
        : p.options.some((o) => o.value === v) ? v : p.default;
      fixed ||= out !== v;
      return out;
    };
    const kept = k.items.filter((x) => x.h || insertDef(x.i));
    const items = kept.map((x) => {
      const it = x.h ? newHousing() : newInsert(x.i), def = defOf(it), own = def.params.map((p) => p.name);
      // older flip links name one pocket by its fingers
      if (x.i === "flip") ["top", "bot"].forEach((s) => {
        const w = { mono: 22, two: 40, three: 58 }[x.v?.[s + "_kind"]];
        if (w) { x.v[s + "_kind"] = "pocket"; x.v[s + "_pw"] = w; }
      });
      // older links have one fuzzy setting: its value is the strength
      if (x.v?.fuzzy && x.v.fuzzy !== "none") { x.v.texture = "fuzzy"; x.v.texture_size = x.v.fuzzy; }
      // a setting the page no longer has (from an older link) is dropped, the rest of the kit stays
      Object.entries(x.h || x.v || {}).forEach(([n, v]) => { if (own.includes(n)) it.values[n] = fit(specIn(def, n), v); });
      const before = JSON.stringify(it.values);
      (def.spans || []).forEach((s) => fitSpan(s, it.values, def));
      cleanParams(it.values, def);
      if (noEdge(it) && optOf(it, "texture")?.modeled) it.values.texture = "none";   // a modeled pattern needs an edge
      fixed ||= JSON.stringify(it.values) !== before;
      return it;
    });
    if (!items.length) return false;
    kit.items.push(...items); kit.sel = Math.max(0, kept.indexOf(k.items[k.s | 0]));
    if (fixed || items.length < k.items.length) {   // longer than a usual toast: the page is still loading
      const no = toast("This link is from an older version. Some settings changed to fit, so check the kit.", true);
      setTimeout(() => hideToast(no), 10000);
    }
    return true;
  } catch (e) { return false; }
}
$("b-link").onclick = async () => {
  try { await navigator.clipboard.writeText(location.href); toast("Link copied. It opens this kit."); }
  catch (e) { toast("Copy the address from the address bar. It holds this kit."); }
};

// ---------- start
$("partner").onchange = (e) => { partnerKey = e.target.value; renderNames(); framed = false; changed(true); };
$("b-fit").onclick = frame;
// phones: the 3D view takes 35% of the screen, or 70% for a closer look; the model is framed again in the new size
$("b-big").onclick = (e) => {
  const big = viewer.classList.toggle("big");
  e.currentTarget.textContent = big ? "Smaller" : "Bigger";
  setTimeout(() => { if (renderer) { resize(); frame(); } }, 50);
};
$("b-kit").onclick = downloadKit;
$("b-jump").onclick = () => $("dl-section").scrollIntoView({ behavior: "smooth" });
$("add-ins").onclick = () => addItem(newInsert("edge"));
$("add-hou").onclick = () => addItem(newHousing());

function setMode(m) {
  mode = m;
  try { localStorage.setItem("opengrips-mode", m); } catch (e) { /* storage blocked */ }
  if (cat) buildEditor();
}

// the theme button flips between light and dark; until it is pressed, the page follows the system
const SUN = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
const MOON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>`;
const isDark = () => getComputedStyle(document.documentElement).colorScheme === "dark";
function themeButton() {
  const dark = isDark(), b = $("theme");
  b.innerHTML = dark ? SUN : MOON;
  b.title = dark ? "Switch to the light theme" : "Switch to the dark theme";
  b.setAttribute("aria-label", b.title);
  if (scene) sceneColor();
}
$("theme").onclick = () => {
  const t = isDark() ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("opengrips-theme", t); } catch (e) { /* storage blocked */ }
  themeButton();
};
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", themeButton);
themeButton();

fetch("catalog.json").then((r) => r.ok ? r.json() : Promise.reject(new Error(`the server said ${r.status}`))).then((c) => {
  cat = c;
  if (!loadKit()) kit.items.push(newInsert("edge"), newHousing());
  setMode(mode); renderNames(); update();
}).catch((e) => status("Could not load the catalog: " + e.message, true));
