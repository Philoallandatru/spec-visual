// 3D 眼图：x = 时间（2 UI），y = 电压，z = 命中密度（对数），颜色同为密度
import { THREE, label, state, CSS } from './core.js';

const STOPS = [[0, 0x123540], [.18, 0x1a5a72], [.42, 0x2a9bb0], [.66, 0xe0b84a], [.84, 0xf08a3c], [1, 0xfff2d8]].map(([t, c]) => [t, new THREE.Color(c)]);
const BASE = new THREE.Color(0x0d1b20);
export function heat(t, out = new THREE.Color()) {
  if (t <= 0) return out.copy(BASE);
  for (let i = 1; i < STOPS.length; i++) if (t <= STOPS[i][0]) { const [a, ca] = STOPS[i-1], [b, cb] = STOPS[i]; return out.copy(ca).lerp(cb, (t - a)/(b - a)); }
  return out.copy(STOPS[STOPS.length - 1][1]);
}

export function makeEye({ w = 8, h = 5, nx = 64, ny = 96, zScale = 1.1, title = '', parent, pos = [0, 0, 0], ticks = true, compact = false }) {
  const grp = new THREE.Group(); grp.position.set(...pos); (parent || state.R).add(grp);
  const geo = new THREE.PlaneGeometry(w, h, nx - 1, ny - 1);
  const colors = new Float32Array(nx*ny*3); geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .75, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0 }));
  // 自发光用顶点色：用 onBeforeCompile 太重，这里用较亮的环境光 + 第二个 basic 层
  const flat = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: .55, depthWrite: false }));
  grp.add(mesh); grp.add(flat);
  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, h)), new THREE.LineBasicMaterial({ color: 0x3f6a72 }));
  grp.add(frame);
  const deco = new THREE.Group(); grp.add(deco);   // 刻度与标注
  const over = new THREE.Group(); grp.add(over);   // 眼罩、采样点
  let titleLb = null;
  if (title) { titleLb = label(title, { size: compact ? .26 : .3 }); titleLb.position.set(0, h/2 + .45, 0); grp.add(titleLb); }
  let lastVmax = -1;
  const tmp = new THREE.Color();

  function drawTicks(vmax) {
    while (deco.children.length) { const c = deco.children[0]; deco.remove(c); c.material.map && c.material.map.dispose(); c.material.dispose(); }
    if (!ticks) return;
    const mv = vmax*1000, step = [5, 10, 20, 25, 50, 100, 200, 250, 500].find(s => mv/s <= 3) || 500;
    for (let v = -Math.floor(mv/step)*step; v <= mv + 1e-6; v += step) {
      const l = label(`${v} mV`, { size: compact ? .16 : .19, bg: false, color: CSS.muted, anchor: 'right', mono: true });
      l.position.set(-w/2 - .1, v/mv*h/2, 0); deco.add(l);
    }
    for (const t of [-1, -.5, 0, .5, 1]) {
      const l = label(t === 0 ? '0' : `${t > 0 ? '+' : ''}${t} UI`, { size: compact ? .16 : .19, bg: false, color: CSS.muted, mono: true });
      l.position.set(t*w/2, -h/2 - .25, 0); deco.add(l);
    }
  }

  return {
    grp, mesh, over, w, h,
    setTitle(t) { titleLb && titleLb.userData.draw(t); },
    update(E) {
      const hist = E.hist, max = Math.log1p(E.maxH || 1), pos = geo.attributes.position;
      for (let row = 0; row < ny; row++) for (let col = 0; col < nx; col++) {
        const vi = row*nx + col, c = hist[(ny - 1 - row)*nx + col], t = c > 0 ? Math.log1p(c)/max : 0;
        pos.setZ(vi, t*zScale); heat(t, tmp); colors[3*vi] = tmp.r; colors[3*vi+1] = tmp.g; colors[3*vi+2] = tmp.b;
      }
      pos.needsUpdate = true; geo.attributes.color.needsUpdate = true; geo.computeVertexNormals();
      if (Math.abs(E.vmax - lastVmax) > 1e-6) { lastVmax = E.vmax; drawTicks(E.vmax); }
    },
    // 叠加 1e-12 眼罩（EW × EH 的矩形）与采样点
    overlay(m, vmax, opt = {}) {
      while (over.children.length) { const c = over.children[0]; over.remove(c); c.geometry && c.geometry.dispose(); c.material.map && c.material.map.dispose(); c.material.dispose(); }
      const sx = w/2, sy = h/2/vmax, z = zScale + .02;
      for (const E of m.eyes) {
        const cy = E.mid*sy;
        if (E.eh > 0 && E.ew > 0) {
          const hw = E.ew/2*sx, hh = E.eh/2*sy;
          const pts = [[-hw, 0], [0, hh], [hw, 0], [0, -hh], [-hw, 0]].map(([x, y]) => new THREE.Vector3(x, cy + y, z));
          const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x7fd18b })); over.add(ln);
          const box = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh], [-hw, -hh]].map(([x, y]) => new THREE.Vector3(x, cy + y, z));
          over.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(box), new THREE.LineDashedMaterial({ color: 0x7fd18b, dashSize: .08, gapSize: .06 })));
          over.children[over.children.length - 1].computeLineDistances();
        } else if (!opt.quiet) {
          const l = label('眼已闭合', { size: .26, color: '#ffb0b0', border: 'rgba(240,100,100,.7)' }); l.position.set(0, cy, z); over.add(l);
        }
        const dot = new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); dot.position.set(0, cy, z); over.add(dot);
      }
    }
  };
}
