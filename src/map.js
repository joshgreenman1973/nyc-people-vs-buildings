// Register PMTiles protocol with MapLibre.
const protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

const POP_URL  = "pmtiles://./data/pop_blocks.pmtiles";
const BLDG_URL = "pmtiles://./data/buildings.pmtiles";

// Stylized "diorama" basemap: dark, illustrated, no photographic noise.
// CARTO's free dark-matter raster gives the right backdrop for vibrant extrusions.
const STYLE = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    basemap: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
    basemap_dark: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png",
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
    { id: "basemap_dark", type: "raster", source: "basemap_dark", layout: { visibility: "none" } },
  ],
  light: {
    anchor: "viewport",
    color: "#ffffff",
    intensity: 0.45,
    position: [1.5, 90, 80],
  },
  sky: {
    "sky-color": "#0b0e1f",
    "sky-horizon-blend": 0.6,
    "horizon-color": "#1d2a4a",
    "horizon-fog-blend": 0.7,
    "fog-color": "#0b0e1f",
    "fog-ground-blend": 0.4,
  },
};

const map = new maplibregl.Map({
  container: "map",
  style: STYLE,
  center: [-73.97, 40.755],
  zoom: 11,
  pitch: 55,
  bearing: -22,
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

// ----------- Residential layer config -----------
let multiplier = 8;
function popHeightExpr(mult) {
  return ["*", ["coalesce", ["to-number", ["get", "ppa"]], 0], mult];
}
const POP_COLOR = [
  "interpolate", ["linear"], ["coalesce", ["to-number", ["get", "ppa"]], 0],
  0,   "#fde725",
  50,  "#5ec962",
  150, "#21918c",
  300, "#3b528b",
  600, "#440154",
];

// ----------- Built layer (stylized animated diorama) -----------
// Vibrant categorical-by-height palette. Reads as illustration, not photo.
const BLDG_COLOR_BASE = [
  "step", ["coalesce", ["to-number", ["get", "h"]], 0],
  "#f5e6b8",   //   0–30 ft  cream (rowhouses)
  30, "#ffb084",   //  30–80 ft  peach
  80, "#ff6b9a",   //  80–200 ft hot pink (mid-rise)
  200, "#a946e0",  // 200–500 ft purple (towers)
  500, "#3fc7ff",  // 500–1000 ft electric blue (highrises)
  1000, "#ffe34f", // 1000+    ft gold (supertalls)
];

let bldgMultiplier = 2;
function bldgHeightExpr(mult) {
  return ["*", ["coalesce", ["to-number", ["get", "h"]], 0], mult];
}

map.on("load", () => {
  map.addLayer({
    id: "pop-extrusion",
    type: "fill-extrusion",
    source: "pop",
    "source-layer": "blocks",
    paint: {
      "fill-extrusion-height": popHeightExpr(multiplier),
      "fill-extrusion-base": 0,
      "fill-extrusion-color": POP_COLOR,
      "fill-extrusion-opacity": 0.85,
    },
  });

  map.addLayer({
    id: "bldg-extrusion",
    type: "fill-extrusion",
    source: "bldg",
    "source-layer": "buildings",
    layout: { visibility: "none" },
    paint: {
      "fill-extrusion-height": bldgHeightExpr(bldgMultiplier),
      "fill-extrusion-base": 0,
      "fill-extrusion-color": BLDG_COLOR_BASE,
      "fill-extrusion-opacity": 0.95,
      "fill-extrusion-vertical-gradient": true,
    },
  });

  setupToggle();
  setupTooltip();
  setupOrbitButton();
  setupRotateButtons();
});

// ----------- Diorama animation: moving sun over the skyline -----------
// MapLibre's `light` controls how extrusions are shaded. Rotating the
// light's azimuth slowly gives the city a "time-lapse" feel without
// touching a single feature, so it stays cheap with 1M buildings.
let lightRAF = null;
function startLightAnimation() {
  stopLightAnimation();
  const start = performance.now();
  function step(ts) {
    const t = (ts - start) / 1000;          // seconds
    const azimuth = (t * 6) % 360;           // 6°/s -> full sweep every 60s
    const intensity = 0.45 + 0.18 * Math.sin(t * 0.6); // gentle pulse
    map.setLight({
      anchor: "viewport",
      color: "#ffffff",
      intensity,
      position: [1.5, azimuth, 80],
    });
    lightRAF = requestAnimationFrame(step);
  }
  lightRAF = requestAnimationFrame(step);
}
function stopLightAnimation() {
  if (lightRAF) {
    cancelAnimationFrame(lightRAF);
    lightRAF = null;
  }
  map.setLight({
    anchor: "viewport",
    color: "#ffffff",
    intensity: 0.45,
    position: [1.5, 90, 80],
  });
}

function setupToggle() {
  const btnPop = document.getElementById("btn-pop");
  const btnBldg = document.getElementById("btn-bldg");
  const legPop = document.getElementById("legend-pop");
  const legBldg = document.getElementById("legend-bldg");

  function showPop() {
    map.setLayoutProperty("pop-extrusion", "visibility", "visible");
    map.setLayoutProperty("bldg-extrusion", "visibility", "none");
    map.setLayoutProperty("basemap", "visibility", "visible");
    map.setLayoutProperty("basemap_dark", "visibility", "none");
    stopLightAnimation();
    btnPop.classList.add("active");
    btnBldg.classList.remove("active");
    btnPop.setAttribute("aria-selected", "true");
    btnBldg.setAttribute("aria-selected", "false");
    legPop.classList.remove("hidden");
    legBldg.classList.add("hidden");
    activeView = "pop";
  }
  function showBldg() {
    map.setLayoutProperty("pop-extrusion", "visibility", "none");
    map.setLayoutProperty("bldg-extrusion", "visibility", "visible");
    map.setLayoutProperty("basemap", "visibility", "none");
    map.setLayoutProperty("basemap_dark", "visibility", "visible");
    startLightAnimation();
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

  const multSelect = document.getElementById("mult");
  const multVal = document.getElementById("mult-val");
  multSelect.addEventListener("change", (e) => {
    multiplier = parseFloat(e.target.value);
    multVal.textContent = String(multiplier);
    map.setPaintProperty("pop-extrusion", "fill-extrusion-height", popHeightExpr(multiplier));
  });

  const bmultSelect = document.getElementById("bmult");
  const bmultVal = document.getElementById("bmult-val");
  if (bmultSelect) {
    bmultSelect.addEventListener("change", (e) => {
      bldgMultiplier = parseFloat(e.target.value);
      if (bmultVal) bmultVal.textContent = String(bldgMultiplier);
      map.setPaintProperty("bldg-extrusion", "fill-extrusion-height", bldgHeightExpr(bldgMultiplier));
    });
  }
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
