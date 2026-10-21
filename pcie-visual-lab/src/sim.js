// PCIe 串行链路行为级仿真：PRBS → TX FFE → 有损信道 → 噪声 → CTLE → DFE → 折叠眼图
// 时间单位统一用 UI（Unit Interval，一个符号的时长），每 UI 采样 SPU 点。
// 这是教学用的简化模型：信道用多极点低通近似，不追求与真实 S 参数逐点吻合，
// 但损耗、ISI、均衡、抖动、噪声之间的因果关系是对的。

export const SPU = 32;
export const Q12 = 7.034;          // BER = 1e-12 对应的 Q 值
export const NYQ = 0.5;            // NRZ 奈奎斯特频率 = 0.5 周期/UI

/* ---------- PCIe 5.0 规范 Table 8-1：TX Preset ---------- */
export const PRESETS = [
  ['P0', 0,   -6.0, 0,      -0.25 ],
  ['P1', 0,   -3.5, 0,      -0.167],
  ['P2', 0,   -4.4, 0,      -0.2  ],
  ['P3', 0,   -2.5, 0,      -0.125],
  ['P4', 0,    0,   0,       0    ],
  ['P5', 1.9,  0,  -0.1,     0    ],
  ['P6', 2.5,  0,  -0.125,   0    ],
  ['P7', 3.5, -6.0, -0.1,   -0.2  ],
  ['P8', 3.5, -3.5, -0.125, -0.125],
  ['P9', 3.5,  0,  -0.166,   0    ],
  ['P10', 0,  null, 0,      -0.333]   // P10 的去加重取决于 LF，这里取 LF/FS = 1/3 作示例
].map(([id, pre, de, cm1, cp1]) => ({ id, pre, de, cm1, cp1, c0: +(1 - Math.abs(cm1) - Math.abs(cp1)).toFixed(3) }));

export const ffeOf = (cm1, cp1) => ({ cm1, cp1, c0: 1 - Math.abs(cm1) - Math.abs(cp1) });

/* ---------- 代际参数 ---------- */
export const GENS = {
  3: { name: 'Gen3', rate: 8,  baud: 8,  ui: 125,   mod: 'nrz',  loss: 20, enc: '128b/130b' },
  4: { name: 'Gen4', rate: 16, baud: 16, ui: 62.5,  mod: 'nrz',  loss: 26, enc: '128b/130b' },
  5: { name: 'Gen5', rate: 32, baud: 32, ui: 31.25, mod: 'nrz',  loss: 32, enc: '128b/130b' },
  6: { name: 'Gen6', rate: 64, baud: 32, ui: 31.25, mod: 'pam4', loss: 30, enc: 'FLIT, PAM4' }
};

/* ---------- 随机数 ---------- */
export function rng(seed = 1) {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let spare = null;
  u.gauss = () => { if (spare !== null) { const s = spare; spare = null; return s; }
    let x, y, r; do { x = u()*2 - 1; y = u()*2 - 1; r = x*x + y*y; } while (!r || r >= 1);
    const m = Math.sqrt(-2*Math.log(r)/r); spare = y*m; return x*m; };
  return u;
}

/* ---------- PRBS ---------- */
const PRBS_TAPS = { 7: 6, 9: 5, 11: 9, 15: 14, 23: 18, 31: 28 };
export function prbs(n, order = 7, seed = 0x5a) {
  const t = PRBS_TAPS[order], mask = (1 << order) - 1;
  let s = (seed & mask) || 1; const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const b = ((s >> (order - 1)) ^ (s >> (t - 1))) & 1; s = ((s << 1) | b) & mask; out[i] = b; }
  return out;
}
// NRZ：0/1 → -1/+1；PAM4：两比特格雷码 → -1, -1/3, +1/3, +1
export function toSymbols(bits, mod) {
  if (mod !== 'pam4') return Float32Array.from(bits, b => b ? 1 : -1);
  const lv = { 0: -1, 1: -1/3, 3: 1/3, 2: 1 }, n = bits.length >> 1, s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = lv[(bits[2*i] << 1) | bits[2*i+1]];
  return s;
}
export const levelsOf = mod => mod === 'pam4' ? [-1, -1/3, 1/3, 1] : [-1, 1];

/* ---------- 滤波积木 ---------- */
function onePole(x, fc) {
  const a = 1 - Math.exp(-2*Math.PI*fc/SPU), y = new Float32Array(x.length); let s = 0;
  for (let i = 0; i < x.length; i++) { s += a*(x[i] - s); y[i] = s; }
  return y;
}
const cmul = (a, b) => [a[0]*b[0] - a[1]*b[1], a[0]*b[1] + a[1]*b[0]];
const cdiv1 = (f, fc) => { const d = 1 + (f/fc)**2; return [1/d, -(f/fc)/d]; }; // 1/(1+jf/fc)

/* ---------- 信道：快路径 4 极点 + 慢路径 1 极点（模拟趋肤效应的长拖尾） ---------- */
export const CFG = { nPole: 2, wSlow: .55, slow: .15, fz: .15, fp: 1.0 };
function chH(f, fc) {
  let p = [1, 0]; const q = cdiv1(f, fc); for (let i = 0; i < CFG.nPole; i++) p = cmul(p, q);
  const s = cdiv1(f, fc*CFG.slow), w = CFG.wSlow;
  return [(1-w)*p[0] + w*s[0], (1-w)*p[1] + w*s[1]];
}
const fcCache = new Map();
export function channelFc(lossDb) {
  const key = [lossDb.toFixed(2), CFG.nPole, CFG.wSlow, CFG.slow].join('|'); if (fcCache.has(key)) return fcCache.get(key);
  const target = 10 ** (-lossDb/20); let lo = .005, hi = 50;
  for (let i = 0; i < 60; i++) { const m = Math.sqrt(lo*hi), h = chH(NYQ, m), mag = Math.hypot(h[0], h[1]); if (mag > target) hi = m; else lo = m; }
  const fc = Math.sqrt(lo*hi); fcCache.set(key, fc); return fc;
}
export function channelMag(f, lossDb) { if (lossDb <= 0) return 1; const h = chH(f, channelFc(lossDb)); return Math.hypot(h[0], h[1]); }
export function channel(x, lossDb) {
  if (lossDb <= 0) return Float32Array.from(x);
  const fc = channelFc(lossDb);
  let fast = x; for (let i = 0; i < CFG.nPole; i++) fast = onePole(fast, fc);
  const slow = onePole(x, fc*CFG.slow), y = new Float32Array(x.length), w = CFG.wSlow;
  for (let i = 0; i < x.length; i++) y[i] = (1-w)*fast[i] + w*slow[i];
  return y;
}

/* ---------- TX：3 抽头 FFE + 上升沿 ---------- */
export const SWING = 0.4;   // 单边峰值 0.4 V，即差分 800 mVpp（满摆幅）
export function txWave(sym, ffe, swing = SWING) {
  const n = sym.length, x = new Float32Array(n*SPU);
  for (let k = 0; k < n; k++) {
    const v = swing*(ffe.cm1*(k+1 < n ? sym[k+1] : 0) + ffe.c0*sym[k] + ffe.cp1*(k > 0 ? sym[k-1] : 0));
    x.fill(v, k*SPU, (k+1)*SPU);
  }
  return onePole(onePole(x, 2.2), 2.2);
}
export function ffeMag(f, ffe) { // |c-1·e^{+jω} + c0 + c+1·e^{-jω}|，ω = 2πf（f 以周期/UI 计）
  const w = 2*Math.PI*f, re = ffe.cm1*Math.cos(w) + ffe.c0 + ffe.cp1*Math.cos(w), im = ffe.cm1*Math.sin(w) - ffe.cp1*Math.sin(w);
  return Math.hypot(re, im);
}

/* ---------- RX：CTLE（一个零点 + 一个极点；与规范参考 CTLE 一样，用直流衰减换取相对高频增益） ---------- */
const ctleK = db => 10 ** (db/20) - 1;
export function ctle(x, peakDb) {
  if (peakDb <= 0) return Float32Array.from(x);
  const k = ctleK(peakDb), lz = onePole(x, CFG.fz), y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = (x[i] + k*(x[i] - lz[i]))/(1 + k);   // 直流衰减 peakDb，高频约 0 dB
  return onePole(y, CFG.fp);
}
export function ctleMag(f, peakDb) {
  if (peakDb <= 0) return 1;
  const k = ctleK(peakDb), z = cdiv1(f, CFG.fz);             // 1/(1+jf/fz)
  const hp = [1 - z[0], -z[1]];                                // jf/fz/(1+jf/fz) = 1 - 1/(1+jf/fz)
  const num = [(1 + k*hp[0])/(1 + k), k*hp[1]/(1 + k)], p = cdiv1(f, CFG.fp);
  const h = cmul(num, p); return Math.hypot(h[0], h[1]);
}

/* ---------- 脉冲响应 ---------- */
const PP = 6, PLEN = 56;
export function pulseResponse({ ffe, loss, ctleDb = 0, swing = SWING }) {
  const sym = new Float32Array(PLEN); sym[PP] = 1;
  // 用 +1/0 激励，线性系统下即单个符号的贡献
  const tx = txWave(sym, ffe, swing), ch = channel(tx, loss), rx = ctle(ch, ctleDb);
  const pick = arr => { let im = 0; for (let i = 0; i < arr.length; i++) if (arr[i] > arr[im]) im = i;
    const h = []; for (let c = -3; c <= 40; c++) { const j = im + c*SPU; h.push(j >= 0 && j < arr.length ? arr[j] : 0); }
    return { wave: arr, peak: im, off: im - PP*SPU, h, h0: arr[im] }; };
  return { start: PP*SPU, tx: pick(tx), ch: pick(ch), rx: pick(rx) };
}
// 峰值失真法估算眼高：主游标减去所有未被 DFE 消掉的 ISI 绝对值之和
export function peakDistortionEH(pr, nDfe = 0) {
  const h = pr.h; let isi = 0;
  for (let c = -3; c <= 40; c++) { if (c === 0) continue; if (c >= 1 && c <= nDfe) continue; isi += Math.abs(h[c+3]); }
  return h[3] - isi;
}

/* ---------- 完整仿真 ---------- */
export function simulate(p) {
  const mod = p.mod || 'nrz', R = rng(p.seed || 7);
  const nSym = p.nSym || 2400;
  const bits = prbs(mod === 'pam4' ? nSym*2 : nSym, p.prbs || 9, 0x5a);
  const sym = toSymbols(bits, mod);
  const ffe = p.ffe || ffeOf(0, 0);
  const tx = txWave(sym, ffe);
  const ch = channel(tx, p.loss);
  const noise = new Float32Array(ch.length), sigma = (p.noiseMv || 0)/1000;
  if (sigma > 0) {
    // 噪声先限带到约 1 周期/UI（接收前端带宽），再归一化到指定 σ
    const w = new Float32Array(ch.length); for (let i = 0; i < w.length; i++) w[i] = R.gauss();
    const b = onePole(onePole(w, 1), 1); let e = 0; for (let i = 0; i < b.length; i++) e += b[i]*b[i];
    const g = sigma/Math.sqrt(e/b.length); for (let i = 0; i < b.length; i++) noise[i] = g*b[i];
  }
  // 串扰：相邻 Lane 的随机信号经过高通耦合进来
  if (p.xtalkMv > 0) {
    const ag = txWave(toSymbols(prbs(nSym*(mod === 'pam4' ? 2 : 1), 11, 0x33), mod), ffeOf(0, 0), 1);
    const lp = onePole(ag, .3), g = p.xtalkMv/1000/.6;
    for (let i = 0; i < noise.length; i++) noise[i] += g*(ag[i] - lp[i]);
  }
  const chN = new Float32Array(ch.length); for (let i = 0; i < ch.length; i++) chN[i] = ch[i] + noise[i];
  const rx = ctle(ch, p.ctleDb || 0), rxNoise = ctle(noise, p.ctleDb || 0);
  let s1 = 0, s2 = 0; for (let i = 0; i < rxNoise.length; i++) { s1 += rxNoise[i]; s2 += rxNoise[i]*rxNoise[i]; }
  const sigmaOut = Math.sqrt(Math.max(0, s2/rxNoise.length - (s1/rxNoise.length)**2));
  let c1 = 0, c2 = 0; for (let i = 0; i < noise.length; i++) c2 += noise[i]*noise[i];
  const sigmaIn = Math.sqrt(c2/noise.length);
  const pr = pulseResponse({ ffe, loss: p.loss, ctleDb: p.ctleDb || 0 });
  const nDfe = p.dfeTaps || 0, h0 = pr.rx.h0;
  const dfe = []; for (let i = 1; i <= nDfe; i++) dfe.push(Math.max(-.6*h0, Math.min(.6*h0, pr.rx.h[i+3])));
  return { p, mod, sym, ffe, tx, ch, chN, noise, rx, rxNoise, sigmaIn, sigmaOut, pr, dfe };
}

/* ---------- 眼图折叠（得到 2 UI × ny 的命中密度） ---------- */
export function foldEye(wave, sym, o) {
  const nx = 2*SPU, ny = o.ny || 96, vmax = o.vmax, hist = new Float32Array(nx*ny);
  const R = rng(o.seed || 3), add = o.add || null, dfe = o.dfe || null, jit = o.jit || null;
  const skip = o.skip ?? 80, n = sym.length;
  const yOf = v => Math.max(0, Math.min(ny - 1, Math.round((v + vmax)/(2*vmax)*(ny - 1))));
  let maxH = 0;
  for (let k = skip; k < n - 3; k++) {
    let sh = 0;
    if (jit) sh = Math.round(((jit.rj || 0)*R.gauss() + (jit.sj || 0)*Math.sin(2*Math.PI*k/(jit.sjPeriod || 97)))*SPU);
    const start = k*SPU + o.off + sh - SPU;
    if (start < 0 || start + nx + 1 >= wave.length) continue;
    let corr = 0; if (dfe) for (let i = 0; i < dfe.length; i++) corr += dfe[i]*(sym[k-1-i] || 0);
    let py = -1;
    for (let j = 0; j < nx; j++) {
      const idx = start + j, v = wave[idx] + (add ? add[idx] : 0) - corr, y = yOf(v);
      if (py < 0) py = y;
      const a = Math.min(py, y), b = Math.max(py, y);
      for (let yy = a; yy <= b; yy++) { const c = ++hist[yy*nx + j]; if (c > maxH) maxH = c; }
      py = y;
    }
  }
  return { hist, nx, ny, vmax, maxH };
}

/* ---------- 统计眼测量（外推到 BER 1e-12） ---------- */
const LN10 = Math.LN10;
function erfc(x) { // Abramowitz–Stegun 7.1.26
  const t = 1/(1 + .3275911*x), y = t*(.254829592 + t*(-.284496736 + t*(1.421413741 + t*(-1.453152027 + t*1.061405429))));
  return y*Math.exp(-x*x);
}
export function log10Q(x) {
  if (x <= 0) return Math.log10(.5);
  if (x < 5) return Math.log10(.5*erfc(x/Math.SQRT2));
  return (-x*x/2)/LN10 - Math.log10(x*Math.sqrt(2*Math.PI));
}
const logAdd = (a, b) => { const m = Math.max(a, b); return m + Math.log10(10**(a - m) + 10**(b - m)); };

export function measureEye(wave, sym, o) {
  const levels = levelsOf(o.mod), nx = 2*SPU, n = sym.length, dfe = o.dfe || null, skip = o.skip ?? 80;
  const eyes = [];
  for (let e = 0; e < levels.length - 1; e++) eyes.push({ lo: levels[e], hi: levels[e+1], up: new Float32Array(nx).fill(Infinity), dn: new Float32Array(nx).fill(-Infinity), sumU: 0, sumD: 0, nU: 0, nD: 0 });
  for (let k = skip; k < n - 3; k++) {
    const start = k*SPU + o.off - SPU; if (start < 0 || start + nx >= wave.length) continue;
    let corr = 0; if (dfe) for (let i = 0; i < dfe.length; i++) corr += dfe[i]*(sym[k-1-i] || 0);
    const s = sym[k];
    for (const E of eyes) {
      const isU = Math.abs(s - E.hi) < 1e-3, isD = Math.abs(s - E.lo) < 1e-3; if (!isU && !isD) continue;
      for (let j = 0; j < nx; j++) { const v = wave[start + j] - corr; if (isU) { if (v < E.up[j]) E.up[j] = v; } else if (v > E.dn[j]) E.dn[j] = v; }
      const vc = wave[start + SPU] - corr; if (isU) { E.sumU += vc; E.nU++; } else { E.sumD += vc; E.nD++; }
    }
  }
  const sv = o.sigmaV || 0, rj = Math.max(o.rj || 0, 1e-4), sj = o.sj || 0;
  for (const E of eyes) {
    E.raw = Array.from(E.up, (u, j) => u - E.dn[j]);
    E.mid = (E.up[SPU] + E.dn[SPU])/2;
    E.ehIsi = E.raw[SPU];
    E.eh = E.ehIsi - 2*Q12*sv;
    let l = SPU, r = SPU;
    if (E.raw[SPU] - 2*Q12*sv > 0) {
      while (l > 0 && E.raw[l-1] - 2*Q12*sv > 0) l--;
      while (r < nx - 1 && E.raw[r+1] - 2*Q12*sv > 0) r++;
      E.wNoise = (r - l + 1)/SPU;
    } else E.wNoise = 0;
    let L = SPU, Rr = SPU;
    if (E.raw[SPU] > 0) { while (L > 0 && E.raw[L-1] > 0) L--; while (Rr < nx - 1 && E.raw[Rr+1] > 0) Rr++; }
    E.tL = (L - SPU)/SPU - .5/SPU; E.tR = (Rr - SPU)/SPU + .5/SPU;
    E.ew = Math.max(0, E.wNoise - 2*Q12*(o.rj || 0) - 2*sj);
    // 浴盆曲线：相位 φ（UI，相对中心）处的 log10(BER)
    E.bathtub = [];
    for (let j = 0; j < nx; j++) {
      const phi = (j - SPU)/SPU;
      let lb;
      if (E.raw[j] <= 0 || E.raw[SPU] <= 0) lb = Math.log10(.5);
      else {
        const lt = Math.log10(.5) + log10Q((phi - E.tL - sj)/rj), rt = Math.log10(.5) + log10Q((E.tR - sj - phi)/rj);
        const vt = sv > 0 ? Math.log10(.5) + log10Q(E.raw[j]/2/sv) : -40;
        lb = Math.min(Math.log10(.5), logAdd(logAdd(lt, rt), vt));
      }
      E.bathtub.push(Math.max(-20, lb));
    }
  }
  const worst = eyes.reduce((a, b) => (b.eh < a.eh ? b : a));
  return { eyes, eh: worst.eh, ehIsi: worst.ehIsi, ew: Math.min(...eyes.map(e => e.ew)), worst };
}

/* ---------- 一次跑完：仿真 + 各阶段眼 ---------- */
export function runChain(p, stages = ['rx']) {
  const S = simulate(p), out = { S };
  const j = { rj: p.rjUi || 0, sj: p.sjUi || 0 };
  const vm = arr => { let m = 0; for (let i = 2000; i < arr.length; i++) { const a = Math.abs(arr[i]); if (a > m) m = a; } return m*1.12 || .1; };
  for (const st of stages) {
    let w, add = null, off, dfe = null, sv = 0;
    if (st === 'tx') { w = S.tx; off = S.pr.tx.off; }
    else if (st === 'ch') { w = S.ch; add = S.noise; off = S.pr.ch.off; sv = S.sigmaIn; }
    else if (st === 'rx') { w = S.rx; add = S.rxNoise; off = S.pr.rx.off; sv = S.sigmaOut; }
    else { w = S.rx; add = S.rxNoise; off = S.pr.rx.off; dfe = S.dfe.length ? S.dfe : null; sv = S.sigmaOut; }
    const vmax = p.vmax || vm(add ? Float32Array.from(w, (v, i) => v + add[i]) : w);
    out[st] = {
      eye: foldEye(w, S.sym, { off, vmax, add, dfe, jit: j, ny: p.ny || 96 }),
      m: measureEye(w, S.sym, { off, dfe, mod: S.mod, sigmaV: sv, rj: j.rj, sj: j.sj }),
      vmax, off
    };
  }
  return out;
}
