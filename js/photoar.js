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

    // --- IndexedDB: 写真データの保存用 ---
    let db;
    const dbRequest = indexedDB.open("GeoPhotoDB", 1);
    dbRequest.onupgradeneeded = e => {
        e.target.result.createObjectStore("photos", { keyPath: "id", autoIncrement: true });
    };
    dbRequest.onsuccess = e => {
        db = e.target.result;
        loadSavedPhotos(); // 起動時に過去の写真を復元
    };

    // スタート
    startScreen.addEventListener('click', () => {
        startScreen.style.opacity = '0';
        setTimeout(() => {
            startScreen.style.display = 'none';
            mainUI.style.display = 'flex';
            appStarted = true;
        }, 400);
    });

    // 写真選択
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
                fileLabel.innerText = "✅ 画面をタップ！";
                fileLabel.style.background = "#2e7d32";
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });

    // 写真をAR空間に生成
    function createARPhoto(data) {
        const plane = document.createElement('a-plane');
        // GPS位置を指定
        plane.setAttribute('gps-entity-place', `latitude: ${data.lat}; longitude: ${data.lng};`);
        plane.setAttribute('look-at', '#myCamera');
        plane.setAttribute('material', 'shader:flat;side:double;transparent:true');
        
        // サイズ設定
        const size = 3; // GPS空間で見えやすいよう少し大きめ
        if (data.aspect >= 1) {
            plane.setAttribute('width', size);
            plane.setAttribute('height', size / data.aspect);
        } else {
            plane.setAttribute('height', size);
            plane.setAttribute('width', size * data.aspect);
        }

        new THREE.TextureLoader().load(data.image, tex => {
            const mesh = plane.getObject3D('mesh');
            mesh.material.map = tex;
            mesh.material.needsUpdate = true;
        });
        scene.appendChild(plane);
    }

    // 保存データの復元
    function loadSavedPhotos() {
        const transaction = db.transaction(["photos"], "readonly");
        transaction.objectStore("photos").openCursor().onsuccess = e => {
            const cursor = e.target.result;
            if (cursor) {
                createARPhoto(cursor.value);
                cursor.continue();
            }
        };
    }

    // タップで位置取得＆保存
    async function addPhoto(e) {
        if (!appStarted || e.target.closest('.ui-container') || !selectedImgUrl) return;

        navigator.geolocation.getCurrentPosition(pos => {
            const data = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                image: selectedImgUrl,
                aspect: selectedAspect
            };
            
            // 保存
            const tx = db.transaction(["photos"], "readwrite");
            tx.objectStore("photos").add(data);
            
            // 配置
            createARPhoto(data);

            selectedImgUrl = null;
            fileLabel.innerText = "① 写真を選ぶ";
            fileLabel.style.background = "rgba(0,0,0,.7)";
        }, err => alert("GPSをオンにしてください"), { enableHighAccuracy: true });
    }

    window.addEventListener('touchstart', addPhoto);
    window.addEventListener('mousedown', addPhoto);

    // 全消去
    clearBtn.onclick = () => {
        if (confirm("全データを削除しますか？")) {
            db.transaction(["photos"], "readwrite").objectStore("photos").clear();
            location.reload();
        }
    };

    // スクリーンショット保存（お送りいただいたコードを流用）
    shotBtn.addEventListener('click', async () => {
        try {
            const video = document.querySelector('video');
            const glCanvas = scene.canvas;
            const canvas = document.createElement('canvas');
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            const ctx = canvas.getContext('2d');

            // 背景（カメラ）
            const vAspect = video.videoWidth / video.videoHeight;
            const sAspect = canvas.width / canvas.height;
            let sx, sy, sw, sh;
            if (vAspect > sAspect) {
                sw = video.videoHeight * sAspect; sh = video.videoHeight;
                sx = (video.videoWidth - sw) / 2; sy = 0;
            } else {
                sw = video.videoWidth; sh = video.videoWidth / sAspect;
                sx = 0; sy = (video.videoHeight - sh) / 2;
            }
            ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

            // ARレイヤー
            scene.renderer.render(scene.object3D, scene.camera);
            ctx.drawImage(glCanvas, 0, 0, glCanvas.width, glCanvas.height, 0, 0, canvas.width, canvas.height);

            const url = canvas.toDataURL('image/jpeg', 0.8);
            const link = document.createElement('a');
            link.href = url; link.download = `ar-${Date.now()}.jpg`; link.click();
        } catch (e) { console.error(e); }
    });
};