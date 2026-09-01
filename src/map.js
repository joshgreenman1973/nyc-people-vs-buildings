// Register PMTiles protocol with MapLibre.
const protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

const POP_URL  = "pmtiles://./data/pop_blocks.pmtiles";
const BLDG_URL = "pmtiles://./data/buildings.pmtiles";

// Single neutral basemap for both views. CARTO Positron is a soft, low-saturation
// raster — it stays out of the way of vibrant 3D extrusions on top.
const STYLE = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    basemap: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=cb1_2r82_1_ae4e70b6166057bc41b89638",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=cb1_2r82_1_ae4e70b6166057bc41b89638",
        "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=cb1_2r82_1_ae4e70b6166057bc41b89638",
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
    pop:  { type: "vector", url: POP_URL },
    bldg: { type: "vector", url: BLDG_URL },
  },
  layers: [
    { id: "basemap", type: "raster", source: "basemap" },
  ],
};

const map = new maplibregl.Map({
  container: "map",
  style: STYLE,
  center: [-73.987, 40.755],
  zoom: 12.6,
  pitch: 68,
  bearing: -28,
  maxZoom: 17,
  minZoom: 9,
  maxPitch: 85,
  hash: true,
  attributionControl: { compact: true },
  dragRotate: true,
  pitchWithRotate: true,
  touchPitch: true,
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true, showZoom: true }), "bottom-right");

window.map = map;

// ----------- Auto-rotate orbit -----------
let orbitRAF = null;
let orbitLastTs = null;
function startOrbit() {
  stopOrbit();
  const speedDegPerSec = 8;
  orbitLastTs = null;
  function step(ts) {
    if (orbitLastTs == null) orbitLastTs = ts;
    const dt = (ts - orbitLastTs) / 1000;
    orbitLastTs = ts;
    map.setBearing(map.getBearing() - speedDegPerSec * dt);
    orbitRAF = requestAnimationFrame(step);
  }
  orbitRAF = requestAnimationFrame(step);
}
function stopOrbit() {
  if (orbitRAF) {
    cancelAnimationFrame(orbitRAF);
    orbitRAF = null;
  }
}
map.on("mousedown", stopOrbit);
map.on("touchstart", stopOrbit);
map.on("wheel", stopOrbit);

// ----------- Shared color palette (viridis) -----------
// Same ramp for both views, so the visual A/B is purely about what's being
// extruded — colors mean "low → high value" on each respective metric.
const VIRIDIS_POP = [
  "interpolate", ["linear"], ["coalesce", ["to-number", ["get", "ppa"]], 0],
  0,   "#fde725",
  50,  "#5ec962",
  150, "#21918c",
  300, "#3b528b",
  600, "#440154",
];
const VIRIDIS_BLDG = [
  "interpolate", ["linear"], ["coalesce", ["to-number", ["get", "h"]], 0],
  0,    "#fde725",
  50,   "#5ec962",
  200,  "#21918c",
  500,  "#3b528b",
  1200, "#440154",
];

// Residential height multiplier (still needed because persons/acre is a count,
// not a length — it has no inherent feet value). Default ×1 makes the two
// views directly comparable visually: peak residential blocks (~2,700 ppa)
// render in the same height range as the tallest NYC buildings (~1,500 ft),
// so toggling shows where the visual mass *shifts* between the two views.
let multiplier = 1;
function popHeightExpr(mult) {
  return ["*", ["coalesce", ["to-number", ["get", "ppa"]], 0], mult];
}

// Building heights are real measured feet — no multiplier (would be a lie).
const BLDG_HEIGHT_EXPR = ["coalesce", ["to-number", ["get", "h"]], 0];

const POP_OPACITY = 0.85;
const BLDG_OPACITY = 0.95;

map.on("load", () => {
  // Both layers are added at startup with their proper visuals. We toggle
  // between views by swapping opacity — tiles for both stream in immediately
  // so the second click is instant, with no first-time fetch jank.
  map.addLayer({
    id: "pop-extrusion",
    type: "fill-extrusion",
    source: "pop",
    "source-layer": "blocks",
    paint: {
      "fill-extrusion-height": popHeightExpr(multiplier),
      "fill-extrusion-base": 0,
      "fill-extrusion-color": VIRIDIS_POP,
      "fill-extrusion-opacity": POP_OPACITY,
    },
  });

  map.addLayer({
    id: "bldg-extrusion",
    type: "fill-extrusion",
    source: "bldg",
    "source-layer": "buildings",
    paint: {
      "fill-extrusion-height": BLDG_HEIGHT_EXPR,
      "fill-extrusion-base": 0,
      "fill-extrusion-color": VIRIDIS_BLDG,
      "fill-extrusion-opacity": 0,           // start hidden via opacity
      "fill-extrusion-vertical-gradient": true,
    },
  });

  setupToggle();
  setupTooltip();
  setupOrbitButton();
  setupRotateButtons();
});

function setupToggle() {
  const btnPop = document.getElementById("btn-pop");
  const btnBldg = document.getElementById("btn-bldg");
  const legPop = document.getElementById("legend-pop");
  const legBldg = document.getElementById("legend-bldg");

  function showPop() {
    map.setPaintProperty("pop-extrusion", "fill-extrusion-opacity", POP_OPACITY);
    map.setPaintProperty("bldg-extrusion", "fill-extrusion-opacity", 0);
    btnPop.classList.add("active");
    btnBldg.classList.remove("active");
    btnPop.setAttribute("aria-selected", "true");
    btnBldg.setAttribute("aria-selected", "false");
    legPop.classList.remove("hidden");
    legBldg.classList.add("hidden");
    activeView = "pop";
  }
  function showBldg() {
    map.setPaintProperty("pop-extrusion", "fill-extrusion-opacity", 0);
    map.setPaintProperty("bldg-extrusion", "fill-extrusion-opacity", BLDG_OPACITY);
    btnBldg.classList.add("active");
    btnPop.classList.remove("active");
    btnBldg.setAttribute("aria-selected", "true");
    btnPop.setAttribute("aria-selected", "false");
    legBldg.classList.remove("hidden");
    legPop.classList.add("hidden");
    activeView = "bldg";
  }

  btnPop.addEventListener("click", showPop);
  btnBldg.addEventListener("click", showBldg);

  // Keyboard: 1 = Residential, 2 = Built, T or Space = toggle
  document.addEventListener("keydown", (e) => {
    if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
    if (e.key === "1") { showPop(); e.preventDefault(); }
    else if (e.key === "2") { showBldg(); e.preventDefault(); }
    else if (e.key === "t" || e.key === "T" || e.key === " ") {
      if (activeView === "pop") showBldg(); else showPop();
      e.preventDefault();
    }
  });

  const multSelect = document.getElementById("mult");
  const multVal = document.getElementById("mult-val");
  multSelect.addEventListener("change", (e) => {
    multiplier = parseFloat(e.target.value);
    multVal.textContent = String(multiplier);
    map.setPaintProperty("pop-extrusion", "fill-extrusion-height", popHeightExpr(multiplier));
  });
}

function setupOrbitButton() {
  const btn = document.getElementById("btn-orbit");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (orbitRAF) {
      stopOrbit();
      btn.classList.remove("active");
      btn.textContent = "Auto-rotate";
    } else {
      startOrbit();
      btn.classList.add("active");
      btn.textContent = "Stop rotating";
    }
  });
}

function setupRotateButtons() {
  const left = document.getElementById("btn-rot-l");
  const right = document.getElementById("btn-rot-r");
  if (left) left.addEventListener("click", () => map.easeTo({ bearing: map.getBearing() + 30, duration: 400 }));
  if (right) right.addEventListener("click", () => map.easeTo({ bearing: map.getBearing() - 30, duration: 400 }));
}

let activeView = "pop";

function setupTooltip() {
  const tip = document.getElementById("tooltip");
  const fmt = new Intl.NumberFormat("en-US");
  const fmt1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

  map.on("mousemove", (e) => {
    const layer = activeView === "pop" ? "pop-extrusion" : "bldg-extrusion";
    const feats = map.queryRenderedFeatures(e.point, { layers: [layer] });
    if (!feats.length) {
      tip.classList.add("hidden");
      return;
    }
    const p = feats[0].properties || {};
    let html = "";
    if (activeView === "pop") {
      const ppa = Number(p.ppa) || 0;
      const pop = Number(p.p) || 0;
      const ac = Number(p.ac) || 0;
      html = `<strong>${fmt1.format(ppa)}</strong> persons/acre<br>${fmt.format(pop)} people on ${fmt1.format(ac)} acres<br><span style="opacity:.7">${p.boro || ""}</span>`;
    } else {
      const h = Number(p.h) || 0;
      html = `<strong>${fmt.format(Math.round(h))} ft</strong> roof height<br><span style="opacity:.7">BBL ${p.bbl || "—"}</span>`;
    }
    tip.innerHTML = html;
    tip.style.left = e.point.x + "px";
    tip.style.top = e.point.y + "px";
    tip.classList.remove("hidden");
  });

  map.on("mouseout", () => tip.classList.add("hidden"));
}
