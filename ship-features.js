





// =========================================================================
// NÂNG CẤP 3D: DỰNG TÀU 3D & 2 LÁ CỜ XUẤT PHÁT / ĐÍCH TRÊN THREE.JS GLOBE
// =========================================================================
window.threeShipMesh = null;
window.threeStartFlag = null;
window.threeEndFlag = null;
window.threeRouteLine = null;

// Đổi tọa độ (lat, lng) sang tọa độ không gian 3D (x, y, z) trên mặt cầu
window.latLngToVector3 = function(lat, lng, radius) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = (radius * Math.sin(phi) * Math.sin(theta));
    const y = (radius * Math.cos(phi));
    return new THREE.Vector3(x, y, z);
};

// Tự động tìm Scene và bán kính Quả địa cầu Three.js đang chạy trong trang
window.findThreeSceneAndRadius = function() {
    const sceneObj = window.scene || window.globeScene || (typeof scene !== "undefined" ? scene : null);
    if (!sceneObj || typeof THREE === "undefined") return null;

    let earthRadius = 100;
    sceneObj.traverse(obj => {
        if (obj.isMesh && obj.geometry && obj.geometry.type === "SphereGeometry") {
            const r = obj.geometry.parameters?.radius;
            if (r && r > 1 && r < 500) earthRadius = r;
        }
    });
    return { scene: sceneObj, radius: earthRadius };
};

window.updateThreeJS3DObjects = function(routeCoords, currentShipLatLng) {
    const env = window.findThreeSceneAndRadius();
    if (!env) return;
    const { scene, radius } = env;

    // 1. Tạo hoặc cập nhật 2 lá cờ 3D (Xuất phát & Đích đến)
    if (Array.isArray(routeCoords) && routeCoords.length >= 2) {
        const startPt = routeCoords.at(0);
        const endPt = routeCoords.at(routeCoords.length - 1);

        if (!window.threeStartFlag) {
            const grp = new THREE.Group();
            const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(radius * 0.004, radius * 0.004, radius * 0.09, 8),
                new THREE.MeshBasicMaterial({ color: 0xffffff })
            );
            pole.position.y = radius * 0.045;
            const flag = new THREE.Mesh(
                new THREE.BoxGeometry(radius * 0.04, radius * 0.025, radius * 0.005),
                new THREE.MeshBasicMaterial({ color: 0x10b981 }) // Cờ xanh lá xuất phát
            );
            flag.position.set(radius * 0.02, radius * 0.075, 0);
            grp.add(pole, flag);
            scene.add(grp);
            window.threeStartFlag = grp;
        }
        const sPos = window.latLngToVector3(startPt.at(0), startPt.at(1), radius);
        window.threeStartFlag.position.copy(sPos);
        window.threeStartFlag.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sPos.clone().normalize());

        if (!window.threeEndFlag) {
            const grp = new THREE.Group();
            const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(radius * 0.004, radius * 0.004, radius * 0.09, 8),
                new THREE.MeshBasicMaterial({ color: 0xffffff })
            );
            pole.position.y = radius * 0.045;
            const flag = new THREE.Mesh(
                new THREE.BoxGeometry(radius * 0.04, radius * 0.025, radius * 0.005),
                new THREE.MeshBasicMaterial({ color: 0xf43f5e }) // Cờ đỏ đích đến
            );
            flag.position.set(radius * 0.02, radius * 0.075, 0);
            grp.add(pole, flag);
            scene.add(grp);
            window.threeEndFlag = grp;
        }
        const ePos = window.latLngToVector3(endPt.at(0), endPt.at(1), radius);
        window.threeEndFlag.position.copy(ePos);
        window.threeEndFlag.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ePos.clone().normalize());
    }

    // 2. Tạo hoặc di chuyển Mô hình Tàu Phá Băng 3D trên mặt cầu
    if (Array.isArray(currentShipLatLng) && currentShipLatLng.length === 2) {
        if (!window.threeShipMesh) {
            const shipGrp = new THREE.Group();
            // Thân tàu 3D
            const hull = new THREE.Mesh(
                new THREE.ConeGeometry(radius * 0.018, radius * 0.055, 4),
                new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
            );
            hull.rotation.x = Math.PI / 2;
            hull.position.y = radius * 0.012;
            // Cabin chỉ huy màu trắng sáng
            const cabin = new THREE.Mesh(
                new THREE.BoxGeometry(radius * 0.016, radius * 0.018, radius * 0.02),
                new THREE.MeshBasicMaterial({ color: 0xffffff })
            );
            cabin.position.set(0, radius * 0.022, -radius * 0.008);
            shipGrp.add(hull, cabin);
            scene.add(shipGrp);
            window.threeShipMesh = shipGrp;
        }

        const shipPos = window.latLngToVector3(currentShipLatLng.at(0), currentShipLatLng.at(1), radius * 1.005);
        window.threeShipMesh.position.copy(shipPos);
        window.threeShipMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), shipPos.clone().normalize());
    }
};

// Đồng bộ liên tục vị trí con tàu 3D mỗi 60ms khi đang mô phỏng (hoặc đặt sẵn tại điểm xuất phát)
setInterval(() => {
    let route = [];
    if (typeof recommendedRouteLine !== "undefined" && recommendedRouteLine && recommendedRouteLine.getLatLngs) {
        route = recommendedRouteLine.getLatLngs().map(p => [p.lat, p.lng]);
    } else {
        const sLat = parseFloat(document.getElementById("start-lat")?.value);
        const sLng = parseFloat(document.getElementById("start-lng")?.value);
        const eLat = parseFloat(document.getElementById("end-lat")?.value);
        const eLng = parseFloat(document.getElementById("end-lng")?.value);
        if ([sLat, sLng, eLat, eLng].every(Number.isFinite)) route = [[sLat, sLng], [eLat, eLng]];
    }

    let shipPos = route.length >= 1 ? route.at(0) : null;
    if (window.simShipMarker && typeof window.simShipMarker.getLatLng === "function") {
        const ll = window.simShipMarker.getLatLng();
        if (ll) shipPos = [ll.lat, ll.lng];
    }

    if (route.length >= 2 || shipPos) {
        window.updateThreeJS3DObjects(route, shipPos);
    }
}, 60);


// =========================================================================
// KẾT HỢP PHÂN TÍCH ĐỘ TIN CẬY THEO THỜI GIAN CHO DỮ LIỆU TỪ FILE NASA EONET
// =========================================================================
window.enrichIceConfidenceFromDate = function(ice) {
    const rawDate = ice.scanTimeUtc || ice.date || "";
    const nowMs = Date.now();
    const scanMs = rawDate ? Date.parse(rawDate) : nowMs;
    const validScanMs = Number.isFinite(scanMs) ? scanMs : nowMs;

    const diffMinutes = Math.max(1, Math.round((nowMs - validScanMs) / 60000));
    const diffHours = +(diffMinutes / 60).toFixed(1);

    let timeAgoText = diffMinutes < 60
        ? `${diffMinutes} phút trước`
        : `${Math.floor(diffHours)} giờ ${diffMinutes % 60} phút trước`;

    if (diffHours >= 24) {
        const days = Math.floor(diffHours / 24);
        const remHrs = Math.round(diffHours % 24);
        timeAgoText = `${days} ngày ${remHrs} giờ trước`;
    }

    let confidence = "Cao";
    let badgeColor = "#10b981";
    let reasonText = "Dữ liệu vệ tinh vừa mới cập nhật, khối băng chưa kịp trôi xa nên tọa độ phản ánh chính xác vị trí hiện tại.";

    if (diffHours > 12) {
        confidence = "Thấp";
        badgeColor = "#f43f5e";
        reasonText = "Đã quá 12 giờ kể từ lần vệ tinh NASA ghi nhận trong file; dưới tác động của dòng hải lưu và gió biển, tảng băng đã trôi dạt sang vị trí khác.";
    } else if (diffHours >= 2) {
        confidence = "Trung bình";
        badgeColor = "#f59e0b";
        reasonText = "Dữ liệu được quét cách đây vài giờ; khối băng có thể đã dịch chuyển nhẹ từ 2 - 8 hải lý so với tọa độ lưu trong file.";
    }

    return {
        timeAgo: ice.timeAgo || timeAgoText,
        confidence: ice.confidence || confidence,
        badgeColor: badgeColor,
        reason: ice.confidenceReason || reasonText
    };
};

// Tự động gắn bảng thông tin Độ tin cậy + Lý do + Thông số vật lý khi bấm vào bất kỳ điểm băng nào từ File
window.combinedIceLayerGroup = null;
window._lastCombinedHash = "";

setInterval(() => {
    if (typeof map === "undefined" || !map || typeof icebergs === "undefined" || !Array.isArray(icebergs)) return;

    const currentHash = icebergs.map(i => `${i.id}_${i.lat}_${i.lng}_${i.date || ""}`).join("|");
    if (currentHash === window._lastCombinedHash) return;
    window._lastCombinedHash = currentHash;

    if (window.combinedIceLayerGroup) {
        map.removeLayer(window.combinedIceLayerGroup);
    }
    window.combinedIceLayerGroup = L.layerGroup().addTo(map);

    icebergs.forEach((ice, idx) => {
        const info = window.enrichIceConfidenceFromDate(ice);
        const rNm = Number(ice.radiusNm) || 5;
        const diameterKm = ice.diameterKm || +(rNm * 2 * 1.852).toFixed(1);
        const freeboardM = ice.freeboardM || +(rNm * 6.5).toFixed(1);
        const draftM = ice.draftM || +(freeboardM * 7.33).toFixed(1);

        // Vẽ vòng định vị độ tin cậy bao quanh tảng băng từ file
        const ring = L.circleMarker([ice.lat, ice.lng], {
            radius: 13,
            color: info.badgeColor,
            weight: 2,
            dashArray: "4 3",
            fillColor: info.badgeColor,
            fillOpacity: 0.22
        }).addTo(window.combinedIceLayerGroup);

        const popupHtml = `
            <div style="min-width:240px; font-family:sans-serif; color:#0f172a; line-height:1.5;">
                <div style="font-weight:800; font-size:13px; color:#0369a1; border-bottom:1px solid #cbd5e1; padding-bottom:4px; margin-bottom:6px;">
                    🧊 ${ice.type || ice.id || ("Khu vực #" + (idx + 1))}
                </div>
                <div style="font-size:11.5px; margin-bottom:6px;">
                    • <b>Cập nhật gần nhất:</b> <b>${info.timeAgo}</b><br/>
                    • <b>Độ tin cậy tọa độ:</b> <span style="background:${info.badgeColor}; color:#fff; font-weight:bold; padding:1px 7px; border-radius:4px;">${info.confidence}</span><br/>
                    • <b>Kích thước:</b> R = ${rNm} NM (ĐK: ${diameterKm} km)<br/>
                    • <b>Độ nổi / Độ chìm:</b> +${freeboardM}m / <b style="color:#be123c;">-${draftM}m</b>
                </div>
                <div style="padding:6px 8px; background:#f1f5f9; border-left:3px solid ${info.badgeColor}; font-size:11px; color:#334155; border-radius:4px;">
                    <b>Lý do độ tin cậy:</b> ${info.reason}
                </div>
            </div>
        `;

        ring.bindPopup(popupHtml);
        ring.bindTooltip(`${ice.id || "Zone " + (idx + 1)} • Cập nhật: ${info.timeAgo} • Tin cậy: ${info.confidence}`);
        ring.on("click", () => {
            if (typeof showIcebergTelemetry === "function") {
                showIcebergTelemetry(Object.assign({}, ice, { radiusNm: rNm, diameterKm, freeboardM, draftM }));
            }
        });
    });
}, 1000);

// =========================================================================
// BẮT TRỰC TIẾP KHUNG CẢNH 3D & GẮN 2 LÁ CỜ + TÀU 3D VÀO KHỐI CẦU TRÁI ĐẤT
// =========================================================================
(function hookThreeRenderer() {
    const timer = setInterval(() => {
        if (typeof THREE !== "undefined" && THREE.WebGLRenderer && !THREE.WebGLRenderer.prototype.__hookedForFlags) {
            THREE.WebGLRenderer.prototype.__hookedForFlags = true;
            const origRender = THREE.WebGLRenderer.prototype.render;
            THREE.WebGLRenderer.prototype.render = function(scene, camera) {
                if (scene && scene.isScene) {
                    window.__capturedThreeScene = scene;
                }
                return origRender.apply(this, arguments);
            };
            clearInterval(timer);
        }
    }, 200);
})();

window.findThreeSceneAndRadius = function() {
    const sceneObj = window.__capturedThreeScene || window.scene || window.globeScene;
    if (!sceneObj || typeof THREE === "undefined") return null;

    let earthMesh = null;
    let earthRadius = 100;
    sceneObj.traverse(obj => {
        if (obj.isMesh && obj.geometry && obj.geometry.type === "SphereGeometry") {
            const r = obj.geometry.parameters?.radius;
            if (r && r > 1 && r < 500 && (!earthMesh || r > earthRadius)) {
                // Chọn khối cầu Trái Đất chính (bỏ qua lớp mây/khí quyển nếu lớn hơn nhiều)
                if (!earthMesh || r < earthRadius * 1.15) {
                    earthMesh = obj;
                    earthRadius = r;
                }
            }
        }
    });
    return { scene: sceneObj, targetParent: earthMesh || sceneObj, radius: earthRadius };
};

window.updateThreeJS3DObjects = function(routeCoords, currentShipLatLng) {
    const env = window.findThreeSceneAndRadius();
    if (!env) return;
    const { targetParent, radius } = env;

    // 1. Tạo hoặc cập nhật 2 lá cờ 3D (Xuất phát & Đích đến)
    if (Array.isArray(routeCoords) && routeCoords.length >= 2) {
        const startPt = routeCoords.at(0);
        const endPt = routeCoords.at(routeCoords.length - 1);

        if (!window.threeStartFlag) {
            const grp = new THREE.Group();
            const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(radius * 0.006, radius * 0.006, radius * 0.14, 10),
                new THREE.MeshBasicMaterial({ color: 0xffffff })
            );
            pole.position.y = radius * 0.07;
            const flag = new THREE.Mesh(
                new THREE.BoxGeometry(radius * 0.065, radius * 0.04, radius * 0.008),
                new THREE.MeshBasicMaterial({ color: 0x10b981 }) // Cờ xanh lá xuất phát
            );
            flag.position.set(radius * 0.032, radius * 0.115, 0);
            const ring = new THREE.Mesh(
                new THREE.RingGeometry(radius * 0.015, radius * 0.028, 24),
                new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide })
            );
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = radius * 0.003;
            grp.add(pole, flag, ring);
            targetParent.add(grp);
            window.threeStartFlag = grp;
        }
        const sPos = window.latLngToVector3(startPt.at(0), startPt.at(1), radius);
        window.threeStartFlag.position.copy(sPos);
        window.threeStartFlag.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sPos.clone().normalize());

        if (!window.threeEndFlag) {
            const grp = new THREE.Group();
            const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(radius * 0.006, radius * 0.006, radius * 0.14, 10),
                new THREE.MeshBasicMaterial({ color: 0xffffff })
            );
            pole.position.y = radius * 0.07;
            const flag = new THREE.Mesh(
                new THREE.BoxGeometry(radius * 0.065, radius * 0.04, radius * 0.008),
                new THREE.MeshBasicMaterial({ color: 0xf43f5e }) // Cờ đỏ đích đến
            );
            flag.position.set(radius * 0.032, radius * 0.115, 0);
            const ring = new THREE.Mesh(
                new THREE.RingGeometry(radius * 0.015, radius * 0.028, 24),
                new THREE.MeshBasicMaterial({ color: 0xf43f5e, side: THREE.DoubleSide })
            );
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = radius * 0.003;
            grp.add(pole, flag, ring);
            targetParent.add(grp);
            window.threeEndFlag = grp;
        }
        const ePos = window.latLngToVector3(endPt.at(0), endPt.at(1), radius);
        window.threeEndFlag.position.copy(ePos);
        window.threeEndFlag.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ePos.clone().normalize());
    }

    // 2. Tạo hoặc di chuyển Con Tàu 3D trên mặt cầu
    if (Array.isArray(currentShipLatLng) && currentShipLatLng.length === 2) {
        if (!window.threeShipMesh) {
            const shipGrp = new THREE.Group();
            const hull = new THREE.Mesh(
                new THREE.ConeGeometry(radius * 0.025, radius * 0.075, 4),
                new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
            );
            hull.rotation.x = Math.PI / 2;
            hull.position.y = radius * 0.015;
            const cabin = new THREE.Mesh(
                new THREE.BoxGeometry(radius * 0.022, radius * 0.024, radius * 0.028),
                new THREE.MeshBasicMaterial({ color: 0xffffff })
            );
            cabin.position.set(0, radius * 0.028, -radius * 0.01);
            shipGrp.add(hull, cabin);
            targetParent.add(shipGrp);
            window.threeShipMesh = shipGrp;
        }
        const shipPos = window.latLngToVector3(currentShipLatLng.at(0), currentShipLatLng.at(1), radius * 1.008);
        window.threeShipMesh.position.copy(shipPos);
        window.threeShipMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), shipPos.clone().normalize());
    }
};

// =========================================================================
// BẮT TRỰC TIẾP KHUNG CẢNH 3D & GẮN 2 LÁ CỜ + TÀU 3D VÀO KHỐI CẦU TRÁI ĐẤT
// =========================================================================
(function hookThreeRenderer() {
    const timer = setInterval(() => {
        if (typeof THREE !== "undefined" && THREE.WebGLRenderer && !THREE.WebGLRenderer.prototype.__hookedForFlags) {
            THREE.WebGLRenderer.prototype.__hookedForFlags = true;
            const origRender = THREE.WebGLRenderer.prototype.render;
            THREE.WebGLRenderer.prototype.render = function(scene, camera) {
                if (scene && scene.isScene) {
                    window.__capturedThreeScene = scene;
                }
                return origRender.apply(this, arguments);
            };
            clearInterval(timer);
        }
    }, 200);
})();

window.findThreeSceneAndRadius = function() {
    const sceneObj = window.__capturedThreeScene || window.scene || window.globeScene;
    if (!sceneObj || typeof THREE === "undefined") return null;

    let earthMesh = null;
    let earthRadius = 100;
    sceneObj.traverse(obj => {
        if (obj.isMesh && obj.geometry && obj.geometry.type === "SphereGeometry") {
            const r = obj.geometry.parameters?.radius;
            if (r && r > 1 && r < 500 && (!earthMesh || r > earthRadius)) {
                // Chọn khối cầu Trái Đất chính (bỏ qua lớp mây/khí quyển nếu lớn hơn nhiều)
                if (!earthMesh || r < earthRadius * 1.15) {
                    earthMesh = obj;
                    earthRadius = r;
                }
            }
        }
    });
    return { scene: sceneObj, targetParent: earthMesh || sceneObj, radius: earthRadius };
};

window.updateThreeJS3DObjects = function(routeCoords, currentShipLatLng) {
    const env = window.findThreeSceneAndRadius();
    if (!env) return;
    const { targetParent, radius } = env;

    // 1. Tạo hoặc cập nhật 2 lá cờ 3D (Xuất phát & Đích đến)
    if (Array.isArray(routeCoords) && routeCoords.length >= 2) {
        const startPt = routeCoords.at(0);
        const endPt = routeCoords.at(routeCoords.length - 1);

        if (!window.threeStartFlag) {
            const grp = new THREE.Group();
            const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(radius * 0.006, radius * 0.006, radius * 0.14, 10),
                new THREE.MeshBasicMaterial({ color: 0xffffff })
            );
            pole.position.y = radius * 0.07;
            const flag = new THREE.Mesh(
                new THREE.BoxGeometry(radius * 0.065, radius * 0.04, radius * 0.008),
                new THREE.MeshBasicMaterial({ color: 0x10b981 }) // Cờ xanh lá xuất phát
            );
            flag.position.set(radius * 0.032, radius * 0.115, 0);
            const ring = new THREE.Mesh(
                new THREE.RingGeometry(radius * 0.015, radius * 0.028, 24),
                new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide })
            );
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = radius * 0.003;
            grp.add(pole, flag, ring);
            targetParent.add(grp);
            window.threeStartFlag = grp;
        }
        const sPos = window.latLngToVector3(startPt.at(0), startPt.at(1), radius);
        window.threeStartFlag.position.copy(sPos);
        window.threeStartFlag.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sPos.clone().normalize());

        if (!window.threeEndFlag) {
            const grp = new THREE.Group();
            const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(radius * 0.006, radius * 0.006, radius * 0.14, 10),
                new THREE.MeshBasicMaterial({ color: 0xffffff })
            );
            pole.position.y = radius * 0.07;
            const flag = new THREE.Mesh(
                new THREE.BoxGeometry(radius * 0.065, radius * 0.04, radius * 0.008),
                new THREE.MeshBasicMaterial({ color: 0xf43f5e }) // Cờ đỏ đích đến
            );
            flag.position.set(radius * 0.032, radius * 0.115, 0);
            const ring = new THREE.Mesh(
                new THREE.RingGeometry(radius * 0.015, radius * 0.028, 24),
                new THREE.MeshBasicMaterial({ color: 0xf43f5e, side: THREE.DoubleSide })
            );
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = radius * 0.003;
            grp.add(pole, flag, ring);
            targetParent.add(grp);
            window.threeEndFlag = grp;
        }
        const ePos = window.latLngToVector3(endPt.at(0), endPt.at(1), radius);
        window.threeEndFlag.position.copy(ePos);
        window.threeEndFlag.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ePos.clone().normalize());
    }

    // 2. Tạo hoặc di chuyển Con Tàu 3D trên mặt cầu
    if (Array.isArray(currentShipLatLng) && currentShipLatLng.length === 2) {
        if (!window.threeShipMesh) {
            const shipGrp = new THREE.Group();
            const hull = new THREE.Mesh(
                new THREE.ConeGeometry(radius * 0.025, radius * 0.075, 4),
                new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
            );
            hull.rotation.x = Math.PI / 2;
            hull.position.y = radius * 0.015;
            const cabin = new THREE.Mesh(
                new THREE.BoxGeometry(radius * 0.022, radius * 0.024, radius * 0.028),
                new THREE.MeshBasicMaterial({ color: 0xffffff })
            );
            cabin.position.set(0, radius * 0.028, -radius * 0.01);
            shipGrp.add(hull, cabin);
            targetParent.add(shipGrp);
            window.threeShipMesh = shipGrp;
        }
        const shipPos = window.latLngToVector3(currentShipLatLng.at(0), currentShipLatLng.at(1), radius * 1.008);
        window.threeShipMesh.position.copy(shipPos);
        window.threeShipMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), shipPos.clone().normalize());
    }
};
