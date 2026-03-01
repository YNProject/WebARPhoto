window.onload = () => {
    const scene = document.querySelector('a-scene');
    const debugPanel = document.getElementById('debug-panel');
    const photoCountEl = document.getElementById('photo-count');
    const fileInput = document.getElementById('fileInput');
    const fileLabel = document.getElementById('fileLabel');
    const startScreen = document.getElementById('start-screen');
    const mainUI = document.getElementById('main-ui');
    const shotBtn = document.getElementById('shotBtn');

    let selectedImgUrl = null;
    let selectedAspect = 1;
    let appStarted = false;
    let currentPos = { lat: 0, lng: 0 };

    // GPS監視
    navigator.geolocation.watchPosition(pos => {
        currentPos.lat = pos.coords.latitude;
        currentPos.lng = pos.coords.longitude;
        const acc = Math.round(pos.coords.accuracy);
        debugPanel.innerHTML = `精度: ${acc}m<br>座標: ${currentPos.lat.toFixed(5)}, ${currentPos.lng.toFixed(5)}<br>枚数: <span id="photo-count">${document.querySelectorAll('a-plane').length}</span>枚`;
    }, null, { enableHighAccuracy: true });

    // DB初期化
    let db;
    const dbRequest = indexedDB.open("GeoPhotoDB_V_Final", 1);
    dbRequest.onupgradeneeded = e => e.target.result.createObjectStore("photos", { keyPath: "id", autoIncrement: true });
    dbRequest.onsuccess = e => { db = e.target.result; loadSavedPhotos(); };

    startScreen.addEventListener('click', () => {
        startScreen.style.display = 'none';
        mainUI.style.display = 'flex';
        appStarted = true;
    });

    fileInput.addEventListener('change', e => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = ev => {
            const img = new Image();
            img.onload = () => {
                const c = document.createElement('canvas');
                const max = 1024;
                let w = img.width, h = img.height;
                if (w > h && w > max) { h *= max / w; w = max; } else if (h > max) { w *= max / h; h = max; }
                c.width = w; c.height = h;
                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                selectedImgUrl = c.toDataURL('image/jpeg', 0.9);
                selectedAspect = w / h;
                fileLabel.innerText = "✅ 画面をタップ！";
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });

    function createARPhoto(data) {
        const entity = document.createElement('a-entity');
        entity.setAttribute('gps-entity-place', `latitude: ${data.lat}; longitude: ${data.lng};`);

        const plane = document.createElement('a-plane');
        plane.setAttribute('look-at', '#myCamera');
        plane.setAttribute('position', '0 1.5 0'); 
        
        const size = 2.5; // 半分サイズ
        plane.setAttribute('width', data.aspect >= 1 ? size : size * data.aspect);
        plane.setAttribute('height', data.aspect >= 1 ? size / data.aspect : size);
        plane.setAttribute('material', 'shader: flat; side: double; transparent: true;');

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
            if (cursor) { createARPhoto(cursor.value); cursor.continue(); }
        };
    }

    const handleTap = (e) => {
        if (!appStarted || e.target.closest('.ui-container') || !selectedImgUrl) return;
        const data = { lat: currentPos.lat, lng: currentPos.lng, image: selectedImgUrl, aspect: selectedAspect };
        db.transaction(["photos"], "readwrite").objectStore("photos").add(data);
        createARPhoto(data);
        selectedImgUrl = null;
        fileLabel.innerText = "① 写真を選ぶ";
    };

    window.addEventListener('touchstart', handleTap);
    window.addEventListener('mousedown', handleTap);

    // --- 高精度保存ロジック ---
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

            // 1. ビデオ背景の切り抜き描画
            let sx, sy, sw, sh;
            if (vAspect > sAspect) {
                sw = video.videoHeight * sAspect; sh = video.videoHeight;
                sx = (video.videoWidth - sw) / 2; sy = 0;
            } else {
                sw = video.videoWidth; sh = video.videoWidth / sAspect;
                sx = 0; sy = (video.videoHeight - sh) / 2;
            }
            ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

            // 2. ARレイヤーの切り抜き描画（歪み防止）
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

            // 3. フラッシュ演出と共有/保存
            const url = canvas.toDataURL('image/jpeg', 0.8);
            flashEffect();
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

    document.getElementById('clearBtn').onclick = () => {
        if (confirm("全消去しますか？")) {
            db.transaction(["photos"], "readwrite").objectStore("photos").clear();
            location.reload();
        }
    };
};