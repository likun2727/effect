let particles = [];
let MAX_R = 200;
const BASE_MAX_R = 300;
const BURST_MAX_R = 500;const BIRTH_RATE = 30; // 每帧新生粒子数
const BASE_SPEED = 2.2; // 正常扩散速度

// 爆发相关
let burst = false;
let burstStart = 0;
const BURST_DURATION = 30; // 爆发持续帧数

function setup() {
  createCanvas(800, 800);
  colorMode(HSL, 1);
  noStroke();
  background(0, 0, 0.1);
}

function draw() {
  background(0, 0, 0.1, 0.15);

  // 每帧在中心生成新粒子
  for (let i = 0; i < BIRTH_RATE; i++) {
    let theta = random(TWO_PI);
    let myPhase = random(TWO_PI);
    particles.push({
      theta,
      myPhase,
      r: 0 // 初始半径为0
    });
  }

  // 爆发控制
  let particleSpeed = BASE_SPEED;
  let colorBoost = 0;
  if (burst) {
    let burstProgress = (frameCount - burstStart) / BURST_DURATION;
    if (burstProgress < 1) {
      particleSpeed = BASE_SPEED * 4; // 爆发时扩散速度变快
      colorBoost = 0.2 * (1 - burstProgress); // 爆发时更亮
    } else {
      burst = false; // 爆发结束
    }
  }

  // 更新和绘制粒子
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    // 粒子向外扩散
    p.r += particleSpeed;

    // 有机扰动
    let nx = noise(p.theta, frameCount * 0.01) * 8 - 4;
    let ny = noise(p.theta + 100, frameCount * 0.01) * 8 - 4;

    let x = width / 2 + p.r * cos(p.theta) + nx;
    let y = height / 2 + p.r * sin(p.theta) + ny;

    // 颜色和透明度渐变
    let hStart = 0.62;
    let hEnd = 0.95;

    // 如果在爆发状态，改为更剧烈的色相范围（蓝 → 红紫）
    if (burst) {
      hStart = 0.55; // 更蓝
      hEnd = 0.03;   // 红色 (HSL 色相周期 0 到 1，从红到红循环)
        MAX_R = BURST_MAX_R; // 扩展半径

    }else {
  burst = false;
  MAX_R = BASE_MAX_R; // 恢复正常半径
}

    let h = map(p.r, 0, MAX_R, hStart, hEnd);
    let s = map(p.r, 0, MAX_R, 1, 0.6);     // 中心更饱和
    let l = map(p.r, 0, MAX_R, 0.95 + colorBoost, 0.3); // 中心更亮      
    let alpha = map(p.r, 0, MAX_R, 0.8 + colorBoost, 0.05);
    let sz = map(p.r, 0, MAX_R, 2.2, 0.5);

    fill(h, s, l, alpha);
    ellipse(x, y, sz, sz);

    // 到达最外圈就移除
    if (p.r > MAX_R) {
      particles.splice(i, 1);
    }
  }
}

function triggerBurst() {
  burst = true;
  burstStart = frameCount;
  MAX_R = BURST_MAX_R;
}

// 测试用：按空格键模拟下蹲
function keyPressed() {
  if (key === ' ') {
    triggerBurst();
  }
}