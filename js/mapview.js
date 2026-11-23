// Карта (Leaflet + стандартные плитки OpenStreetMap, ключ для них не нужен).

import { h } from "./util.js";

const L = window.L;
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

const COBALT = "#173a8c";
const TRAM = "#ffc629";

const ll = (p) => [p.lat, p.lon];

export class MapView {
  constructor(el, { zoom = 4, center = { lat: 45, lon: 8 }, pad = {} } = {}) {
    this.el = el;
    // Отступы при подгонке карты: сверху и снизу её перекрывают панели.
    this.pad = { top: 18, bottom: 18, side: 18, ...pad };
    this.map = L.map(el, {
      zoomControl: false,
      attributionControl: true,
      center: ll(center),
      zoom,
      tap: false,
      zoomSnap: 0.25,
      worldCopyJump: true,
    });
    this.map.attributionControl.setPrefix(false);
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(this.map);

    // Порядок слоёв: радиус, маршрут, места, истории, "я".
    this.areaLayer = L.layerGroup().addTo(this.map);
    this.routeLayer = L.layerGroup().addTo(this.map);
    this.placeLayer = L.layerGroup().addTo(this.map);
    this.storyLayer = L.layerGroup().addTo(this.map);
    this.youLayer = L.layerGroup().addTo(this.map);
    this.clickHandler = null;
    this.map.on("click", (e) => this.clickHandler?.({ lat: e.latlng.lat, lon: e.latlng.lng }));
    this.map.on("contextmenu", (e) => this.holdHandler?.({ lat: e.latlng.lat, lon: e.latlng.lng }));

    // Карта должна пересчитать размер, когда меняется её контейнер.
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => this.map.invalidateSize({ animate: false }));
      this.ro.observe(el);
    }
  }

  onClick(fn) {
    this.clickHandler = fn;
  }

  onHold(fn) {
    this.holdHandler = fn;
  }

  setPicking(on) {
    this.el.classList.toggle("picking", !!on);
  }

  /** Точка "я здесь" с кругом точности. */
  setYou(p, accuracy) {
    this.youLayer.clearLayers();
    if (!p) return;
    if (accuracy && accuracy > 25 && accuracy < 2000) {
      L.circle(ll(p), { radius: accuracy, stroke: false, fillColor: COBALT, fillOpacity: 0.08, interactive: false }).addTo(this.youLayer);
    }
    L.circleMarker(ll(p), { radius: 8, color: "#fff", weight: 3, fillColor: "#1f6fff", fillOpacity: 1, interactive: false }).addTo(this.youLayer);
  }

  /** Круг поиска вокруг выбранной точки. */
  setArea(center, radius, { manual = false, fit = true } = {}) {
    this.areaLayer.clearLayers();
    if (!center) return;
    const circle = L.circle(ll(center), {
      radius,
      color: COBALT,
      weight: 2,
      dashArray: "6 7",
      fillColor: COBALT,
      fillOpacity: 0.05,
      interactive: false,
    }).addTo(this.areaLayer);
    if (manual) {
      L.marker(ll(center), { icon: pinIcon(), interactive: false, keyboard: false }).addTo(this.areaLayer);
    }
    if (fit) this.fit(circle.getBounds());
  }

  fit(bounds, extra = 0) {
    const { top, bottom, side } = this.pad;
    this.map.fitBounds(bounds, { paddingTopLeft: [side + extra, top + extra], paddingBottomRight: [side + extra, bottom + extra], animate: true, maxZoom: 18 });
  }

  clearArea() {
    this.areaLayer.clearLayers();
  }

  /** Найденные места: кружки, чем известнее место, тем крупнее. */
  setPlaces(places, { minors = [] } = {}) {
    this.placeLayer.clearLayers();
    for (const m of minors) {
      const mk = L.circleMarker(ll(m), { radius: 3.500, color: COBALT, weight: 0, fillColor: COBALT, fillOpacity: 0.45 });
      mk.bindPopup(() => popup(m.name, m.desc), { closeButton: false, maxWidth: 220 });
      mk.addTo(this.placeLayer);
    }
    places.forEach((p, i) => {
      const big = i < 8;
      const mk = L.circleMarker(ll(p), { radius: big ? 7 : 5, color: "#fff", weight: 2, fillColor: COBALT, fillOpacity: big ? 1 : 0.8 });
      mk.bindPopup(() => popup(p.name, p.descText), { closeButton: false, maxWidth: 240 });
      mk.addTo(this.placeLayer);
    });
  }

  /** Маршрут и точка назначения. */
  setRoute(coords, dest, { fit = true } = {}) {
    this.routeLayer.clearLayers();
    if (dest) L.marker(ll(dest), { icon: flagIcon(), interactive: false, keyboard: false }).addTo(this.routeLayer);
    if (!coords?.length) return;
    L.polyline(coords.map(ll), { color: "#fff", weight: 9, opacity: 0.9, interactive: false }).addTo(this.routeLayer);
    const line = L.polyline(coords.map(ll), { color: COBALT, weight: 5, opacity: 0.95, interactive: false }).addTo(this.routeLayer);
    if (fit) this.fit(line.getBounds(), 12);
  }

  /** Номера историй на карте. */
  setStories(stories, { active = -1, onTap } = {}) {
    this.storyLayer.clearLayers();
    stories.forEach((s, i) => {
      const mk = L.marker(ll(s.place), { icon: numberIcon(i + 1, i === active), keyboard: false, zIndexOffset: i === active ? 500 : 0 });
      if (onTap) mk.on("click", () => onTap(i));
      mk.addTo(this.storyLayer);
    });
  }

  fitPoints(points, pad = 30) {
    const pts = points.filter(Boolean);
    if (!pts.length) return;
    if (pts.length === 1) return this.map.setView(ll(pts[0]), 16, { animate: true });
    this.fit(L.latLngBounds(pts.map(ll)), pad - 18);
  }

  panTo(p, zoom) {
    if (!p) return;
    if (zoom) this.map.setView(ll(p), zoom, { animate: true });
    else this.map.panTo(ll(p), { animate: true });
  }

  refresh() {
    this.map.invalidateSize({ animate: false });
  }
}

function popup(name, desc) {
  return h("div", { class: "map-pop" }, h("strong", null, name || ""), desc ? h("span", null, desc) : null);
}

function numberIcon(n, active) {
  return L.divIcon({
    className: "",
    html: `<div class="num-pin${active ? " active" : ""}">${Number(n)}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function pinIcon() {
  return L.divIcon({
    className: "",
    html: `<svg class="pin-ico" viewBox="0 0 24 32" width="30" height="40" aria-hidden="true"><path d="M12 31S2 19.800 2 12a10 10 0 0 1 20 0c0 7.800-10 19-10 19Z" fill="${COBALT}" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="#fff"/></svg>`,
    iconSize: [30, 40],
    iconAnchor: [15, 39],
  });
}

function flagIcon() {
  return L.divIcon({
    className: "",
    html: `<svg class="pin-ico" viewBox="0 0 24 32" width="30" height="40" aria-hidden="true"><path d="M12 31S2 19.800 2 12a10 10 0 0 1 20 0c0 7.800-10 19-10 19Z" fill="${TRAM}" stroke="${COBALT}" stroke-width="2"/><path d="M9 7.500v9M9 8h6.500l-1.500 2.500 1.500 2.500H9" fill="none" stroke="${COBALT}" stroke-width="1.800" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
    iconSize: [30, 40],
    iconAnchor: [15, 39],
  });
}
