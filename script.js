let camera = null;
let pose = null;
let isRunning = false;

// 获取DOM元素
const videoElement = document.createElement('video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');

// 定义动作阈值和状态
const SQUAT_THRESHOLD = 0.3; // 下蹲阈值
const JUMP_THRESHOLD = 0.1;  // 跳跃阈值
let lastY = 0;              // 记录上一帧的Y位置
let isSquatting = false;    // 下蹲状态
let isJumping = false;      // 跳跃状态
let squatCount = 0;         // 下蹲次数
let jumpCount = 0;          // 跳跃次数

// 下蹲识别控制
let isSquatDetectionEnabled = false; // 下蹲识别是否启用
const squatToggleBtn = document.getElementById('squatToggleBtn');
const squatCountDisplay = document.getElementById('squatCount');

// 屈肘抬臂识别控制
let isArmDetectionEnabled = false; // 屈肘抬臂识别是否启用
let armCount = 0; // 屈肘抬臂次数
let lastElbowY = { left: 0, right: 0, avg: undefined }; // 记录上一帧手肘Y位置
let armMovementState = 'none'; // 手臂运动状态：'none', 'rising', 'falling'
let armCycleStarted = false; // 是否开始了一个完整的屈肘抬臂周期
const ARM_MOVEMENT_THRESHOLD = 0.05; // 手臂运动阈值
const armToggleBtn = document.getElementById('armToggleBtn');
const armCountDisplay = document.getElementById('armCount');

// 伸展运动识别控制
let isStretchDetectionEnabled = false; // 伸展运动识别是否启用
let stretchCount = 0; // 伸展运动次数
let stretchMovementState = 'none'; // 伸展运动状态：'none', 'right_on_chest', 'left_on_chest'
const stretchToggleBtn = document.getElementById('stretchToggleBtn');
const stretchCountDisplay = document.getElementById('stretchCount');

// 设置画布大小
function setupCanvas() {
    try {
        // 设置画布为窗口大小
        canvasElement.width = window.innerWidth;
        canvasElement.height = window.innerHeight;
        console.log('Canvas setup complete:', canvasElement.width, 'x', canvasElement.height);
    } catch (error) {
        console.error('Error setting up canvas:', error);
    }
}

// 处理窗口大小变化
window.addEventListener('resize', () => {
    setupCanvas();
});

// 检测下蹲动作
function detectSquat(landmarks) {
    // 只有在启用下蹲识别时才执行检测
    if (!isSquatDetectionEnabled) return;
    
    const hip = landmarks[23]; // 左髋关节
    const knee = landmarks[25]; // 左膝关节
    const ankle = landmarks[27]; // 左踝关节

    // 计算膝关节角度
    const kneeAngle = Math.abs(hip.y - ankle.y);
    
    if (kneeAngle > SQUAT_THRESHOLD && !isSquatting) {
        isSquatting = true;
        squatCount++;
        updateSquatCount();
        updateStatus(`下蹲次数: ${squatCount}, 跳跃次数: ${jumpCount}, 屈肘抬臂次数: ${armCount}, 伸展运动次数: ${stretchCount}`);
    } else if (kneeAngle <= SQUAT_THRESHOLD) {
        isSquatting = false;
    }
}

// 切换下蹲识别状态
function toggleSquatDetection() {
    isSquatDetectionEnabled = !isSquatDetectionEnabled;
    
    if (isSquatDetectionEnabled) {
        squatToggleBtn.textContent = '关闭下蹲识别';
        squatToggleBtn.className = 'squat-toggle enabled';
        // 重置计数器
        squatCount = 0;
        updateSquatCount();
    } else {
        squatToggleBtn.textContent = '启动下蹲识别';
        squatToggleBtn.className = 'squat-toggle disabled';
    }
}

// 更新下蹲计数显示
function updateSquatCount() {
    if (squatCountDisplay) {
        squatCountDisplay.textContent = squatCount;
    }
}

// 检测跳跃动作
function detectJump(landmarks) {
    const hip = landmarks[23]; // 左髋关节
    
    // 计算髋关节的垂直运动
    const deltaY = lastY - hip.y;
    lastY = hip.y;
    
    if (deltaY > JUMP_THRESHOLD && !isJumping) {
        isJumping = true;
        jumpCount++;
        updateStatus(`下蹲次数: ${squatCount}, 跳跃次数: ${jumpCount}, 屈肘抬臂次数: ${armCount}, 伸展运动次数: ${stretchCount}`);
    } else if (deltaY <= JUMP_THRESHOLD) {
        isJumping = false;
    }
}

// 更新状态显示
function updateStatus(message) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = 'success';
}

// 检测屈肘抬臂动作
function detectArmMovement(landmarks) {
    // 只有在启用屈肘抬臂识别时才执行检测
    if (!isArmDetectionEnabled) return;
    
    const leftElbow = landmarks[13];   // 左手肘
    const rightElbow = landmarks[14];  // 右手肘
    const leftShoulder = landmarks[11]; // 左肩
    const rightShoulder = landmarks[12]; // 右肩
    
    // 计算手肘相对于肩膀的位置（使用左右手肘的平均值）
    const avgElbowY = (leftElbow.y + rightElbow.y) / 2;
    const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    
    // 计算手肘相对于肩膀的高度差
    const elbowRelativeY = avgElbowY - avgShoulderY;
    
    // 如果是第一帧，初始化位置
    if (lastElbowY.avg === undefined) {
        lastElbowY.avg = elbowRelativeY;
        return;
    }
    
    // 计算手肘的垂直运动
    const deltaY = elbowRelativeY - lastElbowY.avg;
    lastElbowY.avg = elbowRelativeY;
    
    // 检测运动状态变化
    if (Math.abs(deltaY) > ARM_MOVEMENT_THRESHOLD) {
        if (deltaY < 0) { // 手肘上升（Y值减小表示向上）
            if (armMovementState === 'falling') {
                // 从下降转为上升，完成一个完整周期
                if (armCycleStarted) {
                    armCount++;
                    updateArmCount();
                    updateStatus(`下蹲次数: ${squatCount}, 跳跃次数: ${jumpCount}, 屈肘抬臂次数: ${armCount}, 伸展运动次数: ${stretchCount}`);
                    armCycleStarted = false;
                }
            }
            armMovementState = 'rising';
        } else if (deltaY > 0) { // 手肘下降（Y值增大表示向下）
            if (armMovementState === 'rising') {
                // 从上升转为下降，开始一个周期
                armCycleStarted = true;
            }
            armMovementState = 'falling';
        }
    }
}

// 切换屈肘抬臂识别状态
function toggleArmDetection() {
    isArmDetectionEnabled = !isArmDetectionEnabled;
    
    if (isArmDetectionEnabled) {
        armToggleBtn.textContent = '关闭屈肘抬臂识别';
        armToggleBtn.className = 'arm-toggle enabled';
        // 重置计数器和状态
        armCount = 0;
        armMovementState = 'none';
        armCycleStarted = false;
        lastElbowY = { left: 0, right: 0, avg: undefined };
        updateArmCount();
    } else {
        armToggleBtn.textContent = '启动屈肘抬臂识别';
        armToggleBtn.className = 'arm-toggle disabled';
    }
}

// 更新屈肘抬臂计数显示
function updateArmCount() {
    if (armCountDisplay) {
        armCountDisplay.textContent = armCount;
    }
}

// 计算三点角度（度）
function calculateAngle(point1, point2, point3) {
    const vector1 = { x: point1.x - point2.x, y: point1.y - point2.y };
    const vector2 = { x: point3.x - point2.x, y: point3.y - point2.y };
    
    const dot = vector1.x * vector2.x + vector1.y * vector2.y;
    const mag1 = Math.sqrt(vector1.x * vector1.x + vector1.y * vector1.y);
    const mag2 = Math.sqrt(vector2.x * vector2.x + vector2.y * vector2.y);
    
    const cosAngle = dot / (mag1 * mag2);
    const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);
    
    return angle;
}

// 检测伸展运动
function detectStretchMovement(landmarks) {
    // 只有在启用伸展运动识别时才执行检测
    if (!isStretchDetectionEnabled) return;
    
    const leftShoulder = landmarks[11];  // 左肩
    const rightShoulder = landmarks[12]; // 右肩
    const leftWrist = landmarks[15];     // 左手腕
    const rightWrist = landmarks[16];    // 右手腕
    
    // 计算胸部中心位置（肩膀中点）
    const chestCenterX = (leftShoulder.x + rightShoulder.x) / 2;
    const chestCenterY = (leftShoulder.y + rightShoulder.y) / 2;
    
    // 计算胸口区域的范围（基于肩膀宽度）
    const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
    const chestRadius = shoulderWidth * 0.6; // 增加胸口检测范围，使其更容易被检测到
    
    // 检测左手是否放在胸口
    const leftHandToChestDistance = Math.sqrt(
        Math.pow(leftWrist.x - chestCenterX, 2) + 
        Math.pow(leftWrist.y - chestCenterY, 2)
    );
    const isLeftHandOnChest = leftHandToChestDistance < chestRadius;
    
    // 检测右手是否放在胸口
    const rightHandToChestDistance = Math.sqrt(
        Math.pow(rightWrist.x - chestCenterX, 2) + 
        Math.pow(rightWrist.y - chestCenterY, 2)
    );
    const isRightHandOnChest = rightHandToChestDistance < chestRadius;
    
    // 调试信息：显示距离和阈值（降低频率，每10帧输出一次）
    if (Math.random() < 0.1) {
        console.log(`伸展运动检测：左手距离胸口 ${leftHandToChestDistance.toFixed(3)}, 右手距离胸口 ${rightHandToChestDistance.toFixed(3)}, 阈值 ${chestRadius.toFixed(3)}`);
    }
    
    // 判断当前状态
    let currentState = 'none';
    if (isRightHandOnChest && !isLeftHandOnChest) {
        currentState = 'right_on_chest';
        console.log('伸展运动检测：右手放在胸口');
    } else if (isLeftHandOnChest && !isRightHandOnChest) {
        currentState = 'left_on_chest';
        console.log('伸展运动检测：左手放在胸口');
    } else if (isLeftHandOnChest && isRightHandOnChest) {
        // 双手都在胸口，保持当前状态
        console.log('伸展运动检测：双手都在胸口');
        return;
    } else {
        // 没有手在胸口
        currentState = 'none';
        // console.log('伸展运动检测：没有手在胸口'); // 减少日志输出
        return;
    }
    
    // 检测状态变化并计数
    if (currentState !== 'none' && currentState !== stretchMovementState) {
        if (stretchMovementState === 'right_on_chest' && currentState === 'left_on_chest') {
            // 从右手胸口切换到左手胸口，完成一次伸展运动
            stretchCount++;
            updateStretchCount();
            updateStatus(`下蹲次数: ${squatCount}, 跳跃次数: ${jumpCount}, 屈肘抬臂次数: ${armCount}, 伸展运动次数: ${stretchCount}`);
            console.log('伸展运动检测：完成一次伸展运动，计数:', stretchCount);
        } else if (stretchMovementState === 'left_on_chest' && currentState === 'right_on_chest') {
            // 从左手胸口切换到右手胸口，也算一次（双向计数）
            stretchCount++;
            updateStretchCount();
            updateStatus(`下蹲次数: ${squatCount}, 跳跃次数: ${jumpCount}, 屈肘抬臂次数: ${armCount}, 伸展运动次数: ${stretchCount}`);
            console.log('伸展运动检测：完成一次伸展运动，计数:', stretchCount);
        }
        
        stretchMovementState = currentState;
    }
}

// 切换伸展运动识别状态
function toggleStretchDetection() {
    isStretchDetectionEnabled = !isStretchDetectionEnabled;
    
    if (isStretchDetectionEnabled) {
        stretchToggleBtn.textContent = '关闭伸展运动识别';
        stretchToggleBtn.className = 'stretch-toggle enabled';
        // 重置计数器和状态
        stretchCount = 0;
        stretchMovementState = 'none';
        updateStretchCount();
    } else {
        stretchToggleBtn.textContent = '启动伸展运动识别';
        stretchToggleBtn.className = 'stretch-toggle disabled';
    }
}

// 更新伸展运动计数显示
function updateStretchCount() {
    if (stretchCountDisplay) {
        stretchCountDisplay.textContent = stretchCount;
    }
}

// 初始化MediaPipe Pose
async function initializePose() {
    try {
        console.log('Initializing MediaPipe Pose...');
        pose = new Pose({
            locateFile: (file) => {
                const url = `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
                console.log('Loading MediaPipe file:', url);
                return url;
            }
        });

        pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            enableSegmentation: true,
            smoothSegmentation: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        pose.onResults(onResults);

        await pose.initialize();
        console.log('MediaPipe Pose initialized successfully');
    } catch (error) {
        console.error('Error initializing MediaPipe Pose:', error);
    }
}

// 处理识别结果
function onResults(results) {
    if (!isRunning) return;

    try {
        // 清除画布
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

        // 计算视频显示尺寸和位置
        const canvasAspect = canvasElement.width / canvasElement.height;
        const videoAspect = results.image.width / results.image.height;

        let drawWidth, drawHeight, offsetX, offsetY;

        if (canvasAspect > videoAspect) {
            // 画布较宽，视频高度填充
            drawHeight = canvasElement.height;
            drawWidth = drawHeight * videoAspect;
            offsetX = (canvasElement.width - drawWidth) / 2;
            offsetY = 0;
        } else {
            // 画布较高，视频宽度填充
            drawWidth = canvasElement.width;
            drawHeight = drawWidth / videoAspect;
            offsetX = 0;
            offsetY = (canvasElement.height - drawHeight) / 2;
        }

        // 绘制视频帧
        canvasCtx.save();
        canvasCtx.drawImage(results.image, offsetX, offsetY, drawWidth, drawHeight);

        if (results.poseLandmarks) {
            // 检测动作
            detectSquat(results.poseLandmarks);
            detectJump(results.poseLandmarks);
            detectArmMovement(results.poseLandmarks);
            detectStretchMovement(results.poseLandmarks);

            // 设置绘制区域
            canvasCtx.beginPath();
            canvasCtx.rect(offsetX, offsetY, drawWidth, drawHeight);
            canvasCtx.clip();

            // 绘制骨架连接线
            canvasCtx.save();
            canvasCtx.translate(offsetX, offsetY);
            
            // 绘制连接线
            drawConnectors(
                canvasCtx,
                results.poseLandmarks,
                POSE_CONNECTIONS,
                {color: '#00FF00', lineWidth: 3}
            );

            // 绘制关键点
            drawLandmarks(
                canvasCtx,
                results.poseLandmarks,
                {
                    color: '#FF0000',
                    lineWidth: 2,
                    radius: 4,
                    visibilityMin: 0.65
                }
            );
            
            canvasCtx.restore();
        }

        canvasCtx.restore();

    } catch (error) {
        console.error('Error in onResults:', error);
    }
}

// 初始化摄像头
function initializeCamera() {
    try {
        console.log('Initializing camera...');
        camera = new Camera(videoElement, {
            onFrame: async () => {
                if (isRunning && pose) {
                    try {
                        await pose.send({image: videoElement});
                    } catch (error) {
                        console.error('Error sending frame to pose:', error);
                    }
                }
            },
            width: 1280,
            height: 720
        });
        console.log('Camera initialized successfully');
    } catch (error) {
        console.error('Error initializing camera:', error);
    }
}

// 开始识别
async function startDetection() {
    try {
        if (!isRunning) {
            console.log('Starting detection...');
            isRunning = true;
            await camera.start();
            startBtn.disabled = true;
            stopBtn.disabled = false;
            console.log('Detection started successfully');
            
            // 重置计数器
            squatCount = 0;
            jumpCount = 0;
            armCount = 0;
            stretchCount = 0;
            updateSquatCount(); // 更新下蹲计数显示
            updateArmCount(); // 更新屈肘抬臂计数显示
            updateStretchCount(); // 更新伸展运动计数显示
            updateStatus(`下蹲次数: ${squatCount}, 跳跃次数: ${jumpCount}, 屈肘抬臂次数: ${armCount}, 伸展运动次数: ${stretchCount}`);
        }
    } catch (error) {
        console.error('Error starting detection:', error);
        alert('启动摄像头失败，请确保已授予摄像头访问权限，并刷新页面重试。');
        isRunning = false;
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
}

// 停止识别
function stopDetection() {
    try {
        if (isRunning) {
            console.log('Stopping detection...');
            isRunning = false;
            camera.stop();
            startBtn.disabled = false;
            stopBtn.disabled = true;
            // 清除画布
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
            console.log('Detection stopped successfully');
            
            // 显示最终结果
            const status = document.getElementById('status');
            status.textContent = `最终结果 - 下蹲次数: ${squatCount}, 跳跃次数: ${jumpCount}, 屈肘抬臂次数: ${armCount}, 伸展运动次数: ${stretchCount}`;
            status.className = 'success';
            
            // 重置下蹲识别状态
            if (isSquatDetectionEnabled) {
                toggleSquatDetection();
            }
            
            // 重置屈肘抬臂识别状态
            if (isArmDetectionEnabled) {
                toggleArmDetection();
            }
            
            // 重置伸展运动识别状态
            if (isStretchDetectionEnabled) {
                toggleStretchDetection();
            }
        }
    } catch (error) {
        console.error('Error stopping detection:', error);
    }
}

// 初始化应用
async function initialize() {
    try {
        console.log('Initializing application...');
        setupCanvas();
        await initializePose();
        initializeCamera();
        
        // 添加按钮事件监听
        startBtn.addEventListener('click', startDetection);
        stopBtn.addEventListener('click', stopDetection);
        squatToggleBtn.addEventListener('click', toggleSquatDetection);
        armToggleBtn.addEventListener('click', toggleArmDetection);
        stretchToggleBtn.addEventListener('click', toggleStretchDetection);
        stopBtn.disabled = true;
        console.log('Application initialized successfully');
    } catch (error) {
        console.error('Error during initialization:', error);
    }
}

// 确保DOM完全加载后再初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
} 