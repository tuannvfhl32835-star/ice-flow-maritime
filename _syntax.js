
        const API_ROUTE = "http://localhost:3000/api/route";
        const TILE_BOUNDS = L.latLngBounds(L.latLng(-85.05112878, -180), L.latLng(85.05112878, 180));
        const BLANK_TILE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

        const SafeTileLayer = L.TileLayer.extend({
            getTileUrl: function (coords) {
                const limit = 2 ** coords.z;
                if (coords.x < 0 || coords.y < 0 || coords.x >= limit || coords.y >= limit) return BLANK_TILE;
                if (this.options.bounds && !this._tileCoordsToBounds(coords).intersects(this.options.bounds)) return BLANK_TILE;
                return L.TileLayer.prototype.getTileUrl.call(this, coords);
            }
        });

        let map, globe, vesselMarker, safetyCircle, startMarker, endMarker, recommendedRouteLine, currentTileLayer;
        let bufferRadiusNM = 5;
        let isSatelliteView = false;
        let customApiKey = "";
        let gpsWatchId = null;
        let lastGpsFix = null;
        let currentSogKnots = 12.4;
        let currentCogDeg = 148;
        let pickingMode = null;
        let activeTool = "pan";
        let isDrawing = false;
        let currentPolyline = null;
        let drawnLayers = [];
        let iceMarkers = [];
        let is3DMode = true;
        let viewTransitioning = false;
        let suppressZoomUntil = 0;
        const shipCoords = [74.8, -10.2];

        let sampleIcebergs = [
            { id: "ICE-GS-01", lat: 74.35, lng: -11.15, risk: "high", radiusNm: 9, type: "Tabular berg trên tuyến thẳng", size: "Lớn", speed: "0.8 kts SE", source: "Sentinel-1" },
            { id: "ICE-GS-02", lat: 73.55, lng: -8.55, risk: "high", radiusNm: 7, type: "Cụm growler", size: "Vừa", speed: "1.1 kts S", source: "VIIRS" },
            { id: "ICE-GS-03", lat: 74.85, lng: -9.4, risk: "med", radiusNm: 4.5, type: "Bergy bit", size: "Vừa", speed: "1.4 kts E", source: "Bridge report" },
            { id: "ICE-GS-04", lat: 72.95, lng: -10.4, risk: "low", radiusNm: 3, type: "Brash ice", size: "Nhỏ", speed: "0.4 kts N", source: "X-band radar" }
        ];

        const nasa48hSample = [
            { id: "NASA-MODIS-801", lat: 74.7, lng: -12.1, risk: "high", radiusNm: 5, type: "Mảnh vỡ 48 giờ", size: "Lớn", speed: "1.6 kts S", source: "NASA MODIS sample" },
            { id: "NASA-VIIRS-802", lat: 73.9, lng: -7.6, risk: "med", radiusNm: 3.5, type: "Floe nhiệt thấp 48 giờ", size: "Vừa", speed: "1.2 kts SE", source: "NASA VIIRS sample" }
        ];

        const nasaHistorical = [
            { id: "A-68", year: "2017", lat: -67.9, lng: -60.6, risk: "high", radiusNm: 18, type: "Larsen C calving A-68", size: "Khổng lồ", speed: "0.3 kts N", source: "NASA Worldview 2017" },
            { id: "A-76", year: "2021", lat: -75.4, lng: -48.2, risk: "high", radiusNm: 16, type: "Ronne Ice Shelf A-76", size: "Khổng lồ", speed: "0.2 kts", source: "NASA Worldview 2021" },
            { id: "A-81", year: "2023", lat: -75.5, lng: -26.1, risk: "high", radiusNm: 12, type: "Brunt Ice Shelf A-81", size: "Lớn", speed: "0.4 kts", source: "NASA Worldview 2023" },
            { id: "GS-2025-01", year: "2025", lat: 75.05, lng: -13.4, risk: "high", radiusNm: 6, type: "Greenland Sea breakup 2025", size: "Lớn", speed: "1.0 kts E", source: "Operational archive 2025" }
        ];

        function formatCoordPair(lat, lng) {
            const fmt = (v, pos, neg) => {
                const abs = Math.abs(v);
                const deg = Math.floor(abs);
                const minutes = ((abs - deg) * 60).toFixed(2).padStart(5, "0");
                return String(deg).padStart(2, "0") + "°" + minutes + "'" + (v >= 0 ? pos : neg);
            };
            return fmt(lat, "N", "S") + " " + fmt(lng, "E", "W");
        }

        function cogLabel(deg) {
            const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
            const rounded = ((deg % 360) + 360) % 360;
            return String(Math.round(rounded)).padStart(3, "0") + "° (" + dirs[Math.round(rounded / 45) % 8] + ")";
        }

        function bearingDeg(lat1, lng1, lat2, lng2) {
            const toRad = Math.PI / 180;
            const y = Math.sin((lng2 - lng1) * toRad) * Math.cos(lat2 * toRad);
            const x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) - Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos((lng2 - lng1) * toRad);
            return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
        }

        function setStatus(text, cls) {
            const el = document.getElementById("routing-status");
            el.innerText = text;
            el.className = cls || "text-slate-200 font-semibold";
        }

        function applyVesselFix(lat, lng, sogKnots, cogDeg) {
            shipCoords[0] = lat;
            shipCoords[1] = lng;
            if (vesselMarker) {
                vesselMarker.setLatLng([lat, lng]);
                const icon = vesselMarker.getElement();
                const heading = icon && icon.querySelector(".ship-heading");
                if (heading && Number.isFinite(cogDeg)) heading.style.transform = "rotate(" + cogDeg + "deg)";
            }
            if (safetyCircle) safetyCircle.setLatLng([lat, lng]);
            document.getElementById("header-coords").innerText = formatCoordPair(lat, lng);
            if (Number.isFinite(sogKnots)) {
                currentSogKnots = sogKnots;
                document.getElementById("header-speed").innerText = sogKnots.toFixed(1) + " Knots";
            }
            if (Number.isFinite(cogDeg)) {
                currentCogDeg = cogDeg;
                document.getElementById("header-cog").innerText = cogLabel(cogDeg);
            }
            syncGlobeScene(currentRouteLatLngs());
        }

        function onGpsPosition(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const now = position.timestamp || Date.now();
            let sog = currentSogKnots;
            let cog = currentCogDeg;
            if (Number.isFinite(position.coords.speed) && position.coords.speed >= 0) {
                sog = position.coords.speed * 1.943844;
            } else if (lastGpsFix) {
                const hours = Math.max(0.0001, (now - lastGpsFix.time) / 3600000);
                const movedNm = L.latLng(lastGpsFix.lat, lastGpsFix.lng).distanceTo(L.latLng(lat, lng)) / 1852;
                if (movedNm > 0.002) sog = movedNm / hours;
            }
            if (Number.isFinite(position.coords.heading) && position.coords.heading >= 0) {
                cog = position.coords.heading;
            } else if (lastGpsFix) {
                const movedM = L.latLng(lastGpsFix.lat, lastGpsFix.lng).distanceTo(L.latLng(lat, lng));
                if (movedM > 4) cog = bearingDeg(lastGpsFix.lat, lastGpsFix.lng, lat, lng);
            }
            const firstLock = !lastGpsFix;
            lastGpsFix = { lat, lng, time: now };
            applyVesselFix(lat, lng, sog, cog);
            if (firstLock) {
                document.getElementById("start-lat").value = lat.toFixed(4);
                document.getElementById("start-lng").value = lng.toFixed(4);
                setStartPoint(lat, lng);
                if (!is3DMode && map) map.setView([lat, lng], Math.max(map.getZoom(), 8));
                setStatus("GPS khóa liên tục", "text-emerald-400 font-bold");
            }
        }

        function onGpsError(error) {
            const messages = {
                1: "Đã từ chối quyền vị trí. Đang dùng tàu mô phỏng trên Greenland Sea.",
                2: "GPS thiết bị không khả dụng. Đang dùng vị trí mô phỏng.",
                3: "Hết thời gian chờ GPS. Đang dùng vị trí mô phỏng."
            };
            setStatus(messages[error.code] || "Không đọc được GPS.", "text-amber-400 font-semibold");
        }

        function requestAndGetLocation() {
            if (!navigator.geolocation) {
                setStatus("Trình duyệt không có Geolocation.", "text-red-400 font-bold");
                return;
            }
            if (gpsWatchId != null) navigator.geolocation.clearWatch(gpsWatchId);
            setStatus("Đang khóa GPS thiết bị…", "text-ice-cyan font-semibold");
            gpsWatchId = navigator.geolocation.watchPosition(onGpsPosition, onGpsError, {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 2000
            });
        }

        function refreshMapSurface() {
            if (!map) return;
            map.invalidateSize({ animate: false, pan: false });
            if (currentTileLayer) currentTileLayer.redraw();
        }

        function mountTileLayer() {
            if (!map) return;
            if (currentTileLayer) map.removeLayer(currentTileLayer);
            const key = customApiKey ? encodeURIComponent(customApiKey) : "";
            const google = customApiKey.indexOf("AIza") === 0;
            let url;
            let attribution;
            if (isSatelliteView) {
                url = google
                    ? "https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}&key=" + key
                    : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
                attribution = google ? "Google satellite" : "Tiles &copy; Esri World Imagery";
            } else {
                url = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png" + (key && !google ? "?api_key=" + key : "");
                attribution = "&copy; OpenStreetMap &copy; CARTO";
            }
            currentTileLayer = new SafeTileLayer(url, {
                attribution: attribution,
                bounds: TILE_BOUNDS,
                noWrap: true,
                maxZoom: 16,
                maxNativeZoom: 18,
                minZoom: 2,
                subdomains: "abcd",
                errorTileUrl: BLANK_TILE,
                updateWhenIdle: true
            });
            currentTileLayer.addTo(map);
            setTimeout(refreshMapSurface, 50);
        }

        function initMap() {
            map = L.map("ice-map", {
                center: shipCoords,
                zoom: 6,
                zoomControl: false,
                maxBounds: TILE_BOUNDS,
                maxBoundsViscosity: 1,
                minZoom: 2,
                maxZoom: 16,
                worldCopyJump: false
            });
            map.attributionControl.setPosition("bottomleft");
            L.control.scale({ imperial: true, metric: true, position: "bottomleft" }).addTo(map);
            mountTileLayer();

            const shipIcon = L.divIcon({
                className: "custom-ship-marker",
                html: '<div class="ship-heading relative flex items-center justify-center" style="transform:rotate(' + currentCogDeg + 'deg)"><i class="fa-solid fa-location-arrow text-ice-cyan text-xl"></i></div>',
                iconSize: [28, 28],
                iconAnchor: [14, 14]
            });
            vesselMarker = L.marker(shipCoords, { icon: shipIcon, zIndexOffset: 800 }).addTo(map);
            renderSafetyBuffer();
            renderIcebergs();
            map.whenReady(refreshMapSurface);
            initMapInteractions();
            new ResizeObserver(() => refreshMapSurface()).observe(document.getElementById("ice-map"));
        }

        function initMapInteractions() {
            map.on("click", function (e) {
                if (!pickingMode) return;
                const lat = Number(e.latlng.lat.toFixed(4));
                const lng = Number(e.latlng.lng.toFixed(4));
                if (pickingMode === "start") {
                    document.getElementById("start-lat").value = lat;
                    document.getElementById("start-lng").value = lng;
                    setStartPoint(lat, lng);
                } else {
                    document.getElementById("end-lat").value = lat;
                    document.getElementById("end-lng").value = lng;
                    setEndPoint(lat, lng);
                }
                pickingMode = null;
                document.getElementById("ice-map").classList.remove("cursor-target-reticle");
            });
            map.on("mousedown", function (e) {
                if (activeTool !== "draw") return;
                isDrawing = true;
                map.dragging.disable();
                currentPolyline = L.polyline([e.latlng], { color: "#00F0FF", weight: 3 }).addTo(map);
                drawnLayers.push(currentPolyline);
            });
            map.on("mousemove", function (e) {
                if (activeTool === "draw" && isDrawing && currentPolyline) currentPolyline.addLatLng(e.latlng);
            });
            map.on("mouseup", function () {
                if (activeTool !== "draw") return;
                isDrawing = false;
            });
            map.on("dblclick", function () {
                if (activeTool !== "draw" || !currentPolyline) return;
                const pts = currentPolyline.getLatLngs();
                if (pts.length >= 3) {
                    map.removeLayer(currentPolyline);
                    drawnLayers = drawnLayers.filter((layer) => layer !== currentPolyline);
                    const poly = L.polygon(pts, { color: "#00F0FF", weight: 2, fillColor: "#00F0FF", fillOpacity: 0.12 }).addTo(map);
                    drawnLayers.push(poly);
                }
                currentPolyline = null;
                isDrawing = false;
            });
        }

        function setMapTool(tool) {
            activeTool = tool;
            document.getElementById("tool-pan").className = tool === "pan"
                ? "p-2 rounded-lg text-ice-cyan bg-navy-700 border border-ice-cyan/40"
                : "p-2 rounded-lg text-slate-400";
            document.getElementById("tool-draw").className = tool === "draw"
                ? "p-2 rounded-lg text-ice-cyan bg-navy-700 border border-ice-cyan/40"
                : "p-2 rounded-lg text-slate-400";
            if (tool === "draw") {
                if (is3DMode) {
                    const pov = globe ? globe.pointOfView() : { lat: shipCoords[0], lng: shipCoords[1] };
                    show2DMap(pov.lat, pov.lng, 7);
                }
                map.dragging.disable();
                map.doubleClickZoom.disable();
            } else {
                map.dragging.enable();
                map.doubleClickZoom.enable();
            }
        }

        function clearUserDrawings() {
            drawnLayers.forEach((layer) => map.removeLayer(layer));
            drawnLayers = [];
            currentPolyline = null;
        }

        function applyCustomApiKey() {
            customApiKey = document.getElementById("custom-api-key").value.trim();
            mountTileLayer();
            setStatus(customApiKey ? "Đã gắn API key vào lớp bản đồ." : "Đã xoá API key. Dùng lớp công khai.", "text-amber-300 font-semibold");
        }

        function pickOnMap(mode) {
            if (is3DMode) show2DMap(shipCoords[0], shipCoords[1], 7);
            pickingMode = mode;
            document.getElementById("ice-map").classList.add("cursor-target-reticle");
            setStatus(mode === "start" ? "Chọn điểm bắt đầu trên bản đồ" : "Chọn điểm đến trên bản đồ", "text-ice-cyan font-semibold");
        }

        function markerIcon(color, icon) {
            return L.divIcon({
                className: "",
                html: '<div class="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center shadow-lg" style="background:' + color + '"><i class="fa-solid ' + icon + ' text-xs text-navy-900"></i></div>',
                iconSize: [28, 28],
                iconAnchor: [14, 14]
            });
        }

        function setStartPoint(lat, lng) {
            if (startMarker) map.removeLayer(startMarker);
            startMarker = L.marker([lat, lng], { icon: markerIcon("#10b981", "fa-play") }).addTo(map).bindPopup("Điểm bắt đầu");
        }

        function setEndPoint(lat, lng) {
            if (endMarker) map.removeLayer(endMarker);
            endMarker = L.marker([lat, lng], { icon: markerIcon("#ff2a6d", "fa-flag") }).addTo(map).bindPopup("Điểm đến");
        }

        function obstaclePayload() {
            return sampleIcebergs.map((ice) => ({
                id: ice.id,
                lat: ice.lat,
                lng: ice.lng,
                risk: ice.risk,
                radiusNm: ice.radiusNm || (ice.risk === "high" ? 6 : ice.risk === "low" ? 2 : 3.5)
            }));
        }

        function currentRouteLatLngs() {
            if (!recommendedRouteLine) return null;
            return recommendedRouteLine.getLatLngs().map((p) => [p.lat, p.lng]);
        }

        async function startExpandingRouteSimulation() {
            const sLat = parseFloat(document.getElementById("start-lat").value);
            const sLng = parseFloat(document.getElementById("start-lng").value);
            const eLat = parseFloat(document.getElementById("end-lat").value);
            const eLng = parseFloat(document.getElementById("end-lng").value);
            if (![sLat, sLng, eLat, eLng].every(Number.isFinite)) {
                setStatus("Tọa độ không hợp lệ", "text-red-400 font-bold");
                return;
            }
            show2DMap(sLat, sLng, 6);
            setStartPoint(sLat, sLng);
            setEndPoint(eLat, eLng);
            if (recommendedRouteLine) map.removeLayer(recommendedRouteLine);
            setStatus("A* server đang né băng…", "text-ice-cyan font-bold");
            try {
                const res = await fetch(API_ROUTE, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        start: [sLat, sLng],
                        end: [eLat, eLng],
                        bufferRadius: bufferRadiusNM,
                        speedKnots: currentSogKnots || 12.4,
                        obstacles: obstaclePayload()
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Route request failed");
                const latlngs = data.route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
                recommendedRouteLine = L.polyline(latlngs, { color: "#00F0FF", weight: 4, opacity: 0.95 }).addTo(map);
                map.fitBounds(recommendedRouteLine.getBounds().pad(0.35), { animate: false });
                refreshMapSurface();
                document.getElementById("route-distance").innerText = data.distanceNm.toFixed(1) + " NM";
                document.getElementById("fuel-saving").innerText = data.fuelSavingPercent > 0 ? "~ " + Number(data.fuelSavingPercent).toFixed(1) + "%" : "0%";
                const nearest = (data.tcpa || []).find((row) => row.level !== "clear") || (data.tcpa || [])[0];
                document.getElementById("route-tcpa").innerText = nearest
                    ? nearest.id + " · " + nearest.tcpaMinutes + " phút · CPA " + nearest.cpaDistanceNm + " NM"
                    : "Không có mục tiêu";
                const avoided = (data.obstaclesAvoided || []).length;
                setStatus(avoided ? "A* né " + avoided + " mục tiêu · " + data.distanceNm.toFixed(1) + " NM" : "Tuyến thẳng an toàn · " + data.distanceNm.toFixed(1) + " NM", "text-emerald-400 font-bold");
                syncGlobeScene(latlngs);
            } catch (err) {
                setStatus("Server offline: " + err.message, "text-red-400 font-bold");
            }
        }

        function toggleMapTileLayer() {
            isSatelliteView = !isSatelliteView;
            mountTileLayer();
            const btn = document.getElementById("btn-toggle-map");
            const label = document.getElementById("map-mode-label");
            if (isSatelliteView) {
                btn.innerHTML = "Ra-đa đêm";
                label.innerText = "CHẾ ĐỘ VỆ TINH TRÁI ĐẤT";
            } else {
                btn.innerHTML = "Vệ tinh Trái Đất";
                label.innerText = "CHẾ ĐỘ RA-ĐA SAR";
            }
        }

        function renderSafetyBuffer() {
            if (!map) return;
            if (safetyCircle) map.removeLayer(safetyCircle);
            safetyCircle = L.circle(shipCoords, {
                radius: bufferRadiusNM * 1852,
                color: "#00F0FF",
                weight: 1.5,
                dashArray: "4, 4",
                fillColor: "#00F0FF",
                fillOpacity: 0.08
            }).addTo(map);
        }

        function updateBufferRadius(val) {
            bufferRadiusNM = parseFloat(val);
            document.getElementById("buffer-val-display").innerText = bufferRadiusNM.toFixed(1) + " NM";
            renderSafetyBuffer();
        }

        function toggleIceFilter(riskType) {
            iceMarkers.forEach((marker) => {
                if (marker.riskLevel !== riskType) return;
                if (map.hasLayer(marker)) map.removeLayer(marker);
                else marker.addTo(map);
            });
        }

        function riskColor(risk) {
            if (risk === "high") return "#ff2a6d";
            if (risk === "low") return "#06d6a0";
            return "#ffb703";
        }

        function renderIcebergs() {
            iceMarkers.forEach((marker) => map.removeLayer(marker));
            iceMarkers = [];
            sampleIcebergs.forEach((ice) => {
                const marker = L.circleMarker([ice.lat, ice.lng], {
                    radius: 7,
                    color: "#ffffff",
                    weight: 1,
                    fillColor: riskColor(ice.risk),
                    fillOpacity: 0.95
                }).addTo(map);
                marker.riskLevel = ice.risk;
                marker.bindPopup("<b>" + ice.id + "</b><br>" + (ice.type || "") + "<br>" + (ice.source || ""));
                iceMarkers.push(marker);
            });
            syncGlobeScene(currentRouteLatLngs());
        }

        function noteIngest(items, label) {
            const list = document.getElementById("nasa-ingested-list");
            const html = items.map((item) => '<div class="bg-navy-900/80 p-2 rounded border border-navy-600/40"><b class="text-ice-cyan">' + item.id + "</b> · " + (item.source || label) + "</div>").join("");
            list.innerHTML = html || "Không có điểm trong vùng.";
        }

        function mergeIce(items) {
            items.forEach((item) => {
                if (!sampleIcebergs.some((row) => row.id === item.id)) sampleIcebergs.push(item);
            });
            renderIcebergs();
        }

        async function loadNasa48h() {
            const key = document.getElementById("firms-key").value.trim();
            const bounds = map.getBounds();
            const params = new URLSearchParams({
                key: key,
                south: bounds.getSouth().toFixed(3),
                north: bounds.getNorth().toFixed(3),
                west: bounds.getWest().toFixed(3),
                east: bounds.getEast().toFixed(3),
                days: "2"
            });
            setStatus("Đang hỏi NASA FIRMS…", "text-ice-cyan font-semibold");
            try {
                const res = await fetch("http://localhost:3000/api/firms?" + params.toString());
                const data = await res.json();
                const features = (data.features && data.features.length) ? data.features : nasa48hSample;
                mergeIce(features.map((row) => Object.assign({ radiusNm: row.risk === "high" ? 5 : 3, size: "Live", speed: "—" }, row)));
                noteIngest(features, data.source || "48h");
                if (features[0]) show2DMap(features[0].lat, features[0].lng, 6);
                setStatus(data.source === "firms" ? "FIRMS 48h: " + features.length + " điểm" : "Không có key FIRMS — đã nạp mẫu 48h", "text-emerald-400 font-semibold");
            } catch (err) {
                mergeIce(nasa48hSample);
                noteIngest(nasa48hSample, "sample");
                setStatus("FIRMS offline, dùng mẫu 48h", "text-amber-400 font-semibold");
            }
        }

        function loadNasaHistoricalData() {
            const year = document.getElementById("nasa-year-select").value;
            const picked = nasaHistorical.filter((item) => year === "all" || item.year === year);
            mergeIce(picked);
            noteIngest(picked, "historical");
            if (picked[0]) show2DMap(picked[0].lat, picked[0].lng, year === "2025" ? 6 : 4);
        }

        function handleNasaFileUpload(input) {
            const file = input.files && input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const data = JSON.parse(reader.result);
                    const rows = Array.isArray(data) ? data : (data.features || data.icebergs || []);
                    const parsed = rows.map((row, index) => {
                        const geom = row.geometry && row.geometry.coordinates;
                        const lng = geom ? Number(geom[0]) : Number(row.lng != null ? row.lng : row.lon);
                        const lat = geom ? Number(geom[1]) : Number(row.lat);
                        return {
                            id: String(row.id || row.properties && row.properties.id || ("FILE-" + (index + 1))),
                            lat: lat,
                            lng: lng,
                            risk: (row.risk || (row.properties && row.properties.risk) || "med"),
                            radiusNm: Number(row.radiusNm) || 4,
                            type: row.type || (row.properties && row.properties.type) || "Imported ice",
                            source: file.name
                        };
                    }).filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng));
                    mergeIce(parsed);
                    noteIngest(parsed, file.name);
                    if (parsed[0]) show2DMap(parsed[0].lat, parsed[0].lng, 6);
                } catch (err) {
                    setStatus("File JSON không đọc được", "text-red-400 font-bold");
                }
            };
            reader.readAsText(file);
        }

        function switchLeftTab(tab) {
            ["nav", "nasa", "crowd"].forEach((name) => {
                document.getElementById("tab-" + name + "-btn").className = "py-2.5 rounded-md text-center text-slate-400";
                document.getElementById("panel-" + name).classList.add("hidden");
            });
            document.getElementById("tab-" + tab + "-btn").className = "py-2.5 rounded-md text-center text-ice-cyan bg-navy-700 border border-ice-cyan/30";
            document.getElementById("panel-" + tab).classList.remove("hidden");
        }

        function focusOnShip() {
            show2DMap(shipCoords[0], shipCoords[1], 8);
        }

        function resetMapView() {
            show3DGlobe(74.2, -12);
        }

        function toggleSimulationAlert() {
            document.getElementById("red-alert-banner").classList.toggle("hidden");
        }

        function dismissAlert() {
            document.getElementById("red-alert-banner").classList.add("hidden");
        }

        function initCrowdFeed() {
            document.getElementById("crowd-feed-list").innerHTML = '<div class="bg-navy-900/80 p-2 rounded border border-navy-600/30 text-slate-300">Sẵn sàng nhận báo cáo thuyền viên. Điểm mới được đưa vào lần tính A* tiếp theo.</div>';
        }

        function submitCrowdsourcedIce(event) {
            event.preventDefault();
            const lat = parseFloat(document.getElementById("ice-lat").value);
            const lng = parseFloat(document.getElementById("ice-lng").value);
            const size = document.getElementById("ice-size").value;
            const notes = document.getElementById("ice-notes").value.trim();
            const ice = {
                id: "CROWD-" + Math.floor(100 + Math.random() * 900),
                lat: lat,
                lng: lng,
                risk: size === "Large" ? "high" : size === "Small" ? "low" : "med",
                radiusNm: size === "Large" ? 6 : size === "Small" ? 2 : 3.5,
                type: notes || "Quan sát thực địa",
                size: size,
                source: "Crowdsourced"
            };
            sampleIcebergs.push(ice);
            renderIcebergs();
            show2DMap(lat, lng, 8);
            const feed = document.getElementById("crowd-feed-list");
            feed.insertAdjacentHTML("afterbegin", '<div class="bg-navy-900/80 p-2 rounded border border-navy-600/30"><b class="text-ice-cyan">' + ice.id + "</b> · " + size + " · " + lat.toFixed(3) + ", " + lng.toFixed(3) + "</div>");
        }

        function updateViewButton() {
            const btn = document.getElementById("btn-view-mode");
            btn.innerHTML = is3DMode ? "<b>3D Globe</b> / 2D Map" : "3D Globe / <b>2D Map</b>";
        }

        function show2DMap(lat, lng, zoom) {
            const container = document.getElementById("globe-container");
            is3DMode = false;
            updateViewButton();
            viewTransitioning = true;
            container.style.pointerEvents = "none";
            container.style.opacity = "0";
            setTimeout(() => {
                container.style.visibility = "hidden";
                if (map && Number.isFinite(lat) && Number.isFinite(lng)) {
                    map.setView([lat, lng], zoom || map.getZoom() || 7, { animate: false });
                }
                refreshMapSurface();
                setTimeout(refreshMapSurface, 280);
                viewTransitioning = false;
            }, 700);
        }

        function show3DGlobe(lat, lng) {
            const container = document.getElementById("globe-container");
            is3DMode = true;
            updateViewButton();
            suppressZoomUntil = Date.now() + 1300;
            container.style.visibility = "visible";
            container.style.pointerEvents = "auto";
            requestAnimationFrame(() => { container.style.opacity = "1"; });
            const center = map ? map.getCenter() : { lat: shipCoords[0], lng: shipCoords[1] };
            if (globe) {
                globe.pointOfView({
                    lat: lat != null ? lat : center.lat,
                    lng: lng != null ? lng : center.lng,
                    altitude: 2.2
                }, 900);
            }
        }

        function toggleViewMode() {
            if (is3DMode) {
                const pov = globe ? globe.pointOfView() : { lat: shipCoords[0], lng: shipCoords[1] };
                show2DMap(pov.lat, pov.lng, 7);
            } else {
                const center = map.getCenter();
                show3DGlobe(center.lat, center.lng);
            }
        }

        function syncGlobeScene(routeLatLngs) {
            if (!globe) return;
            const points = sampleIcebergs.concat([{
                id: "VESSEL",
                lat: shipCoords[0],
                lng: shipCoords[1],
                risk: "ship"
            }]);
            globe
                .pointsData(points)
                .pointLat((d) => d.lat)
                .pointLng((d) => d.lng)
                .pointColor((d) => d.risk === "ship" ? "#00f0ff" : riskColor(d.risk))
                .pointAltitude((d) => d.risk === "ship" ? 0.02 : 0.01)
                .pointRadius((d) => d.risk === "ship" ? 0.35 : 0.18)
                .pointLabel((d) => d.id);
            if (routeLatLngs && routeLatLngs.length > 1) {
                globe
                    .pathsData([{ path: routeLatLngs }])
                    .pathPoints("path")
                    .pathPointLat((p) => p[0])
                    .pathPointLng((p) => p[1])
                    .pathColor(() => "#00f0ff")
                    .pathStroke(0.7)
                    .pathPointAlt(() => 0.012);
            }
        }

        function init3DGlobe() {
            const container = document.getElementById("globe-container");
            if (typeof Globe !== "function") {
                show2DMap(shipCoords[0], shipCoords[1], 6);
                return;
            }
            try {
                globe = Globe()(container)
                    .globeImageUrl("//unpkg.com/three-globe/example/img/earth-night.jpg")
                    .bumpImageUrl("//unpkg.com/three-globe/example/img/earth-topology.png")
                    .backgroundImageUrl("//unpkg.com/three-globe/example/img/night-sky.png")
                    .showAtmosphere(true)
                    .atmosphereColor("#48cae4")
                    .atmosphereAltitude(0.18)
                    .pointOfView({ lat: shipCoords[0], lng: shipCoords[1], altitude: 2.4 });
                syncGlobeScene();
                globe.onZoom(({ altitude }) => {
                    if (Date.now() < suppressZoomUntil || viewTransitioning || !is3DMode) return;
                    if (altitude < 0.6) {
                        const pov = globe.pointOfView();
                        show2DMap(pov.lat, pov.lng, 7);
                    }
                });
                updateViewButton();
            } catch (err) {
                console.error(err);
                show2DMap(shipCoords[0], shipCoords[1], 6);
            }
        }

        async function pingRouteServer() {
            try {
                const res = await fetch("http://localhost:3000/api/health");
                if (!res.ok) throw new Error("offline");
                if (!lastGpsFix) setStatus("A* server sẵn sàng", "text-emerald-400 font-semibold");
            } catch (err) {
                if (!lastGpsFix) setStatus("Chưa thấy server :3000 — chạy npm start", "text-amber-400 font-semibold");
            }
        }

        window.addEventListener("resize", refreshMapSurface);
        window.onload = function () {
            document.getElementById("header-coords").innerText = formatCoordPair(shipCoords[0], shipCoords[1]);
            document.getElementById("header-speed").innerText = currentSogKnots.toFixed(1) + " Knots";
            document.getElementById("header-cog").innerText = cogLabel(currentCogDeg);
            setInterval(() => {
                document.getElementById("system-clock").innerText = new Date().toUTCString().split(" ")[4] + " UTC";
            }, 1000);
            initMap();
            init3DGlobe();
            initCrowdFeed();
            requestAndGetLocation();
            pingRouteServer();
        };
    