import { THREE, COL, CSS, state, ui, label, place, ribbon, polyline, plot, table, clearGroup, throttle } from '../core.js';
import { SPU, PRESETS, ffeOf, txWave, ffeMag, SWING } from '../sim.js';

const BITS = '0001111100010101100111000'.split('').map(c => c === '1' ? 1 : -1);
const LF = 1/3; // 示例：LF/FS = 1/3（LF 由实现给出，通过 TS1 通告）

export function levels(f) {
  const a = Math.abs(f.cm1), b = Math.abs(f.cp1);
  return { Vd: f.c0 + a + b, Va: f.c0 + b - a, Vb: f.c0 - a - b, Vc: f.c0 - b + a };
}
const db = x => 20*Math.log10(x);

export default {
  key: 'ffe', nav: 'TX 均衡与 Preset', title: 'TX 均衡：3 抽头 FFE 与 Preset', sub: '发送前先把信号“预扭曲”',
  lead: `<p>信道会削弱高频、拉长拖尾。发送端的办法是提前反向修正：每个输出电平不只由当前比特决定，还减去一点前一个比特（<b>去加重 de-emphasis，c<sub>+1</sub></b>）和后一个比特（<b>预冲 preshoot，c<sub>−1</sub></b>）。</p>
<p>输出 = c<sub>−1</sub>·b<sub>n+1</sub> + c<sub>0</sub>·b<sub>n</sub> + c<sub>+1</sub>·b<sub>n−1</sub>，三个系数绝对值之和等于满摆幅 FS。跳变处的电平被保留，长串相同比特时电平被压低，等于相对抬高了高频。</p>
<p>规范预定义了 <b>P0–P10</b> 共 11 组系数。前景是当前 Preset 下的 TX 输出波形，后方是 11 组 Preset 的三个系数柱状图。</p>`,
  points: [
    '四个电平（规范图 8-5）：<b>Vd</b> 是孤立比特的峰值，<b>Va</b> 是跳变后的第一个比特，<b>Vb</b> 是稳定段，<b>Vc</b> 是下一次跳变前的最后一个比特。去加重 = 20·log(Vb/Va)，预冲 = 20·log(Vc/Vb)。',
    '<b>P4</b> 是唯一不加任何均衡的 Preset，常用来做基准测量；<b>P7</b> 同时有 3.5 dB 预冲和 6 dB 去加重，是长信道常见的起点。',
    '系数并非随便取：|c<sub>−1</sub>| ≤ FS/4，并且 Vb（最低电平）不能低于 LF。FS 和 LF 由发送端在 TS1 中告诉对方，对方请求的系数超出范围时，发送端会置 <code>Reject Coefficient Values</code> 拒绝。',
    'TX FFE 的代价是降低了低频幅度：去加重 6 dB 时稳定段只剩一半电压，所以它补的是“相对”的高频，不是凭空增加能量。',
    'wiki 原文的 Preset 表把 P4 写成典型去加重、P0 写成无均衡，与规范相反。这里按规范表 8-1 绘制。'
  ],
  src: 'PCIe 5.0 Base Spec §8.3.3.3、图 8-5、表 8-1（Tx Preset Ratios），§4.2.3.1（系数规则）',
  cam: [4.5, 5, 13.5], target: [3, 2.2, -1.5],
  build() {
    let f = PRESETS.find(p => p.id === 'P7'), id = 'P7';
    const G = new THREE.Group(), B = new THREE.Group(); state.R.add(G); state.R.add(B);
    const cvF = ui.canvas('FFE 频率响应（相对直流，奈奎斯特 = 0.5 周期/UI）', 160);
    const cvR = ui.canvas('系数空间：|c−1| 与 |c+1|（阴影为 LF/FS = 1/3 时的合法区）', 190);
    const g = ui.group('TX Preset');
    const seg = ui.seg('预设', PRESETS.map(p => ({ label: p.id, value: p.id })), id, v => { id = v; f = PRESETS.find(p => p.id === v); s1.set(f.cm1); s2.set(f.cp1); draw(); }, g);
    const custom = throttle(() => { id = '自定义'; seg.set(null); draw(); });
    const s1 = ui.slider('c−1（预冲）', { min: -.3, max: 0, step: .005, value: f.cm1, fmt: v => v.toFixed(3) }, v => { f = ffeOf(v, f.cp1); custom(); }, g);
    const s2 = ui.slider('c+1（去加重）', { min: -.45, max: 0, step: .005, value: f.cp1, fmt: v => v.toFixed(3) }, v => { f = ffeOf(f.cm1, v); custom(); }, g);

    // 柱状图（静态部分）
    const BX = -1, BZ = -5, BY = 2.6, BH = 2.2;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(12.4, .06, 1.6), new THREE.MeshStandardMaterial({ color: 0x17292e })); deck.position.set(BX + 5.5, BY, BZ); state.R.add(deck);
    place(label('c₀ ↑     c₋₁ / c₊₁ ↓（负值）', { size: .22, bg: false, color: CSS.muted }), BX + 5.5, BY + BH + .7, BZ);

    function draw() {
      clearGroup(G); clearGroup(B);
      const L = levels(f), legal = Math.abs(f.cm1) <= .25 + 1e-9 && L.Vb >= LF - 1e-9 && f.c0 > 0;
      // 波形
      const sym = Float32Array.from(BITS), w = txWave(sym, f), T = .5, Y0 = 2.4, YS = 4.2;
      const pts = []; for (let t = 0; t < w.length; t += 2) pts.push([t/SPU*T - 3, Y0 + YS*w[t], 0]);
      ribbon(pts, COL.copper, .06, G);
      const ideal = []; BITS.forEach((b, k) => { ideal.push([k*T - 3, Y0 + YS*SWING*b, -.02], [(k + 1)*T - 3, Y0 + YS*SWING*b, -.02]); });
      const il = polyline(ideal.length, 0xd9e5e7, G, { dashed: true, opacity: .35 }); il.userData.set(i => ideal[i]);
      const x1 = BITS.length*T - 3;
      for (const [k, v, c] of [['Vd', L.Vd, CSS.fg], ['Va', L.Va, CSS.tx], ['Vb', L.Vb, CSS.amber], ['Vc', L.Vc, CSS.rx]]) {
        const y = Y0 + YS*SWING*v, ln = polyline(2, new THREE.Color(c).getHex(), G, { dashed: true, opacity: .55 }); ln.userData.set(i => [i ? x1 + .3 : -3, y, .01]);
        place(label(`${k} ${(2*SWING*v*1000).toFixed(0)} mVpp`, { size: .2, bg: false, color: c, anchor: 'left', mono: true }), x1 + .4, y, 0, G);
      }
      const zl = polyline(2, 0x3f6a72, G); zl.userData.set(i => [i ? x1 : -3, Y0, 0]);
      place(label(`TX 输出波形 · ${id}`, { size: .28 }), 3, Y0 + YS*SWING + .7, 0, G);
      // 柱状图
      PRESETS.forEach((p, i) => {
        const x = BX + i*1.1, on = p.id === id, mk = (v, dx, col) => {
          const h = Math.max(.002, Math.abs(v)*BH), m = new THREE.Mesh(new THREE.BoxGeometry(.24, h, .5), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: on ? .55 : .05, transparent: !on, opacity: on ? 1 : .45 }));
          m.position.set(x + dx, BY + (v >= 0 ? h/2 : -h/2) + .03, BZ); B.add(m);
        };
        mk(p.c0, 0, COL.copper); mk(p.cm1, -.28, COL.rx); mk(p.cp1, .28, COL.tx);
        const lb = label(p.id, { size: .2, bg: false, color: on ? '#fff' : CSS.muted }); lb.position.set(x, BY - .1 - BH*.5, BZ + .45); B.add(lb);
      });
      ui.setStatus(table([
        ['系数', `c−1 = ${f.cm1.toFixed(3)} · c0 = ${f.c0.toFixed(3)} · c+1 = ${f.cp1.toFixed(3)}`],
        ['预冲 preshoot', `${db(L.Vc/L.Vb).toFixed(2)} dB`],
        ['去加重 de-emphasis', `${db(L.Vb/L.Va).toFixed(2)} dB`],
        ['Boost', `${db(L.Vd/L.Vb).toFixed(2)} dB（孤立比特 / 稳定段）`],
        ['合法性（LF/FS = 1/3 示例）', legal ? '<span class="chip ok">合法</span>' : '<span class="chip bad">会被 Reject</span>']
      ]));
      // 频率响应
      const fr = [], f4 = []; for (let i = 0; i <= 100; i++) { const q = i/200; fr.push([q, db(ffeMag(q, f)/ffeMag(0, f))]); f4.push([q, 0]); }
      plot(cvF, { x: [0, .5], y: [-2, 16], xTicks: [0, .125, .25, .375, .5], yTicks: [0, 4, 8, 12, 16], xLabel: '频率（周期/UI）', yLabel: 'dB', xFmt: v => v.toFixed(2),
        series: [{ data: f4, color: CSS.muted, dash: [4, 4] }, { data: fr, color: CSS.copper, width: 2 }], legend: [[id, CSS.copper], ['P4', CSS.muted]] });
      // 系数空间
      const region = [[0, 0], [.25, 0], [.25, (1 - LF)/2 - .25], [0, (1 - LF)/2], [0, 0]];
      plot(cvR, { x: [0, .32], y: [0, .45], xTicks: [0, .1, .2, .3], yTicks: [0, .1, .2, .3, .4], xLabel: '|c−1|', yLabel: '|c+1|', xFmt: v => v.toFixed(1), yFmt: v => v.toFixed(1),
        series: [{ data: region, color: '#3f7a49', fill: 'rgba(127,209,139,.12)' }],
        points: [...PRESETS.map(p => ({ x: Math.abs(p.cm1), y: Math.abs(p.cp1), color: p.id === id ? '#fff' : CSS.muted, r: p.id === id ? 5 : 3, label: p.id })), ...(id === '自定义' ? [{ x: Math.abs(f.cm1), y: Math.abs(f.cp1), color: CSS.copper, r: 5, label: '当前' }] : [])] });
    }
    draw();
    return { views: [{ label: '看波形', cam: [3, 2.6, 10], target: [3, 2.4, 0] }, { label: '看柱状图', cam: [4.5, 4.5, 2], target: [4.5, 2.4, -5] }] };
  }
};
