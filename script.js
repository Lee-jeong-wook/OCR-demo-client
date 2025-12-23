const socket = io('http://192.168.10.110:5000');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const videoInput = document.getElementById('video-input');
const picInput = document.getElementById('pic-input');
const statusDiv = document.getElementById('status');
const videoContainer = document.getElementById('video-container');

let predictQueue = [];
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
    predictQueue = [];
    predictMap.clear();
    // 파일을 Base64로 변환
    const reader = new FileReader();
    reader.onload = (event) => {
        socket.emit('upload_video', {
            video: event.target.result
        });
    };
    videoInput.value = null;
    reader.readAsDataURL(file);
});
    
socket.on('upload_success', (data) => {
    showStatus('번호판 인식 중...', 'processing');
    videoContainer.style.display = 'grid';
});

let previousImageUrl = null;

socket.on('frame', (data) => {
    const blob = new Blob([data.frame], { type: 'image/jpeg' });
    const imageUrl = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        if (previousImageUrl) {
            URL.revokeObjectURL(previousImageUrl);
        }
        previousImageUrl = imageUrl;
    };
    img.src = imageUrl;
    
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

socket.on('video_info', (data) => {
    document.querySelector(".video_time").textContent = data.duration;
});

socket.on('completed', (data) => {
    showStatus(`분석 완료`, 'success');
    document.querySelector(".video_play_time").textContent = data.video_play_time;
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


const picPreviewContainer = document.getElementById('pic-preview-container');
const processPicBtn = document.getElementById('process-pic-btn');
const picStatusDiv = document.getElementById('pic-status');

function showPicStatus(message, type) {
    picStatusDiv.innerHTML = `<div class="status ${type}">${message}</div>`;
}

document.querySelectorAll("nav>div").forEach(e => {
    e.addEventListener("click", ()=> {
    if(e.classList.contains("active")) return;
    for(i of e.parentElement.children){
        i.classList.toggle("active");
    }
    for(i of document.querySelectorAll(".container>.content")){
        i.classList.toggle("active");
    }
    })
})  
picInput.addEventListener('click', (e) => {
    e.target.value = null;
})

picInput.addEventListener('change', (e) => {
    const resDiv = document.getElementById("pic-results");
    resDiv.style.display = 'none';
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    selectedPicFiles = files;
    showPicStatus(`${files.length}개의 사진들 처리중....`, 'processing');
    const formData = new FormData();
    selectedPicFiles.forEach(file => {
        formData.append('images', file);
    });
    console.log(formData.getAll('images'))
    
    try {
        
        fetch(`http://192.168.10.110:5000/process_images`, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            console.log(data)
            if (data.success) {
                const linkSource = `data:application/zip;base64,${data.zip_file}`;
                const downloadLink = document.querySelector('#res-download');
                downloadLink.href = linkSource;
                downloadLink.download = data.filename;

                const chartImg = document.getElementById('chart-image');
                chartImg.src = data.chart_data;
                showPicStatus(`성공`, 'success');
                resDiv.style.display = 'block';
            } else {
                alert('처리 실패: ' + data.error);
            }
        }) 
        
    } catch (error) {
        console.log(error);
        showPicStatus(`오류: ${error.message}`, 'error');
    }
});