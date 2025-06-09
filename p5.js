let particles = [];
const MAX_R = 300; // 粒子最大半径（到达外圈就消失）
const BIRTH_RATE = 20; // 每帧新生粒子数
const SPEED = 1.5; // 粒子扩散速度

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
    let phase = random(TWO_PI);
    particles.push({
      theta,
      phase,
      r: 0 // 初始半径为0
    });
  }

  // 更新和绘制粒子
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    // 粒子向外扩散
    p.r += SPEED;

    // 有机扰动
    let nx = noise(p.theta, frameCount * 0.01) * 8 - 4;
    let ny = noise(p.theta + 100, frameCount * 0.01) * 8 - 4;

    let x = width / 2 + p.r * cos(p.theta) + nx;
    let y = height / 2 + p.r * sin(p.theta) + ny;

    // 颜色和透明度渐变
    let h = map(p.r, 0, MAX_R, 0.62, 0.7); // 蓝到蓝紫
    let s = 0.7;
    let l = map(p.r, 0, MAX_R, 0.9, 0.3);
    let alpha = map(p.r, 0, MAX_R, 0.8, 0.05);
    let sz = map(p.r, 0, MAX_R, 2.2, 0.5);

    fill(h, s, l, alpha);
    ellipse(x, y, sz, sz);

    // 到达最外圈就移除
    if (p.r > MAX_R) {
      particles.splice(i, 1);
    }
  }
}