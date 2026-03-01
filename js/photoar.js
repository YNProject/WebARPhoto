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

    // 1. 常にGPSを監視してデバッグ表示を更新
    navigator.geolocation.watchPosition(pos => {
        currentPos.lat = pos.coords.latitude;
        currentPos.lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;
        debugPanel.innerHTML = `緯度: ${currentPos.lat.toFixed(6)}<br>経度: ${currentPos.lng.toFixed(6)}<br>精度: 約${Math.round(accuracy)}m<br>表示中: <span id="photo-count">${photoCountEl.innerText}</span>枚`;
    }, err => {
        debugPanel.innerHTML = "<span style='color:red;'>GPSエラー: 許可を確認してください</span>";
    }, { enableHighAccuracy: true });

    // 2. データベース接続
    let db;
    const dbRequest = indexedDB.open("GeoPhotoDB_V4", 1);
    dbRequest.onupgradeneeded = e => {
        e.target.result.createObjectStore("photos", { keyPath: "id", autoIncrement: true });
    };
    dbRequest.onsuccess = e => {
        db = e.target.result;
        loadSavedPhotos();
    };

    // アプリ開始
    startScreen.addEventListener('click', () => {
        startScreen.style.opacity = '0';
        setTimeout(() => {
            startScreen.style.display = 'none';
            mainUI.style.display = 'flex';
            appStarted = true;
        }, 400);
    });

    // 写真読み込み
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
                selectedImgUrl = c.toDataURL('image/jpeg', 0.8);
                selectedAspect = w / h;
                fileLabel.innerText = "✅ 周りを見回してタップ！";
                fileLabel.style.background = "#2e7d32";
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });

    // 3. 写真生成（巨大化 & 高度アップ版）
    function createARPhoto(data) {
        const entity = document.createElement('a-entity');
        entity.setAttribute('gps-entity-place', `latitude: ${data.lat}; longitude: ${data.lng};`);

        const plane = document.createElement('a-plane');
        plane.setAttribute('look-at', '#myCamera');
        
        // 地面に埋まらないように2m浮かせる
        plane.setAttribute('position', '0 2 0');

        plane.setAttribute('material', {
            src: data.image,
            shader: 'flat',
            transparent: true,
            side: 'double'
        });

        // 見つけやすいように10メートルの巨大看板サイズに設定
        const size = 10; 
        if (data.aspect >= 1) {
            plane.setAttribute('width', size);
            plane.setAttribute('height', size / data.aspect);
        } else {
            plane.setAttribute('height', size);
            plane.setAttribute('width', size * data.aspect);
        }

        entity.appendChild(plane);
        scene.appendChild(entity);
        
        // カウントをUIに反映
        photoCountEl.innerText = document.querySelectorAll('a-plane').length;
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

    // タップ設置
    const handleTap = (e) => {
        // UI操作時は反応させない
        if (!appStarted || e.target.closest('.ui-container') || !selectedImgUrl) return;

        const data = {
            lat: currentPos.lat,
            lng: currentPos.lng,
            image: selectedImgUrl,
            aspect: selectedAspect
        };

        const tx = db.transaction(["photos"], "readwrite");
        tx.objectStore("photos").add(data);
        createARPhoto(data);

        selectedImgUrl = null;
        fileLabel.innerText = "① 写真を選ぶ";
        fileLabel.style.background = "rgba(0,0,0,.7)";
    };

    window.addEventListener('touchstart', handleTap);
    window.addEventListener('mousedown', handleTap);

    document.getElementById('clearBtn').onclick = () => {
        if (confirm("保存した写真をすべて削除しますか？")) {
            db.transaction(["photos"], "readwrite").objectStore("photos").clear();
            location.reload();
        }
    };
};