const fs = require("fs");
const p = __dirname + "/ice.html";
let s = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");

function swap(from, to, next) {
    const a = s.indexOf(from);
    const b = s.indexOf(to);
    if (a < 0 || b < 0 || b <= a) {
        throw new Error("missing marker\nFROM " + from.slice(0, 60) + "\nTO " + to.slice(0, 60) + "\n" + a + " " + b);
    }
    s = s.slice(0, a) + next + s.slice(b);
}

swap(
`        function applyCustomApiKey() {`,
`        function pickOnMap(mode) {`,
`        function applyCustomApiKey() {
            const key = document.getElementById('custom-api-key').value.trim();
            if (!key) {
                alert("Vui lòng nhập API Key trước khi bấm Lưu.");
                return;
            }
            customApiKey = key;
            mountTileLayer();
            alert("Đã gắn API key vào lớp bản đồ đang mở.");
        }

`
);

swap(
`        // --- THUẬT TOÁN ĐỊNH TUYẾN THÔNG MINH MỚI: TÍNH VÉC-TƠ VÀ KHOẢNG CÁCH NÉ BĂNG CHUẨN XÁC ---`,
`        function initMap() {`,
`        function obstaclePayload() {
            return sampleIcebergs.map(ice => ({
                id: ice.id,
                lat: ice.lat,
                lng: ice.lng,
                risk: ice.risk,
                radiusNm: ice.risk === 'high' ? 6 : ice.risk === 'low' ? 2 : 3.5
            }));
        }

        async function startExpandingRouteSimulation() {
            const sLat = parseFloat(document.getElementById('start-lat').value);
            const sLng = parseFloat(document.getElementById('start-lng').value);
            const eLat = parseFloat(document.getElementById('end-lat').value);
            const eLng = parseFloat(document.getElementById('end-lng').value);
            const statusEl = document.getElementById('routing-status');

            if (![sLat, sLng, eLat, eLng].every(Number.isFinite)) {
                statusEl.innerText = 'Tọa độ bắt đầu / kết thúc không hợp lệ';
                statusEl.className = 'text-red-400 font-bold';
                return;
            }

            show2DMap(sLat, sLng, map ? Math.max(map.getZoom(), 7) : 8);
            setStartPoint(sLat, sLng);
            setEndPoint(eLat, eLng);
            if (recommendedRouteLine) map.removeLayer(recommendedRouteLine);

            statusEl.innerText = 'A* server đang né băng...';
            statusEl.className = 'text-ice-cyan font-bold animate-pulse';

            try {
                const res = await fetch(API_ROUTE, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        start: [sLat, sLng],
                        end: [eLat, eLng],
                        bufferRadius: bufferRadiusNM,
                        speedKnots: currentSogKnots || 14.8,
                        obstacles: obstaclePayload()
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Route request failed');

                const latlngs = data.route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
                recommendedRouteLine = L.polyline(latlngs, {
                    color: '#00F0FF',
                    weight: 5,
                    opacity: 0.95
                }).addTo(map);
                map.fitBounds(recommendedRouteLine.getBounds().pad(0.35));
                requestAnimationFrame(() => map.invalidateSize(true));

                document.getElementById('route-distance').innerText = data.distanceNm.toFixed(1) + ' NM';
                document.getElementById('fuel-saving').innerText = '~ ' + Number(data.fuelSavingPercent).toFixed(1) + '%';
                const nearest = (data.tcpa || [])[0];
                document.getElementById('route-tcpa').innerText = nearest
                    ? nearest.id + ' · ' + nearest.tcpaMinutes + ' phút · ' + nearest.cpaDistanceNm + ' NM'
                    : 'Không có mục tiêu';

                const avoided = (data.obstaclesAvoided || []).length;
                statusEl.innerText = avoided
                    ? 'A* né ' + avoided + ' mục tiêu · ' + data.distanceNm.toFixed(1) + ' NM'
                    : 'Tuyến thẳng an toàn · ' + data.distanceNm.toFixed(1) + ' NM';
                statusEl.className = 'text-emerald-400 font-bold';
                syncGlobeScene(latlngs);
            } catch (err) {
                statusEl.innerText = 'Server offline: ' + err.message;
                statusEl.className = 'text-red-400 font-bold';
            }
        }

`
);

swap(
`        function initMap() {`,
`        function renderSafetyBuffer() {`,
`        const TILE_BOUNDS = L.latLngBounds(L.latLng(-85.0511, -180), L.latLng(85.0511, 180));

        function mountTileLayer() {
            if (!map) return;
            if (currentTileLayer) map.removeLayer(currentTileLayer);
            const key = customApiKey ? encodeURIComponent(customApiKey) : '';
            if (isSatelliteView) {
                currentTileLayer = L.tileLayer(
                    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' + (key ? '?token=' + key : ''),
                    {
                        attribution: 'Tiles &copy; Esri World Imagery',
                        bounds: TILE_BOUNDS,
                        noWrap: true,
                        maxZoom: 18,
                        maxNativeZoom: 18,
                        minZoom: 2
                    }
                );
            } else {
                currentTileLayer = L.tileLayer(
                    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' + (key ? '?api_key=' + key : ''),
                    {
                        attribution: '&copy; OpenStreetMap &copy; CARTO',
                        bounds: TILE_BOUNDS,
                        noWrap: true,
                        maxZoom: 18,
                        maxNativeZoom: 18,
                        minZoom: 2,
                        subdomains: 'abcd'
                    }
                );
            }
            currentTileLayer.addTo(map);
            setTimeout(() => map.invalidateSize(true), 60);
        }

        function initMap() {
            map = L.map('ice-map', {
                center: shipCoords,
                zoom: 8,
                zoomControl: false,
                maxBounds: TILE_BOUNDS,
                maxBoundsViscosity: 0.85,
                minZoom: 2,
                worldCopyJump: false
            });

            mountTileLayer();

            const shipIcon = L.divIcon({
                className: 'custom-ship-marker',
                html: \`
                    <div class="relative flex items-center justify-center">
                        <div class="absolute w-9 h-9 bg-ice-cyan/20 rounded-full animate-ping"></div>
                        <i class="fa-solid fa-ship text-ice-cyan text-xl"></i>
                    </div>
                \`,
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            });

            vesselMarker = L.marker(shipCoords, { icon: shipIcon }).addTo(map);
            renderSafetyBuffer();
            renderIcebergs();
            map.whenReady(() => map.invalidateSize(true));
        }

        function toggleMapTileLayer() {
            isSatelliteView = !isSatelliteView;
            mountTileLayer();

            const btn = document.getElementById('btn-toggle-map');
            const label = document.getElementById('map-mode-label');
            if (isSatelliteView) {
                btn.innerHTML = '<i class="fa-solid fa-radar mr-1"></i> Ra-đa Đêm';
                btn.className = "px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded text-[11px] font-bold";
                label.innerText = "CHẾ ĐỘ VỆ TINH TRÁI ĐẤT";
            } else {
                btn.innerHTML = '<i class="fa-solid fa-earth-americas mr-1"></i> Vệ Tinh Trái Đất';
                btn.className = "px-2 py-1 bg-ice-cyan/20 hover:bg-ice-cyan/30 text-ice-cyan border border-ice-cyan/40 rounded text-[11px] font-bold";
                label.innerText = "CHẾ ĐỘ RA-ĐA SAR";
            }
        }

`
);

swap(
`                iceMarkers.push(marker);
            });
        }`,
`        function loadNasa48hMockData() {`,
`                iceMarkers.push(marker);
            });
            syncGlobeScene(recommendedRouteLine ? recommendedRouteLine.getLatLngs().map(p => [p.lat, p.lng]) : null);
        }

`
);

swap(
`        function focusOnShip() {
            map.flyTo(shipCoords, 11);
        }

        function resetMapView() {
            map.flyTo([77.8000, -41.5000], 7);
        }`,
`        function toggleSimulationAlert() {`,
`        function focusOnShip() {
            show2DMap(shipCoords[0], shipCoords[1], 11);
        }

        function resetMapView() {
            show3DGlobe(77.8, -41.5);
        }

`
);

const globeStart = s.indexOf("        let globe;");
if (globeStart < 0) throw new Error("globe block missing");
s = s.slice(0, globeStart) + `        let globe;
        let is3DMode = true;
        let viewTransitioning = false;

        function updateViewButton() {
            const btn = document.getElementById('btn-view-mode');
            if (!btn) return;
            btn.innerHTML = is3DMode
                ? '<i class="fa-solid fa-map mr-1"></i> 2D Map'
                : '<i class="fa-solid fa-earth-asia mr-1"></i> 3D Globe';
        }

        function show2DMap(lat, lng, zoom) {
            const container = document.getElementById('globe-container');
            is3DMode = false;
            updateViewButton();
            if (!container || !map) return;
            viewTransitioning = true;
            container.style.opacity = '0';
            setTimeout(() => {
                container.style.pointerEvents = 'none';
                container.style.visibility = 'hidden';
                map.setView([lat, lng], zoom || 9, { animate: false });
                map.invalidateSize(true);
                setTimeout(() => map.invalidateSize(true), 280);
                viewTransitioning = false;
            }, 700);
        }

        function show3DGlobe(lat, lng) {
            const container = document.getElementById('globe-container');
            is3DMode = true;
            updateViewButton();
            if (!container) return;
            const center = map ? map.getCenter() : { lat: 77.9, lng: -41.5 };
            container.style.visibility = 'visible';
            container.style.pointerEvents = 'auto';
            requestAnimationFrame(() => { container.style.opacity = '1'; });
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
                show2DMap(pov.lat, pov.lng, 9);
            } else {
                const center = map.getCenter();
                show3DGlobe(center.lat, center.lng);
            }
        }

        function syncGlobeScene(routeLatLngs) {
            if (!globe) return;
            globe
                .pointsData(sampleIcebergs)
                .pointLat(d => d.lat)
                .pointLng(d => d.lng)
                .pointColor(d => d.risk === 'high' ? '#ff2a6d' : d.risk === 'low' ? '#06d6a0' : '#ffb703')
                .pointAltitude(0.012)
                .pointRadius(0.22)
                .pointLabel(d => d.id);
            if (routeLatLngs && routeLatLngs.length) {
                globe
                    .pathsData([{ path: routeLatLngs }])
                    .pathPoints('path')
                    .pathPointLat(p => p[0])
                    .pathPointLng(p => p[1])
                    .pathColor(() => '#00f0ff')
                    .pathStroke(0.8)
                    .pathPointAlt(() => 0.01);
            }
        }

        function init3DGlobe() {
            const container = document.getElementById('globe-container');
            if (!container || typeof Globe !== 'function') {
                show2DMap(shipCoords[0], shipCoords[1], 8);
                return;
            }
            try {
                globe = Globe()(container)
                    .globeImageUrl('//unpkg.com/three-globe/example/img/earth-dark.jpg')
                    .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
                    .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')
                    .pointOfView({ lat: shipCoords[0], lng: shipCoords[1], altitude: 2.4 });
                syncGlobeScene();
                globe.onZoom(({ altitude }) => {
                    if (altitude < 0.6 && is3DMode && !viewTransitioning) {
                        const pov = globe.pointOfView();
                        show2DMap(pov.lat, pov.lng, 9);
                    }
                });
                updateViewButton();
            } catch (err) {
                console.error('3D Globe failed', err);
                show2DMap(shipCoords[0], shipCoords[1], 8);
            }
        }

        async function pingRouteServer() {
            const statusEl = document.getElementById('routing-status');
            try {
                const res = await fetch('http://localhost:3000/api/health');
                if (!res.ok) throw new Error('offline');
                if (statusEl.innerText === 'Sẵn sàng kích hoạt') {
                    statusEl.innerText = 'A* server sẵn sàng';
                    statusEl.className = 'text-emerald-400 font-semibold';
                }
            } catch (err) {
                if (!gpsWatchId) {
                    statusEl.innerText = 'Chưa thấy server :3000';
                    statusEl.className = 'text-amber-400 font-semibold';
                }
            } finally {
                if (gpsWatchId == null) requestAndGetLocation();
            }
        }

        window.onload = function () {
            initClock();
            initMap();
            init3DGlobe();
            initCrowdFeed();
            initMapClickPickers();
            pingRouteServer();
        };
    </script>
</body>
</html>
`;

fs.writeFileSync(p, s);
console.log("patched", s.length);
