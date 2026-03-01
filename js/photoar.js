window.onload = () => {
    const scene = document.querySelector('a-scene');
    const assets = document.getElementById('assets-container');
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

    // 1. GPS取得
    navigator.geolocation.watchPosition(pos => {
        currentPos.lat = pos.coords.latitude;
        currentPos.lng = pos.coords.longitude;
        debugPanel.innerHTML = `GPS: OK (${Math.round(pos.coords.accuracy)}m) | 枚数: <span id="photo-count">${photoCountEl.innerText}</span>`;
    }, null, { enableHighAccuracy: true });

    // 2. DB初期化
    let db;
    const dbRequest = indexedDB.open("GeoPhotoDB_V150", 1);
    dbRequest.onupgradeneeded = e => e.target.result.createObjectStore("photos", { keyPath: "id", autoIncrement: true });
    dbRequest.onsuccess = e => { db = e.target.result; loadSavedPhotos(); };

    startScreen.addEventListener('click', () => {
        startScreen.style.opacity = '0';
        setTimeout(() => { startScreen.style.display = 'none'; mainUI.style.display = 'flex'; appStarted = true; }, 400);
    });

    // 3. 写真選択 & リサイズ
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
                if (w > h && w > max) { h *= max / w; w = max; } else if (h > max) { w *= max / h; h = max; }
                c.width = w; c.height = h;
                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                selectedImgUrl = c.toDataURL('image/jpeg', 0.8);
                selectedAspect = w / h;
                fileLabel.innerText = "✅ 画面をタップして設置！";
                fileLabel.style.background = "#2e7d32";
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });

    // 4. AR写真生成 (ここが重要！)
    function createARPhoto(data) {
        // IDを生成
        const assetId = `img-${Date.now()}-${Math.floor(Math.random()*1000)}`;
        
        // A-Assetsにimgタグを追加
        const imgAsset = document.createElement('img');
        imgAsset.setAttribute('id', assetId);
        imgAsset.setAttribute('src', data.image);
        imgAsset.setAttribute('crossorigin', 'anonymous');
        assets.appendChild(imgAsset);

        // Entity作成
        const entity = document.createElement('a-entity');
        entity.setAttribute('gps-entity-place', `latitude: ${data.lat}; longitude: ${data.lng};`);

        // Plane作成
        const plane = document.createElement('a-plane');
        plane.setAttribute('look-at', '#myCamera');
        plane.setAttribute('position', '0 2 0'); // 2m浮かせる
        
        // サイズ計算
        const size = 5; 
        const width = data.aspect >= 1 ? size : size * data.aspect;
        const height = data.aspect >= 1 ? size / data.aspect : size;
        plane.setAttribute('width', width);
        plane.setAttribute('height', height);

        // マテリアルセット
        plane.setAttribute('material', `src: #${assetId}; shader: flat; transparent: true; side: double;`);

        // 強制描画リフレッシュ
        plane.addEventListener('materialtextureloaded', () => {
            const mesh = plane.getObject3D('mesh');
            if (mesh && mesh.material) {
                mesh.material.map.needsUpdate = true;
            }
        });

        entity.appendChild(plane);
        scene.appendChild(entity);
        photoCountEl.innerText = document.querySelectorAll('a-plane').length;
    }

    function loadSavedPhotos() {
        const tx = db.transaction(["photos"], "readonly");
        tx.objectStore("photos").openCursor().onsuccess = e => {
            const cursor = e.target.result;
            if (cursor) { createARPhoto(cursor.value); cursor.continue(); }
        };
    }

    // タップで配置
    const handleTap = (e) => {
        if (!appStarted || e.target.closest('.ui-container') || !selectedImgUrl) return;
        const data = { lat: currentPos.lat, lng: currentPos.lng, image: selectedImgUrl, aspect: selectedAspect };
        db.transaction(["photos"], "readwrite").objectStore("photos").add(data);
        createARPhoto(data);
        selectedImgUrl = null;
        fileLabel.innerText = "① 写真を選ぶ";
        fileLabel.style.background = "rgba(0,0,0,.7)";
    };

    window.addEventListener('touchstart', handleTap);
    window.addEventListener('mousedown', handleTap);

    // スクショ保存
    shotBtn.addEventListener('click', async () => {
        try {
            const video = document.querySelector('video');
            const glCanvas = scene.canvas;
            const canvas = document.createElement('canvas');
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            const ctx = canvas.getContext('2d');

            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            scene.renderer.render(scene.object3D, scene.camera);
            ctx.drawImage(glCanvas, 0, 0, canvas.width, canvas.height);

            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/jpeg', 0.9);
            link.download = `ar-photo.jpg`;
            link.click();
        } catch (e) { alert("保存に失敗しました"); }
    });

    document.getElementById('clearBtn').onclick = () => {
        if (confirm("全消去しますか？")) {
            db.transaction(["photos"], "readwrite").objectStore("photos").clear();
            location.reload();
        }
    };
};