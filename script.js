// WebSocket connection using native WebSocket API
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${wsProtocol}//localhost:5000/ws`;
let socket = null;
let sessionId = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const imageInput = document.getElementById('image-input');
const picInput = document.getElementById('pic-input');
const statusDiv = document.getElementById('status');
const imageContainer = document.getElementById('image-container');

let predictQueue = [];
const predictMap = new Map();

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

function connectWebSocket() {
    // 이미 연결되어 있으면 닫기
    if (socket && socket.readyState !== WebSocket.CLOSED) {
        socket.close();
    }
    
    try {
        socket = new WebSocket(wsUrl);
        
        socket.onopen = () => {
            console.log('WebSocket connected');
            reconnectAttempts = 0;
            showStatus('서버에 연결되었습니다', 'success');
        };
        
        socket.onmessage = (event) => {
            try {
                const data = event.data;
                handleWebSocketMessage(data);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
                console.error('Raw message:', event.data);
            }
        };
        
        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            // onclose에서 처리하므로 여기서는 로그만
        };
        
        socket.onclose = (event) => {
            console.log('WebSocket disconnected', event.code, event.reason);
            
            // 정상 종료가 아닌 경우에만 재연결 시도
            if (event.code !== 1000 && event.code !== 1001) {
                showStatus('서버 연결이 끊어졌습니다. 재연결 시도 중...', 'error');
                
                // 재연결 시도
                if (reconnectAttempts < maxReconnectAttempts) {
                    reconnectAttempts++;
                    const delay = Math.min(1000 * reconnectAttempts, 5000);
                    console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
                    setTimeout(connectWebSocket, delay);
                } else {
                    showStatus('서버 재연결 실패. 페이지를 새로고침해주세요.', 'error');
                }
            } else {
                showStatus('서버 연결이 종료되었습니다', 'error');
            }
        };
    } catch (error) {
        console.error('Failed to create WebSocket:', error);
        showStatus('서버 연결 실패: ' + error.message, 'error');
        
        // 재연결 시도
        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            const delay = Math.min(1000 * reconnectAttempts, 5000);
            setTimeout(connectWebSocket, delay);
        }
    }
}

function handleWebSocketMessage(data) {
    data = JSON.parse(data);
    const type = data.type;
    
    switch(type) {
        case 'connected':
            sessionId = data.session_id;
            console.log('Session ID:', sessionId);
            break;
            
        case 'upload_success':
            showStatus('이미지 처리 중...', 'processing');
            imageContainer.style.display = 'grid';
            break;
            
        case 'frame':
            handleFrame(data);
            break;
            
        case 'completed':
            showStatus('분석 완료', 'success');
            if (data.plates && data.plates.length > 0) {
                console.log('인식된 번호판:', data.plates);
            }
            break;
            
        case 'error':
            showStatus('오류: ' + data.message, 'error');
            break;
            
        case 'received':
            console.log('Received confirmation:', data.message);
            break;
            
        default:
            console.log('Unknown message type:', type, data);
    }
}

let previousImageUrl = null;

function handleFrame(data) {
    if (!data || !data.frame) {
        console.warn('Invalid frame data received');
        return;
    }
    
    try {
        // Decode base64 frame data
        const binaryString = atob(data.frame);
        console.log(`Received frame of size: ${binaryString.length} bytes`);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'image/jpeg' });
        const imageUrl = URL.createObjectURL(blob);

        const img = new Image();
        img.onerror = () => {
            console.error('Failed to load image');
            if (imageUrl) URL.revokeObjectURL(imageUrl);
        };
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
        if (data.detections && data.detections.length > 0) {
            detectionsDiv.innerHTML = data.detections.map(det => {
                const bgColor = '#d4edda';
                const textColor = '#155724';
                const txt = getPredictPlate(det.status === 'success' ? det.plate_text : null);
                if (txt === null) return '';
                return `
                    <div class="detection-item" style="background: ${bgColor};">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: ${textColor}; font-size: 20px; font-weight: bold;">
                                Detected reliable plate: ${txt}
                            </span>
                        </div>
                    </div>
                `;
            }).filter(html => html !== '').join('');
        } else {
            detectionsDiv.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">번호판이 탐지되지 않았습니다</p>';
        }
    } catch (error) {
        console.error('Error processing frame:', error);
    }
}

function sendWebSocketMessage(type, data) {
    if (!socket) {
        console.error('WebSocket is not initialized');
        showStatus('서버 연결을 초기화하는 중...', 'error');
        connectWebSocket();
        // 연결 대기 후 재시도
        setTimeout(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                sendWebSocketMessage(type, data);
            } else {
                showStatus('서버 연결 실패. 잠시 후 다시 시도해주세요.', 'error');
            }
        }, 1000);
        return;
    }
    
    if (socket.readyState === WebSocket.OPEN) {
        try {
            const message = {
                type: type,
                ...data
            };
            socket.send(JSON.stringify(message));
        } catch (error) {
            console.error('Error sending WebSocket message:', error);
            showStatus('메시지 전송 실패: ' + error.message, 'error');
        }
    } else if (socket.readyState === WebSocket.CONNECTING) {
        console.log('WebSocket is connecting, waiting...');
        setTimeout(() => sendWebSocketMessage(type, data), 500);
    } else {
        console.error('WebSocket is not connected. State:', socket.readyState);
        showStatus('서버에 연결되지 않았습니다. 재연결 시도 중...', 'error');
        connectWebSocket();
        // 재연결 후 재시도
        setTimeout(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                sendWebSocketMessage(type, data);
            }
        }, 2000);
    }
}

function showStatus(message, type) {
    statusDiv.innerHTML = `<div class="status ${type}">${message}</div>`;
}

// Initialize WebSocket connection
connectWebSocket();

// 이미지 업로드 처리 (Base64 또는 Binary)
imageInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // 이미지 파일인지 확인
    if (!file.type.startsWith('image/')) {
        showStatus('이미지 파일만 업로드 가능합니다', 'error');
        imageInput.value = null;
        return;
    }
    
    // WebSocket 연결 확인
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        showStatus('서버에 연결되지 않았습니다. 연결을 기다리는 중...', 'error');
        const checkConnection = setInterval(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                clearInterval(checkConnection);
                e.target.dispatchEvent(new Event('change'));
            } else if (socket && socket.readyState === WebSocket.CLOSED) {
                clearInterval(checkConnection);
                showStatus('서버 연결 실패. 페이지를 새로고침해주세요.', 'error');
            }
        }, 500);
        
        setTimeout(() => {
            clearInterval(checkConnection);
            if (!socket || socket.readyState !== WebSocket.OPEN) {
                showStatus('서버 연결 시간 초과', 'error');
            }
        }, 10000);
        return;
    }
    
    // 파일 크기 체크 (10MB 제한)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
        showStatus('파일 크기가 너무 큽니다. (최대 10MB)', 'error');
        imageInput.value = null;
        return;
    }
    
    showStatus('업로드 중...', 'processing');
    imageContainer.style.display = 'none';
    predictQueue = [];
    predictMap.clear();
    tmp = 0;
    
    // 작은 파일은 Base64로, 큰 파일은 Binary로 전송
    // const useBase64 = file.size < 5 * 1024 * 1024; // 5MB 이하는 Base64
    useBase64 = false;
    
    if (useBase64) {
        console.log('Sending file as Base64');
        // Base64로 전송
        const reader = new FileReader();
        reader.onerror = () => {
            showStatus('파일 읽기 실패', 'error');
            imageInput.value = null;
        };
        reader.onload = (event) => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                const base64Data = event.target.result.split(',')[1]; // data:image/...;base64, 제거
                sendWebSocketMessage('buffer_image', {
                    data: base64Data
                });
            } else {
                showStatus('서버 연결이 끊어졌습니다', 'error');
            }
        };
        reader.readAsDataURL(file);
    } else {
        const reader = new FileReader();

        reader.onerror = () => {
            console.error('❌ 파일 읽기 실패');
            // imageInput.value = null; // 필요시 추가
        };

        reader.onload = (event) => {
            if (!socket || socket.readyState !== WebSocket.OPEN) {
                console.error('❌ 서버 연결이 끊어졌습니다');
                return;
            }
        
            try {
                // Raw Buffer 데이터
                const arrayBuffer = event.target.result;
                const fileBytes = new Uint8Array(arrayBuffer);

                console.log(`\n📤 Sending image as Raw Buffer '${file.name}'`);
                console.log(`📦 File size: ${fileBytes.length} bytes`);
                console.log(`🔍 First 10 bytes:`, Array.from(fileBytes.slice(0, 10)));
                console.log(`🔌 WebSocket readyState: ${socket.readyState}`);
                console.log(`🔌 WebSocket bufferedAmount before: ${socket.bufferedAmount}`);

                // Blob으로 변환해서 전송
                const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });

                console.log(`📦 Blob size: ${blob.size} bytes, type: ${blob.type}`);

                // Blob을 바이너리로 전송
                socket.send(blob);

                console.log(`🔌 WebSocket bufferedAmount after: ${socket.bufferedAmount}`);
                console.log('✅ Image sent as Raw Buffer! Waiting for server response...');

                // 서버 응답 대기
                setTimeout(() => {
                    if (socket.bufferedAmount > 0) {
                        console.warn('⚠️ 아직 전송 중입니다...');
                    }
                }, 1000);

            } catch (ex) {
                console.error(`❌ An error occurred: ${ex.message}`);
                console.error(ex);
            }
        };
        reader.readAsArrayBuffer(file);
    }
    imageInput.value = null;
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