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

    // GPS監視
    navigator.geolocation.watchPosition(pos => {
        currentPos.lat = pos.coords.latitude;
        currentPos.lng = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy);
        debugPanel.childNodes[0].nodeValue = `緯度: ${currentPos.lat.toFixed(6)} 経度: ${currentPos.lng.toFixed(6)} 精度: ${accuracy}m`;
    }, null, { enableHighAccuracy: true });

    // IndexedDB
    let db;
    const dbRequest = indexedDB.open("GeoPhotoDB_V150", 1);
    dbRequest.onupgradeneeded = e => e.target.result.createObjectStore("photos", { keyPath: "id", autoIncrement: true });
    dbRequest.onsuccess = e => { db = e.target.result; loadSavedPhotos(); };

    startScreen.addEventListener('click', () => {
        startScreen.style.opacity = '0';
        setTimeout(() => { startScreen.style.display = 'none'; mainUI.style.display = 'flex'; appStarted = true; }, 400);
    });

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
                fileLabel.innerText = "✅ 設置OK!";
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });

    function createARPhoto(data) {
        // 1.5.0ではentityを先に作成してsceneに追加してから属性をセットするのが安定
        const entity = document.createElement('a-entity');
        scene.appendChild(entity);

        entity.setAttribute('gps-entity-place', {
            latitude: data.lat,
            longitude: data.lng
        });

        const plane = document.createElement('a-plane');
        // A-Frame 1.5.0対応のmaterial指定
        plane.setAttribute('material', `src: ${data.image}; shader: flat; transparent: true; side: double;`);
        plane.setAttribute('look-at', '#myCamera');
        plane.setAttribute('position', '0 2 0'); // 高さを2mに
        
        const size = 10; // 巨大サイズ
        if (data.aspect >= 1) {
            plane.setAttribute('width', size);
            plane.setAttribute('height', size / data.aspect);
        } else {
            plane.setAttribute('height', size);
            plane.setAttribute('width', size * data.aspect);
        }

        entity.appendChild(plane);
        photoCountEl.innerText = document.querySelectorAll('a-plane').length;
    }

    function loadSavedPhotos() {
        const tx = db.transaction(["photos"], "readonly");
        tx.objectStore("photos").openCursor().onsuccess = e => {
            const cursor = e.target.result;
            if (cursor) { createARPhoto(cursor.value); cursor.continue(); }
        };
    }

    const handleTap = (e) => {
        if (!appStarted || e.target.closest('.ui-container') || e.target.closest('#debug-panel') || !selectedImgUrl) return;
        const data = { lat: currentPos.lat, lng: currentPos.lng, image: selectedImgUrl, aspect: selectedAspect };
        db.transaction(["photos"], "readwrite").objectStore("photos").add(data);
        createARPhoto(data);
        selectedImgUrl = null;
        fileLabel.innerText = "① 写真を選ぶ";
    };

    window.addEventListener('touchstart', handleTap);
    window.addEventListener('mousedown', handleTap);

    // 強制召喚（デバッグ用）
    document.getElementById('force-show').addEventListener('click', () => {
        if(!selectedImgUrl) { alert("写真を選んでください"); return; }
        // 0.00005度は約5メートル北
        createARPhoto({
            lat: currentPos.lat + 0.00005,
            lng: currentPos.lng,
            image: selectedImgUrl,
            aspect: selectedAspect
        });
        alert("少し北側に召喚しました。周囲を確認してください。");
    });

    document.getElementById('clearBtn').onclick = () => {
        if (confirm("全消去しますか？")) {
            db.transaction(["photos"], "readwrite").objectStore("photos").clear();
            location.reload();
        }
    };
};