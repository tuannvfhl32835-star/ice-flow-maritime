const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

module.exports = function(app) {
    // API giải nén file .kmz trực tiếp trên Windows (không bao giờ lỗi JSZip)
    app.post("/api/parse-kmz", require("express").raw({ type: "*/*", limit: "25mb" }), (req, res) => {
        try {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nisar-kmz-"));
            const zipPath = path.join(tmpDir, "upload.zip");
            fs.writeFileSync(zipPath, req.body);

            // Dùng lệnh Expand-Archive có sẵn của Windows để giải nén file KMZ
            execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${tmpDir}' -Force"`);

            const kmlFile = fs.readdirSync(tmpDir).find(f => f.toLowerCase().endsWith(".kml"));
            if (!kmlFile) {
                fs.rmSync(tmpDir, { recursive: true, force: true });
                return res.status(400).json({ error: "Không tìm thấy file doc.kml bên trong gói KMZ!" });
            }

            const kmlText = fs.readFileSync(path.join(tmpDir, kmlFile), "utf8");
            fs.rmSync(tmpDir, { recursive: true, force: true });
            res.json({ kmlText });
        } catch (err) {
            res.status(500).json({ error: "Lỗi giải nén KMZ trên server: " + err.message });
        }
    });
};
