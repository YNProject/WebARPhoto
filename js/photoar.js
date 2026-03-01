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

    // --- IndexedDB: 写真データの保存 ---
    let db;
    const dbRequest = indexedDB.open("GeoPhotoDB_V2", 1);
    dbRequest.onupgradeneeded = e => {
        e.target.result.createObjectStore("photos", { keyPath: "id", autoIncrement: true });
    };
    dbRequest.onsuccess = e => {
        db = e.target.result;
        loadSavedPhotos(); 
    };

    startScreen.addEventListener('click', () => {
        startScreen.style.opacity = '0';
        setTimeout(() => {
            startScreen.style.display = 'none';
            mainUI.style.display = 'flex';
            appStarted = true;
        }, 400);
    });

    // 写真の圧縮と読み込み
    fileInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            const img = new Image();
            img.onload = () => {
                const c = document.createElement('canvas');
                const max = 800; // iOSのメモリ制限対策で少し小さめに設定
                let w = img.width, h = img.height;
                if (w > h && w > max) { h *= max / w; w = max; }
                else if (h > max) { w *= max / h; h = max; }
                c.width = w; c.height = h;
                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                selectedImgUrl = c.toDataURL('image/jpeg', 0.7);
                selectedAspect = w / h;
                fileLabel.innerText = "✅ 設置する場所でタップ！";
                fileLabel.style.background = "#2e7d32";
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });

    // --- AR写真生成ロジック ---
    function createARPhoto(data) {
        const entity = document.createElement('a-entity');
        
        // GPS位置の設定
        entity.setAttribute('gps-entity-place', `latitude: ${data.lat}; longitude: ${data.lng};`);
        
        // 白飛び防止: shader: flat を指定
        const plane = document.createElement('a-plane');
        plane.setAttribute('look-at', '#myCamera');
        plane.setAttribute('material', 'shader: flat; side: double; transparent: true;');
        plane.setAttribute('visible', 'false'); // 読み込み完了まで隠す

        // 距離を監視
        entity.addEventListener('gps-entity-place-update-positon', (event) => {
            // 必要に応じて「30m以内なら大きくする」などの演出を入れる
            console.log(`写真までの距離: ${event.detail.distance}m`);
        });

        const size = 1; // GPSベースだと1m=1単位なので少し大きめにする
        if (data.aspect >= 1) {
            plane.setAttribute('width', size);
            plane.setAttribute('height', size / data.aspect);
        } else {
            plane.setAttribute('height', size);
            plane.setAttribute('width', size * data.aspect);
        }

        const loader = new THREE.TextureLoader();
        loader.load(data.image, (tex) => {
            const mesh = plane.getObject3D('mesh');
            mesh.material.map = tex;
            mesh.material.needsUpdate = true;
            plane.setAttribute('visible', 'true');
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

    // タップで設置
    async function handleTap(e) {
        if (!appStarted || e.target.closest('.ui-container') || !selectedImgUrl) return;

        navigator.geolocation.getCurrentPosition(pos => {
            const data = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                image: selectedImgUrl,
                aspect: selectedAspect
            };
            
            db.transaction(["photos"], "readwrite").objectStore("photos").add(data);
            createARPhoto(data);

            selectedImgUrl = null;
            fileLabel.innerText = "① 写真を選ぶ";
            fileLabel.style.background = "rgba(0,0,0,.7)";
        }, err => alert("GPSをオンにして屋外で試してください"), { enableHighAccuracy: true });
    }

    window.addEventListener('touchstart', handleTap);
    window.addEventListener('mousedown', handleTap);

    // データ全消去
    clearBtn.onclick = () => {
        if (confirm("全データを削除しますか？")) {
            db.transaction(["photos"], "readwrite").objectStore("photos").clear();
            location.reload();
        }
    };
};