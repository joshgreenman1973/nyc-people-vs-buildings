// Register PMTiles protocol with MapLibre.
const protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

const POP_URL  = "pmtiles://./data/pop_blocks.pmtiles";

// Lightweight raster basemap (CARTO Voyager — free, attribution required).
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
    pop:  { type: "vector", url: POP_URL },
  },
  layers: [
    { id: "basemap", type: "raster", source: "basemap" },
  ],
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

  setupToggle();
  setupTooltip();
  setupOrbitButton();
  setupRotateButtons();
});

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

let google3DOverlay = null;
let googleCopyrightText = "";

function ensureGoogle3D() {
  if (google3DOverlay) return google3DOverlay;
  const KEY = window.GOOGLE_3D_KEY;
  if (!KEY) {
    console.warn("No Google 3D key configured");
    return null;
  }
  const Tile3DLayer = deck.Tile3DLayer;
  const Tiles3DLoader = loaders.Tiles3DLoader;
  const layer = new Tile3DLayer({
    id: "google-3d-tiles",
    data: `https://tile.googleapis.com/v1/3dtiles/root.json?key=${KEY}`,
    loader: Tiles3DLoader,
    loadOptions: { "3d-tiles": { loadGLTF: true } },
    onTilesetLoad: (tileset) => {
      tileset.options.onTraversalComplete = (selectedTiles) => {
        const credits = new Set();
        for (const t of selectedTiles) {
          const c = t.content && t.content.credits;
          if (c && c.length) for (const x of c) credits.add(x.text || x);
        }
        googleCopyrightText = [...credits].join(", ");
        const el = document.getElementById("google-attribution");
        if (el) el.textContent = "Imagery © " + googleCopyrightText;
        return selectedTiles;
      };
    },
  });
  google3DOverlay = new deck.MapboxOverlay({
    interleaved: false,
    layers: [layer],
  });
  return google3DOverlay;
}

function setupToggle() {
  const btnPop = document.getElementById("btn-pop");
  const btnBldg = document.getElementById("btn-bldg");
  const legPop = document.getElementById("legend-pop");
  const legBldg = document.getElementById("legend-bldg");
  const attrEl = document.getElementById("google-attribution");

  function showPop() {
    map.setLayoutProperty("pop-extrusion", "visibility", "visible");
    map.setLayoutProperty("basemap", "visibility", "visible");
    if (google3DOverlay) {
      try { map.removeControl(google3DOverlay); } catch (_) {}
    }
    btnPop.classList.add("active");
    btnBldg.classList.remove("active");
    btnPop.setAttribute("aria-selected", "true");
    btnBldg.setAttribute("aria-selected", "false");
    legPop.classList.remove("hidden");
    legBldg.classList.add("hidden");
    if (attrEl) attrEl.classList.add("hidden");
    activeView = "pop";
  }
  function showBldg() {
    map.setLayoutProperty("pop-extrusion", "visibility", "none");
    map.setLayoutProperty("basemap", "visibility", "none");
    const overlay = ensureGoogle3D();
    if (overlay) {
      try { map.addControl(overlay); } catch (_) {}
    }
    btnBldg.classList.add("active");
    btnPop.classList.remove("active");
    btnBldg.setAttribute("aria-selected", "true");
    btnPop.setAttribute("aria-selected", "false");
    legBldg.classList.remove("hidden");
    legPop.classList.add("hidden");
    if (attrEl) {
      attrEl.textContent = googleCopyrightText
        ? "Imagery © " + googleCopyrightText
        : "Imagery © Google";
      attrEl.classList.remove("hidden");
    }
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
}

let activeView = "pop";

function setupTooltip() {
  const tip = document.getElementById("tooltip");
  const fmt = new Intl.NumberFormat("en-US");
  const fmt1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

  map.on("mousemove", (e) => {
    if (activeView !== "pop") {
      tip.classList.add("hidden");
      return;
    }
    const feats = map.queryRenderedFeatures(e.point, { layers: ["pop-extrusion"] });
    if (!feats.length) {
      tip.classList.add("hidden");
      return;
    }
    const p = feats[0].properties || {};
    const ppa = Number(p.ppa) || 0;
    const pop = Number(p.p) || 0;
    const ac = Number(p.ac) || 0;
    tip.innerHTML = `<strong>${fmt1.format(ppa)}</strong> persons/acre<br>${fmt.format(pop)} people on ${fmt1.format(ac)} acres<br><span style="opacity:.7">${p.boro || ""}</span>`;
    tip.style.left = e.point.x + "px";
    tip.style.top = e.point.y + "px";
    tip.classList.remove("hidden");
  });

  map.on("mouseout", () => tip.classList.add("hidden"));
}
