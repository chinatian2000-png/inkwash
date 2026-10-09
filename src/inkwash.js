/**
 * inkwash.js — 程序化水墨山水生成核心（v2：笔触版）
 *
 * ── 为什么从"等值线"改成"笔触" ────────────────────────────────
 * v1 用 `fBm → 阈值 → 等值线 → 填色`。外部评审指出这是**方向性错误**：
 *   等值线在拓扑上天然是**等距、连续、无笔锋**的 —— 无论怎么调阈值/配色，
 *   它都只能得到"地形等高线图（DEM 可视化）"，不可能得到"画"。
 * 因此 v2 把渲染的**基本笔元**换成：
 *   · **带方向的流线笔触**（沿高度场等值方向积分得到的 streamline）
 *   · 每条笔触自己的**起收笔、粗细变化、干湿断续、浓淡随机**
 *   · 再加**皴法**（披麻 / 斧劈）：沿梯度方向的短线
 *
 * ── 仍然成立的三条（对 HN 的卖点）──────────────────────────
 *   1. 纯数学：不存在模型/权重/GPU/网络请求
 *   2. 确定性：同 seed 逐字节同图（含笔触序列，因为它由 seeded PRNG 生成）
 *   3. 零依赖：一份代码同时跑浏览器与 Node
 */

'use strict';

// ---------------------------------------------------------------- 随机数
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- 噪声
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

function makePerm(seed) {
  const r = rng(seed), p = new Uint8Array(512);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = (r() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (let i = 0; i < 256; i++) p[256 + i] = p[i];
  return p;
}
function valueNoise(perm, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const X = xi & 255, Y = yi & 255;
  const h = (a, b) => perm[(perm[a & 255] + b) & 255] / 255;
  const u = fade(xf), v = fade(yf);
  return lerp(lerp(h(X, Y), h(X + 1, Y), u), lerp(h(X, Y + 1), h(X + 1, Y + 1), u), v);
}
function fbm(perm, x, y, oct, freq, gain) {
  let s = 0, amp = 1, f = freq, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * valueNoise(perm, x * f, y * f);
    norm += amp; amp *= gain; f *= 2.02;
  }
  return s / norm;
}

// ---------------------------------------------------------------- 调色
const PAPER = [0xF7, 0xF3, 0xE8];
const INK   = [0x17, 0x19, 0x1A];       // 焦墨（近黑，略冷）

// ---------------------------------------------------------------- 主体
function renderInk(o = {}) {
  const seed = (o.seed ?? 7) | 0;
  const W = o.w || 900, H = o.h || 1200;
  const INKGAIN = o.ink ?? 1.0;
  const CUN = o.cun ?? 1.0;      // 皴密度倍率（滑杆）
  const WETK = o.wet ?? 1.0;     // 干湿：>1 更干（滑杆）
  const rnd = rng(seed ^ 0x9E3779B9);

  const permT = makePerm((seed * 40503 + 11) >>> 0);     // 纹理 / 流场
  const permW = makePerm((seed * 92837111 + 97) >>> 0);  // 纸纹
  const permR = makePerm((seed * 2246822519 + 5) >>> 0); // 笔触抖动

  // ---------- 构图：三条山带 ----------
  const fadeSide = rnd();          // 远带向哪一侧渐隐（构图留白方向）
  const horizon = 0.12 + 0.06 * rnd();
  const waterLine = 0.80 + 0.06 * rnd();

  const bands = [
    { yTop: horizon,        yBot: 0.58, ink: 0.32, oct: 4, freq: 1.2, wash: 0.66, air: 0.38, streak: 0.45 },
    { yTop: horizon + 0.15, yBot: 0.80, ink: 0.78, oct: 5, freq: 1.7, wash: 0.54, air: 0.78, streak: 0.95 },
    { yTop: horizon + 0.40, yBot: 1.03, ink: 0.82, oct: 6, freq: 2.3, wash: 0.56, air: 1.00, streak: 1.00 },
  ];

  // ---------- 轮廓线（保留 v1 里已经对了的部分：宽厚山块）----------
  const profiles = bands.map((b, li) => {
    const prof = new Float32Array(W);
    const p = makePerm((seed * 131 + li * 7919) >>> 0);
    const p2 = makePerm((seed * 977 + li * 3571) >>> 0);
    // 焦点孤峰：三条带的主峰位置【错开】，避免"一排排同心山脊"
    const peakAt = 0.26 + 0.16 * li + 0.14 * rnd();
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const mass = fbm(p, u * 1.55 + li * 9.1, li * 4.3, b.oct, b.freq, 0.56);
      const roll = fbm(p2, u * 4.2 + li * 3.7, li * 11.1, 3, 1.0, 0.5);
      const peak = Math.exp(-Math.pow((u - peakAt) * 2.0, 2));
      let v = mass * 0.94 + roll * 0.06;
      // 中带（li===1）是焦点：孤峰更突出；远带一侧渐隐，留出干净的空白
      const peakW = li === 1 ? (0.52 + 0.78 * peak) : (0.70 + 0.42 * peak);
      v = v * peakW;
      if (li === 0) {
        const fadeFrom = fadeSide > 0.5 ? 0.52 : 0.0;
        const t = fadeSide > 0.5 ? (u - fadeFrom) / (1 - fadeFrom) : (fadeFrom + 0.48 - u) / 0.48;
        const tt = Math.min(1, Math.max(0, t));
        v *= (1 - 0.88 * tt * tt * (3 - 2 * tt));   // 远山在一侧完全化入雾中
      }
      prof[x] = v;
    }
    const sm = new Float32Array(W);
    const R = 6;
    for (let pass = 0; pass < 2; pass++) {
      for (let x = 0; x < W; x++) {
        let s = 0, c = 0;
        for (let k = -R; k <= R; k++) { const xx = x + k; if (xx >= 0 && xx < W) { s += prof[xx]; c++; } }
        sm[x] = s / c;
      }
      if (pass === 0) for (let x = 0; x < W; x++) prof[x] = sm[x];
    }
    let lo = 1e9, hi = -1e9;
    for (let x = 0; x < W; x++) { if (sm[x] < lo) lo = sm[x]; if (sm[x] > hi) hi = sm[x]; }
    for (let x = 0; x < W; x++) sm[x] = 0.42 + 0.58 * Math.pow((sm[x] - lo) / (hi - lo + 1e-6), 0.85);
    return sm;
  });

  const crestY = bands.map((b, li) => {
    const arr = new Float32Array(W);
    for (let x = 0; x < W; x++) arr[x] = (b.yTop + (1 - profiles[li][x]) * (b.yBot - b.yTop)) * H;
    return arr;
  });

  /** 像素 (x,y) 对第 li 带的进深比：0=脊线，1=山脚；<0 = 带外 */
  function depthOf(li, x, y) {
    const c = crestY[li][x];
    if (y < c) return -1;
    const bot = bands[li].yBot * H;
    return Math.min(1.2, (y - c) / Math.max(1e-6, bot - c + 0.16 * H));
  }

  // ---------- 流场：T(x,y) 的等值方向 ⇒ 笔触走向 ----------
  const tScale = 3.1;
  function fieldT(x, y) {
    return fbm(permT, (x / W) * tScale, (y / H) * tScale * (H / W), 5, 1.0, 0.55);
  }

  // ---------- 生成笔触 ----------
  const strokes = [];
  const nBands = bands.length;
  const totalStrokes = Math.round((W * H) / 210 * INKGAIN * CUN);   // 皴=点缀，不是主体

  for (let s = 0; s < totalStrokes; s++) {
    const li = s % nBands;                       // 三条带轮流
    const b = bands[li];
    const x = Math.floor(rnd() * W);
    const c = crestY[li][x], bot = Math.min(H, b.yBot * H);
    if (bot <= c) continue;
    const u = Math.pow(rnd(), 1.65);             // 偏向脊线
    const y = Math.floor(c + u * (bot - c));
    const d = depthOf(li, x, y);
    if (d < 0 || d > 1.05) continue;
    // ① 水面以下【零笔触】—— 否则笔触会浮在空白纸面上变成碎屑
    if (y > waterLine * H) continue;

    // 低频掩码：决定"这一片要不要落笔" ⇒ 出现成片的皴与成片的留白
    const macro = fbm(permT, (x / W) * 1.25 + li * 3.7, (y / H) * 1.25 + li * 2.1, 3, 1.0, 0.5);
    const keep = Math.min(1, Math.max(0, (macro - 0.28) / 0.30));
    // ★ 取消"保底密度"：低密度区直接【零笔触】
    // 之前 0.25 的保底会让稀疏区的孤立笔触变成"浮在纸上的碎屑"，
    // 而真实水墨的笔触是【成片】的 —— 宁可这里一笔不画（留白）。
    const density = Math.pow(keep, 1.7) * (1 - d * 0.45);
    if (rnd() > density) continue;

    // ── 笔触方向：用【山形轮廓的切向】而不是噪声场的流线 ──
    // 教训：对噪声标量场做 LIC，流线会绕局部极值闭合成环 ⇒ 画出来是"一团面条"。
    // 中国画的皴是【短、有方向、成片】的，所以方向要来自山体本身。
    const xL = Math.max(0, x - 4), xR = Math.min(W - 1, x + 4);
    const slope = (crestY[li][xR] - crestY[li][xL]) / Math.max(1e-6, (xR - xL));
    const tanX = 1 / Math.hypot(1, slope), tanY = slope / Math.hypot(1, slope);

    const e = 2.0;
    const gx = fieldT(x + e, y) - fieldT(x - e, y);
    const gy = fieldT(x, y + e) - fieldT(x, y - e);
    const gmag = Math.hypot(gx, gy) + 1e-6;
    const steep = Math.min(1, gmag * 2.6);

    // 陡处用斧劈（顺坡向下、短、硬），缓处用披麻（顺山脊走向、稍长、软）
    const axe = rnd() < (0.18 + 0.45 * steep) * b.streak;
    let dirx, diry;
    if (axe) {
      dirx = -tanY; diry = tanX;                       // 轮廓法向 ≈ 下坡方向
      if (diry < 0) { dirx = -dirx; diry = -diry; }    // 保证朝下
    } else {
      dirx = tanX; diry = tanY;                        // 顺轮廓
    }
    // 少量噪声扰动，避免呆板
    const wob = (valueNoise(permR, x * 0.03, y * 0.03) - 0.5) * 0.5;
    const ca = Math.cos(wob), sa = Math.sin(wob);
    const ddx = dirx * ca - diry * sa, ddy = dirx * sa + diry * ca;

    // 尺寸/浓度拉出长尾分布：偶尔来一笔大的（焦墨），多数是细笔
    const big = rnd() < 0.07;
    const len = (axe ? (6 + rnd() * 12) : (12 + rnd() * 22)) * (big ? 2.1 : 1);
    const w0 = (axe ? 1.5 + rnd() * 2.4 : 1.1 + rnd() * 1.9) * (W / 900) * (big ? 2.6 : 1);
    const a0 = (axe ? 0.50 + rnd() * 0.45 : 0.28 + rnd() * 0.38)
             * b.ink * b.air * INKGAIN * (big ? 1.5 : 1);
    strokes.push({ x, y, dirx: ddx, diry: ddy, len, w0, a0, axe });
  }

  // ---------- 可分离盒式模糊（用于湿墨"洇边"）----------
  function boxBlur(src, w, h, r) {
    if (r < 1) return src.slice();
    const inv = 1 / (2 * r + 1);
    const tmp = new Float32Array(w * h), dst = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += src[row + Math.min(w - 1, Math.max(0, k))];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = sum * inv;
        sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
      for (let y = 0; y < h; y++) {
        dst[y * w + x] = sum * inv;
        sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    return dst;
  }


  // ---------- 【渲】湿墨主体：先在独立缓冲里算，才能做"洇边" ----------
  const washBuf = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const fy = y / H;
    // 云雾带
    let mist = 0;
    for (let m = 0; m < 3; m++) {
      const cy = 0.30 + m * 0.19 + (seed % 7) * 0.004;
      mist = Math.max(mist, Math.exp(-Math.pow((fy - cy) / 0.05, 2)) * (1 - m * 0.2));
    }
    const waterK = fy > waterLine ? (fy - waterLine) / Math.max(1e-6, 1 - waterLine) : 0;
    for (let x = 0; x < W; x++) {
      const fx = x / W;
      // ★ 边界扰动：让墨块边缘不是 silhouette 裁出来的硬边（关键：消"剪纸感"）
      const edge = (fbm(permW, fx * 8.5, fy * 8.5, 3, 1.0, 0.5) - 0.5) * 0.06;
      let wet = 0;
      for (let li = 0; li < nBands; li++) {
        const b = bands[li];
        const d = depthOf(li, x, y + edge * H);
        if (d < 0) continue;
        const t1 = fbm(permT, fx * 4.2 + li * 3.1, fy * 4.2 * (H / W) + li * 2.7, 4, 1.0, 0.55);
        // 低频浓度：让墨色成片浓淡（不是均匀铺）
        const macro = 0.50 + 0.50 * fbm(permW, fx * 1.7 + li * 2.2, fy * 1.7 + li * 1.3, 3, 1.0, 0.5);
        let w = (1 - d * b.wash) * (0.55 + 0.45 * t1) * macro * b.ink * b.air * INKGAIN;
        w *= (1 - mist * (li === 0 ? 0.80 : li === 1 ? 0.55 : 0.18));

        // ★ 墨分五色（②③）：用低频噪声调制"墨的浓度"（不是像素明度），
        //   并软量化到 4 阶 —— 同一块墨就有了中心浓、外缘淡的层次
        // ② 墨色层次：低频【浓度】调制，但必须【克制】
        //    上一版用 4 阶硬量化 + 幅度 0.46~1.32 ⇒ 出现"霉斑"。真实墨色过渡更细腻。
        const lvN = fbm(permW, fx * 0.9 + li * 1.7, fy * 2.6 * (H / W) + li * 0.9, 3, 1.0, 0.5);
        w *= (0.76 + 0.36 * lvN);

        // 飞白：只在边缘、且更稀有（避免满纸白点）
        const fb = fbm(permR, fx * 20, fy * 20 * (H / W), 2, 1.0, 0.5);
        const fbT = 0.70 + 0.10 * (1 - d);
        if (fb > fbT) {
          const k = Math.min(1, (fb - fbT) / 0.14);
          w *= (1 - 0.32 * k * k);
        }
        wet = Math.max(wet, w);
      }
      if (waterK > 0) wet *= Math.exp(-waterK * 3.2);
      washBuf[y * W + x] = wet;
    }
  }
  // ★ 多尺度模糊：墨在纸上洇开；同时保留一部分核心锐度
  const r0 = Math.max(1, Math.round(W * 0.004));
  const bS = boxBlur(washBuf, W, H, r0);
  const bM = boxBlur(washBuf, W, H, r0 * 3);
  const bL = boxBlur(washBuf, W, H, r0 * 8);
  for (let i = 0; i < washBuf.length; i++) {
    washBuf[i] = washBuf[i] * 0.52 + bS[i] * 0.28 + bM[i] * 0.14 + bL[i] * 0.06;
  }

  // ---------- 把笔触画进墨缓冲 ----------
  const buf = new Float32Array(W * H);
  const splat = (px, py, rad, a) => {
    if (a <= 0.002) return;
    const r = Math.ceil(rad);
    for (let dy = -r; dy <= r; dy++) {
      const yy = py + dy; if (yy < 0 || yy >= H) continue;
      for (let dxx = -r; dxx <= r; dxx++) {
        const xx = px + dxx; if (xx < 0 || xx >= W) continue;
        const dd = Math.sqrt(dxx * dxx + dy * dy) / rad;
        if (dd >= 1) continue;
        // ★ 只有在"渲"存在的地方才允许"皴"落笔：
        //   否则笔触会浮在空白纸面上，看起来像碎屑
        const gate = Math.min(1, washBuf[yy * W + xx] * 3.4);
        if (gate <= 0.02) continue;
        const f = (1 - dd) * (1 - dd) * a * (0.30 + 0.70 * gate);
        const i = yy * W + xx;
        if (f > buf[i]) buf[i] = f;      // 取 max，避免叠加成死黑
      }
    }
  };

  for (const st of strokes) {
    // 短笔 + 轻微摆动：不做逐步流线积分（那会闭合成环）
    const n = Math.max(3, Math.round(st.len));
    const cx = Math.cos((rnd() - 0.5) * 0.0);
    void cx;
    // 垂直方向的小摆动幅度（毛笔的手抖/提按）
    const px0 = -st.diry, py0 = st.dirx;
    const bow = (valueNoise(permR, st.x * 0.02, st.y * 0.02) - 0.5) * st.len * 0.28;
    for (let k = 0; k <= n; k++) {
      const t = k / n;                                  // 0..1
      const s0 = t - 0.5;
      let px = st.x + st.dirx * st.len * s0 + px0 * bow * (0.25 - s0 * s0 * 4);
      let py = st.y + st.diry * st.len * s0 + py0 * bow * (0.25 - s0 * s0 * 4);
      // 起收笔：两端细、中间粗
      const taper = Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.86 + 0.07)), 0.55);
      // 干湿断续
      const dry = valueNoise(permR, (px + py * 0.7) * 0.09, (py - px * 0.4) * 0.09);
      if (dry < (0.14 + 0.20 * (1 - t)) * WETK) continue;   // 干湿滑杆
      const wetv = 0.6 + 0.4 * valueNoise(permR, px * 0.05, py * 0.05);
      const a = st.a0 * taper * wetv;
      const w = st.w0 * (0.5 + 0.8 * taper);
      splat(Math.round(px), Math.round(py), Math.max(0.7, w), a);
    }
  }


  // ---------- 焦墨层：色域的黑端（只做这一件事，不改架构）----------
  // 目的：把 tonal range 拉到"纯黑 + 干净留白" —— cc 说这是缩略图能不能被点开的关键。
  const jiao = new Float32Array(W * H);
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const jsplat = (px, py, rad, a) => {
    if (a <= 0.006) return;
    const r = Math.ceil(rad);
    for (let dy = -r; dy <= r; dy++) {
      const yy = py + dy; if (yy < 0 || yy >= H) continue;
      for (let dxx = -r; dxx <= r; dxx++) {
        const xx = px + dxx; if (xx < 0 || xx >= W) continue;
        const dd = Math.sqrt(dxx * dxx + dy * dy) / rad;
        if (dd >= 1) continue;
        const f = (1 - dd) * (1 - dd) * a;
        const i = yy * W + xx;
        if (f > jiao[i]) jiao[i] = f;          // 焦墨取 max：叠成死黑
      }
    }
  };
  /** 焦墨用笔：提按 + 枯竭 + 笔头分股（外缘先枯 ⇒ 飞白是力学结果） */
  function jbrush(px, py, dx, dy, len, Wd, L0, dry) {
    const nx = -dy, ny = dx;
    const n = Math.max(6, Math.round(len));
    let used = 0;
    for (let k = 0; k <= n; k++) {
      const t = k / n, s0 = t - 0.5;
      const x = px + dx * len * s0, y = py + dy * len * s0;
      const press = clamp01(t / 0.08) * (1 - 0.75 * clamp01((t - 0.55) / 0.45));
      const w = Wd * press;
      used += press * (len / n);
      const L = L0 * Math.exp(-dry * used);
      if (L <= 0.06) break;
      const K = Math.max(2, Math.round(w / 1.5));
      for (let j = 0; j < K; j++) {
        const bb = (j / (K - 1) - 0.5) * w;
        const Lj = L * (1 - 0.9 * Math.abs(bb) / Math.max(0.6, w / 2));
        if (Lj <= 0.15) continue;               // 外缘股先枯 ⇒ 飞白
        jsplat(Math.round(x + nx * bb), Math.round(y + ny * bb), 1.05, Lj);
      }
    }
  }

  for (let li = 0; li < nBands; li++) {
    const b = bands[li];
    const bottom = Math.min(H, b.yBot * H);
    // (1) 骨线：沿【龙脉主脊】—— 干笔、强提按、被枯竭打断成碎段（不是描外轮廓）
    for (let x = 2; x < W - 2; x += 2) {
      const y = crestY[li][x];
      if (y > waterLine * H) continue;
      if (valueNoise(permR, x * 0.09, li * 2.3) < 0.34) continue;      // 枯断
      const press = valueNoise(permR, x * 0.012, li * 7.7);
      const a = (0.55 + 0.75 * press) * b.ink * b.air * INKGAIN;
      const w = (2.2 + 4.6 * press) * (W / 900);
      const dx = 1, dy = (crestY[li][Math.min(W - 1, x + 2)] - y) / 2;
      const m = Math.hypot(dx, dy) + 1e-6;
      jbrush(x, y, dx / m, dy / m, 14 + 12 * press, w, a * 2.6, 0.42);
    }
    // (2) 支脉：从主脊的局部峰向下伸入山体（这是"龙脉"，不是外轮廓）
    const nB = 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < nB; k++) {
      const x0 = Math.floor((0.12 + 0.76 * (k + rnd()) / nB) * W);
      let bx = x0, by = crestY[li][x0];
      let ang = (rnd() - 0.5) * 0.8;
      for (let st = 0; st < 9; st++) {
        ang += (valueNoise(permR, bx * 0.01, by * 0.01 + k * 3) - 0.5) * 0.4;
        const step = 26 + rnd() * 34;
        const ex = bx + Math.sin(ang) * step * (W / 900) * 1.5;
        const ey = by + Math.cos(ang) * step;
        if (ex < 0 || ex >= W || ey > bottom || ey > waterLine * H) break;
        const ddx = (ex - bx), ddy = (ey - by); const mm = Math.hypot(ddx, ddy) + 1e-6;
        jbrush(bx, by, ddx / mm, ddy / mm, mm, (3.0 + 3.4 * rnd()) * (W / 900),
               (0.42 + 0.42 * rnd()) * b.ink * b.air * INKGAIN, 0.42 + rnd() * 0.34);
        bx = ex; by = ey;
      }
    }
  }
  // (3) 近黑核：3–8 个（压最黑，给缩略图一个"点"）
  const nCore = Math.max(2, Math.round((6 + Math.floor(rnd() * 7)) * CUN));
  for (let k = 0; k < nCore; k++) {
    const li = 1 + (k % 2);                     // 中/近景
    const b = bands[li];
    const x = Math.floor((0.16 + 0.68 * rnd()) * W);
    const y = crestY[li][x] + (6 + rnd() * 26) * (W / 900);
    if (y > waterLine * H) continue;
    jsplat(x, Math.round(y), (8 + rnd() * 14) * (W / 900), 0.92 + rnd() * 0.08);
  }

  // ---------- 合成：渲为主体，皴为点缀，焦墨点醒 ----------
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const fy = y / H;
    for (let x = 0; x < W; x++) {
      const fx = x / W;
      const i = y * W + x;

      const wash = washBuf[i];
      const st = buf[i];

      // 渲打底；皴压在渲上（更实、更黑）
      let ink = wash * 1.15;
      ink = ink + st * 0.92 * (1 - ink * 0.30);
      ink = ink + jiao[i] * 1.45 * (1 - ink * 0.15);   // 焦墨压黑端
      ink = Math.min(1, ink);
      ink = Math.pow(ink, 0.80);

      const fiber = valueNoise(permW, fx * W * 0.5, fy * H * 0.5) * 0.028;
      const grain = (valueNoise(permW, fx * W * 1.6 + 11, fy * H * 1.6 + 7) - 0.5) * 0.022;
      const col = [lerp(PAPER[0], INK[0], ink), lerp(PAPER[1], INK[1], ink), lerp(PAPER[2], INK[2], ink)];
      const dx2 = (fx - 0.5) * 1.12, dy2 = (fy - 0.5) * 1.02;
      const vig = 1 - 0.085 * Math.pow(Math.min(1, dx2 * dx2 + dy2 * dy2) * 2.0, 1.3);

      const j = i * 4;
      out[j]     = col[0] * vig + fiber * 255 + grain * 255;
      out[j + 1] = col[1] * vig + fiber * 255 + grain * 255;
      out[j + 2] = col[2] * vig + fiber * 255 + grain * 255;
      out[j + 3] = 255;
    }
  }
  return { data: out, w: W, h: H, strokes: strokes.length };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { renderInk, rng, valueNoise, fbm };
