/* ============================================================
   particles.js —— 过场粒子系统（漂浮微尘 / 流动光团 / 流星）
   依赖：无
   用法：var ps = createParticleSystem(canvas, 容器);
        ps.start()  过场开始时调用
        ps.stop()   过场结束时调用（同时清空画布）
   动画仅在 start~stop 之间运行，不常驻占用。
   ============================================================ */

function createParticleSystem(canvas, container) {
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0, DPR = 1;
  var motes = [], orbs = [], streaks = [];
  var rafId = null;
  var particlesInited = false;
  var lastTs = 0;
  var nextStreakAt = 1600;   // 第一条流星出现的时间（相对开场）
  var elapsed = 0;
  var resizeTimer = null;

  /* 莫兰迪发光色（rgb 三元组，便于拼 rgba） */
  var GLOW_COLORS = [
    [143, 163, 173],  // 雾蓝
    [168, 179, 155],  // 灰豆绿
    [194, 164, 160],  // 脏粉
    [164, 156, 174],  // 灰紫
    [201, 184, 150]   // 沙色
  ];

  /* 预渲染柔光精灵，避免每帧大量 createRadialGradient */
  var moteSprites = GLOW_COLORS.map(function (c) {
    return makeSprite(32, function (g) {
      g.addColorStop(0,    'rgba(255,255,255,.85)');
      g.addColorStop(0.28, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',.55)');
      g.addColorStop(1,    'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
    });
  });
  var orbSprite = makeSprite(256, function (g) {
    g.addColorStop(0,   'rgba(255,252,246,.55)');
    g.addColorStop(0.45,'rgba(255,252,246,.18)');
    g.addColorStop(1,   'rgba(255,252,246,0)');
  });

  function makeSprite(size, fill) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var sctx = c.getContext('2d');
    var R = size / 2;
    var g = sctx.createRadialGradient(R, R, 0, R, R, R);
    fill(g, R);
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, size, size);
    return c;
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia &&
              window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function resizeCanvas() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  function makeMote(fromBottom) {
    return {
      x: rand(-20, W + 20),
      y: fromBottom ? H + rand(4, 40) : rand(-20, H),
      r: rand(0.7, 2.3),
      vy: rand(0.08, 0.32),                 // 上升速度（向上为负）
      amp: rand(8, 34),                     // 横向摇摆幅度
      freq: rand(0.0004, 0.0011),
      phase: rand(0, Math.PI * 2),
      baseAlpha: rand(0.35, 0.9),
      twSpeed: rand(0.6, 1.8),              // 明灭速度
      twPhase: rand(0, Math.PI * 2),
      color: Math.floor(rand(0, GLOW_COLORS.length))
    };
  }

  function makeOrb() {
    return {
      x: rand(0, W),
      y: rand(0, H),
      size: rand(Math.min(W, H) * 0.22, Math.min(W, H) * 0.5),
      vx: rand(0.006, 0.016) * (Math.random() < .5 ? -1 : 1),
      vy: rand(0.004, 0.012) * (Math.random() < .5 ? -1 : 1),
      alpha: rand(0.10, 0.22),
      breathe: rand(0.5, 1.1),
      phase: rand(0, Math.PI * 2),
      color: Math.floor(rand(0, GLOW_COLORS.length))
    };
  }

  function initParticles() {
    var area = W * H;
    var moteCount = Math.min(96, Math.round(area / 14000));
    if (moteCount < 26) moteCount = 26;
    motes = [];
    for (var i = 0; i < moteCount; i++) motes.push(makeMote(false));

    var orbCount = W < 560 ? 3 : 4;
    orbs = [];
    for (var j = 0; j < orbCount; j++) orbs.push(makeOrb());

    streaks = [];
    elapsed = 0;
    nextStreakAt = rand(1200, 2200);
    particlesInited = true;
  }

  function spawnStreak() {
    var fromLeft = Math.random() < .5;
    streaks.push({
      x: fromLeft ? rand(-W * .2, W * .3) : rand(W * .7, W * 1.2),
      y: rand(H * .05, H * .55),
      len: rand(70, 150),
      speed: rand(0.18, 0.34),                 // px/ms
      angle: fromLeft ? rand(0.45, 0.75) : rand(Math.PI - 0.75, Math.PI - 0.45),
      age: 0,
      life: rand(1600, 2400),
      color: Math.floor(rand(0, GLOW_COLORS.length))
    });
  }

  function drawOrb(o, dt) {
    o.x += o.vx * dt;
    o.y += o.vy * dt;
    // 缓慢环绕边界，飘出后从对侧回来
    var m = o.size;
    if (o.x < -m) o.x = W + m;
    if (o.x > W + m) o.x = -m;
    if (o.y < -m) o.y = H + m;
    if (o.y > H + m) o.y = -m;

    var breathe = 1 + Math.sin(elapsed * o.breathe / 1000 + o.phase) * 0.18;
    var s = o.size * breathe;
    var c = GLOW_COLORS[o.color];
    ctx.globalAlpha = o.alpha * breathe;
    // 彩色底层 + 白色柔光核心，营造“光在流”的层次
    var g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, s / 2);
    g.addColorStop(0,   'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',.28)');
    g.addColorStop(0.6, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',.10)');
    g.addColorStop(1,   'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
    ctx.fillStyle = g;
    ctx.fillRect(o.x - s / 2, o.y - s / 2, s, s);
    ctx.globalAlpha = o.alpha * 0.8 * breathe;
    ctx.drawImage(orbSprite, o.x - s * .28, o.y - s * .28, s * .56, s * .56);
    ctx.globalAlpha = 1;
  }

  function drawMote(m, dt) {
    m.y -= m.vy * dt * 0.06;
    m.phase += m.freq * dt;
    var x = m.x + Math.sin(m.phase) * m.amp;

    if (m.y < -24) {                       // 飘出顶部，从底部重生
      var reborn = makeMote(true);
      reborn.x = rand(-20, W + 20);
      m.x = reborn.x; m.y = reborn.y;
      m.vy = reborn.vy; m.amp = reborn.amp; m.freq = reborn.freq;
      m.phase = reborn.phase; m.baseAlpha = reborn.baseAlpha;
      m.twSpeed = reborn.twSpeed; m.color = reborn.color; m.r = reborn.r;
      return;
    }
    var twinkle = 0.55 + 0.45 * Math.sin(elapsed / 1000 * m.twSpeed + m.twPhase);
    var alpha = m.baseAlpha * twinkle;
    var size = m.r * 11;
    ctx.globalAlpha = alpha;
    ctx.drawImage(moteSprites[m.color], x - size / 2, m.y - size / 2, size, size);
    ctx.globalAlpha = 1;
  }

  function drawStreak(s, dt) {
    s.age += dt;
    var d = s.speed * dt;
    s.x += Math.cos(s.angle) * d;
    s.y += Math.sin(s.angle) * d;

    var k = s.age / s.life;
    if (k >= 1) return false;               // 生命结束
    var fadeIn = Math.min(1, s.age / 260);
    var fadeOut = 1 - Math.max(0, (k - 0.55) / 0.45);
    var alpha = 0.5 * fadeIn * fadeOut;
    var c = GLOW_COLORS[s.color];
    var tx = s.x - Math.cos(s.angle) * s.len;
    var ty = s.y - Math.sin(s.angle) * s.len;
    var g = ctx.createLinearGradient(s.x, s.y, tx, ty);
    g.addColorStop(0,   'rgba(255,255,255,' + (alpha * 0.9) + ')');
    g.addColorStop(0.35,'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (alpha * .55) + ')');
    g.addColorStop(1,   'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    // 头部微光
    ctx.globalAlpha = alpha;
    ctx.drawImage(moteSprites[s.color], s.x - 9, s.y - 9, 18, 18);
    ctx.globalAlpha = 1;
    return true;
  }

  function frame(ts) {
    if (!lastTs) lastTs = ts;
    var dt = Math.min(ts - lastTs, 50);     // 切后台回来避免跳变
    lastTs = ts;
    elapsed += dt;

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';  // 柔光叠加

    for (var i = 0; i < orbs.length; i++) drawOrb(orbs[i], dt);
    for (var j = 0; j < motes.length; j++) drawMote(motes[j], dt);

    if (elapsed >= nextStreakAt) {
      spawnStreak();
      nextStreakAt = elapsed + rand(2600, 4600);
    }
    streaks = streaks.filter(function (s) { return drawStreak(s, dt); });

    rafId = requestAnimationFrame(frame);
  }

  /* 减弱动态：只画一帧安静的微尘与光团 */
  function paintStillFrame() {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    orbs.forEach(function (o) {
      ctx.globalAlpha = o.alpha;
      var s = o.size;
      ctx.drawImage(orbSprite, o.x - s * .28, o.y - s * .28, s * .56, s * .56);
    });
    ctx.globalAlpha = 1;
    motes.forEach(function (m) {
      var size = m.r * 11;
      ctx.globalAlpha = m.baseAlpha * 0.7;
      ctx.drawImage(moteSprites[m.color], m.x - size / 2, m.y - size / 2, size, size);
    });
    ctx.globalAlpha = 1;
  }

  function start() {
    if (rafId) return;
    resizeCanvas();
    if (!particlesInited) initParticles();

    if (prefersReducedMotion()) {
      paintStillFrame();
      return;
    }
    lastTs = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    ctx.clearRect(0, 0, W, H);
  }

  // 过场期间窗口尺寸变化：防抖重建画布与粒子
  window.addEventListener('resize', function () {
    if (!container.classList.contains('show')) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resizeCanvas();
      initParticles();
      if (!rafId && !prefersReducedMotion()) {
        lastTs = 0;
        rafId = requestAnimationFrame(frame);
      } else if (prefersReducedMotion()) {
        paintStillFrame();
      }
    }, 150);
  });

  return { start: start, stop: stop };
}
