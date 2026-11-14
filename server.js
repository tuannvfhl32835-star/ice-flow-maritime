/**
 * ICE FLOW — maritime pathfinding server
 * POST /api/route  { start:[lat,lng], end:[lat,lng], bufferRadius, speedKnots?, obstacles? }
 *
 * Grid A* treats icebergs (radius + safety buffer) and simplified landmass
 * coasts as blocked cells, then string-pulls the corridor into waypoints.
 */
// 1. Khai báo với tên mới (nasaApiKey)
const nasaApiKey = process.env.NASA_API_KEY || 'RJqjzdWLwBtFR9CmtHcBWWJJWcpnndchjGhNhFR9';

const verifyUrl = `https://nasa.gov{encodeURIComponent(apiKey)}`;


const express = require("express");
const h3 = require("h3-js");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const http = require("http");
const https = require("https");
// Độ phân giải H3: 4 (~22km/ô) chạy cực nhẹ và mượt cho toàn thế giới
// Sửa dòng H3_RES = 4 thành 5:
const H3_RES = 5;
const LAND_CELLS = new Set();
const NEAR_COAST_CELLS = new Set(); // Thêm tập đánh dấu vùng ven bờ

console.log("Dang nap ban do dat lien vao luoi luc giac H3...");
const rawLand = JSON.parse(fs.readFileSync(path.join(__dirname, "land.geojson"), "utf8"));

rawLand.features.forEach(feature => {
    if (!feature || !feature.geometry) return;
    const geom = feature.geometry;
    const polygons = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;

    polygons.forEach(poly => {
        try {
            const cells = h3.polygonToCells(poly, H3_RES, true);
            cells.forEach(cell => {
                // Vùng cấm tuyệt đối (sát bờ ~15km)
                h3.gridDisk(cell, 1).forEach(c => LAND_CELLS.add(c));
                // Vùng hạn chế ven bờ (~45km) để đẩy tàu ra xa
                h3.gridDisk(cell, 3).forEach(c => NEAR_COAST_CELLS.add(c));
            });
        } catch (e) { }
    });
});

console.log(">>> HOAN TAT! Da ma hoa thanh cong", LAND_CELLS.size, "o luc giac dat lien.");

const PORT = process.env.PORT || 3000;
const NM_PER_DEG_LAT = 60;


/** East-coast longitude (negative = west) sampled down Greenland. */
const GREENLAND_EAST = [
    [83.6, -26], [81, -17.5], [78, -18.2], [75, -18.4], [72, -21.5],
    [69, -23], [66, -32], [63, -40], [60, -43.5]
];
const GREENLAND_WEST = [
    [83.6, -58], [81, -66], [78, -70], [75, -62], [72, -56],
    [69, -54], [66, -53], [63, -51], [60, -46]
];

const LAND_BOXES = [];
const DEFAULT_ICE = [
    { id: "ICE-GS-01", lat: 74.35, lng: -11.15, radiusNm: 9, risk: "high" },
    { id: "ICE-GS-02", lat: 73.55, lng: -8.55, radiusNm: 7, risk: "high" },
    { id: "ICE-GS-03", lat: 74.85, lng: -9.4, radiusNm: 4.5, risk: "med" },
    { id: "ICE-GS-04", lat: 72.95, lng: -10.4, radiusNm: 3, risk: "low" }
];


const FIRMS_SAMPLE = [];

function haversineNm(lat1, lng1, lat2, lng2) {
    const R = 3440.065;
    const toR = Math.PI / 180;
    const dLat = (lat2 - lat1) * toR;
    const dLng = (lng2 - lng1) * toR;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
}

function coastLng(samples, lat) {
    if (lat <= samples[0][0]) return samples[0][1];
    if (lat >= samples[samples.length - 1][0]) return samples[samples.length - 1][1];
    for (let i = 1; i < samples.length; i++) {
        const [lat0, lng0] = samples[i - 1];
        const [lat1, lng1] = samples[i];
        if (lat <= lat1) {
            const t = (lat - lat0) / (lat1 - lat0);
            return lng0 + (lng1 - lng0) * t;
        }
    }
    return samples[samples.length - 1][1];
}

function inGreenland(lat, lng) {
    if (lat < 59.8 || lat > 83.65) return false;
    const east = coastLng(GREENLAND_EAST, lat);
    const west = coastLng(GREENLAND_WEST, lat);
    return lng >= west && lng <= east;
}

function inLand(lat, lng, zones) {
    // 1. Khóa cứng toàn bộ chỏm băng không thể đi qua ở Bắc Cực (> 81.5°N)
    if (lat > 81.5) return "North Pole Ice Cap";

    // 2. Khóa cứng lục địa Nam Cực theo đúng đường bờ biển từng kinh độ (Antarctica Coastline)
    if (lat < -63.0) {
        // Bán đảo Nam Cực (Antarctic Peninsula: kinh độ -65° đến -55°) nhô lên tới -63.2°
        if (lng >= -66 && lng <= -54 && lat < -63.2) return "Antarctic Peninsula";
        // Vùng Đông Nam Cực (Enderby Land, Wilkes Land: kinh độ 0° đến 165°) nhô lên tới -65.5°
        if (lng >= -10 && lng <= 168 && lat < -65.5) return "East Antarctica";
        // Toàn bộ phần thềm lục địa Nam Cực còn lại phía dưới -70.5°
        if (lat < -70.5) return "Antarctica Continent";
    }
    if (inGreenland(lat, lng)) return "Greenland";
    const cell = h3.latLngToCell(lat, lng, H3_RES);
    if (LAND_CELLS.has(cell)) {
        return "Landmass";
    }
    return null;
}
function inNearCoast(lat, lng) {
    const cell = h3.latLngToCell(lat, lng, H3_RES);
    return NEAR_COAST_CELLS.has(cell);
}
function normalizeObstacles(raw) {
    const source = Array.isArray(raw) && raw.length ? raw : DEFAULT_ICE;
    return source
        .map((o) => ({
            id: String(o.id || "ICE"),
            lat: Number(o.lat),
            lng: Number(o.lng),
            radiusNm: Number(o.radiusNm) > 0 ? Number(o.radiusNm) : 4,
            risk: o.risk || "med"
        }))
        .filter((o) => Number.isFinite(o.lat) && Number.isFinite(o.lng));
}

function segmentHits(a, b, obstacles, land, bufferNm, samples) {
    // Tăng từ 150 lên 600 để không lọt qua bất kỳ hòn đảo nhỏ nào
    const steps = Math.max(samples || 48, 600);
    // ... giữ nguyên phần code bên dưới của hàm này

    const listA = Array.from(a);
    const listB = Array.from(b);
    const aLat = listA.shift();
    const aLng = listA.pop();
    const bLat = listB.shift();
    const bLng = listB.pop();

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const lat = aLat + (bLat - aLat) * t;
        const lng = aLng + (bLng - aLng) * t;
        if (inLand(lat, lng, land)) return true;
        for (const o of obstacles) {
            if (haversineNm(lat, lng, o.lat, o.lng) < o.radiusNm + bufferNm) return true;
        }
    }
    return false;
}

function obstaclesOnSegment(a, b, obstacles, bufferNm) {
    const hit = [];
    const listA = Array.from(a);
    const listB = Array.from(b);
    const aLat = listA.shift();
    const aLng = listA.pop();
    const bLat = listB.shift();
    const bLng = listB.pop();

    for (const o of obstacles) {
        const keep = o.radiusNm + bufferNm;
        const steps = 32;
        let minD = Infinity;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const lat = aLat + (bLat - aLat) * t;
            const lng = aLng + (bLng - aLng) * t;
            minD = Math.min(minD, haversineNm(lat, lng, o.lat, o.lng));
        }
        if (minD < keep) hit.push(o);
    }
    return hit;
}

class MinHeap {
    constructor() {
        this.items = [];
    }
    get size() {
        return this.items.length;
    }
    push(node) {
        const a = this.items;
        a.push(node);
        let i = a.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (a[p].f <= a[i].f) break;
            const tmp = a[p];
            a[p] = a[i];
            a[i] = tmp;
            i = p;
        }
    }
    pop() {
        const a = this.items;
        const top = a[0];
        const last = a.pop();
        if (a.length && last) {
            a[0] = last;
            let i = 0;
            for (;;) {
                let s = i;
                const l = i * 2 + 1;
                const r = l + 1;
                if (l < a.length && a[l].f < a[s].f) s = l;
                if (r < a.length && a[r].f < a[s].f) s = r;
                if (s === i) break;
                const tmp = a[s];
                a[s] = a[i];
                a[i] = tmp;
                i = s;
            }
        }
        return top;
    }
}

function nearestFree(rows, cols, target, blocked) {
    if (target != null && !blocked[target]) return target;
    const tr = target == null ? 0 : Math.floor(target / cols);
    const tc = target == null ? 0 : target % cols;
    let best = null;
    let bestD = Infinity;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const i = r * cols + c;
            if (blocked[i]) continue;
            const d = (r - tr) ** 2 + (c - tc) ** 2;
            if (d < bestD) {
                bestD = d;
                best = i;
            }
        }
    }

    return best;
}

function astar(grid, blocked, startIdx, endIdx) {
    const { rows, cols, cellNm } = grid;
    const came = new Int32Array(rows * cols).fill(-1);
    const g = new Float64Array(rows * cols).fill(Infinity);
    const open = new MinHeap();
    g[startIdx] = 0;
    open.push({ i: startIdx, f: 0 });

    const endR = Math.floor(endIdx / cols);
    const endC = endIdx % cols;
    const dirs = [
        [-1, 0], [1, 0], [0, -1], [0, 1],
        [-1, -1], [-1, 1], [1, -1], [1, 1]
    ];

    while (open.size) {
        const current = open.pop();
        if (current.f > g[current.i] + Math.hypot(
            Math.floor(current.i / cols) - endR,
            (current.i % cols) - endC
        ) * cellNm + 1e-6) {
            continue;
        }
        if (current.i === endIdx) {
            const path = [];
            let n = current.i;
            while (n !== -1) {
                path.push(n);
                n = came[n];
            }
            path.reverse();
            return path;
        }

        const r = Math.floor(current.i / cols);
        const c = current.i % cols;
        for (const [dr, dc] of dirs) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
            const ni = nr * cols + nc;
            if (blocked[ni]) continue;
            if (dr !== 0 && dc !== 0) {
                if (blocked[(r + dr) * cols + c] || blocked[r * cols + (c + dc)]) continue;
            }
            const step = dr !== 0 && dc !== 0 ? cellNm * Math.SQRT2 : cellNm;
            const tentative = g[current.i] + step;
            if (tentative < g[ni]) {
                came[ni] = current.i;
                g[ni] = tentative;
                const heur = Math.hypot(nr - endR, nc - endC) * cellNm;
                open.push({ i: ni, f: tentative + heur });
            }
        }
    }
    return null;
}

function buildGrid(start, end, obstacles, land, bufferNm) {
    const [sLat, sLng] = start;
    const [eLat, eLng] = end;

    const direct = haversineNm(sLat, sLng, eLat, eLng);
    const padDeg = clamp((direct / NM_PER_DEG_LAT) * 1.3, 4.0, 45);

    const minLat = clamp(Math.min(sLat, eLat) - padDeg, -85, 85);
    const maxLat = clamp(Math.max(sLat, eLat) + padDeg, -85, 85);
    const minLng = clamp(Math.min(sLng, eLng) - padDeg * 1.6, -180, 180);
    const maxLng = clamp(Math.max(sLng, eLng) + padDeg * 1.6, -180, 180);

    const rows = 160;
    const cols = 160;
    const latStep = (maxLat - minLat) / (rows - 1);
    const lngStep = (maxLng - minLng) / (cols - 1);
    const midLat = (minLat + maxLat) / 2;
    const cellNm = Math.max(
        latStep * NM_PER_DEG_LAT,
        lngStep * NM_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180)
    );

    const blocked = new Uint8Array(rows * cols);
    const center = (r, c) => [minLat + r * latStep, minLng + c * lngStep];

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const [lat, lng] = center(r, c);
            if (inLand(lat, lng, land)) {
                blocked[r * cols + c] = 1;
                continue;
            }
            for (const o of obstacles) {
                if (haversineNm(lat, lng, o.lat, o.lng) < o.radiusNm + bufferNm) {
                    blocked[r * cols + c] = 1;
                    break;
                }
            }
        }
    }
    const toIndex = (lat, lng) => {
        const r = clamp(Math.round((lat - minLat) / latStep), 0, rows - 1);
        const c = clamp(Math.round((lng - minLng) / lngStep), 0, cols - 1);
        return r * cols + c;
    };

    return { rows, cols, cellNm, blocked, center, toIndex };
}

function smoothPath(points, clearFn) {
    if (points.length <= 2) return points;
    const out = [points[0]];
    let anchor = 0;
    while (anchor < points.length - 1) {
        let next = anchor + 1;
        for (let i = points.length - 1; i > anchor + 1; i--) {
            if (clearFn(points[anchor], points[i])) {
                next = i;
                break;
            }
        }
        out.push(points[next]);
        anchor = next;
    }
    return out;
}

function pathLengthNm(points) {
    let d = 0;
    for (let i = 1; i < points.length; i++) {
        d += haversineNm(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
    }
    return d;
}

function closestApproach(path, obstacle) {
    let best = { distanceNm: Infinity, alongNm: 0 };
    let walked = 0;
    for (let i = 1; i < path.length; i++) {
        const a = path[i - 1];
        const b = path[i];
        const seg = haversineNm(a[0], a[1], b[0], b[1]) || 0.0001;
        const steps = Math.max(4, Math.ceil(seg / 0.4));
        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const lat = a[0] + (b[0] - a[0]) * t;
            const lng = a[1] + (b[1] - a[1]) * t;
            const dist = haversineNm(lat, lng, obstacle.lat, obstacle.lng);
            if (dist < best.distanceNm) {
                best = { distanceNm: dist, alongNm: walked + seg * t, lat, lng };
            }
        }
        walked += seg;
    }
    return best;
}

function buildTcpa(path, obstacles, speedKnots, bufferNm) {
    const speed = speedKnots > 0.5 ? speedKnots : 12;
    const rows = obstacles.map((o) => {
        const cpa = closestApproach(path, o);
        const hours = cpa.alongNm / speed;
        const margin = cpa.distanceNm - (o.radiusNm + bufferNm);
        let level = "clear";
        if (cpa.distanceNm <= o.radiusNm + bufferNm * 0.55) level = "high";
        else if (cpa.distanceNm <= o.radiusNm + bufferNm * 1.35) level = "medium";
        else if (cpa.distanceNm <= o.radiusNm + bufferNm * 2.4) level = "low";
        return {
            id: o.id,
            risk: o.risk,
            level,
            cpaDistanceNm: Math.round(cpa.distanceNm * 100) / 100,
            tcpaMinutes: Math.round(hours * 60 * 10) / 10,
            marginNm: Math.round(margin * 100) / 100
        };
    });
    rows.sort((a, b) => a.cpaDistanceNm - b.cpaDistanceNm);
    return rows.slice(0, 8);
}

function fuelSaving(directNm, routeNm, avoidedCount, bufferNm) {
    if (avoidedCount <= 0) {
        return {
            percent: 0,
            note: "Direct track is clear of ice and land. No slow-steam penalty."
        };
    }
    const slowSteamFactor = 1.22;
    const ramPenaltyNm = avoidedCount * Math.max(1.5, bufferNm * 0.45);
    const naive = directNm * slowSteamFactor + ramPenaltyNm;
    const raw = ((naive - routeNm) / naive) * 100;
    const band = 14 + Math.min(4, avoidedCount * 0.85 + Math.max(0, 1.4 - routeNm / Math.max(directNm, 1)));
    const percent = Math.round(clamp(raw > 0 ? raw * 0.4 + band * 0.6 : band, 14, 18) * 10) / 10;
    return {
        percent,
        naiveFuelNm: Math.round(naive * 100) / 100,
        avoidedNm: Math.round((naive - routeNm) * 100) / 100,
        note: "Full-speed bypass compared with slow-steaming through the ice corridor (modeled 14–18%)."
    };
}

function planRoute(start, end, obstacles, land, bufferNm) {
    // Da tat che do di thang great-circle de luon ne dat lien & Nam Cuc bang A*

    const grid = buildGrid(start, end, obstacles, land, bufferNm);
    const startIdx = nearestFree(grid.rows, grid.cols, grid.toIndex(start[0], start[1]), grid.blocked);
    const endIdx = nearestFree(grid.rows, grid.cols, grid.toIndex(end[0], end[1]), grid.blocked);
    if (startIdx == null || endIdx == null) return null;

    const indexPath = astar(grid, grid.blocked, startIdx, endIdx);
    if (!indexPath) return null;

    let points = indexPath.map((i) => {
        const r = Math.floor(i / grid.cols);
        const c = i % grid.cols;
        return grid.center(r, c);
    });
    if (points.length < 2) points = [start.slice(), end.slice()];
    points[0] = start;
    points[points.length - 1] = end;

    const clear = (a, b) => !segmentHits(a, b, obstacles, land, bufferNm, 20);
    points = smoothPath(points, clear);
    return {
        points,
        algorithm: "A*",
        avoided: obstaclesOnSegment(start, end, obstacles, bufferNm)
    };
}

function parsePair(value, name) {
    if (!Array.isArray(value) || value.length < 2) {
        throw new Error(`${name} must be [lat, lng]`);
    }
    const lat = Number(value[0]);
    const lng = Number(value[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error(`${name} coordinates must be numbers`);
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new Error(`${name} is outside geographic range`);
    }
    return [lat, lng];
}

function fetchText(options) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                response.resume();
                fetchText(response.headers.location).then(resolve, reject);
                return;
            }
            if (response.statusCode !== 200) {
                response.resume();
                reject(new Error("FIRMS HTTP " + response.statusCode));
                return;
            }
            const chunks = [];
            response.on("data", (chunk) => chunks.push(chunk));
            response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        });
        req.setTimeout(12000, () => {
            req.destroy(new Error("FIRMS timeout"));
        });
        req.on("error", reject);
        req.end();
    });
}

function parseFirmsCsv(csv) {
    const lines = csv.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const latI = header.indexOf("latitude");
    const lngI = header.indexOf("longitude");
    const confI = header.indexOf("confidence");
    const frpI = header.indexOf("frp");
    if (latI < 0 || lngI < 0) return [];
    const out = [];
    for (let i = 1; i < lines.length && out.length < 80; i++) {
        const cols = lines[i].split(",");
        const lat = Number(cols[latI]);
        const lng = Number(cols[lngI]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        const frp = frpI >= 0 ? Number(cols[frpI]) : 0;
        const confidence = confI >= 0 ? String(cols[confI] || "") : "";
        out.push({
            id: "FIRMS-" + i,
            lat,
            lng,
            risk: frp > 20 || confidence.toLowerCase() === "high" ? "high" : "med",
            type: "VIIRS thermal anomaly",
            source: "NASA FIRMS live",
            confidence
        });
    }
    return out;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname)));

app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "ice.html"));
});

app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "ice-flow", algorithm: "A*" });
});

app.get("/api/firms", (req, res) => {
    const DEFAULT_NASA_KEY = "RJqjzdWLwBtFR9CmtHcBWWJJWcpnndchjGhNhFR9";
    const apiKey = String(req.query.key || DEFAULT_NASA_KEY).trim();
    try {
        // 1. Đọc cả 2 tệp dữ liệu đã lưu
        const file1 = JSON.parse(fs.readFileSync(path.join(__dirname, "eonet_raw.json"), "utf8"));
        const file2 = JSON.parse(fs.readFileSync(path.join(__dirname, "eonet_moreraw.json"), "utf8"));

        // 2. Gộp danh sách sự kiện của cả 2 tệp lại
        const list1 = Array.isArray(file1.events) ? file1.events : (Array.isArray(file1.features) ? file1.features : []);
        const list2 = Array.isArray(file2.events) ? file2.events : (Array.isArray(file2.features) ? file2.features : []);
        const events = [...list1, ...list2];

        const iceFeatures = [];
        const seenIds = new Set();

        // 3. Lọc lấy toàn bộ tảng băng (seaLakeIce) và vị trí mới nhất của từng tảng
        [...events].reverse().forEach((ev) => {
            const info = ev.properties || ev;
            const isIce = Array.isArray(info.categories) && info.categories.some(c => c.id === "seaLakeIce");
            if (!isIce) return;

            const id = info.id || "EONET-ICE";
            if (seenIds.has(id)) return;

            let coords = null;
            if (Array.isArray(ev.geometry) && ev.geometry.length) {
                coords = ev.geometry[ev.geometry.length - 1].coordinates;
            } else if (ev.geometry && Array.isArray(ev.geometry.coordinates)) {
                coords = ev.geometry.type === "Point"
                    ? ev.geometry.coordinates
                    : ev.geometry.coordinates[ev.geometry.coordinates.length - 1];
            }

            if (Array.isArray(coords) && coords.length >= 2) {
                const lng = Number(coords[0]); // Kinh độ
                const lat = Number(coords[1]); // Vĩ độ

                if (Number.isFinite(lat) && Number.isFinite(lng)) {
                    seenIds.add(id);
                    iceFeatures.push({
                        id: id,
                        lat: lat,
                        lng: lng,
                        radiusNm: 12,
                        risk: "high",
                        type: info.title || "NASA Sea Ice",
                        source: "NASA EONET File"
                    });
                }
            }
        });

        console.log(">>> DA LAY DU LIEU TU 2 FILE EONET! Tong cong co", iceFeatures.length, "tang bang.");

        res.json({
            source: "firms",
            hours: 48,
            features: iceFeatures
        });

    } catch (err) {
        console.log(">>> LOI DOC FILE EONET:", err.message);
        res.status(500).json({
            error: "Lỗi đọc file dữ liệu EONET!"
        });
    }
});
app.post("/api/route", (req, res) => {
    try {
        const start = parsePair(req.body.start, "start");
        const end = parsePair(req.body.end, "end");
        const bufferRadius = clamp(Number(req.body.bufferRadius) || 5, 0.5, 40);
        const speedKnots = clamp(Number(req.body.speedKnots) || 14.8, 0.5, 40);
        const obstacles = normalizeObstacles(req.body.obstacles);
        const land = LAND_BOXES.concat(Array.isArray(req.body.landmasses) ? req.body.landmasses : []);

        if (haversineNm(start[0], start[1], end[0], end[1]) < 0.05) {
            return res.status(400).json({ error: "Start and end are the same position." });
        }
        if (inLand(start[0], start[1], land) || inLand(end[0], end[1], land)) {
            return res.status(422).json({ error: "Start or end sits on a landmass. Move the fix into open water." });
        }

        const planned = planRoute(start, end, obstacles, land, bufferRadius);
        if (!planned) {
            return res.status(422).json({
                error: "No safe corridor. Move the destination or reduce the safety buffer."
            });
        }

        const distanceNm = Math.round(pathLengthNm(planned.points) * 100) / 100;
        const directNm = Math.round(haversineNm(start[0], start[1], end[0], end[1]) * 100) / 100;
        const tcpa = buildTcpa(planned.points, obstacles, speedKnots, bufferRadius);
        const fuel = fuelSaving(directNm, distanceNm, planned.avoided.length, bufferRadius);
        const coordinates = planned.points.map(([lat, lng]) => [
            Math.round(lng * 1e5) / 1e5,
            Math.round(lat * 1e5) / 1e5
        ]);

        res.json({
            route: {
                type: "Feature",
                geometry: { type: "LineString", coordinates },
                properties: {
                    algorithm: planned.algorithm,
                    bufferRadiusNm: bufferRadius,
                    waypointCount: planned.points.length
                }
            },
            waypoints: planned.points.map(([lat, lng]) => ({
                lat: Math.round(lat * 1e5) / 1e5,
                lng: Math.round(lng * 1e5) / 1e5
            })),
            distanceNm,
            directDistanceNm: directNm,
            speedKnots,
            obstaclesAvoided: planned.avoided.map((o) => o.id),
            tcpa,
            fuelSavingPercent: fuel.percent,
            fuel
        });
    } catch (err) {
        res.status(400).json({ error: err.message || "Invalid route request." });
    }
});
app.get("/api/asf-sar", async (req, res) => {
    try {
        const asfUrl = new URL("https://alaska.edu");
        asfUrl.searchParams.set("dataset", "SENTINEL-1");
        asfUrl.searchParams.set("intersectsWith", "POLYGON((-75 55,30 55,30 83,-75 83,-75 55))");
        asfUrl.searchParams.set("maxResults", "20");
        asfUrl.searchParams.set("output", "geojson");

        console.log(">>> Dang lay du lieu Radar SAR thoi gian thuc tu NASA:", asfUrl.toString());
        const rawText = await fetchText(asfUrl.toString());
        if (rawText.trim().startsWith("<")) {
            return res.status(503).json({ error: "Máy chủ NASA ASF DAAC đang bảo trì, vui lòng thử lại sau." });
        }

        const parsed = JSON.parse(rawText);
        const features = Array.isArray(parsed.features) ? parsed.features : [];
        const nowMs = Date.now();
        const liveSarPoints = [];

        features.forEach((f, idx) => {
            const p = f.properties || {};
            const lat = Number(p.centerLat);
            const lng = Number(p.centerLon);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

            const scanTimeMs = p.startTime ? Date.parse(p.startTime) : nowMs;
            const diffMinutes = Math.max(1, Math.round((nowMs - scanTimeMs) / 60000));
            const diffHours = +(diffMinutes / 60).toFixed(1);

            const timeAgoText = diffMinutes < 60
                ? `${diffMinutes} phút trước`
                : `${Math.floor(diffHours)} giờ ${diffMinutes % 60} phút trước`;

            let confidence = "Cao";
            let riskLevel = "low";
            let reasonText = "Dữ liệu vệ tinh vừa mới quét, tọa độ băng phản ánh chính xác vị trí thực tế hiện tại.";

            if (diffHours > 12) {
                confidence = "Thấp";
                riskLevel = "high";
                reasonText = "Đã quá 12 giờ kể từ lần quét gần nhất; dưới tác động của dòng hải lưu và gió, khối băng nhiều khả năng đã trôi dạt sang vị trí khác.";
            } else if (diffHours >= 2) {
                confidence = "Trung bình";
                riskLevel = "med";
                reasonText = "Vệ tinh đã quét cách đây vài giờ; khối băng có thể đã dịch chuyển nhẹ từ 2 - 8 hải lý so với tọa độ gốc.";
            }

            liveSarPoints.push({
                id: p.sceneName ? p.sceneName.slice(0, 18) : `NASA-SAR-${idx + 1}`,
                lat: lat,
                lng: lng,
                radiusNm: 3.5,
                tier: confidence === "Thấp" ? 3 : (confidence === "Trung bình" ? 2 : 1),
                risk: riskLevel,
                isSarLive: true,
                platform: p.platform || "Sentinel-1 SAR",
                scanTimeUtc: p.startTime || "N/A",
                timeAgo: timeAgoText,
                confidence: confidence,
                confidenceReason: reasonText,
                type: `SAR Radar (${p.platform || "Sentinel-1"}) • Tin cậy: ${confidence}`,
                source: "NASA ASF DAAC Live"
            });
        });

        console.log(">>> THANH CONG! Da lay", liveSarPoints.length, "diem Radar SAR that tu NASA.");
        res.json({ source: "nasa-asf-live", features: liveSarPoints });
    } catch (err) {
        console.log(">>> LOI KET NOI NASA ASF:", err.message);
        res.status(502).json({ error: "Lỗi kết nối tới NASA ASF DAAC: " + err.message });
    }
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`ICE FLOW server  http://localhost:${PORT}`);
        console.log(`Cockpit          http://localhost:${PORT}/ice.html`);
        console.log(`Route API        POST http://localhost:${PORT}/api/route`);
    });
}

module.exports = { app, planRoute, haversineNm };






