// 场景、通用 3D 积木、面板 UI、2D 曲线
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export { THREE };
export const COL = { tx:0x5ccfe6, rx:0xef7fa8, copper:0xd9954a, ok:0x7fd18b, bad:0xf06464, dllp:0xb48cf0, data:0x51707a, amber:0xe8b04a, dim:0x3f6a72 };
export const CSS = { fg:'#d9e5e7', muted:'#8ba1a6', line:'#21373d', grid:'#1a2d32', tx:'#5ccfe6', rx:'#ef7fa8', copper:'#d9954a', ok:'#7fd18b', bad:'#f06464', dllp:'#b48cf0', amber:'#e8b04a' };
export const FONT = '"Microsoft YaHei UI","PingFang SC","Noto Sans SC","Segoe UI",sans-serif';
export const MONO = '"Cascadia Mono",Consolas,"JetBrains Mono",monospace';
export const ease = u => u < .5 ? 2*u*u : 1 - Math.pow(-2*u + 2, 2)/2;
export const V = (x, y, z) => new THREE.Vector3(x, y, z);
const $ = s => document.querySelector(s);

/* ---------- 渲染器与场景 ---------- */
export const stageEl = $('#stage');
const canvas = $('#gl');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1316);
scene.fog = new THREE.Fog(0x0a1316, 40, 80);
export const camera = new THREE.PerspectiveCamera(42, 1, .05, 300);
export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = .08; controls.maxDistance = 60; controls.minDistance = 2;
window.__lab = { camera, controls, scene };   // 便于在控制台调试
scene.add(new THREE.HemisphereLight(0xcfe3e8, 0x0a1316, .8));
const sun = new THREE.DirectionalLight(0xffffff, .9); sun.position.set(6, 14, 10); scene.add(sun);
export const floor = new THREE.Group(); scene.add(floor);
{
  const board = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: 0x0e2427, roughness: .92 }));
  board.rotation.x = -Math.PI/2; board.position.y = -.01; floor.add(board);
  const grid = new THREE.GridHelper(90, 90, 0x1b3c41, 0x132e33); grid.position.y = .001; floor.add(grid);
}

export const state = { R: null, gen: 0, busy: false, update: null };
const tweens = [], flashers = [];

/* ---------- 标签精灵 ---------- */
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x+r, y); g.arcTo(x+w, y, x+w, y+h, r); g.arcTo(x+w, y+h, x, y+h, r); g.arcTo(x, y+h, x, y, r); g.arcTo(x, y, x+w, y, r); g.closePath(); }
export function label(text, o = {}) {
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: !!o.depthTest, depthWrite: false }));
  sp.renderOrder = 30;
  const ax = o.anchor === 'left' ? 0 : o.anchor === 'right' ? 1 : .5;
  sp.center.set(ax, o.anchor === 'bottom' ? 0 : o.vAnchor === 'bottom' ? 0 : .5);
  function draw(t) {
    if (t !== undefined) sp.userData.text = t;
    const lines = String(sp.userData.text).split('\n'), fs = 40, lh = fs*1.3, px = o.bg === false ? 6 : 18, py = o.bg === false ? 4 : 10;
    const font = `${o.weight || 600} ${fs}px ${o.mono ? MONO : FONT}`;
    g.font = font; let w = 0; for (const l of lines) w = Math.max(w, g.measureText(l).width);
    cv.width = Math.max(8, Math.ceil(w + px*2)); cv.height = Math.ceil(lh*lines.length + py*2);
    g.font = font; g.textBaseline = 'middle'; g.textAlign = o.align === 'left' ? 'left' : 'center';
    if (o.bg !== false) { g.fillStyle = o.bg || 'rgba(9,18,21,0.88)'; rr(g, 2, 2, cv.width-4, cv.height-4, 12); g.fill(); g.lineWidth = 3; g.strokeStyle = o.border || 'rgba(217,149,74,0.55)'; g.stroke(); }
    g.fillStyle = o.color || CSS.fg;
    lines.forEach((l, i) => g.fillText(l, o.align === 'left' ? px : cv.width/2, py + lh*(i + .5)));
    tex.needsUpdate = true;
    const hw = (o.size || .32)*cv.height/lh; sp.scale.set(hw*cv.width/cv.height, hw, 1);
  }
  sp.userData.o = o; sp.userData.draw = draw; draw(text);
  return sp;
}
export function place(sp, x, y, z, parent) { sp.position.set(x, y, z); (parent || state.R).add(sp); return sp; }

/* ---------- 积木 ---------- */
export function stdMat(c, e = .45, extra = {}) { return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: e, roughness: .45, ...extra }); }
export function chip({ w = 2, h = .45, d = 1.2, color = 0x2c434b, pos = [0, 0, 0], text = '', labelSize = .3, parent }) {
  const grp = new THREE.Group(); grp.position.set(...pos);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: .55, metalness: .25 }));
  mesh.position.y = h/2; grp.add(mesh);
  const top = new THREE.Mesh(new THREE.BoxGeometry(w*.84, .02, d*.78), new THREE.MeshStandardMaterial({ color: 0x0c171a, roughness: .35, metalness: .5 }));
  top.position.y = h + .01; grp.add(top);
  let lb = null; if (text) { lb = label(text, { size: labelSize, vAnchor: 'bottom' }); lb.position.y = h + .25; grp.add(lb); }
  (parent || state.R).add(grp);
  const c = { grp, mesh, label: lb, h,
    flash(col = COL.copper, k = 1.6) { c.col = new THREE.Color(col); c.k = k; if (!flashers.includes(c)) flashers.push(c); },
    setText(t) { lb && lb.userData.draw(t); } };
  return c;
}
export function trace(pts, color = COL.copper, w = .12, parent, h = .03) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: .35, metalness: .65, emissive: color, emissiveIntensity: .12 });
  for (let i = 0; i < pts.length - 1; i++) {
    const a = V(...pts[i]), b = V(...pts[i+1]), len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len + w, h, w), mat);
    m.position.copy(a).add(b).multiplyScalar(.5);
    m.quaternion.setFromUnitVectors(V(1, 0, 0), b.clone().sub(a).normalize());
    grp.add(m);
  }
  (parent || state.R).add(grp); return grp;
}
export function P(pts) {
  const v = pts.map(p => V(p[0], p[1], p[2])), seg = []; let L = 0;
  for (let i = 0; i < v.length - 1; i++) { const l = v[i].distanceTo(v[i+1]); seg.push(l); L += l; }
  return { L, rev: () => P(pts.slice().reverse()),
    at(u, out = V()) { let d = Math.max(0, Math.min(1, u))*L;
      for (let i = 0; i < seg.length; i++) { if (d <= seg[i] || i === seg.length - 1) return out.lerpVectors(v[i], v[i+1], seg[i] ? Math.min(1, d/seg[i]) : 1); d -= seg[i]; }
      return out.copy(v[v.length - 1]); } };
}
// 可每帧更新的折线
export function polyline(n, color, parent, opts = {}) {
  const geo = new THREE.BufferGeometry(); const pos = new Float32Array(n*3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = opts.dashed ? new THREE.LineDashedMaterial({ color, dashSize: .15, gapSize: .1, transparent: true, opacity: opts.opacity ?? 1 })
                          : new THREE.LineBasicMaterial({ color, transparent: true, opacity: opts.opacity ?? 1 });
  const line = new THREE.Line(geo, mat); line.frustumCulled = false;
  (parent || state.R).add(line);
  line.userData.set = (fn) => { for (let i = 0; i < n; i++) { const p = fn(i); pos[3*i] = p[0]; pos[3*i+1] = p[1]; pos[3*i+2] = p[2]; } geo.attributes.position.needsUpdate = true; if (opts.dashed) line.computeLineDistances(); };
  return line;
}
// 粗线：用细长方块串起来的“带”，适合 3D 中强调的波形
export function ribbon(pts, color, width = .05, parent, opacity = 1) {
  const n = pts.length, pos = [], idx = [];
  for (let i = 0; i < n; i++) { const [x, y, z] = pts[i]; pos.push(x, y - width/2, z, x, y + width/2, z); if (i < n - 1) { const a = 2*i; idx.push(a, a+1, a+2, a+1, a+3, a+2); } }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: opacity < 1, opacity }));
  (parent || state.R).add(m); return m;
}
export function disposeTree(o) { o.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material) [].concat(n.material).forEach(m => { m.map && m.map.dispose(); m.dispose(); }); }); }
export function kill(o) { if (!o) return; o.parent && o.parent.remove(o); disposeTree(o); }
export function clearGroup(g) { while (g.children.length) { const c = g.children[0]; g.remove(c); disposeTree(c); } }

/* ---------- 动画 ---------- */
export function tween(dur, fn) { const g = state.gen; return new Promise(res => tweens.push({ t: 0, dur: Math.max(dur, 1e-3), fn, res, g })); }
export const wait = s => tween(s, () => {});
export const fly = (o, path, dur) => tween(dur, u => path.at(ease(u), o.position));
export function moveCam(pos, target, dur = 1.1) {
  const p0 = camera.position.clone(), t0 = controls.target.clone(), p1 = V(...pos), t1 = V(...target);
  return tween(dur, u => { const e = ease(u); camera.position.lerpVectors(p0, p1, e); controls.target.lerpVectors(t0, t1, e); });
}

/* ---------- 面板 UI ---------- */
export const ui = {
  controls: $('#controls'), status: $('#status'), log: $('#log'), plots: $('#plots'),
  reset() { for (const k of ['controls', 'plots']) this[k].innerHTML = ''; this.status.innerHTML = ''; this.status.hidden = true; this.log.innerHTML = ''; this.log.hidden = true; this._s = ''; },
  group(title) { const d = document.createElement('div'); d.className = 'cgroup'; if (title) d.innerHTML = `<p class="cg-title">${title}</p>`; this.controls.appendChild(d); return d; },
  button(text, fn, cls = '', parent) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + cls; b.textContent = text; b.addEventListener('click', fn); (parent || this.controls).appendChild(b); return b; },
  toggle(text, val, fn, parent) { const b = this.button(text, () => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); fn(on); }, 'toggle', parent); b.setAttribute('aria-pressed', String(!!val)); return b; },
  seg(title, opts, val, fn, parent) {
    const wrap = document.createElement('div'); wrap.className = 'seg';
    wrap.innerHTML = `<span class="seg-title">${title}</span>`;
    const row = document.createElement('div'); row.className = 'seg-row'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', title);
    const btns = opts.map(o => { const b = document.createElement('button'); b.type = 'button'; b.textContent = o.label; b.setAttribute('aria-pressed', String(o.value === val)); if (o.title) b.title = o.title;
      b.addEventListener('click', () => { btns.forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); fn(o.value); });
      row.appendChild(b); return b; });
    wrap.appendChild(row); (parent || this.controls).appendChild(wrap);
    return { set(v) { btns.forEach((b, i) => b.setAttribute('aria-pressed', String(opts[i].value === v))); } };
  },
  slider(title, { min, max, step, value, fmt = v => v, id }, fn, parent) {
    const wrap = document.createElement('label'); wrap.className = 'sl';
    const iid = id || 'sl-' + title.replace(/\W+/g, '') + '-' + Math.random().toString(36).slice(2, 6);
    wrap.innerHTML = `<span class="sl-top"><span>${title}</span><output></output></span><input type="range" id="${iid}" min="${min}" max="${max}" step="${step}" value="${value}">`;
    const inp = wrap.querySelector('input'), out = wrap.querySelector('output');
    const show = () => out.textContent = fmt(+inp.value); show();
    inp.addEventListener('input', () => { show(); fn(+inp.value); });
    (parent || this.controls).appendChild(wrap);
    return { set(v) { inp.value = v; show(); }, get: () => +inp.value, el: inp };
  },
  setStatus(html) { if (html === this._s) return; this._s = html; this.status.hidden = false; this.status.innerHTML = html; },
  addLog(html, kind = '') { this.log.hidden = false; const li = document.createElement('li'); li.className = kind; li.innerHTML = html; this.log.prepend(li); while (this.log.children.length > 9) this.log.lastChild.remove(); },
  canvas(title, h = 170) { const f = document.createElement('figure'); f.className = 'plot'; f.innerHTML = `<figcaption>${title}</figcaption><canvas height="${h}"></canvas>`; this.plots.appendChild(f); const c = f.querySelector('canvas'); c.style.height = h + 'px'; return c; }
};
export function setBusy(v) { state.busy = v; document.querySelectorAll('#controls .act').forEach(b => b.disabled = v); }
export function act(text, fn, parent) { return ui.button(text, async () => { if (state.busy) return; const g = state.gen; setBusy(true); await fn(); if (g === state.gen) setBusy(false); }, 'act', parent); }
export const table = rows => '<table class="kv">' + rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('') + '</table>';
// 节流：滑块拖动时最多每帧计算一次
export function throttle(fn) { let pending = false; return () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; fn(); }); }; }

/* ---------- 2D 曲线 ---------- */
export function plot(cv, o) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), W = cv.clientWidth || 340, H = cv.clientHeight || 170;
  if (cv.width !== Math.round(W*dpr) || cv.height !== Math.round(H*dpr)) { cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const m = { l: 46, r: 12, t: 10, b: 30 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
  const [x0, x1] = o.x, [y0, y1] = o.y;
  const X = x => m.l + (x - x0)/(x1 - x0)*pw, Y = y => m.t + (1 - (y - y0)/(y1 - y0))*ph;
  g.font = `11px ${MONO}`; g.lineWidth = 1;
  for (const t of o.yTicks || []) { g.strokeStyle = CSS.grid; g.beginPath(); g.moveTo(m.l, Y(t)); g.lineTo(W - m.r, Y(t)); g.stroke(); g.fillStyle = CSS.muted; g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText(o.yFmt ? o.yFmt(t) : t, m.l - 6, Y(t)); }
  for (const t of o.xTicks || []) { g.strokeStyle = CSS.grid; g.beginPath(); g.moveTo(X(t), m.t); g.lineTo(X(t), H - m.b); g.stroke(); g.fillStyle = CSS.muted; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(o.xFmt ? o.xFmt(t) : t, X(t), H - m.b + 6); }
  g.strokeStyle = CSS.line; g.strokeRect(m.l, m.t, pw, ph);
  if (o.xLabel) { g.fillStyle = CSS.muted; g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText(o.xLabel, W - m.r, H - 1); }
  if (o.yLabel) { g.save(); g.translate(11, m.t + ph/2); g.rotate(-Math.PI/2); g.fillStyle = CSS.muted; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(o.yLabel, 0, 0); g.restore(); }
  g.save(); g.beginPath(); g.rect(m.l, m.t, pw, ph); g.clip();
  for (const h of o.hlines || []) { g.strokeStyle = h.color || CSS.muted; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(m.l, Y(h.y)); g.lineTo(W - m.r, Y(h.y)); g.stroke(); g.setLineDash([]); if (h.label) { g.fillStyle = h.color || CSS.muted; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText(h.label, m.l + 4, Y(h.y) - 2); } }
  for (const v of o.vlines || []) { g.strokeStyle = v.color || CSS.muted; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(X(v.x), m.t); g.lineTo(X(v.x), H - m.b); g.stroke(); g.setLineDash([]); if (v.label) { g.fillStyle = v.color || CSS.muted; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(v.label, X(v.x) + 3, m.t + 2); } }
  for (const s of o.series || []) {
    if (s.stems) { g.strokeStyle = s.color; g.fillStyle = s.color; g.lineWidth = 2; for (const [x, y] of s.data) { g.beginPath(); g.moveTo(X(x), Y(0)); g.lineTo(X(x), Y(y)); g.stroke(); g.beginPath(); g.arc(X(x), Y(y), 3, 0, 7); g.fill(); } continue; }
    g.strokeStyle = s.color; g.lineWidth = s.width || 1.6; g.setLineDash(s.dash || []); g.beginPath();
    s.data.forEach(([x, y], i) => i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))); g.stroke(); g.setLineDash([]);
    if (s.fill) { g.lineTo(X(s.data[s.data.length-1][0]), Y(y0)); g.lineTo(X(s.data[0][0]), Y(y0)); g.closePath(); g.fillStyle = s.fill; g.fill(); }
  }
  for (const p of o.points || []) { g.fillStyle = p.color || CSS.copper; g.beginPath(); g.arc(X(p.x), Y(p.y), p.r || 4, 0, 7); g.fill(); if (p.label) { g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText(p.label, X(p.x) + 5, Y(p.y) - 3); } }
  g.restore();
  if (o.legend) { let x = m.l + 6; g.textBaseline = 'top'; g.textAlign = 'left'; for (const [t, c] of o.legend) { g.fillStyle = c; g.fillRect(x, m.t + 6, 10, 3); g.fillStyle = CSS.fg; g.fillText(t, x + 14, m.t + 2); x += g.measureText(t).width + 26; } }
}

/* ---------- 主循环 ---------- */
function resize() {
  const w = stageEl.clientWidth, h = stageEl.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w/h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stageEl); resize();
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last)/1000, .05); last = now;
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i]; if (tw.g !== state.gen) { tweens.splice(i, 1); continue; }
    tw.t += dt; const u = Math.min(tw.t/tw.dur, 1); tw.fn(u);
    if (u >= 1) { tweens.splice(i, 1); tw.res(); }
  }
  if (state.update) state.update(dt, now/1000);
  for (let i = flashers.length - 1; i >= 0; i--) {
    const c = flashers[i]; c.k -= dt*1.3;
    if (c.k <= 0) { c.mesh.material.emissive.setHex(0); flashers.splice(i, 1); }
    else c.mesh.material.emissive.copy(c.col).multiplyScalar(Math.min(1, c.k)*.55);
  }
  controls.update(); renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

export function resetScene() {
  state.gen++; setBusy(false); tweens.length = 0; flashers.length = 0; state.update = null;
  if (state.R) { scene.remove(state.R); disposeTree(state.R); }
  state.R = new THREE.Group(); scene.add(state.R);
  floor.visible = true;
  ui.reset();
}
