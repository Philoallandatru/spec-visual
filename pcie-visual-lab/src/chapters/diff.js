import { THREE, COL, CSS, state, ui, chip, trace, label, place, polyline, act, tween, plot, table } from '../core.js';
import { prbs } from '../sim.js';

export default {
  key: 'diff', nav: '差分对与 TX/RX 前端', title: '差分信号与收发前端', sub: '为什么两根线比一根线跑得快',
  lead: `<p>每条 Lane 的每个方向都是一对线：<b>D+</b> 和 <b>D−</b> 同时发送互为反相的信号，接收端只看两者之差。干扰往往同时打在两根线上（<b>共模噪声</b>），相减后就抵消了。</p>
<p>场景中从左到右依次是：发送驱动器、<b>AC 耦合电容</b>、PCB 走线、接收端 <b>50 Ω 端接</b>，右侧小屏幕显示接收端看到的差分波形。打开下面的开关，看哪些问题能被差分抵消，哪些不能。</p>`,
  points: [
    '差分电压 V<sub>DIFF</sub> = V(D+) − V(D−)，共模电压 V<sub>CM</sub> = [V(D+) + V(D−)]/2。接收端只对 V<sub>DIFF</sub> 判决。',
    '对内 skew（D+ 与 D− 长度不等）会把一部分差分信号变成共模，同时让差分边沿变缓。所以 PCB 设计要做对内等长，误差通常控制在几 mil 以内。',
    'AC 耦合电容让两端可以使用不同的共模电压；规范要求 75–265 nF（8 GT/s 及以上为 176–265 nF），一般放在发送端附近。',
    '<b>Receiver Detect</b>：链路训练的第一步，发送端抬一下共模电压，看线路充电快慢。有 50 Ω 端接时，经过大电容充电很慢；悬空时很快。LTSSM 的 Detect 状态就是这样判断对端存不存在的。',
    'D+ 与 D− 接反并不致命：Polling 阶段接收端从 TS1/TS2 中发现极性颠倒，会在内部自动取反（Lane Polarity Inversion）。'
  ],
  src: 'PCIe 5.0 Base Spec §8.3（发送端）、§8.4（接收端）、§4.2.4.4（Receiver Detection）、§4.2.6.2（Polling）',
  cam: [2, 7.5, 13], target: [2.5, 1.2, 0],
  build() {
    const opt = { cm: false, skew: 0, loss: false, invert: false };
    chip({ w: 2, h: .5, d: 2, pos: [-9.6, 0, 0], color: 0x6a4a2c, text: 'TX 驱动器' });
    const rxc = chip({ w: 2, h: .5, d: 2, pos: [9.4, 0, 0], color: 0x3a4e66, text: 'RX 接收器 + CDR' });
    const zP = -.35, zN = .35, X0 = -8.4, X1 = 8.2;
    const tP = trace([[X0, .03, zP], [X1, .03, zP]], COL.copper, .1);
    const tN = trace([[X0, .03, zN], [X1, .03, zN]], COL.copper, .1);
    // AC 耦合电容
    for (const z of [zP, zN]) { const c = new THREE.Mesh(new THREE.BoxGeometry(.32, .18, .2), new THREE.MeshStandardMaterial({ color: 0xb79a6a, roughness: .5 })); c.position.set(-6.6, .1, z); state.R.add(c); }
    place(label('AC 耦合电容', { size: .2, bg: false, color: CSS.muted }), -6.6, .55, -1.05);
    // 端接
    for (const z of [zP, zN]) { const r = new THREE.Mesh(new THREE.BoxGeometry(.26, .14, .16), new THREE.MeshStandardMaterial({ color: 0x2b2b2b })); r.position.set(7.7, .08, z + (z < 0 ? -.45 : .45)); state.R.add(r); }
    place(label('50 Ω 端接 ×2\n（差分 100 Ω）', { size: .18, bg: false, color: CSS.muted }), 7.7, .6, 1.4);
    place(label('D+', { size: .28, color: CSS.tx }), X0 + .6, .25, zP - .5);
    place(label('D−', { size: .28, color: CSS.rx }), X0 + .6, .25, zN + .5);
    // 极性反转时在接收端画交叉
    const cross = new THREE.Group(); state.R.add(cross); cross.visible = false;
    trace([[7.2, .06, zP], [8.2, .06, zN]], COL.bad, .06, cross, .02); trace([[7.2, .06, zN], [8.2, .06, zP]], COL.bad, .06, cross, .02);

    const N = 220, base = 1.2, k = .9;
    const lineP = polyline(N, COL.tx), lineN = polyline(N, COL.rx), lineCM = polyline(N, 0x8ba1a6, null, { dashed: true, opacity: .7 });
    place(label('V(D+)', { size: .2, bg: false, color: CSS.tx }), -7.6, base + 1.15, zP);
    place(label('共模 V_CM', { size: .2, bg: false, color: CSS.muted }), -4, base + .05, 0);
    // 接收端示波器屏
    const SX0 = 11, SX1 = 17, SY = 2.2, SH = 1.6;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(SX1 - SX0 + .4, SH*2 + .6), new THREE.MeshBasicMaterial({ color: 0x0b1619, transparent: true, opacity: .9, side: THREE.DoubleSide }));
    scr.position.set((SX0 + SX1)/2, SY, -.05); state.R.add(scr);
    const scrFrame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(SX1 - SX0 + .4, SH*2 + .6)), new THREE.LineBasicMaterial({ color: 0x3f6a72 }));
    scrFrame.position.copy(scr.position); state.R.add(scrFrame);
    const zero = polyline(2, 0x3f6a72); zero.userData.set(i => [i ? SX1 : SX0, SY, 0]);
    place(label('接收端看到的波形', { size: .24 }), (SX0 + SX1)/2, SY + SH + .6, 0);
    place(label('差分 D+ − D−', { size: .18, bg: false, color: CSS.copper, anchor: 'left' }), SX0, SY + SH + .15, 0);
    place(label('单端 D+（对比）', { size: .18, bg: false, color: '#5d8c94', anchor: 'left' }), SX0 + 3.2, SY + SH + .15, 0);
    const scD = polyline(N, COL.copper), scS = polyline(N, 0x5d8c94, null, { opacity: .8 });
    const thr = polyline(2, 0x7fd18b, null, { dashed: true, opacity: .8 }); thr.userData.set(i => [i ? SX1 : SX0, SY, .01]);
    const flagLb = place(label(' ', { size: .22 }), (SX0 + SX1)/2, SY - SH - .55, 0); flagLb.visible = false;

    const bits = prbs(4096, 7, 0x4d), UI = .2, nOnLine = 11, vel = (X1 - X0)/(nOnLine*UI);
    const sm = u => u <= 0 ? 0 : u >= 1 ? 1 : u*u*(3 - 2*u);
    // 某处、某时刻的差分半幅（含距离相关的损耗）
    function sdiff(tau, x) {
      if (tau < 0) return -1;
      const frac = (x - X0)/(X1 - X0), edge = .14 + (opt.loss ? .75*frac : 0), amp = 1 - (opt.loss ? .42*frac : 0);
      const kb = Math.floor(tau/UI), u = tau/UI - kb, a = bits[kb % bits.length] ? 1 : -1, b = bits[(kb + bits.length - 1) % bits.length] ? 1 : -1;
      return amp*(b + (a - b)*sm(u/edge));
    }
    const cmNoise = (t, x) => opt.cm ? .55*Math.sin(2*Math.PI*(t*.9 + x*.05)) + .3*Math.sin(2*Math.PI*(t*3.7 + x*.11) + 1) : 0;
    const vP = (t, x) => { const tau = t - (x - X0)/vel; return .5*sdiff(tau, x) + cmNoise(t, x); };
    const vN = (t, x) => { const tau = t - (x - X0)/vel - opt.skew*UI; return -.5*sdiff(tau, x) + cmNoise(t, x); };

    const g1 = ui.group('干扰与缺陷');
    ui.toggle('注入共模噪声', false, v => opt.cm = v, g1);
    ui.toggle('打开信道损耗', false, v => opt.loss = v, g1);
    ui.toggle('D+ / D− 接反', false, v => { opt.invert = v; cross.visible = v; }, g1);
    ui.slider('对内 skew', { min: 0, max: .6, step: .05, value: 0, fmt: v => v.toFixed(2) + ' UI' }, v => opt.skew = v, g1);
    const g2 = ui.group('Receiver Detect');
    let det = null;
    const cv = ui.canvas('Receiver Detect：发送端共模电压的充电曲线', 150);
    const drawDet = (p) => {
      const tauOn = 1.0, tauOff = .08, xs = []; for (let i = 0; i <= 100; i++) xs.push(i/100*2);
      const on = xs.map(t => [t, 1 - Math.exp(-t/tauOn)]), off = xs.map(t => [t, 1 - Math.exp(-t/tauOff)]);
      plot(cv, { x: [0, 2], y: [0, 1.05], xTicks: [0, .5, 1, 1.5, 2], yTicks: [0, .5, 1], xLabel: '时间（相对）', yFmt: v => v.toFixed(1),
        series: [{ data: off.slice(0, Math.round(p*100) + 1), color: CSS.muted, width: 2 }, { data: on.slice(0, Math.round(p*100) + 1), color: CSS.copper, width: 2 }],
        vlines: [{ x: .3, label: '采样判决点', color: CSS.ok }],
        legend: [['对端有 50 Ω 端接（慢）', CSS.copper], ['对端悬空（快）', CSS.muted]] });
    };
    drawDet(1);
    act('运行 Receiver Detect', async () => {
      ui.addLog('Detect.Quiet：发送端保持电气空闲。');
      rxc.flash(COL.copper, 2);
      await tween(2.2, u => drawDet(u));
      ui.addLog('Detect.Active：在判决点测得电压仍然很低 → 对端存在接收端端接，进入 Polling。', 'ok');
    }, g2);

    const pts = Array.from({ length: N }, (_, i) => X0 + (X1 - X0)*i/(N - 1));
    let t = 3;
    return {
      update(dt) {
        t += dt;
        lineP.userData.set(i => [pts[i], base + k*vP(t, pts[i]), zP]);
        lineN.userData.set(i => [pts[i], base + k*vN(t, pts[i]), zN]);
        lineCM.userData.set(i => [pts[i], base + k*(vP(t, pts[i]) + vN(t, pts[i]))/2, 0]);
        // 接收端屏幕：最近 8 UI
        const W = 8*UI, sgn = opt.invert ? -1 : 1;
        scD.userData.set(i => { const tt = t - W + W*i/(N - 1); return [SX0 + (SX1 - SX0)*i/(N - 1), SY + SH*.8*sgn*(vP(tt, X1) - vN(tt, X1)), .02]; });
        scS.userData.set(i => { const tt = t - W + W*i/(N - 1); return [SX0 + (SX1 - SX0)*i/(N - 1), SY + SH*.8*vP(tt, X1), .015]; });
        const msgs = [];
        if (opt.cm) msgs.push('共模噪声在差分里抵消，单端 D+ 被打乱');
        if (opt.skew >= .2) msgs.push(`skew ${opt.skew.toFixed(2)} UI：差分边沿变缓、幅度下降`);
        if (opt.invert) msgs.push('极性接反：判决结果全部取反，Polling 会自动纠正');
        flagLb.visible = msgs.length > 0; if (flagLb.visible && flagLb.userData.text !== msgs.join('\n')) flagLb.userData.draw(msgs.join('\n'));
        ui.setStatus(table([
          ['差分摆幅', '满摆幅 800–1300 mVpp（8 GT/s 及以上，未加均衡时测）'],
          ['1 UI', 'Gen1 400 ps · Gen3 125 ps · Gen4 62.5 ps · Gen5 31.25 ps'],
          ['差分阻抗', '约 100 Ω（每根线对地约 50 Ω）'],
          ['当前状态', [opt.cm && '共模噪声', opt.loss && '信道损耗', opt.skew > 0 && `skew ${opt.skew.toFixed(2)} UI`, opt.invert && '极性接反'].filter(Boolean).join('，') || '理想链路']
        ]));
      }
    };
  }
};
