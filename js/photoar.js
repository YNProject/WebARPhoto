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

    // --- 1. 2点間の距離を計算する関数 (単位: m) ---
    function getDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000; // 地球の半径
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // --- 2. GPS監視 & デバッグUI更新 ---
    navigator.geolocation.watchPosition(pos => {
        currentPos.lat = pos.coords.latitude;
        currentPos.lng = pos.coords.longitude;
        const acc = Math.round(pos.coords.accuracy);
        
        // 近くにある写真のカウント（半径20m以内）
        let nearbyCount = 0;
        const proximityRadius = 20; 
        const entities = document.querySelectorAll('[gps-entity-place]');
        
        entities.forEach(el => {
            const lat = parseFloat(el.getAttribute('gps-entity-place').latitude);
            const lng = parseFloat(el.getAttribute('gps-entity-place').longitude);
            const dist = getDistance(currentPos.lat, currentPos.lng, lat, lng);
            if (dist < proximityRadius) nearbyCount++;
        });

        // デバッグパネルの表示内容
        let statusMsg = nearbyCount > 0 
            ? `<span style="color: #ffeb3b; font-weight: bold;">📍 近くに ${nearbyCount} 枚の写真があります！</span>`
            : `<span style="opacity: 0.6;">(近くに写真はありません)</span>`;

        debugPanel.innerHTML = `
            精度: ${acc}m<br>
            座標: ${currentPos.lat.toFixed(5)}, ${currentPos.lng.toFixed(5)}<br>
            合計: ${entities.length}枚 / ${statusMsg}
        `;
    }, err => console.error(err), { enableHighAccuracy: true });

    // --- 3. IndexedDB (写真データの永続化) ---
    let db;
    const dbRequest = indexedDB.open("GeoPhotoDB_V_Final", 1);
    dbRequest.onupgradeneeded = e => e.target.result.createObjectStore("photos", { keyPath: "id", autoIncrement: true });
    dbRequest.onsuccess = e => { 
        db = e.target.result; 
        loadSavedPhotos(); 
    };

    // --- 4. スタート処理 ---
    startScreen.addEventListener('click', () => {
        startScreen.style.display = 'none';
        mainUI.style.display = 'flex';
        appStarted = true;
    });

    // --- 5. 写真の選択・リサイズ処理 ---
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
                fileLabel.innerText = "✅ 好きな場所でタップ！";
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
        plane.setAttribute('position', '0 1.5 0'); // 地面から1.5m
        
        const size = 2.5; // サイズを以前の半分に調整
        if (data.aspect >= 1) {
            plane.setAttribute('width', size);
            plane.setAttribute('height', size / data.aspect);
        } else {
            plane.setAttribute('height', size);
            plane.setAttribute('width', size * data.aspect);
        }
        
        plane.setAttribute('material', 'shader: flat; side: double; transparent: true;');

        // A-Frame 1.5.0 真っ白対策のテクスチャ流し込み
        const loader = new THREE.TextureLoader();
        loader.load(data.image, (texture) => {
            const mesh = plane.getObject3D('mesh');
            mesh.material.map = texture;
            mesh.material.needsUpdate = true;
        });

        entity.appendChild(plane);
        scene.appendChild(entity);
    }

    function loadSavedPhotos() {
        const tx = db.transaction(["photos"], "readonly");
        tx.objectStore("photos").openCursor().onsuccess = e => {
            const cursor = e.target.result;
            if (cursor) { 
                createARPhoto(cursor.value); 
                cursor.continue(); 
            }
        };
    }

    // --- 7. タップで配置 ---
    const handleTap = (e) => {
        if (!appStarted || e.target.closest('.ui-container') || !selectedImgUrl) return;
        
        const data = { 
            lat: currentPos.lat, 
            lng: currentPos.lng, 
            image: selectedImgUrl, 
            aspect: selectedAspect 
        };
        
        db.transaction(["photos"], "readwrite").objectStore("photos").add(data);
        createARPhoto(data);
        
        selectedImgUrl = null;
        fileLabel.innerText = "① 写真を選ぶ";
    };

    window.addEventListener('touchstart', handleTap);
    window.addEventListener('mousedown', handleTap);

    // --- 8. 高精度保存ロジック (比率補正あり) ---
    shotBtn.addEventListener('click', async () => {
        try {
            const video = document.querySelector('video');
            const glCanvas = scene.canvas;
            if (!video || !glCanvas) return;

            const canvas = document.createElement('canvas');
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            const ctx = canvas.getContext('2d');

            const vAspect = video.videoWidth / video.videoHeight;
            const sAspect = canvas.width / canvas.height;

            // 背景描画
            let sx, sy, sw, sh;
            if (vAspect > sAspect) {
                sw = video.videoHeight * sAspect; sh = video.videoHeight;
                sx = (video.videoWidth - sw) / 2; sy = 0;
            } else {
                sw = video.videoWidth; sh = video.videoWidth / sAspect;
                sx = 0; sy = (video.videoHeight - sh) / 2;
            }
            ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

            // ARレイヤー描画（歪み補正）
            scene.renderer.render(scene.object3D, scene.camera);
            const cw = glCanvas.width;
            const ch = glCanvas.height;
            const cAspect = cw / ch;

            let asx, asy, asw, ash;
            if (cAspect > sAspect) {
                asw = ch * sAspect; ash = ch;
                asx = (cw - asw) / 2; asy = 0;
            } else {
                asw = cw; ash = cw / sAspect;
                asx = 0; asy = (ch - ash) / 2;
            }
            ctx.drawImage(glCanvas, asx, asy, asw, ash, 0, 0, canvas.width, canvas.height);

            // フラッシュ演出 & 共有
            flashEffect();
            const url = canvas.toDataURL('image/jpeg', 0.8);
            saveOrShare(url);

        } catch (e) { console.error(e); }
    });

    function flashEffect() {
        const f = document.createElement('div');
        f.style.cssText = 'position:fixed;inset:0;background:white;z-index:99999;pointer-events:none;';
        document.body.appendChild(f);
        setTimeout(() => {
            f.style.transition = 'opacity .4s';
            f.style.opacity = 0;
            setTimeout(() => f.remove(), 400);
        }, 50);
    }

    async function saveOrShare(url) {
        const blob = await (await fetch(url)).blob();
        const file = new File([blob], `ar-${Date.now()}.jpg`, { type: 'image/jpeg' });
        
        if (navigator.share) {
            try { await navigator.share({ files: [file] }); } catch (e) {}
        } else {
            const a = document.createElement('a');
            a.href = url; a.download = file.name; a.click();
        }
    }

    // --- 9. 全消去 ---
    document.getElementById('clearBtn').onclick = () => {
        if (confirm("全ての写真を削除しますか？")) {
            db.transaction(["photos"], "readwrite").objectStore("photos").clear();
            location.reload();
        }
    };
};