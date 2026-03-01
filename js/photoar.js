window.onload = () => {
    const scene = document.querySelector('a-scene');
    const debugPanel = document.getElementById('debug-panel');
    const photoCountEl = document.getElementById('photo-count');
    const fileInput = document.getElementById('fileInput');
    const fileLabel = document.getElementById('fileLabel');
    const startScreen = document.getElementById('start-screen');
    const mainUI = document.getElementById('main-ui');

    let selectedImgUrl = null;
    let selectedAspect = 1;
    let appStarted = false;
    let currentPos = { lat: 0, lng: 0 };

    // 1. GPS監視（デバッグ表示用）
    navigator.geolocation.watchPosition(pos => {
        currentPos.lat = pos.coords.latitude;
        currentPos.lng = pos.coords.longitude;
        debugPanel.innerHTML = `緯度:${currentPos.lat.toFixed(5)} 経度:${currentPos.lng.toFixed(5)}<br>枚数: <span id="photo-count">${photoCountEl.innerText}</span>枚`;
    }, null, { enableHighAccuracy: true });

    // 2. DB
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
                selectedImgUrl = c.toDataURL('image/jpeg', 0.8);
                selectedAspect = w / h;
                fileLabel.innerText = "✅ 好きな場所でタップ！";
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });

    // 3. 配置ロジック
    function createARPhoto(data) {
        const entity = document.createElement('a-entity');
        entity.setAttribute('gps-entity-place', `latitude: ${data.lat}; longitude: ${data.lng};`);

        const plane = document.createElement('a-plane');
        plane.setAttribute('look-at', '#myCamera');
        plane.setAttribute('position', '0 2 0'); // 2m浮かせる
        
        // 5mの巨大サイズ
        const size = 5; 
        plane.setAttribute('width', data.aspect >= 1 ? size : size * data.aspect);
        plane.setAttribute('height', data.aspect >= 1 ? size / data.aspect : size);

        // A-Frame 1.5.0で最も安定するマテリアル設定
        plane.setAttribute('material', 'shader: flat; side: double; transparent: true; opacity: 1;');

        // 画像の流し込み（真っ白対策）
        const loader = new THREE.TextureLoader();
        loader.load(data.image, (texture) => {
            const mesh = plane.getObject3D('mesh');
            mesh.material.map = texture;
            mesh.material.needsUpdate = true;
        });

        entity.appendChild(plane);
        scene.appendChild(entity);
        
        const count = document.querySelectorAll('a-plane').length;
        photoCountEl.innerText = count;
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

        // 【デバッグ用】タップした瞬間の座標を確認
        console.log("タップ設置:", currentPos.lat, currentPos.lng);

        const data = { lat: currentPos.lat, lng: currentPos.lng, image: selectedImgUrl, aspect: selectedAspect };
        db.transaction(["photos"], "readwrite").objectStore("photos").add(data);
        createARPhoto(data);

        selectedImgUrl = null;
        fileLabel.innerText = "① 写真を選ぶ";
    };

    window.addEventListener('touchstart', handleTap);
    window.addEventListener('mousedown', handleTap);

    document.getElementById('clearBtn').onclick = () => {
        if (confirm("全消去しますか？")) {
            db.transaction(["photos"], "readwrite").objectStore("photos").clear();
            location.reload();
        }
    };
};