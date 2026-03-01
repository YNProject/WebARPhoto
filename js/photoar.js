window.onload = () => {
    const scene = document.querySelector('a-scene');
    const fileInput = document.getElementById('fileInput');
    const fileLabel = document.getElementById('fileLabel');
    const shotBtn = document.getElementById('shotBtn');
    const clearBtn = document.getElementById('clearBtn');
    const startScreen = document.getElementById('start-screen');
    const mainUI = document.getElementById('main-ui');

    let selectedImgUrl = null;
    let selectedAspect = 1;
    let appStarted = false;

    // --- IndexedDB 初期化 ---
    let db;
    const request = indexedDB.open("PhotoAR_DB", 1);
    request.onupgradeneeded = (e) => {
        db = e.target.result;
        db.createObjectStore("photos", { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = (e) => {
        db = e.target.result;
        loadSavedPhotos(); // 起動時に保存済みデータを表示
    };

    // アプリ開始処理
    startScreen.addEventListener('click', () => {
        startScreen.style.opacity = '0';
        setTimeout(() => {
            startScreen.style.display = 'none';
            mainUI.style.display = 'flex';
            appStarted = true;
        }, 400);
    });

    // --- 写真の読み込みとリサイズ ---
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
                
                fileLabel.innerText = "✅ 設置する場所でタップ！";
                fileLabel.style.background = "#2e7d32";
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });

    // --- 設置 & 位置情報取得 & 保存 ---
    async function handleTap(e) {
        if (!appStarted || e.target.closest('.ui-container') || !selectedImgUrl) return;

        // 現在の位置を取得（タップした瞬間に取得）
        navigator.geolocation.getCurrentPosition((pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;

            const photoData = {
                lat: lat,
                lng: lng,
                image: selectedImgUrl,
                aspect: selectedAspect,
                timestamp: Date.now()
            };

            // DBに保存
            const transaction = db.transaction(["photos"], "readwrite");
            transaction.objectStore("photos").add(photoData);

            // AR空間に表示
            createARPhoto(photoData);

            // UIを元に戻す
            selectedImgUrl = null;
            fileLabel.innerText = "① 写真を選ぶ";
            fileLabel.style.background = "rgba(0,0,0,.75)";
        }, (err) => {
            alert("位置情報が取得できませんでした。設定を確認してください。");
        }, { enableHighAccuracy: true });
    }

    // AR要素を生成する関数
    function createARPhoto(data) {
        const plane = document.createElement('a-plane');
        plane.setAttribute('gps-entity-place', `latitude: ${data.lat}; longitude: ${data.lng};`);
        plane.setAttribute('look-at', '#myCamera'); 
        plane.setAttribute('scale', '15 15 15'); 
        plane.setAttribute('material', 'shader:flat; side:double; transparent:true');
        
        new THREE.TextureLoader().load(data.image, tex => {
            const mesh = plane.getObject3D('mesh');
            mesh.material.map = tex;
            mesh.material.needsUpdate = true;
            const baseSize = 2;
            if (data.aspect >= 1) {
                plane.setAttribute('width', baseSize);
                plane.setAttribute('height', baseSize / data.aspect);
            } else {
                plane.setAttribute('height', baseSize);
                plane.setAttribute('width', baseSize * data.aspect);
            }
        });
        scene.appendChild(plane);
    }

    // 保存済みデータの読み込み
    function loadSavedPhotos() {
        const transaction = db.transaction(["photos"], "readonly");
        const store = transaction.objectStore("photos");
        store.openCursor().onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                createARPhoto(cursor.value);
                cursor.continue();
            }
        };
    }

    // データ全消去
    clearBtn.onclick = () => {
        if(confirm("保存したすべての写真を削除しますか？")) {
            const transaction = db.transaction(["photos"], "readwrite");
            transaction.objectStore("photos").clear();
            location.reload();
        }
    };

    window.addEventListener('mousedown', handleTap);
    window.addEventListener('touchstart', handleTap, { passive: false });

    // スクリーンショット保存（簡易版）
    shotBtn.onclick = () => {
        const canvas = scene.renderer.domElement;
        const url = canvas.toDataURL('image/jpeg');
        const a = document.createElement('a');
        a.href = url; a.download = `ar-photo-${Date.now()}.jpg`; a.click();
    };
};