(() => {
'use strict';

/* ---------- setup ---------- */
const W = 480, H = 720, TAU = Math.PI * 2;
const $ = id => document.getElementById(id);
const cv = $('c'), ctx = cv.getContext('2d');
const wrap = $('wrap'), stage = $('stage'), ov = $('ov');
const panels = { start: $('pStart'), pause: $('pPause'), over: $('pOver') };
const ctl = $('ctl'), bombBtn = $('bombBtn'), bombCount = $('bombCount');
const muteBtn = $('muteBtn'), pauseBtn = $('pauseBtn');
const MONO = "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace";
const DISP = "'Chakra Petch', 'Arial Narrow', system-ui, sans-serif";
const RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};
let hi = parseInt(store.get('novalane.hi') || '0', 10) || 0;
let muted = store.get('novalane.mute') === '1';

let scale = 1, dpr = 1;
function fit() {
  const aw = wrap.clientWidth, ah = wrap.clientHeight;
  if (aw < 20 || ah < 20) return;
  scale = Math.max(0.2, Math.min(aw / W, ah / H));
  stage.style.width = Math.floor(W * scale) + 'px';
  stage.style.height = Math.floor(H * scale) + 'px';
  stage.style.setProperty('--u', scale + 'px');
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(W * scale * dpr);
  cv.height = Math.round(H * scale * dpr);
}

/* ---------- audio (synthesised, no files) ---------- */
let actx = null, master = null, noiseBuf = null, shotN = 0;
function initAudio() {
  if (!actx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      actx = new AC();
      master = actx.createGain();
      master.gain.value = muted ? 0 : 0.22;
      master.connect(actx.destination);
    } catch (e) { actx = null; }
  }
  if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
}
function tone(type, f0, f1, dur, vol, delay) {
  if (!actx) return;
  const t = actx.currentTime + (delay || 0);
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.03);
}
function noise(dur, vol, fc) {
  if (!actx) return;
  if (!noiseBuf) {
    const n = actx.sampleRate;
    noiseBuf = actx.createBuffer(1, n, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  const now = actx.currentTime;
  const s = actx.createBufferSource(); s.buffer = noiseBuf;
  const f = actx.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(fc, now);
  f.frequency.exponentialRampToValueAtTime(100, now + dur);
  const g = actx.createGain();
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(now); s.stop(now + dur + 0.03);
}
const sfx = {
  shoot() { if ((shotN++ % 3) === 0) tone('square', 880, 480, 0.05, 0.045); },
  boom(big) { noise(big ? 0.75 : 0.3, big ? 0.9 : 0.5, big ? 2600 : 1700); tone('sine', big ? 150 : 210, 40, big ? 0.5 : 0.2, 0.4); },
  pick() { tone('triangle', 520, 520, 0.07, 0.25); tone('triangle', 780, 780, 0.07, 0.25, 0.07); tone('triangle', 1040, 1040, 0.13, 0.25, 0.14); },
  hurt() { tone('sawtooth', 320, 60, 0.35, 0.3); noise(0.3, 0.5, 1200); },
  bomb() { noise(1.0, 1.0, 3200); tone('sine', 320, 30, 0.9, 0.5); },
  wave() { tone('triangle', 330, 330, 0.1, 0.2); tone('triangle', 495, 495, 0.1, 0.2, 0.1); tone('triangle', 660, 660, 0.2, 0.2, 0.2); },
  boss() { tone('sawtooth', 95, 55, 0.9, 0.3); }
};

/* ---------- static art: background + glow sprites ---------- */
const bgCanvas = document.createElement('canvas');
bgCanvas.width = W; bgCanvas.height = H;
(function paintBg() {
  const g = bgCanvas.getContext('2d');
  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#05050c'); base.addColorStop(0.55, '#0a0820'); base.addColorStop(1, '#150a2e');
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  const blob = (x, y, r, c) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  };
  blob(90, 170, 260, 'rgba(138,92,255,.16)');
  blob(400, 420, 280, 'rgba(255,63,180,.10)');
  blob(240, 700, 320, 'rgba(52,240,255,.10)');
})();
const glowCache = {};
function glowSprite(color) {
  if (glowCache[color]) return glowCache[color];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color + 'ff'); gr.addColorStop(0.3, color + '70'); gr.addColorStop(1, color + '00');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (glowCache[color] = c);
}
function glow(x, y, r, color, a) {
  ctx.globalAlpha = a;
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

/* ---------- game data ---------- */
const TYPES = {
  drone: { hp: 1, r: 14, score: 10, color: '#ff3fb4' },
  zig:   { hp: 2, r: 15, score: 25, color: '#ffb62e' },
  dart:  { hp: 1, r: 12, score: 20, color: '#ff5a4d' },
  tank:  { hp: 7, r: 24, score: 60, color: '#8a5cff' }
};
const PK = {
  W: { c: '#34f0ff', label: 'POWER UP' },
  S: { c: '#8a5cff', label: 'SHIELD' },
  B: { c: '#ffb62e', label: 'BOMB +1' },
  H: { c: '#4dffb0', label: 'HULL +1' }
};
const PATTERNS = {
  1: [[0, 0]],
  2: [[-9, 0], [9, 0]],
  3: [[0, 0], [-8, -0.14], [8, 0.14]],
  4: [[-9, 0], [9, 0], [-14, -0.22], [14, 0.22]],
  5: [[0, 0], [-9, -0.1], [9, 0.1], [-16, -0.25], [16, 0.25]]
};
const FIRE_INT = [0, 0.19, 0.17, 0.155, 0.14, 0.125];
const SHIP = [[0, -22], [13, 12], [5, 7], [0, 13], [-5, 7], [-13, 12]];
const DRONE = [[0, 14], [14, -9], [0, -3], [-14, -9]];
const ZIG = [[0, 12], [17, -1], [10, -13], [-10, -13], [-17, -1]];
const DART = [[16, 0], [-10, 9], [-5, 0], [-10, -9]];
const TANK = Array.from({ length: 8 }, (_, i) => [Math.cos(i / 8 * TAU + TAU / 16) * 24, Math.sin(i / 8 * TAU + TAU / 16) * 24]);
const TANK_IN = TANK.map(p => [p[0] * 0.5, p[1] * 0.5]);
const BOSS = [[-64, -8], [-34, -32], [34, -32], [64, -8], [44, 28], [0, 46], [-44, 28]];
const HEX = Array.from({ length: 6 }, (_, i) => [Math.cos(i / 6 * TAU) * 13, Math.sin(i / 6 * TAU) * 13]);

/* ---------- state ---------- */
let mode = 'menu';           // menu | play | pause | dying | over
let T = 0;
let score, wave, kills, maxMult, chain, mult, comboT;
let player, bullets, ebullets, enemies, particles, rings, pickups, floaters, boss, sched;
let toSpawn, spawnTimer, waveDelay, bannerT, bannerText, shakeMag, flashT, deadT, newBest;
const stars = Array.from({ length: 110 }, () => ({ x: rand(0, W), y: rand(0, H), z: Math.random() }));

function reset() {
  score = 0; wave = 0; kills = 0; maxMult = 1; chain = 0; mult = 1; comboT = 0;
  player = { x: W / 2, y: H - 120, tx: W / 2, ty: H - 120, hull: 3, inv: 1.5, shield: false, weapon: 1, bombs: 2, bombCd: 0, fireCd: 0, dead: false };
  bullets = []; ebullets = []; enemies = []; particles = []; rings = []; pickups = []; floaters = []; sched = []; boss = null;
  toSpawn = 0; spawnTimer = 0; waveDelay = 0.8; bannerT = 0; bannerText = '';
  shakeMag = 0; flashT = 0; deadT = 0; newBest = false;
  updateBombUI();
}

/* ---------- effects ---------- */
function explode(x, y, color, n, speed) {
  if (particles.length > 700) particles.splice(0, particles.length - 700);
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = rand(0.2, 1) * speed, life = rand(0.35, 0.95);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, size: rand(1, 3.2), color });
  }
}
function sparks(x, y, color) { explode(x, y, color, 4, 120); }
function ring(x, y, max, color, life, w) { rings.push({ x, y, max, color, life: life || 0.45, w: w || 3, t: 0 }); }
function floater(x, y, text, color, size) { floaters.push({ x, y, text, color, size: size || 12, life: 0.9, max: 0.9 }); }
function shake(m) { shakeMag = Math.max(shakeMag, m * (RM ? 0.15 : 1)); }

/* ---------- waves ---------- */
function startWave() {
  wave++;
  waveDelay = 1.6;
  bannerT = 2.2;
  if (wave % 5 === 0) {
    spawnBoss();
    toSpawn = 0;
    bannerText = 'WAVE ' + String(wave).padStart(2, '0') + ' · WARDEN';
    sfx.boss();
  } else {
    toSpawn = 5 + Math.floor(wave * 2.2);
    spawnTimer = 1.0;
    bannerText = 'WAVE ' + String(wave).padStart(2, '0');
    sfx.wave();
  }
}
function pickType() {
  const pool = ['drone'];
  if (wave >= 2) pool.push('zig', 'zig');
  if (wave >= 3) pool.push('dart');
  if (wave >= 4) pool.push('tank');
  return pool[(Math.random() * pool.length) | 0];
}
function spawnEnemy() {
  const type = pickType(), d = TYPES[type];
  const x = type === 'tank' ? rand(80, W - 80) : rand(40, W - 40);
  enemies.push({
    type, x, x0: x, y: -30, vx: 0, vy: 0, r: d.r,
    hp: d.hp + (type === 'tank' ? Math.floor(wave / 6) : 0),
    t: 0, hit: 0, fireCd: rand(0.8, 2), phase: rand(0, TAU),
    dir: Math.random() < 0.5 ? -1 : 1, flip: rand(0.6, 1.3), state: 0, t0: 0, ang: Math.PI / 2
  });
}
function spawnBoss() {
  const hp = 70 + (wave / 5) * 55;
  boss = { x: W / 2, y: -90, hp, max: hp, t: 0, hit: 0, entering: true, fireA: 1.5, fireB: 3, spiral: 0, ang: 0, phase2: false };
}
function updateWaves(dt) {
  if (toSpawn > 0) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnEnemy(); toSpawn--;
      spawnTimer = Math.max(0.3, 0.95 - wave * 0.035) * rand(0.7, 1.25);
    }
  } else if (!enemies.length && !boss) {
    waveDelay -= dt;
    if (waveDelay <= 0) startWave();
  }
}

/* ---------- shooting ---------- */
function ebullet(x, y, ang, speed) {
  const sp = speed * (1 + Math.min(wave, 20) * 0.01);
  ebullets.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 5 });
}
function aimShot(x, y, speed, spread, count) {
  const n = count || 1;
  const base = Math.atan2(player.y - y, player.x - x);
  for (let i = 0; i < n; i++) ebullet(x, y, base + (i - (n - 1) / 2) * spread, speed);
}
function firePlayer() {
  const pat = PATTERNS[player.weapon];
  for (const [dx, ang] of pat) {
    bullets.push({ x: player.x + dx, y: player.y - 18, vx: Math.sin(ang) * 720, vy: -Math.cos(ang) * 720 });
  }
  sfx.shoot();
}

/* ---------- scoring + kills ---------- */
function registerKill() {
  chain++; comboT = 2.2;
  mult = 1 + Math.min(7, Math.floor(chain / 3));
  if (mult > maxMult) maxMult = mult;
}
function dropPickup(x, y, type) {
  if (!type) {
    const r = Math.random() * 100;
    type = r < 38 ? 'W' : r < 60 ? 'S' : r < 82 ? 'B' : 'H';
  }
  pickups.push({ x, y, type, ph: rand(0, TAU) });
}
function killEnemy(e) {
  const i = enemies.indexOf(e);
  if (i >= 0) enemies.splice(i, 1);
  const d = TYPES[e.type], big = e.type === 'tank';
  kills++;
  registerKill();
  const pts = d.score * mult;
  score += pts;
  floater(e.x, e.y - 8, '+' + pts, d.color, big ? 14 : 11);
  explode(e.x, e.y, d.color, big ? 36 : 18, big ? 260 : 180);
  ring(e.x, e.y, big ? 70 : 42, d.color);
  sfx.boom(big);
  if (big) shake(6);
  const chance = big ? 0.7 : e.type === 'dart' ? 0.06 : 0.09;
  if (Math.random() < chance) dropPickup(e.x, e.y);
}
function damageEnemy(e, n) {
  e.hp -= n; e.hit = 0.07;
  if (e.hp <= 0) killEnemy(e);
}
function damageBoss(n, x, y) {
  if (!boss) return;
  boss.hp -= n; boss.hit = 0.06;
  if (x !== undefined) sparks(x, y, '#ff3fb4');
  if (boss.hp <= 0) killBoss();
}
function killBoss() {
  const b = boss;
  boss = null; ebullets.length = 0; waveDelay = 2.6; kills++;
  const pts = 1500 + wave * 100;
  score += pts;
  floater(b.x, b.y, 'WARDEN DOWN +' + pts, '#ffb62e', 16);
  for (let k = 0; k < 9; k++) {
    sched.push({ t: k * 0.13, fn: () => {
      const ex = b.x + rand(-55, 55), ey = b.y + rand(-30, 30);
      explode(ex, ey, k % 2 ? '#ff3fb4' : '#ffb62e', 26, 260);
      ring(ex, ey, 70, '#ff3fb4');
      sfx.boom(k > 6); shake(10);
    } });
  }
  sched.push({ t: 1.2, fn: () => {
    explode(b.x, b.y, '#ffffff', 70, 380);
    ring(b.x, b.y, 260, '#ffffff', 0.7, 6);
    flashT = 0.25; shake(18);
    dropPickup(b.x - 34, b.y, 'W'); dropPickup(b.x, b.y, 'B'); dropPickup(b.x + 34, b.y, 'S');
  } });
}

/* ---------- player actions ---------- */
function hurtPlayer() {
  if (player.inv > 0 || player.dead) return;
  if (player.shield) {
    player.shield = false; player.inv = 1.2;
    ring(player.x, player.y, 70, '#8a5cff'); sfx.hurt(); shake(4);
    return;
  }
  player.hull--;
  player.weapon = Math.max(1, player.weapon - 1);
  chain = 0; mult = 1; comboT = 0;
  player.inv = 2;
  shake(10); flashT = 0.18; sfx.hurt();
  explode(player.x, player.y, '#34f0ff', 16, 200);
  if (player.hull <= 0) killPlayer();
}
function killPlayer() {
  player.dead = true;
  mode = 'dying'; deadT = 1.5;
  explode(player.x, player.y, '#34f0ff', 60, 320);
  explode(player.x, player.y, '#ffffff', 30, 220);
  ring(player.x, player.y, 140, '#34f0ff', 0.7, 5);
  sfx.boom(true); shake(16); flashT = 0.3;
  showControls(false);
  cv.style.cursor = 'default';
}
function useBomb() {
  if (mode !== 'play' || player.bombs <= 0 || player.bombCd > 0) return;
  player.bombs--; player.bombCd = 0.6;
  updateBombUI();
  sfx.bomb(); shake(14); flashT = 0.22;
  ring(player.x, player.y, 780, '#ffb62e', 0.8, 7);
  for (const b of ebullets) sparks(b.x, b.y, '#ffb62e');
  ebullets.length = 0;
  for (const e of enemies.slice()) {
    if (e.type === 'tank') { e.hp -= 8; e.hit = 0.15; if (e.hp <= 0) killEnemy(e); }
    else killEnemy(e);
  }
  if (boss) damageBoss(30, boss.x, boss.y);
}
function collect(p) {
  const d = PK[p.type];
  sfx.pick();
  if (p.type === 'W') { if (player.weapon < 5) player.weapon++; else { score += 500; } }
  else if (p.type === 'S') player.shield = true;
  else if (p.type === 'B') { player.bombs = Math.min(5, player.bombs + 1); updateBombUI(); }
  else if (p.type === 'H') { if (player.hull < 5) player.hull++; else { score += 500; } }
  floater(p.x, p.y - 12, d.label, d.c, 13);
  ring(p.x, p.y, 40, d.c);
}

/* ---------- update ---------- */
function updateStars(dt) {
  const k = mode === 'play' ? 1 : 0.5;
  for (const s of stars) {
    s.y += (30 + s.z * s.z * 240) * dt * k;
    if (s.y > H + 4) { s.y = -4; s.x = rand(0, W); }
  }
}
function updatePlayer(dt) {
  const dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  if (dx || dy) {
    const m = Math.hypot(dx, dy);
    player.tx += dx / m * 520 * dt;
    player.ty += dy / m * 520 * dt;
  }
  player.tx = clamp(player.tx, 20, W - 20);
  player.ty = clamp(player.ty, H * 0.25, H - 40);
  const k = 1 - Math.pow(0.0005, dt);
  player.x += (player.tx - player.x) * k;
  player.y += (player.ty - player.y) * k;
  if (player.inv > 0) player.inv -= dt;
  if (player.bombCd > 0) player.bombCd -= dt;
  player.fireCd -= dt;
  if (player.fireCd <= 0) { firePlayer(); player.fireCd = FIRE_INT[player.weapon]; }
}
function updateEnemies(dt) {
  const spd = 1 + Math.min(wave, 20) * 0.025;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.t += dt;
    if (e.hit > 0) e.hit -= dt;
    switch (e.type) {
      case 'drone':
        e.y += 70 * spd * dt;
        e.x = e.x0 + Math.sin(e.t * 2.2 + e.phase) * 42;
        if (wave >= 3) {
          e.fireCd -= dt;
          if (e.fireCd <= 0 && e.y > 40 && e.y < H * 0.55) { aimShot(e.x, e.y, 200, 0, 1); e.fireCd = rand(2.2, 4); }
        }
        break;
      case 'zig':
        e.y += 85 * spd * dt;
        e.x += e.dir * 150 * dt;
        if (e.x < 30) { e.x = 30; e.dir = 1; } else if (e.x > W - 30) { e.x = W - 30; e.dir = -1; }
        e.flip -= dt;
        if (e.flip <= 0) { e.dir *= -1; e.flip = rand(0.6, 1.3); }
        break;
      case 'dart':
        if (e.state === 0) {
          e.y += 170 * dt;
          if (e.y >= 90) { e.state = 1; e.t0 = 0; }
        } else if (e.state === 1) {
          e.t0 += dt;
          e.ang = Math.atan2(player.y - e.y, player.x - e.x);
          if (e.t0 >= 0.7) { e.state = 2; e.vx = Math.cos(e.ang) * 330; e.vy = Math.sin(e.ang) * 330; }
        } else {
          e.x += e.vx * dt; e.y += e.vy * dt;
        }
        break;
      case 'tank':
        e.y += (e.y < 130 ? 50 : 6) * dt;
        e.x = e.x0 + Math.sin(e.t * 0.8 + e.phase) * 50;
        e.fireCd -= dt;
        if (e.fireCd <= 0 && e.y > 60) { aimShot(e.x, e.y + 10, 210, 0.22, 3); e.fireCd = rand(1.8, 2.6); }
        break;
    }
    if (e.y > H + 50 || e.y < -90 || e.x < -60 || e.x > W + 60) enemies.splice(i, 1);
  }
}
function updateBoss(dt) {
  if (!boss) return;
  boss.t += dt;
  if (boss.hit > 0) boss.hit -= dt;
  if (boss.entering) {
    boss.y += 60 * dt;
    if (boss.y >= 120) { boss.y = 120; boss.entering = false; }
    return;
  }
  const sp = boss.phase2 ? 1.25 : 0.8;
  boss.x = W / 2 + Math.sin(boss.t * sp) * 150;
  boss.y = 120 + Math.sin(boss.t * 1.3) * 14;
  if (!boss.phase2 && boss.hp < boss.max * 0.5) {
    boss.phase2 = true;
    bannerText = 'WARDEN ENRAGED'; bannerT = 1.6;
    sfx.boss(); shake(8); ring(boss.x, boss.y, 160, '#ff3fb4');
  }
  boss.fireA -= dt;
  if (boss.fireA <= 0) {
    aimShot(boss.x, boss.y + 30, 230, 0.2, boss.phase2 ? 7 : 5);
    boss.fireA = boss.phase2 ? 1.0 : 1.5;
  }
  boss.fireB -= dt;
  if (boss.fireB <= 0) {
    const n = boss.phase2 ? 20 : 14, off = rand(0, TAU);
    for (let i = 0; i < n; i++) ebullet(boss.x, boss.y + 10, off + i / n * TAU, 150);
    boss.fireB = boss.phase2 ? 2.2 : 3.2;
  }
  if (boss.phase2) {
    boss.spiral -= dt;
    if (boss.spiral <= 0) { boss.ang += 0.45; ebullet(boss.x, boss.y + 10, boss.ang, 170); boss.spiral = 0.11; }
  }
}
function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y < -24 || b.x < -24 || b.x > W + 24) bullets.splice(i, 1);
  }
  for (let i = ebullets.length - 1; i >= 0; i--) {
    const b = ebullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y < -40 || b.y > H + 40 || b.x < -40 || b.x > W + 40) ebullets.splice(i, 1);
  }
}
function collide() {
  // player bullets vs enemies and boss
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    let hit = false;
    for (let ei = 0; ei < enemies.length; ei++) {
      const e = enemies[ei], dx = b.x - e.x, dy = b.y - e.y, rr = e.r + 4;
      if (dx * dx + dy * dy < rr * rr) {
        sparks(b.x, b.y, TYPES[e.type].color);
        damageEnemy(e, 1);
        hit = true;
        break;
      }
    }
    if (!hit && boss) {
      const dx = (b.x - boss.x) / 64, dy = (b.y - boss.y) / 44;
      if (dx * dx + dy * dy < 1) { damageBoss(1, b.x, b.y); hit = true; }
    }
    if (hit) bullets.splice(bi, 1);
  }
  if (player.dead) return;
  // enemy bullets vs player
  for (let i = ebullets.length - 1; i >= 0; i--) {
    const b = ebullets[i], dx = b.x - player.x, dy = b.y - player.y, rr = b.r + 6;
    if (dx * dx + dy * dy < rr * rr) {
      ebullets.splice(i, 1);
      hurtPlayer();
      if (player.dead) return;
    }
  }
  // ramming
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (!e) continue;
    const dx = e.x - player.x, dy = e.y - player.y, rr = e.r + 9;
    if (dx * dx + dy * dy < rr * rr) {
      if (e.type === 'tank') damageEnemy(e, 3); else killEnemy(e);
      hurtPlayer();
      if (player.dead) return;
    }
  }
  if (boss) {
    const dx = (player.x - boss.x) / 66, dy = (player.y - boss.y) / 46;
    if (dx * dx + dy * dy < 1) hurtPlayer();
  }
}
function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.y += 70 * dt;
    p.x += Math.sin(T * 2 + p.ph) * 30 * dt;
    const dx = player.x - p.x, dy = player.y - p.y, d = Math.hypot(dx, dy);
    if (d < 90) { p.x += dx * 4 * dt; p.y += dy * 4 * dt; }
    if (d < 24) { collect(p); pickups.splice(i, 1); continue; }
    if (p.y > H + 24) pickups.splice(i, 1);
  }
}
function updateFx(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    const d = Math.pow(0.2, dt); p.vx *= d; p.vy *= d;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    rings[i].t += dt;
    if (rings[i].t >= rings[i].life) rings.splice(i, 1);
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.y -= 34 * dt; f.life -= dt;
    if (f.life <= 0) floaters.splice(i, 1);
  }
  for (let i = sched.length - 1; i >= 0; i--) {
    sched[i].t -= dt;
    if (sched[i].t <= 0) { const fn = sched[i].fn; sched.splice(i, 1); fn(); }
  }
  if (bannerT > 0) bannerT -= dt;
  if (flashT > 0) flashT -= dt;
  shakeMag *= Math.pow(0.02, dt);
  if (shakeMag < 0.2) shakeMag = 0;
}
function update(dt) {
  updateStars(dt);
  if (mode === 'play') {
    updatePlayer(dt);
    updateWaves(dt);
    updateEnemies(dt);
    updateBoss(dt);
    updateBullets(dt);
    collide();
    if (mode === 'play') updatePickups(dt);
    if (comboT > 0) { comboT -= dt; if (comboT <= 0) { chain = 0; mult = 1; } }
  } else if (mode === 'dying') {
    updateBullets(dt);
    deadT -= dt;
    if (deadT <= 0) showOver();
  }
}

/* ---------- drawing ---------- */
function poly(pts, x, y, rot, color, fill, hit, lw) {
  const w = lw || 2;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = hit ? '#ffffff' : fill;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color; ctx.globalAlpha = 0.28; ctx.lineWidth = w + 5; ctx.stroke();
  ctx.globalAlpha = 1; ctx.lineWidth = w; ctx.strokeStyle = hit ? '#ffffff' : color; ctx.stroke();
  ctx.restore();
}
function drawStars() {
  for (const s of stars) {
    ctx.globalAlpha = 0.22 + s.z * 0.65;
    ctx.fillStyle = s.z > 0.8 ? '#b9f6ff' : s.z > 0.45 ? '#d9d4ff' : '#8a8fb5';
    const sz = 0.7 + s.z * 1.5;
    ctx.fillRect(s.x, s.y, sz, sz * (1 + s.z * 3));
  }
  ctx.globalAlpha = 1;
}
function drawPickups() {
  for (const p of pickups) {
    const d = PK[p.type];
    ctx.globalCompositeOperation = 'lighter';
    glow(p.x, p.y, 26, d.c, 0.55);
    ctx.globalCompositeOperation = 'source-over';
    poly(HEX, p.x, p.y, T * 1.5 + p.ph, d.c, '#0a0d1f', false, 2);
    ctx.fillStyle = d.c;
    ctx.font = '700 13px ' + DISP;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.type, p.x, p.y + 1);
  }
}
function drawEnemies() {
  for (const e of enemies) {
    const d = TYPES[e.type], hit = e.hit > 0;
    if (e.type === 'drone') poly(DRONE, e.x, e.y, 0, d.color, '#0a0d1f', hit, 2);
    else if (e.type === 'zig') poly(ZIG, e.x, e.y, 0, d.color, '#0a0d1f', hit, 2);
    else if (e.type === 'dart') {
      if (e.state === 1) {
        ctx.globalCompositeOperation = 'lighter';
        glow(e.x, e.y, 24 + Math.sin(T * 30) * 5, '#ff5a4d', 0.7);
        ctx.globalCompositeOperation = 'source-over';
      }
      poly(DART, e.x, e.y, e.ang, d.color, '#0a0d1f', hit, 2);
    } else {
      poly(TANK, e.x, e.y, 0, d.color, '#0a0d1f', hit, 2.5);
      poly(TANK_IN, e.x, e.y, T * 1.2, d.color, '#150f2e', hit, 1.5);
      if (e.hp < TYPES.tank.hp + Math.floor(wave / 6)) {
        const mx = TYPES.tank.hp + Math.floor(wave / 6);
        ctx.fillStyle = 'rgba(138,92,255,.25)'; ctx.fillRect(e.x - 18, e.y + 30, 36, 3);
        ctx.fillStyle = '#8a5cff'; ctx.fillRect(e.x - 18, e.y + 30, 36 * clamp(e.hp / mx, 0, 1), 3);
      }
    }
  }
}
function drawBoss() {
  if (!boss) return;
  const hit = boss.hit > 0;
  ctx.globalCompositeOperation = 'lighter';
  glow(boss.x, boss.y, 120, boss.phase2 ? '#ff3fb4' : '#8a5cff', 0.35);
  ctx.globalCompositeOperation = 'source-over';
  poly(BOSS, boss.x, boss.y, 0, boss.phase2 ? '#ff3fb4' : '#a98bff', '#0b0a1f', hit, 3);
  ctx.save();
  ctx.translate(boss.x, boss.y);
  ctx.strokeStyle = boss.phase2 ? '#ffb62e' : '#8a5cff'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-34, -32); ctx.lineTo(-18, 6); ctx.lineTo(0, 46); ctx.lineTo(18, 6); ctx.lineTo(34, -32); ctx.stroke();
  for (const sx of [-42, 42]) {
    ctx.beginPath(); ctx.arc(sx, 14, 6, 0, TAU);
    ctx.fillStyle = '#0b0a1f'; ctx.fill(); ctx.strokeStyle = '#ff3fb4'; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.globalCompositeOperation = 'lighter';
  glow(0, 2, 26 + Math.sin(T * 6) * 5, '#ff3fb4', 0.9);
  ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath(); ctx.arc(0, 2, 8, 0, TAU); ctx.fillStyle = hit ? '#fff' : '#ffd1ee'; ctx.fill();
  ctx.restore();
}
function drawEBullets() {
  for (const b of ebullets) {
    ctx.globalCompositeOperation = 'lighter';
    glow(b.x, b.y, 12, '#ff3fb4', 0.9);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff0fa';
    ctx.beginPath(); ctx.arc(b.x, b.y, 3.2, 0, TAU); ctx.fill();
  }
}
function drawBullets() {
  ctx.lineCap = 'round';
  for (const b of bullets) {
    const lx = b.x - b.vx * 0.024, ly = b.y - b.vy * 0.024;
    ctx.strokeStyle = 'rgba(52,240,255,.35)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(lx, ly); ctx.stroke();
    ctx.strokeStyle = '#d9fcff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(lx, ly); ctx.stroke();
  }
}
function drawPlayer() {
  if (player.dead) return;
  const y = player.y + (mode === 'menu' ? Math.sin(T * 2) * 4 : 0), x = player.x;
  const flick = 0.5 + 0.5 * Math.sin(T * 40);
  const blink = player.inv > 0 && Math.floor(T * 18) % 2 === 0;
  ctx.globalAlpha = blink ? 0.35 : 1;
  ctx.globalCompositeOperation = 'lighter';
  glow(x, y + 16, 20 + flick * 6, '#34f0ff', 0.8);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#ffb62e';
  ctx.beginPath(); ctx.moveTo(x - 4, y + 11); ctx.lineTo(x + 4, y + 11); ctx.lineTo(x, y + 22 + flick * 10); ctx.closePath(); ctx.fill();
  poly(SHIP, x, y, 0, '#34f0ff', '#0a1226', false, 2);
  ctx.strokeStyle = 'rgba(217,252,255,.8)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x, y + 4); ctx.stroke();
  ctx.globalAlpha = 1;
  if (player.shield) {
    ctx.strokeStyle = '#8a5cff'; ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6 + 0.3 * Math.sin(T * 8);
    ctx.beginPath(); ctx.arc(x, y, 27, 0, TAU); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    glow(x, y, 34, '#8a5cff', 0.35);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}
function drawFx() {
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalCompositeOperation = 'source-over';
  for (const r of rings) {
    const p = r.t / r.life;
    ctx.globalAlpha = (1 - p) * 0.9;
    ctx.strokeStyle = r.color; ctx.lineWidth = r.w * (1 - p * 0.6);
    ctx.beginPath(); ctx.arc(r.x, r.y, r.max * (1 - (1 - p) * (1 - p)), 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of floaters) {
    ctx.globalAlpha = clamp(f.life / f.max * 1.6, 0, 1);
    ctx.font = '600 ' + f.size + 'px ' + MONO;
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}
function drawHUD() {
  ctx.save();
  ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  ctx.font = '500 10px ' + MONO; ctx.fillStyle = '#8a8fb5';
  ctx.fillText('SCORE', 16, 14);
  ctx.font = '600 24px ' + MONO; ctx.fillStyle = '#e9ecff';
  ctx.fillText(String(score).padStart(7, '0'), 16, 27);
  if (mult > 1) {
    ctx.font = '600 15px ' + MONO; ctx.fillStyle = '#ffb62e';
    ctx.fillText('x' + mult, 16, 57);
    ctx.fillStyle = 'rgba(255,182,46,.25)'; ctx.fillRect(46, 62, 56, 4);
    ctx.fillStyle = '#ffb62e'; ctx.fillRect(46, 62, 56 * clamp(comboT / 2.2, 0, 1), 4);
  }
  ctx.textAlign = 'center';
  ctx.font = '500 10px ' + MONO; ctx.fillStyle = '#8a8fb5';
  ctx.fillText('WAVE', W / 2, 14);
  ctx.font = '600 24px ' + MONO; ctx.fillStyle = '#e9ecff';
  ctx.fillText(String(Math.max(1, wave)).padStart(2, '0'), W / 2, 27);
  const x0 = W - 16 - 5 * 17;
  ctx.textAlign = 'right'; ctx.font = '500 10px ' + MONO; ctx.fillStyle = '#8a8fb5';
  ctx.fillText('HULL', x0 - 6, 28);
  ctx.fillText('PWR', x0 - 6, 46);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < player.hull ? '#34f0ff' : 'rgba(138,143,181,.25)';
    ctx.fillRect(x0 + i * 17, 28, 13, 8);
    ctx.fillStyle = i < player.weapon ? '#ffb62e' : 'rgba(138,143,181,.25)';
    ctx.fillRect(x0 + i * 17, 46, 13, 8);
  }
  if (boss) {
    ctx.textAlign = 'left'; ctx.fillStyle = '#ff3fb4'; ctx.font = '600 10px ' + MONO;
    ctx.fillText('WARDEN', 80, 76);
    ctx.fillStyle = 'rgba(255,63,180,.22)'; ctx.fillRect(80, 90, 320, 6);
    ctx.fillStyle = '#ff3fb4'; ctx.fillRect(80, 90, 320 * clamp(boss.hp / boss.max, 0, 1), 6);
  }
  ctx.restore();
}
function drawBanner() {
  if (bannerT <= 0) return;
  const p = 1 - bannerT / 2.2;
  const a = p < 0.15 ? p / 0.15 : p > 0.75 ? (1 - p) / 0.25 : 1;
  const slide = (1 - Math.min(1, p / 0.2)) * -40;
  ctx.save();
  ctx.globalAlpha = clamp(a, 0, 1);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'italic 700 44px ' + DISP;
  ctx.fillStyle = 'rgba(52,240,255,.3)';
  ctx.fillText(bannerText, W / 2 + slide, H * 0.36 + 2);
  ctx.fillStyle = '#e9ecff';
  ctx.fillText(bannerText, W / 2 + slide, H * 0.36);
  ctx.restore();
}
function render() {
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(bgCanvas, 0, 0, W, H);
  drawStars();
  const sx = shakeMag > 0 ? rand(-shakeMag, shakeMag) : 0;
  const sy = shakeMag > 0 ? rand(-shakeMag, shakeMag) : 0;
  ctx.save();
  ctx.translate(sx, sy);
  drawPickups(); drawEnemies(); drawBoss(); drawEBullets(); drawBullets(); drawPlayer(); drawFx();
  ctx.restore();
  if (flashT > 0 && !RM) {
    ctx.globalAlpha = Math.min(0.5, flashT * 1.8);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  if (mode === 'play' || mode === 'pause' || mode === 'dying') { drawHUD(); drawBanner(); }
}

/* ---------- UI + flow ---------- */
function show(which) {
  ov.hidden = !which;
  for (const k in panels) panels[k].hidden = k !== which;
}
function showControls(on) { ctl.hidden = !on; bombBtn.hidden = !on; }
function updateBombUI() {
  bombCount.textContent = String(player.bombs);
  bombBtn.disabled = player.bombs <= 0;
}
function startGame() {
  if (mode === 'play' || mode === 'dying') return;
  initAudio();
  reset();
  mode = 'play';
  show(null);
  showControls(true);
  cv.style.cursor = 'none';
  pActive = false;
}
function togglePause() {
  if (mode === 'play') { mode = 'pause'; show('pause'); cv.style.cursor = 'default'; }
  else if (mode === 'pause') resume();
}
function resume() {
  if (mode !== 'pause') return;
  mode = 'play'; show(null); cv.style.cursor = 'none';
}
function showOver() {
  mode = 'over';
  newBest = score > hi;
  if (newBest) { hi = score; store.set('novalane.hi', String(hi)); }
  $('oScore').textContent = score.toLocaleString();
  $('oWave').textContent = String(Math.max(1, wave));
  $('oKills').textContent = String(kills);
  $('oMult').textContent = 'x' + maxMult;
  $('oBest').textContent = hi.toLocaleString();
  $('oNew').hidden = !newBest;
  $('sBest').textContent = String(hi).padStart(7, '0');
  show('over');
}
function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.22;
  muteBtn.setAttribute('aria-pressed', String(muted));
  muteBtn.textContent = muted ? 'SND OFF' : 'SND ON';
  store.set('novalane.mute', muted ? '1' : '0');
}

/* ---------- input ---------- */
const keys = { left: false, right: false, up: false, down: false };
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };
let pActive = false;
addEventListener('keydown', e => {
  const k = KEYMAP[e.code];
  if (k) { keys[k] = true; if (mode === 'play') e.preventDefault(); return; }
  if (e.code === 'Space') { if (mode === 'play') { e.preventDefault(); if (!e.repeat) useBomb(); } return; }
  if (e.repeat) return;
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  else if (e.code === 'KeyM') toggleMute();
  else if (e.code === 'Enter') {
    if (mode === 'menu' || mode === 'over') startGame();
    else if (mode === 'pause') resume();
  }
});
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });
addEventListener('blur', () => {
  keys.left = keys.right = keys.up = keys.down = false;
  if (mode === 'play') togglePause();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') togglePause(); });

function setTarget(e) {
  const r = cv.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
  const off = e.pointerType === 'mouse' ? 0 : 64;
  player.tx = clamp(x, 20, W - 20);
  player.ty = clamp(y - off, H * 0.25, H - 40);
}
cv.addEventListener('pointerdown', e => {
  if (mode !== 'play') return;
  pActive = true;
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
  setTarget(e);
  e.preventDefault();
});
cv.addEventListener('pointermove', e => {
  if (mode !== 'play') return;
  if (e.pointerType === 'mouse' || pActive) setTarget(e);
});
cv.addEventListener('pointerup', () => { pActive = false; });
cv.addEventListener('pointercancel', () => { pActive = false; });

for (const b of [bombBtn, muteBtn, pauseBtn]) b.addEventListener('mousedown', e => e.preventDefault());
$('btnStart').addEventListener('click', startGame);
$('btnAgain').addEventListener('click', startGame);
$('btnResume').addEventListener('click', resume);
bombBtn.addEventListener('click', useBomb);
pauseBtn.addEventListener('click', togglePause);
muteBtn.addEventListener('click', toggleMute);

/* ---------- loop + boot ---------- */
let last = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, Math.max(0, (ts - last) / 1000));
  last = ts;
  T += dt;
  if (mode === 'play' || mode === 'dying') update(dt);
  else if (mode === 'menu' || mode === 'over') updateStars(dt);
  if (mode !== 'pause') updateFx(dt);
  render();
}
function start(data) {
  if (data && typeof data.hi === 'number' && data.hi > hi) hi = data.hi;
  fit();
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(wrap);
  else addEventListener('resize', fit);
  reset();
  muteBtn.setAttribute('aria-pressed', String(muted));
  muteBtn.textContent = muted ? 'SND OFF' : 'SND ON';
  $('sBest').textContent = String(hi).padStart(7, '0');
  show('start');
  requestAnimationFrame(frame);
}
start({});
})();
