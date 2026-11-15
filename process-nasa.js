const fs = require("fs");
const path = require("path");
const os = require("os");

const nasaDir = path.join(os.homedir(), "Downloads", "nasa");
const results = [];

// Hàm đổi tọa độ chiếu mét vùng cực (EPSG:3413 / 3031) sang độ GPS chuẩn (Lat, Lng)
function polarMetersToLatLng(x, y, isSouth) {
    const a = 6378137.0;
    const e = 0.0818191908426215;
    const latTrue = (isSouth ? -71.0 : 70.0) * Math.PI / 180;
    const lon0 = (isSouth ? 0.0 : -45.0) * Math.PI / 180;
    const sign = isSouth ? -1.0 : 1.0;

    const tTrue = Math.tan(Math.PI / 4 - sign * latTrue / 2) /
                  Math.pow((1 - e * Math.sin(sign * latTrue)) / (1 + e * Math.sin(sign * latTrue)), e / 2);
    const mTrue = Math.cos(sign * latTrue) / Math.sqrt(1 - e * e * Math.pow(Math.sin(sign * latTrue), 2));

    const rho = Math.hypot(x, y);
    const t = rho * tTrue / (a * mTrue);
    const chi = Math.PI / 2 - 2 * Math.atan(t);

    let lat = chi + (e * e / 2 + 5 * Math.pow(e, 4) / 24 + Math.pow(e, 6) / 12) * Math.sin(2 * chi) +
              (7 * Math.pow(e, 4) / 48 + 29 * Math.pow(e, 6) / 240) * Math.sin(4 * chi);
    lat = +(sign * lat * 180 / Math.PI).toFixed(4);
    const lng = +((lon0 + Math.atan2(x, -sign * y)) * 180 / Math.PI).toFixed(4);
    return { lat, lng };
}

if (!fs.existsSync(nasaDir)) {
    console.log(">>> KHONG TIM THAY THU MUC:", nasaDir);
    process.exit(1);
}

const files = fs.readdirSync(nasaDir);

// 1. Xử lý tất cả file .kml trong Downloads\nasa
files.filter(f => f.toLowerCase().endsWith(".kml")).forEach(file => {
    const kmlText = fs.readFileSync(path.join(nasaDir, file), "utf8");
    const isSouth = /antarctic|south/i.test(file);
    const regex = /<coordinates[^>]*>([\s\S]*?)<\/coordinates>/gi;
    let match;
    let count = 0;

    while ((match = regex.exec(kmlText)) !== null && count < 50) {
        const tokens = match.at(1).trim().split(/\s+/);
        const lineCoords = [];

        tokens.forEach(tk => {
            const nums = tk.split(",").map(Number);
            const rawX = nums.at(0);
            const rawY = nums.at(1);
            if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return;

            if (Math.abs(rawY) > 90) {
                const { lat, lng } = polarMetersToLatLng(rawX, rawY, isSouth);
                if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) lineCoords.push([lat, lng]);
            } else if (Math.abs(rawY) <= 90 && Math.abs(rawX) <= 180) {
                lineCoords.push([+rawY.toFixed(4), +rawX.toFixed(4)]);
            }
        });

        if (lineCoords.length > 0) {
            const mid = lineCoords.at(Math.floor(lineCoords.length / 2));
            results.push({
                id: `NASA-KML-${results.length + 1}`,
                lat: mid.at(0),
                lng: mid.at(1),
                lineCoords: lineCoords.length >= 2 ? lineCoords : null,
                radiusNm: 18,
                tier: 2,
                risk: "med",
                confidence: "Cao",
                timeAgo: "Dữ liệu ranh giới băng NASA NSIDC",
                confidenceReason: `Đường mép sông băng trích xuất từ file ${file}`,
                type: `Mép sông băng NASA #${count + 1}`,
                source: file
            });
            count++;
        }
    }
});

// 2. Xử lý tất cả file .csv trong Downloads\nasa (nếu chưa có KML)
if (results.length === 0) {
    files.filter(f => f.toLowerCase().endsWith(".csv")).forEach(file => {
        const lines = fs.readFileSync(path.join(nasaDir, file), "utf8").trim().split(/\r?\n/);
        if (lines.length < 2) return;
        const headers = lines.at(0).split(",").map(h => h.replace(/"/g, "").trim());
        const idxX = headers.findIndex(h => /^(lon|lng|longitude|x|east)/i.test(h));
        const idxY = headers.findIndex(h => /^(lat|latitude|y|north)/i.test(h));
        const idxDate = headers.findIndex(h => /(date|time)/i.test(h));
        const idxSensor = headers.findIndex(h => /(sensor|sat|platform)/i.test(h));
        const isSouth = /antarctic|south/i.test(file);

        const step = Math.max(1, Math.floor((lines.length - 1) / 50));
        for (let i = 1; i < lines.length; i += step) {
            const cols = lines.at(i).split(",").map(c => c.replace(/"/g, "").trim());
            const rawX = Number(cols.at(idxX));
            const rawY = Number(cols.at(idxY));
            if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) continue;

            let lat, lng;
            if (Math.abs(rawY) > 90) {
                ({ lat, lng } = polarMetersToLatLng(rawX, rawY, isSouth));
            } else {
                lat = +rawY.toFixed(4);
                lng = +rawX.toFixed(4);
            }
            if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;

            const dt = idxDate >= 0 ? cols.at(idxDate) : "N/A";
            const sensor = idxSensor >= 0 ? cols.at(idxSensor) : "Sentinel-1 / Landsat";
            results.push({
                id: `NASA-CSV-${results.length + 1}`,
                lat, lng, radiusNm: 18, tier: 2, risk: "med",
                confidence: "Cao",
                timeAgo: `Ngày đo: ${dt}`,
                confidenceReason: `Tọa độ thật từ cảm biến ${sensor} (${file})`,
                type: `Mép băng NASA (${sensor})`,
                source: file
            });
        }
    });
}

const outPath = path.join(__dirname, "nasa-processed.json");
fs.writeFileSync(outPath, JSON.stringify({ count: results.length, features: results }, null, 2), "utf8");
console.log(`>>> HOAN TAT! Da xu ly xong ${results.length} diem/duong bang tu Downloads\\nasa -> luu tai nasa-processed.json`);
