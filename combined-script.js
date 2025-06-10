let my_camera = null;
let pose = null;
let isRunning = false;
let availableCameras = [];
let selectedCameraId = null;

// 获取DOM元素
const videoElement = document.createElement('video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const screenshotBtn = document.getElementById('screenshotBtn');
const galleryBtn = document.getElementById('galleryBtn');
const cameraSelect = document.getElementById('cameraSelect');

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

// 屈臂触发粒子效果的状态
let armSplitCooldownActive = false;
let armSplitCooldownTimeout = null;
const ARM_SPLIT_COOLDOWN_TIME = 4000; // 4秒冷却时间

// 伸展运动识别控制
let isStretchDetectionEnabled = false; // 伸展运动识别是否启用
let stretchCount = 0; // 伸展运动次数
let stretchMovementState = 'none'; // 伸展运动状态：'none', 'right_on_chest', 'left_on_chest'
const stretchToggleBtn = document.getElementById('stretchToggleBtn');
const stretchCountDisplay = document.getElementById('stretchCount');

// 伸展触发粒子效果的状态
let stretchCooldownActive = false;
let stretchCooldownTimeout = null;
const STRETCH_COOLDOWN_TIME = 5000; // 5秒冷却时间

// 截屏计数显示
const screenshotCountDisplay = document.getElementById('screenshotCountDisplay');

// 获取可用摄像头列表
async function getCameraList() {
    try {
        // 首先请求摄像头权限
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        // 立即停止流，我们只是为了获取权限
        stream.getTracks().forEach(track => track.stop());
        
        // 获取设备列表
        const devices = await navigator.mediaDevices.enumerateDevices();
        availableCameras = devices.filter(device => device.kind === 'videoinput');
        
        // 更新下拉框
        updateCameraSelect();
        
        console.log('找到摄像头:', availableCameras.length, '个');
        return availableCameras;
    } catch (error) {
        console.error('获取摄像头列表失败:', error);
        cameraSelect.innerHTML = '<option value="">无法访问摄像头</option>';
        return [];
    }
}

// 更新摄像头选择下拉框
function updateCameraSelect() {
    cameraSelect.innerHTML = '';
    
    if (availableCameras.length === 0) {
        cameraSelect.innerHTML = '<option value="">未找到摄像头</option>';
        return;
    }
    
    // 添加默认选项
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '选择摄像头...';
    cameraSelect.appendChild(defaultOption);
    
    // 添加每个摄像头选项
    availableCameras.forEach((camera, index) => {
        const option = document.createElement('option');
        option.value = camera.deviceId;
        option.textContent = camera.label || `摄像头 ${index + 1}`;
        cameraSelect.appendChild(option);
    });
    
    // 如果只有一个摄像头，自动选择
    if (availableCameras.length === 1) {
        selectedCameraId = availableCameras[0].deviceId;
        cameraSelect.value = selectedCameraId;
    }
}

// 摄像头选择变化处理
function onCameraSelectChange() {
    selectedCameraId = cameraSelect.value;
    console.log('选择摄像头:', selectedCameraId);
    
    // 如果正在运行，需要重新初始化摄像头
    if (isRunning) {
        restartCamera();
    }
}

// 重新启动摄像头
async function restartCamera() {
    try {
        console.log('重新启动摄像头...');
        if (my_camera) {
            my_camera.stop();
        }
        await initializeCamera();
        if (isRunning) {
            await my_camera.start();
        }
        console.log('摄像头重启成功');
    } catch (error) {
        console.error('摄像头重启失败:', error);
        updateStatus('摄像头切换失败，请重新开始识别');
    }
}

// 设置画布大小 - 适应小窗口显示
function setupCanvas() {
    try {
        // 设置画布为小窗口大小
        const containerWidth = 320;  // 小窗口宽度
        const containerHeight = 240; // 小窗口高度
        
        canvasElement.width = containerWidth;
        canvasElement.height = containerHeight;
        console.log('Canvas setup complete:', canvasElement.width, 'x', canvasElement.height);
    } catch (error) {
        console.error('Error setting up canvas:', error);
    }
}

// 处理窗口大小变化
window.addEventListener('resize', () => {
    setupCanvas();
});

// 下蹲触发粒子效果的状态
let squatTriggerTimeout = null;
let countdownInterval = null;
let squatCooldownActive = false;
let squatCooldownTimeout = null;
let cooldownDisplayInterval = null;
const SQUAT_COOLDOWN_TIME = 5000; // 5秒冷却时间

// 截屏功能相关
let screenshotCount = 0;
let hasStartScreenshot = false; // 是否已经拍摄了开始截图
let startScreenshotData = null; // 开始识别时的截图数据
let actionScreenshots = []; // 动作截图数据数组

// 实时姿态跟踪相关
let lastPoseData = {
    leftHand: { x: 0.5, y: 0.5 },
    rightHand: { x: 0.5, y: 0.5 },
    energy: 0.0
};
let poseHistory = [];
const POSE_HISTORY_LENGTH = 20; // 增加历史长度以提高平滑度
let smoothedPoseData = {
    leftHand: { x: 0.5, y: 0.5 },
    rightHand: { x: 0.5, y: 0.5 },
    energy: 0.0
};
const SMOOTHING_FACTOR = 0.15; // 平滑因子，越小越平滑

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
        
        // 检查是否在冷却时间内
        if (squatCooldownActive) {
            updateStatus(`下蹲次数: ${squatCount}, 跳跃次数: ${jumpCount}, 屈肘抬臂次数: ${armCount}, 伸展运动次数: ${stretchCount} - 冷却中，请等待...`);
            return;
        }
        
        // 激活冷却时间
        squatCooldownActive = true;
        updateStatus(`下蹲次数: ${squatCount}, 跳跃次数: ${jumpCount}, 屈肘抬臂次数: ${armCount}, 伸展运动次数: ${stretchCount} - 3秒后触发粒子爆炸效果`);
        

        
        // 清除之前的定时器（如果存在）
        if (squatTriggerTimeout) {
            clearTimeout(squatTriggerTimeout);
        }
        if (countdownInterval) {
            clearInterval(countdownInterval);
        }
        
        // 显示倒计时
        const countdownElement = document.getElementById('explosionCountdown');
        const countdownNumber = document.getElementById('countdownNumber');
        if (countdownElement && countdownNumber) {
            countdownElement.style.display = 'block';
            let countdown = 3;
            countdownNumber.textContent = countdown;
            
            countdownInterval = setInterval(() => {
                countdown--;
                if (countdown > 0) {
                    countdownNumber.textContent = countdown;
                } else {
                    countdownNumber.textContent = '爆炸！';
                    setTimeout(() => {
                        countdownElement.style.display = 'none';
                    }, 500);
                    clearInterval(countdownInterval);
                }
            }, 1000);
        }
        
        // 设置3秒后触发粒子爆炸效果
        squatTriggerTimeout = setTimeout(() => {
            if (typeof window.triggerParticleExplosion === 'function') {
                window.triggerParticleExplosion();
                updateStatus(`下蹲次数: ${squatCount}, 跳跃次数: ${jumpCount}, 屈肘抬臂次数: ${armCount}, 伸展运动次数: ${stretchCount} - 粒子爆炸效果已触发！`);
            } else {
                console.warn('粒子爆炸函数未找到');
            }
        }, 3000); // 3秒延迟
        
        // 显示冷却时间倒计时
        const cooldownElement = document.getElementById('squatCooldown');
        const cooldownTimeElement = document.getElementById('cooldownTime');
        if (cooldownElement && cooldownTimeElement) {
            cooldownElement.style.display = 'block';
            let cooldownRemaining = 5;
            cooldownTimeElement.textContent = cooldownRemaining;
            
            cooldownDisplayInterval = setInterval(() => {
                cooldownRemaining--;
                if (cooldownRemaining > 0) {
                    cooldownTimeElement.textContent = cooldownRemaining;
                } else {
                    cooldownElement.style.display = 'none';
                    clearInterval(cooldownDisplayInterval);
                }
            }, 1000);
        }
        
        // 设置5秒冷却时间
        squatCooldownTimeout = setTimeout(() => {
            squatCooldownActive = false;
            console.log('下蹲冷却时间结束');
        }, SQUAT_COOLDOWN_TIME);
        
    } else if (kneeAngle <= SQUAT_THRESHOLD) {
        isSquatting = false;
    }
}

// 切换下蹲识别状态
function toggleSquatDetection() {
    isSquatDetectionEnabled = !isSquatDetectionEnabled;
    
    if (isSquatDetectionEnabled) {
        squatToggleBtn.textContent = '关闭下蹲识别';
        squatToggleBtn.className = 'action-toggle enabled';
        // 重置计数器
        squatCount = 0;
        updateSquatCount();
    } else {
        squatToggleBtn.textContent = '启动下蹲识别';
        squatToggleBtn.className = 'action-toggle disabled';
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

// 截屏功能
function takeScreenshot(actionType = '') {
    try {
        // 创建一个临时canvas来捕获当前帧
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        // 设置临时canvas尺寸与输出canvas相同
        tempCanvas.width = canvasElement.width;
        tempCanvas.height = canvasElement.height;
        
        // 复制当前canvas内容到临时canvas
        tempCtx.drawImage(canvasElement, 0, 0);
        
        // 获取图片数据
        const imageData = tempCanvas.toDataURL('image/png');
        
        // 生成时间戳
        const now = new Date();
        const timestamp = now.getFullYear() + 
            String(now.getMonth() + 1).padStart(2, '0') + 
            String(now.getDate()).padStart(2, '0') + '_' +
            String(now.getHours()).padStart(2, '0') + 
            String(now.getMinutes()).padStart(2, '0') + 
            String(now.getSeconds()).padStart(2, '0');
        
        screenshotCount++;
        
        // 保存截图数据
        const screenshotData = {
            data: imageData,
            timestamp: timestamp,
            type: actionType || '手动截图',
            count: screenshotCount
        };
        
        if (actionType === '开始识别') {
            startScreenshotData = screenshotData;
            // 清空之前的动作截图
            actionScreenshots = [];
            // 保存到localStorage
            localStorage.setItem('startScreenshot', JSON.stringify(screenshotData));
            localStorage.setItem('actionScreenshots', JSON.stringify(actionScreenshots));
        } else if (actionType && actionType !== '开始识别') {
            actionScreenshots.push(screenshotData);
            // 保存到localStorage
            localStorage.setItem('actionScreenshots', JSON.stringify(actionScreenshots));
        }
        
        // 下载文件
        tempCanvas.toBlob((blob) => {
            if (blob) {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                
                let filename;
                if (actionType) {
                    filename = `${actionType}_${timestamp}_${String(screenshotCount).padStart(3, '0')}.png`;
                } else {
                    filename = `截图_${timestamp}_${String(screenshotCount).padStart(3, '0')}.png`;
                }
                
                link.href = url;
                link.download = filename;
                link.style.display = 'none';
                
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                // 清理URL对象
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                
                console.log(`截屏已保存: ${filename}`);
                if (actionType) {
                    updateStatus(`${actionType}截图已保存: ${filename}`);
                } else {
                    updateStatus(`截屏已保存: ${filename}`);
                }
                
                // 更新截屏计数显示
                if (screenshotCountDisplay) {
                    screenshotCountDisplay.textContent = screenshotCount;
                }
            }
        }, 'image/png');
        
    } catch (error) {
        console.error('截屏失败:', error);
        updateStatus('截屏失败，请重试');
    }
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
                    

                    
                    // 触发粒子分裂效果（如果不在冷却中）
                    if (!armSplitCooldownActive) {
                        if (typeof window.triggerArmSplit === 'function') {
                            window.triggerArmSplit();
                            updateStatus(`下蹲次数: ${squatCount}, 跳跃次数: ${jumpCount}, 屈肘抬臂次数: ${armCount}, 伸展运动次数: ${stretchCount} - 粒子分裂效果已触发！`);
                            
                            // 激活冷却时间
                            armSplitCooldownActive = true;
                            armSplitCooldownTimeout = setTimeout(() => {
                                armSplitCooldownActive = false;
                                console.log('屈臂分裂冷却时间结束');
                            }, ARM_SPLIT_COOLDOWN_TIME);
                        }
                    } else {
                        updateStatus(`下蹲次数: ${squatCount}, 跳跃次数: ${jumpCount}, 屈肘抬臂次数: ${armCount}, 伸展运动次数: ${stretchCount} - 屈臂效果冷却中...`);
                    }
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
        armToggleBtn.className = 'action-toggle enabled';
        // 重置计数器和状态
        armCount = 0;
        armMovementState = 'none';
        armCycleStarted = false;
        lastElbowY = { left: 0, right: 0, avg: undefined };
        updateArmCount();
    } else {
        armToggleBtn.textContent = '启动屈肘抬臂识别';
        armToggleBtn.className = 'action-toggle disabled';
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
    
    // 判断当前状态
    let currentState = 'none';
    if (isRightHandOnChest && !isLeftHandOnChest) {
        currentState = 'right_on_chest';
    } else if (isLeftHandOnChest && !isRightHandOnChest) {
        currentState = 'left_on_chest';
    } else if (isLeftHandOnChest && isRightHandOnChest) {
        // 双手都在胸口，保持当前状态
        return;
    } else {
        // 没有手在胸口
        currentState = 'none';
        return;
    }
    
    // 检测状态变化并计数
    if (currentState !== 'none' && currentState !== stretchMovementState) {
        if (stretchMovementState === 'right_on_chest' && currentState === 'left_on_chest') {
            // 从右手胸口切换到左手胸口，完成一次伸展运动
            stretchCount++;
            updateStretchCount();
            updateStatus(`下蹲次数: ${squatCount}, 跳跃次数: ${jumpCount}, 屈肘抬臂次数: ${armCount}, 伸展运动次数: ${stretchCount}`);
            
            // 触发粒子横向运动效果（如果不在冷却中）
            if (!stretchCooldownActive) {
                if (typeof window.triggerStretchMode === 'function') {
                    window.triggerStretchMode();
                    updateStatus(`下蹲次数: ${squatCount}, 跳跃次数: ${jumpCount}, 屈肘抬臂次数: ${armCount}, 伸展运动次数: ${stretchCount} - 粒子横向运动效果已触发！`);
                    
                    // 激活冷却时间
                    stretchCooldownActive = true;
                    stretchCooldownTimeout = setTimeout(() => {
                        stretchCooldownActive = false;
                        console.log('伸展横向运动冷却时间结束');
                    }, STRETCH_COOLDOWN_TIME);
                }
            } else {
                updateStatus(`下蹲次数: ${squatCount}, 跳跃次数: ${jumpCount}, 屈肘抬臂次数: ${armCount}, 伸展运动次数: ${stretchCount} - 伸展效果冷却中...`);
            }
        } else if (stretchMovementState === 'left_on_chest' && currentState === 'right_on_chest') {
            // 从左手胸口切换到右手胸口，也算一次（双向计数）
            stretchCount++;
            updateStretchCount();
            updateStatus(`下蹲次数: ${squatCount}, 跳跃次数: ${jumpCount}, 屈肘抬臂次数: ${armCount}, 伸展运动次数: ${stretchCount}`);
            
            // 触发粒子横向运动效果（如果不在冷却中）
            if (!stretchCooldownActive) {
                if (typeof window.triggerStretchMode === 'function') {
                    window.triggerStretchMode();
                    updateStatus(`下蹲次数: ${squatCount}, 跳跃次数: ${jumpCount}, 屈肘抬臂次数: ${armCount}, 伸展运动次数: ${stretchCount} - 粒子横向运动效果已触发！`);
                    
                    // 激活冷却时间
                    stretchCooldownActive = true;
                    stretchCooldownTimeout = setTimeout(() => {
                        stretchCooldownActive = false;
                        console.log('伸展横向运动冷却时间结束');
                    }, STRETCH_COOLDOWN_TIME);
                }
            } else {
                updateStatus(`下蹲次数: ${squatCount}, 跳跃次数: ${jumpCount}, 屈肘抬臂次数: ${armCount}, 伸展运动次数: ${stretchCount} - 伸展效果冷却中...`);
            }
        }
        
        stretchMovementState = currentState;
    }
}

// 切换伸展运动识别状态
function toggleStretchDetection() {
    isStretchDetectionEnabled = !isStretchDetectionEnabled;
    
    if (isStretchDetectionEnabled) {
        stretchToggleBtn.textContent = '关闭伸展运动识别';
        stretchToggleBtn.className = 'action-toggle enabled';
        // 重置计数器和状态
        stretchCount = 0;
        stretchMovementState = 'none';
        updateStretchCount();
    } else {
        stretchToggleBtn.textContent = '启动伸展运动识别';
        stretchToggleBtn.className = 'action-toggle disabled';
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

// 提取实时姿态数据
function extractPoseData(landmarks) {
    const leftWrist = landmarks[15];   // 左手腕
    const rightWrist = landmarks[16];  // 右手腕
    const leftShoulder = landmarks[11]; // 左肩
    const rightShoulder = landmarks[12]; // 右肩
    const leftElbow = landmarks[13];   // 左手肘
    const rightElbow = landmarks[14];  // 右手肘
    
    // 计算手部位置
    const currentPose = {
        leftHand: { x: leftWrist.x, y: leftWrist.y },
        rightHand: { x: rightWrist.x, y: rightWrist.y },
        energy: 0.0
    };
    
    // 计算身体活动能量（基于手部和手肘的运动）
    if (lastPoseData) {
        const leftHandMovement = Math.sqrt(
            Math.pow(currentPose.leftHand.x - lastPoseData.leftHand.x, 2) + 
            Math.pow(currentPose.leftHand.y - lastPoseData.leftHand.y, 2)
        );
        const rightHandMovement = Math.sqrt(
            Math.pow(currentPose.rightHand.x - lastPoseData.rightHand.x, 2) + 
            Math.pow(currentPose.rightHand.y - lastPoseData.rightHand.y, 2)
        );
        
        // 计算手肘运动
        const leftElbowMovement = Math.sqrt(
            Math.pow(leftElbow.x - (lastPoseData.leftElbow?.x || leftElbow.x), 2) + 
            Math.pow(leftElbow.y - (lastPoseData.leftElbow?.y || leftElbow.y), 2)
        );
        const rightElbowMovement = Math.sqrt(
            Math.pow(rightElbow.x - (lastPoseData.rightElbow?.x || rightElbow.x), 2) + 
            Math.pow(rightElbow.y - (lastPoseData.rightElbow?.y || rightElbow.y), 2)
        );
        
        // 综合运动能量，降低敏感度
        currentPose.energy = Math.min(1.0, (leftHandMovement + rightHandMovement + leftElbowMovement + rightElbowMovement) * 3.0);
    }
    
    // 保存手肘位置用于下次计算
    currentPose.leftElbow = { x: leftElbow.x, y: leftElbow.y };
    currentPose.rightElbow = { x: rightElbow.x, y: rightElbow.y };
    
    // 更新历史记录
    poseHistory.push(currentPose);
    if (poseHistory.length > POSE_HISTORY_LENGTH) {
        poseHistory.shift();
    }
    
    // 平滑处理能量值
    if (poseHistory.length > 1) {
        const avgEnergy = poseHistory.reduce((sum, pose) => sum + pose.energy, 0) / poseHistory.length;
        currentPose.energy = avgEnergy;
    }
    
    // 应用指数平滑滤波
    smoothedPoseData.leftHand.x = smoothedPoseData.leftHand.x * (1 - SMOOTHING_FACTOR) + currentPose.leftHand.x * SMOOTHING_FACTOR;
    smoothedPoseData.leftHand.y = smoothedPoseData.leftHand.y * (1 - SMOOTHING_FACTOR) + currentPose.leftHand.y * SMOOTHING_FACTOR;
    smoothedPoseData.rightHand.x = smoothedPoseData.rightHand.x * (1 - SMOOTHING_FACTOR) + currentPose.rightHand.x * SMOOTHING_FACTOR;
    smoothedPoseData.rightHand.y = smoothedPoseData.rightHand.y * (1 - SMOOTHING_FACTOR) + currentPose.rightHand.y * SMOOTHING_FACTOR;
    smoothedPoseData.energy = smoothedPoseData.energy * (1 - SMOOTHING_FACTOR) + currentPose.energy * SMOOTHING_FACTOR;
    
    lastPoseData = currentPose;
    return smoothedPoseData;
}

// 处理识别结果
function onResults(results) {
    if (!isRunning) return;

    try {
        // 清除画布
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

        // 计算视频显示尺寸和位置 - 适应小窗口
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
            // 提取实时姿态数据并更新粒子系统
            const poseData = extractPoseData(results.poseLandmarks);
            if (typeof window.updatePoseData === 'function') {
                window.updatePoseData(poseData);
            }
            
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
            canvasCtx.scale(drawWidth / results.image.width, drawHeight / results.image.height);
            
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
        
        // 构建摄像头配置
        const cameraConfig = {
            onFrame: async () => {
                if (isRunning && pose) {
                    try {
                        await pose.send({image: videoElement});
                    } catch (error) {
                        console.error('Error sending frame to pose:', error);
                    }
                }
            },
            width: 320,  // 调整摄像头分辨率以适应小窗口
            height: 240
        };
        
        // 如果选择了特定摄像头，添加设备ID约束
        if (selectedCameraId) {
            cameraConfig.deviceId = selectedCameraId;
        }
        
        my_camera = new Camera(videoElement, cameraConfig);
        console.log('Camera initialized successfully with device:', selectedCameraId || 'default');
    } catch (error) {
        console.error('Error initializing camera:', error);
    }
}

// 开始识别
async function startDetection() {
    try {
        if (!isRunning) {
            // 检查是否选择了摄像头
            if (!selectedCameraId && availableCameras.length > 1) {
                alert('请先选择一个摄像头');
                return;
            }
            
            console.log('Starting detection...');
            isRunning = true;
            await my_camera.start();
            startBtn.disabled = true;
            startBtn.classList.remove('active');
            stopBtn.disabled = false;
            stopBtn.classList.add('active');
            screenshotBtn.disabled = false;
            screenshotBtn.classList.add('active');
            cameraSelect.disabled = true;
            console.log('Detection started successfully');
            
            // 重置计数器
            squatCount = 0;
            jumpCount = 0;
            armCount = 0;
            stretchCount = 0;
            updateSquatCount();
            updateArmCount();
            updateStretchCount();
            updateStatus(`下蹲次数: ${squatCount}, 跳跃次数: ${jumpCount}, 屈肘抬臂次数: ${armCount}, 伸展运动次数: ${stretchCount}`);
            
            // 重置截图数据
            startScreenshotData = null;
            actionScreenshots = [];
            screenshotCount = 0;
            hasStartScreenshot = false;
            // 清空localStorage中的截图数据
            localStorage.removeItem('startScreenshot');
            localStorage.removeItem('actionScreenshots');
            
            // 启动识别时自动截屏
            setTimeout(() => {
                if (isRunning && !hasStartScreenshot) {
                    takeScreenshot('开始识别');
                    hasStartScreenshot = true;
                }
            }, 1000); // 等待1秒确保摄像头画面稳定后截屏
        }
    } catch (error) {
        console.error('Error starting detection:', error);
        alert('启动摄像头失败，请确保已授予摄像头访问权限，并刷新页面重试。');
        isRunning = false;
        startBtn.disabled = false;
        startBtn.classList.remove('active');
        stopBtn.disabled = true;
        stopBtn.classList.remove('active');
        cameraSelect.disabled = false;
    }
}

// 停止识别
function stopDetection() {
    try {
        if (isRunning) {
            console.log('Stopping detection...');
            isRunning = false;
            my_camera.stop();
            startBtn.disabled = false;
            startBtn.classList.remove('active');
            stopBtn.disabled = true;
            stopBtn.classList.remove('active');
            screenshotBtn.disabled = true;
            screenshotBtn.classList.remove('active');
            cameraSelect.disabled = false;
            
            // 清除粒子爆炸定时器和倒计时
            if (squatTriggerTimeout) {
                clearTimeout(squatTriggerTimeout);
                squatTriggerTimeout = null;
            }
            if (countdownInterval) {
                clearInterval(countdownInterval);
                countdownInterval = null;
            }
            if (squatCooldownTimeout) {
                clearTimeout(squatCooldownTimeout);
                squatCooldownTimeout = null;
            }
            if (cooldownDisplayInterval) {
                clearInterval(cooldownDisplayInterval);
                cooldownDisplayInterval = null;
            }
            if (armSplitCooldownTimeout) {
                clearTimeout(armSplitCooldownTimeout);
                armSplitCooldownTimeout = null;
            }
            if (stretchCooldownTimeout) {
                clearTimeout(stretchCooldownTimeout);
                stretchCooldownTimeout = null;
            }
            squatCooldownActive = false;
            armSplitCooldownActive = false;
            stretchCooldownActive = false;
            hasStartScreenshot = false; // 重置开始截图标志
            
            // 隐藏冷却时间显示
            const cooldownElement = document.getElementById('squatCooldown');
            if (cooldownElement) {
                cooldownElement.style.display = 'none';
            }
            
            // 隐藏倒计时显示
            const countdownElement = document.getElementById('explosionCountdown');
            if (countdownElement) {
                countdownElement.style.display = 'none';
            }
            
            // 清除画布
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
            console.log('Detection stopped successfully');
            
            // 停止识别时截图
            takeScreenshot('停止识别');
            
            // 显示最终结果
            const status = document.getElementById('status');
            status.textContent = `最终结果 - 下蹲次数: ${squatCount}, 跳跃次数: ${jumpCount}, 屈肘抬臂次数: ${armCount}, 伸展运动次数: ${stretchCount}`;
            status.className = 'success';
            
            // 重置识别状态
            if (isSquatDetectionEnabled) {
                toggleSquatDetection();
            }
            if (isArmDetectionEnabled) {
                toggleArmDetection();
            }
            if (isStretchDetectionEnabled) {
                toggleStretchDetection();
            }
        }
    } catch (error) {
        console.error('Error stopping detection:', error);
    }
}

// 初始化函数
async function initialize() {
    try {
        console.log('Initializing application...');
        
        // 设置画布
        setupCanvas();
        
        // 获取摄像头列表
        await getCameraList();
        
        // 初始化MediaPipe Pose
        await initializePose();
        
        // 初始化摄像头
        initializeCamera();
        
        // 绑定事件监听器
        startBtn.addEventListener('click', startDetection);
        stopBtn.addEventListener('click', stopDetection);
        screenshotBtn.addEventListener('click', takeScreenshot);
        galleryBtn.addEventListener('click', () => {
            window.open('screenshot-gallery.html', '_blank');
        });
        cameraSelect.addEventListener('change', onCameraSelectChange);
        squatToggleBtn.addEventListener('click', toggleSquatDetection);
        armToggleBtn.addEventListener('click', toggleArmDetection);
        stretchToggleBtn.addEventListener('click', toggleStretchDetection);
        
        console.log('Application initialized successfully');
        
    } catch (error) {
        console.error('Error during initialization:', error);
        const status = document.getElementById('status');
        status.textContent = '初始化失败，请刷新页面重试。';
        status.className = 'error';
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initialize); 