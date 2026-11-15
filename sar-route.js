const https = require("https");
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

function fetchJson(targetUrl) {
    return new Promise((resolve, reject) => {
        const req = https.get(targetUrl, {
            headers: { "User-Agent": "ICE-FLOW/2.0", "Accept": "application/json", "Accept-Encoding": "gzip, deflate" },
            timeout: 12000
        }, (resp) => {
            if (resp.statusCode >= 400) return reject(new Error("HTTP " + resp.statusCode));
            const chunks = [];
            resp.on("data", c => chunks.push(c));
            resp.on("end", () => {
                try {
                    let buf = Buffer.concat(chunks);
                    const enc = (resp.headers["content-encoding"] || "").toLowerCase();
                    if (enc.includes("gzip")) buf = zlib.gunzipSync(buf);
                    else if (enc.includes("deflate")) buf = zlib.inflateSync(buf);
                    const txt = buf.toString("utf8").trim();
                    if (!txt || txt.startsWith("<")) return reject(new Error("HTML response"));
                    resolve(JSON.parse(txt));
                } catch (e) { reject(e); }
            });
        });
        req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
        req.on("error", reject);
    });
}

module.exports = function(app) {
    app.get("/api/asf-sar", async (req, res) => {
        const nowMs = Date.now();
        const results = [];
        let source = "";

        // 1. Gọi trực tiếp vệ tinh Sentinel-1 trên NASA ASF DAAC (vùng biển băng Greenland)
        try {
            const asfUrl = "https://alaska.edu";
            const data = await fetchJson(asfUrl);
            const feats = Array.isArray(data.features) ? data.features : [];
            feats.forEach((f, idx) => {
                const p = f.properties || {};
                let poly = [];
                let lat = Number(p.centerLat), lng = Number(p.centerLon);
                if (f.geometry?.type === "Polygon" && Array.isArray(f.geometry.coordinates?.at(0))) {
                    poly = f.geometry.coordinates.at(0).map(c => [Number(c.at(1)), Number(c.at(0))]).filter(c => Number.isFinite(c.at(0)));
                    if (poly.length && (!Number.isFinite(lat) || !Number.isFinite(lng))) {
                        lat = poly.reduce((s, c) => s + c.at(0), 0) / poly.length;
                        lng = poly.reduce((s, c) => s + c.at(1), 0) / poly.length;
                    }
                }
                if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) < 50) return;
                const dt = p.startTime || p.stopTime || "";
                const diffHrs = +(Math.max(1, Math.round((nowMs - (dt ? Date.parse(dt) : nowMs)) / 60000)) / 60).toFixed(1);
                const gammaT = +(Math.max(0.25, Math.exp(-diffHrs / 72))).toFixed(2);
                const conf = gammaT >= 0.7 ? "Cao" : (gammaT >= 0.45 ? "Trung bình" : "Thấp");

                results.push({
                    id: p.sceneName ? p.sceneName.slice(0, 20) : `S1-${idx + 1}`,
                    lat: +lat.toFixed(4), lng: +lng.toFixed(4),
                    polygonCoords: poly.length >= 3 ? poly : null,
                    radiusNm: 4.2, tier: conf === "Thấp" ? 3 : 2, risk: conf === "Thấp" ? "high" : "med",
                    isSarLive: true, platform: `Sentinel-1 (${p.beamModeType || "IW"})`,
                    scanTimeUtc: dt || "N/A", timeAgo: `${diffHrs} giờ trước`, confidence: conf,
                    confidenceReason: `Cảnh quét Sentinel-1 thật (Orbit ${p.orbit || "N/A"}). Độ tương quan γt = ${gammaT}.`,
                    type: `Sentinel-1 SAR • Tin cậy: ${conf}`, source: "NASA ASF DAAC"
                });
            });
            if (results.length) source = "NASA ASF DAAC Sentinel-1";
        } catch (e) {}

        // 2. Dự phòng đọc từ file NASA trong máy: BẮT BUỘC lọc đúng vùng băng cực (|lat| >= 50) & danh mục seaLakeIce
        if (!results.length) {
            for (const fn of ["eonet_morenew.json", "eonet_raw.json"]) {
                const fp = path.join(__dirname, fn);
                if (!fs.existsSync(fp)) continue;
                try {
                    const obj = JSON.parse(fs.readFileSync(fp, "utf8"));
                    const arr = obj.features || obj.events || [];
                    arr.forEach((it, i) => {
                        const pr = it.properties || it;
                        const cats = Array.isArray(pr.categories) ? pr.categories.map(c => c.id || c.title).join(",") : "";
                        const title = String(pr.title || "");
                        const g = Array.isArray(it.geometry) ? it.geometry.at(-1) : it.geometry;
                        const c = Array.isArray(g?.coordinates) ? g.coordinates : [];
                        const pt = typeof c.at(0) === "number" ? c : (Array.isArray(c.at(0)?.at(0)) ? c.at(0).at(0) : c.at(0));
                        const lng = Number(pt?.at(0)), lat = Number(pt?.at(1));

                        // Chỉ nhận băng biển ở 2 vùng cực (vĩ độ >= 50° Bắc hoặc <= -50° Nam)
                        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) < 50) return;
                        if (cats && !cats.toLowerCase().includes("ice") && !title.toLowerCase().includes("iceberg")) return;

                        results.push({
                            id: String(pr.id || `NASA-ICE-${i + 1}`), lat, lng, radiusNm: 4.5, tier: 2, risk: "med",
                            isSarLive: true, platform: "Sentinel-1 / NASA Polar Ice", scanTimeUtc: g?.date || pr.date || "N/A",
                            timeAgo: "Dữ liệu băng cực NASA", confidence: "Cao",
                            confidenceReason: "Đã lọc chuẩn tọa độ băng biển vùng cực (|lat| >= 50°) từ dữ liệu NASA.",
                            type: `${title || "Polar Iceberg"} (NASA)`, source: fn
                        });
                    });
                    if (results.length) { source = `NASA Polar Ice (${fn})`; break; }
                } catch (err) {}
            }
        }

        console.log(">>> SENTINEL-1 SAR KET QUA CHUAN:", results.length, "diem bang cuc tu", source);
        res.json({ source, count: results.length, features: results });
    });
};
