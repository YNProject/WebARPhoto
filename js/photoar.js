// --- A-Frame カスタムコンポーネント: 近接時のサイズ制御 ---
AFRAME.registerComponent('proximity-listener', {
    schema: {
        shrinkRadius: { type: 'number', default: 3 }
    },
    init: function () {
        this.cameraEl = document.querySelector('#myCamera');
        this.isShrunk = false; 
    },
    tick: function () {
        const camPos = new THREE.Vector3();
        const elPos = new THREE.Vector3();
        this.cameraEl.object3D.getWorldPosition(camPos);
        this.el.object3D.getWorldPosition(elPos);

        const dist = camPos.distanceTo(elPos);

        if (dist < this.data.shrinkRadius && !this.isShrunk) {
            this.el.emit('shrink');
            this.isShrunk = true;
        } else if (dist >= this.data.shrinkRadius && this.isShrunk) {
            this.el.emit('grow');
            this.isShrunk = false;
        }
    }
});

window.onload = () => {
    const scene = document.querySelector('a-scene');
    const debugPanel = document.getElementById('debug-panel');
    const fileInput = document.getElementById('fileInput');
    const fileLabel = document.getElementById('fileLabel');
    const startScreen = document.getElementById('start-screen');
    const mainUI = document.getElementById('main-ui');
    const shotBtn = document.getElementById('shotBtn');

    let selectedImgUrl = null;
    let selectedAspect = 1;
    let appStarted = false;
    let currentPos = { lat: 0, lng: 0 };

    // --- 1. 距離計算関数 ---
    function getDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // --- 2. GPS監視 ---
    navigator.geolocation.watchPosition(pos => {
        currentPos.lat = pos.coords.latitude;
        currentPos.lng = pos.coords.longitude;
        const acc = Math.round(pos.coords.accuracy);
        
        let nearbyCount = 0;
        const proximityRadius = 20; 
        const entities = document.querySelectorAll('[gps-entity-place]');
        
        entities.forEach(el => {
            const attr = el.getAttribute('gps-entity-place');
            const dist = getDistance(currentPos.lat, currentPos.lng, parseFloat(attr.latitude), parseFloat(attr.longitude));
            if (dist < proximityRadius) nearbyCount++;
        });

        let statusMsg = nearbyCount > 0 
            ? `<span style="color: #ffeb3b; font-weight: bold;">📍 近くに ${nearbyCount} 枚！</span>`
            : `<span style="opacity: 0.6;">(近くに写真なし)</span>`;

        debugPanel.innerHTML = `精度: ${acc}m<br>座標: ${currentPos.lat.toFixed(5)}, ${currentPos.lng.toFixed(5)}<br>合計: ${entities.length}枚 / ${statusMsg}`;
    }, err => console.error(err), { enableHighAccuracy: true });

    // --- 3. IndexedDB ---
    let db;
    const dbRequest = indexedDB.open("GeoPhotoDB_V_Final", 1);
    dbRequest.onupgradeneeded = e => e.target.result.createObjectStore("photos", { keyPath: "id", autoIncrement: true });
    dbRequest.onsuccess = e => { db = e.target.result; loadSavedPhotos(); };

    // --- 4. スタート処理 ---
    startScreen.addEventListener('click', () => {
        startScreen.style.display = 'none';
        mainUI.style.display = 'flex';
        appStarted = true;
    });

    // --- 5. 写真選択 ---
    fileInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            const img = new Image();
            img.onload = () => {
                const c = document.createElement('canvas');
                const max = 1024;
                let w = img.width, h = img.height;
                if (w > h && w > max) { h *= max / w; w = max; } 
                else if (h > max) { w *= max / h; h = max; }
                c.width = w; c.height = h;
                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                selectedImgUrl = c.toDataURL('image/jpeg', 0.9);
                selectedAspect = w / h;
                fileLabel.innerText = "✅ 画面をタップして配置！";
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });

    // --- 6. AR写真の生成 ---
    function createARPhoto(data) {
        const entity = document.createElement('a-entity');
        entity.setAttribute('gps-entity-place', `latitude: ${data.lat}; longitude: ${data.lng};`);

        const plane = document.createElement('a-plane');
        plane.setAttribute('look-at', '#myCamera');
        plane.setAttribute('position', '0 1.5 0'); 
        
        const size = 2.5; 
        if (data.aspect >= 1) {
            plane.setAttribute('width', size);
            plane.setAttribute('height', size / data.aspect);
        } else {
            plane.setAttribute('height', size);
            plane.setAttribute('width', size * data.aspect);
        }
        plane.setAttribute('material', 'shader: flat; side: double; transparent: true;');

        const loader = new THREE.TextureLoader();
        loader.load(data.image, (texture) => {
            const mesh = plane.getObject3D('mesh');
            mesh.material.map = texture;
            mesh.material.needsUpdate = true;
        });

        entity.setAttribute('animation__shrink', { property: 'scale', to: '0.3 0.3 0.3', dur: 300, easing: 'easeOutQuad', startEvents: 'shrink' });
        entity.setAttribute('animation__grow', { property: 'scale', to: '1 1 1', dur: 300, easing: 'easeOutQuad', startEvents: 'grow' });
        entity.setAttribute('proximity-listener', { shrinkRadius: 3 });

        entity.appendChild(plane);
        scene.appendChild(entity);
    }

    function loadSavedPhotos() {
        const tx = db.transaction(["photos"], "readonly");
        tx.objectStore("photos").openCursor().onsuccess = e => {
            const cursor = e.target.result;
            if (cursor) { createARPhoto(cursor.value); cursor.continue(); }
        };
    }

    // --- 7. タップで5m先に「重なりを避けて」配置 ---
    const handleTap = (e) => {
        if (!appStarted || e.target.closest('.ui-container') || !selectedImgUrl) return;

        const camera = document.querySelector('#myCamera').object3D;
        const worldDir = new THREE.Vector3();
        camera.getWorldDirection(worldDir);
        const angle = Math.atan2(worldDir.x, worldDir.z);

        const distance = 5; 
        let targetLat = currentPos.lat + (distance * Math.cos(angle)) / 111320;
        let targetLng = currentPos.lng + (distance * Math.sin(angle)) / (111320 * Math.cos(currentPos.lat * Math.PI / 180));

        // --- 重なり回避ロジック ---
        const entities = document.querySelectorAll('[gps-entity-place]');
        entities.forEach(el => {
            const attr = el.getAttribute('gps-entity-place');
            const exLat = parseFloat(attr.latitude);
            const exLng = parseFloat(attr.longitude);
            const distBetween = getDistance(targetLat, targetLng, exLat, exLng);

            // もし既存の写真と1.5m以内なら、少し（1m分）ずらす
            if (distBetween < 1.5) {
                targetLat += (1.0 / 111320); // 北に約1mずらす
                targetLng += (1.0 / (111320 * Math.cos(targetLat * Math.PI / 180))); // 東に約1mずらす
            }
        });

        const data = { lat: targetLat, lng: targetLng, image: selectedImgUrl, aspect: selectedAspect };
        
        db.transaction(["photos"], "readwrite").objectStore("photos").add(data);
        createARPhoto(data);
        
        selectedImgUrl = null;
        fileLabel.innerText = "① 写真を選ぶ";
    };

    window.addEventListener('touchstart', handleTap);
    window.addEventListener('mousedown', handleTap);

    // --- 8. 高精度保存 ---
    shotBtn.addEventListener('click', async () => {
        try {
            const video = document.querySelector('video');
            const glCanvas = scene.canvas;
            if (!video || !glCanvas) return;
            const canvas = document.createElement('canvas');
            canvas.width = window.innerWidth; canvas.height = window.innerHeight;
            const ctx = canvas.getContext('2d');
            const vAspect = video.videoWidth / video.videoHeight;
            const sAspect = canvas.width / canvas.height;
            let sx, sy, sw, sh;
            if (vAspect > sAspect) { sw = video.videoHeight * sAspect; sh = video.videoHeight; sx = (video.videoWidth - sw) / 2; sy = 0; }
            else { sw = video.videoWidth; sh = video.videoWidth / sAspect; sx = 0; sy = (video.videoHeight - sh) / 2; }
            ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            scene.renderer.render(scene.object3D, scene.camera);
            const cw = glCanvas.width, ch = glCanvas.height, cAspect = cw / ch;
            let asx, asy, asw, ash;
            if (cAspect > sAspect) { asw = ch * sAspect; ash = ch; asx = (cw - asw) / 2; asy = 0; }
            else { asw = cw; ash = cw / sAspect; asx = 0; asy = (ch - ash) / 2; }
            ctx.drawImage(glCanvas, asx, asy, asw, ash, 0, 0, canvas.width, canvas.height);
            flashEffect();
            const url = canvas.toDataURL('image/jpeg', 0.8);
            saveOrShare(url);
        } catch (e) { console.error(e); }
    });

    function flashEffect() {
        const f = document.createElement('div');
        f.style.cssText = 'position:fixed;inset:0;background:white;z-index:99999;pointer-events:none;';
        document.body.appendChild(f);
        setTimeout(() => { f.style.transition = 'opacity .4s'; f.style.opacity = 0; setTimeout(() => f.remove(), 400); }, 50);
    }

    async function saveOrShare(url) {
        const blob = await (await fetch(url)).blob();
        const file = new File([blob], `ar-${Date.now()}.jpg`, { type: 'image/jpeg' });
        if (navigator.share) { try { await navigator.share({ files: [file] }); } catch (e) {} }
        else { const a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); }
    }

    document.getElementById('clearBtn').onclick = () => {
        if (confirm("全消去しますか？")) { db.transaction(["photos"], "readwrite").objectStore("photos").clear(); location.reload(); }
    };
};