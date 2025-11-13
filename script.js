const socket = io('http://127.0.0.1:5000');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const videoInput = document.getElementById('video-input');
const statusDiv = document.getElementById('status');
const videoContainer = document.getElementById('video-container');
const progressContainer = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');

const predictQueue = [];
const predictMap = new Map()

let tmp = 0;

function getPredictPlate(new_plate){
    if(!new_plate){
      tmp += 1;
    }
    if(new_plate){
      tmp = 0;
      predictQueue.push(new_plate);
      predictMap.set(new_plate, (predictMap.get(new_plate) || 0) + 1);

      if (predictQueue.length > 10) {
        const old = predictQueue.shift();
        predictMap.set(old, predictMap.get(old) - 1);
        if (predictMap.get(old) === 0) predictMap.delete(old);
      }

      if (predictMap.size === 0) return null;
    }

    let mode = null;
    let maxCount = -Infinity;

    for (const [value, count] of predictMap.entries()) {
      if (count > maxCount) {
        maxCount = count;
        mode = value;
      }
    }
    if(tmp === 10){
      predictQueue.length = 0;
      predictMap.clear();
      return 'None';
    }
    return mode;
}


function showStatus(message, type) {
    statusDiv.innerHTML = `<div class="status ${type}">${message}</div>`;
}

videoInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    showStatus('업로드 중...', 'processing');
    videoContainer.style.display = 'none';
    
    // 파일을 Base64로 변환
    const reader = new FileReader();
    reader.onload = (event) => {
        socket.emit('upload_video', {
            video: event.target.result
        });
    };
    reader.readAsDataURL(file);
});

socket.on('upload_success', (data) => {
    showStatus('업로드 완료! 번호판 인식 중...', 'processing');
    videoContainer.style.display = 'grid';
});

socket.on('video_info', (data) => {
    document.getElementById('fps-value').textContent = data.fps;
});

socket.on('frame', (data) => {
    // 캔버스에 프레임 그리기
    const img = new Image();
    img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
    };
    img.src = 'data:image/jpeg;base64,' + data.frame;
    
    // 탐지된 번호판 표시
    const detectionsDiv = document.getElementById('detections');
    if (data.detections.length > 0) {
        detectionsDiv.innerHTML = data.detections.map(det => {
            const bgColor = '#d4edda';
            const textColor = '#155724';
            const txt = getPredictPlate(det.status === 'success' ? det.plate_text : null);
            return `
                <div class="detection-item" style="background: ${bgColor};">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: ${textColor}; font-size: 20px; font-weight: bold;">
                            Detected reliable plate: ${txt}
                        </span>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        detectionsDiv.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">번호판이 탐지되지 않았습니다</p>';
    }
});

socket.on('completed', (data) => {
    showStatus(`분석 완료!`);
    progressFill.style.width = '100%';
    progressFill.textContent = '100%';
});

socket.on('error', (data) => {
    showStatus('오류: ' + data.message, 'error');
});

socket.on('connect', () => {
    console.log('WebSocket connected');
});

socket.on('disconnect', () => {
    console.log('WebSocket disconnected');
});