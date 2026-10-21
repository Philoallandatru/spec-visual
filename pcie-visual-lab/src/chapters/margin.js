import { THREE, COL, CSS, state, ui, label, act, tween, wait, plot, table, throttle, polyline } from '../core.js';
import { makeEye } from '../eye3d.js';
import { SPU, PRESETS, runChain, log10Q, rng } from '../sim.js';

export default {
  key: 'margin', nav: 'Lane Margining 与抖动', title: 'Lane Margining 与抖动', sub: '在不断链的情况下测出眼睛还有多大余量',
  lead: `<p>示波器只能在测试板上看眼。产品上线后想知道某条 Lane 还剩多少余量，就用 16 GT/s 引入的 <b>Lane Margining at the Receiver</b>：软件让接收器把采样点向左、右（时间）或上、下（电压）一步步挪开，每步统计误码，直到错误数超过上限。</p>
<p>眼图上的白球就是被挪动的采样点。它走出的“十字”就是这条 Lane 的实测余量。左边的参数会改变眼的大小，再跑一次 Margining 对比结果。</p>`,
  points: [
    '命令由 DSP 通过 <b>Control SKP Ordered Set</b> 发给链路上的各个接收器（含 Retimer），软件通过 Margining Lane Control/Status 寄存器操作，Linux 下可以用 pciutils 自带的 <code>pcilmr</code> 工具。',
    '接收器先报告能力：MNumTimingSteps（6–63 步，至少覆盖 ±0.2 UI）、MMaxTimingOffset（20–50% UI）、MNumVoltageSteps（32–127 步，至少 ±50 mV）、MMaxVoltageOffset。本演示取 16 步 / 50% UI、64 步 / 100 mV。',
    'MErrorCount 超过 Error Count Limit 时，接收器自动回到默认采样点并报告 “Too many errors”，避免长时间影响业务。MSampleCount = 3·log₂(已测比特数)，表示统计量有多大。',
    '<b>抖动分解</b>：RJ（随机抖动，高斯分布，无界）在 BER 1e-12 时按 ±7σ 计入；DJ（确定性抖动，有界）包括 ISI 引起的 DDJ、周期性的 SJ/PJ 等，按峰峰值计入。总抖动 TJ ≈ DJ + 14·RJσ（dual-Dirac 模型）。',
    '浴盆曲线越“陡”说明以 DJ 为主，越“缓”说明 RJ 大；RJ 大的链路，测得的余量会随测试时长（比特数）增加而继续缩小。'
  ],
  src: 'PCIe 5.0 Base Spec §4.2.13（Lane Margining at the Receiver）、表 4-26（Margin Command）、表 8-11（Margining 参数）、§8.3.5（抖动）',
  cam: [3.5, 4.5, 12], target: [0, 3.4, 0],
  build() {
    const o = { loss: 16, noise: 1.2, rj: .008, sj: .02, limit: 4 };
    const eye = makeEye({ w: 10, h: 6, nx: 64, ny: 110, zScale: .6, pos: [0, 3.6, 0] });
    const probe = new THREE.Mesh(new THREE.SphereGeometry(.13, 18, 12), new THREE.MeshBasicMaterial({ color: 0xffffff })); state.R.add(probe);
    const cnt = label(' ', { size: .2, mono: true }); state.R.add(cnt); cnt.visible = false;
    const marks = new THREE.Group(); state.R.add(marks);
    const cvT = ui.canvas('时间浴盆：采样相位 vs log₁₀ BER', 150), cvV = ui.canvas('电压浴盆：采样电压偏移 vs log₁₀ BER', 150);
    const g = ui.group('链路条件（16 GT/s）');
    ui.slider('信道插损', { min: 8, max: 24, step: 1, value: o.loss, fmt: v => v + ' dB' }, v => { o.loss = v; tr(); }, g);
    ui.slider('随机噪声 σ', { min: 0, max: 4, step: .25, value: o.noise, fmt: v => v.toFixed(2) + ' mV' }, v => { o.noise = v; tr(); }, g);
    ui.slider('随机抖动 RJ σ', { min: 0, max: .03, step: .002, value: o.rj, fmt: v => v.toFixed(3) + ' UI' }, v => { o.rj = v; tr(); }, g);
    ui.slider('正弦抖动 SJ 幅度', { min: 0, max: .1, step: .01, value: o.sj, fmt: v => v.toFixed(2) + ' UI' }, v => { o.sj = v; tr(); }, g);
    ui.seg('Error Count Limit', [1, 4, 16].map(v => ({ label: String(v), value: v })), o.limit, v => o.limit = v, g);

    let r = null, m = null, vmax = .1;
    const TSTEP = .5/16, VSTEP = .1/64, BITS = 2e9;
    const sx = 5, sy = () => 3/vmax, Y0 = 3.6;
    // 某个偏移处的 log10 BER（时间偏移 dt 以 UI 计，电压偏移 dv 以 V 计）
    function logBer(dt, dv) {
      const E = m.worst, j = Math.max(0, Math.min(63, Math.round(dt*SPU + SPU)));
      const sv = r.S.sigmaOut, half = E.raw[j]/2;
      if (half <= Math.abs(dv)) return Math.log10(.5);
      const lt = E.bathtub[j];
      const lv = sv > 0 ? Math.log10(.5) + log10Q((half - Math.abs(dv))/sv) : -40;
      const mx = Math.max(lt, lv); return mx + Math.log10(10**(lt - mx) + 10**(lv - mx));
    }
    function run() {
      r = runChain({ loss: o.loss, ffe: PRESETS.find(p => p.id === 'P7'), ctleDb: 9, dfeTaps: 2, noiseMv: o.noise, rjUi: o.rj, sjUi: o.sj, nSym: 2400 }, ['dfe']);
      m = r.dfe.m; vmax = r.dfe.vmax;
      eye.update(r.dfe.eye); eye.overlay(m, vmax);
      probe.position.set(0, Y0 + m.worst.mid*sy(), .7); cnt.visible = false;
      while (marks.children.length) { const c = marks.children[0]; marks.remove(c); c.geometry && c.geometry.dispose(); c.material.dispose(); }
      const bt = m.worst.bathtub.map((b, j) => [(j - SPU)/SPU, b]);
      plot(cvT, { x: [-.6, .6], y: [-16, 0], xTicks: [-.5, -.25, 0, .25, .5], yTicks: [0, -4, -8, -12, -16], xLabel: 'UI', yLabel: 'log₁₀ BER',
        series: [{ data: bt, color: CSS.copper, width: 2, fill: 'rgba(217,149,74,.12)' }], hlines: [{ y: -12, label: '1e-12', color: CSS.ok }, { y: Math.log10(o.limit/BITS), label: '本次测试可分辨的 BER', color: CSS.amber }] });
      const vb = []; for (let i = -60; i <= 60; i++) { const dv = i/1000; vb.push([i, Math.max(-16, logBer(0, dv))]); }
      plot(cvV, { x: [-60, 60], y: [-16, 0], xTicks: [-60, -30, 0, 30, 60], yTicks: [0, -4, -8, -12, -16], xLabel: 'mV', yLabel: 'log₁₀ BER',
        series: [{ data: vb, color: CSS.tx, width: 2, fill: 'rgba(92,207,230,.12)' }], hlines: [{ y: -12, label: '1e-12', color: CSS.ok }, { y: Math.log10(o.limit/BITS), color: CSS.amber }] });
      const tj = 2*7.034*o.rj + 2*o.sj;
      ui.setStatus(table([
        ['眼高 / 眼宽 @1e-12', m.eh > 0 && m.ew > 0 ? `${(m.eh*1000).toFixed(1)} mV / ${m.ew.toFixed(3)} UI` : '眼已闭合'],
        ['RJ 贡献（±7σ）', `${(2*7.034*o.rj).toFixed(3)} UI`],
        ['SJ 贡献（峰峰）', `${(2*o.sj).toFixed(3)} UI`],
        ['TJ ≈ DJ + 14σ（不含 ISI）', `${tj.toFixed(3)} UI = ${(tj*62.5).toFixed(1)} ps`],
        ['每步测试比特数', `${BITS.toExponential(0)}（MSampleCount ≈ ${Math.min(127, Math.round(3*Math.log2(BITS)))}）`]
      ]));
    }
    const tr = throttle(run);
    run();

    const R = rng(11);
    const poisson = lam => { if (lam > 50) return Math.round(lam + Math.sqrt(lam)*R.gauss()); let k = 0, p = Math.exp(-lam), s = p; const u = R(); while (u > s && k < 200) { k++; p *= lam/k; s += p; } return k; };
    async function sweep(kind, dir) {
      const isT = kind === 't', nMax = isT ? 16 : 64, mid = m.worst.mid;
      let lastOk = 0;
      for (let s = 1; s <= nMax; s++) {
        const dt = isT ? dir*s*TSTEP : 0, dv = isT ? 0 : dir*s*VSTEP;
        const lb = logBer(dt, dv), errs = Math.min(63, poisson(Math.min(1e6, 10**lb*BITS)));
        const p = new THREE.Vector3(dt*sx, Y0 + (mid + dv)*sy(), .7);
        await tween(.12, u => probe.position.lerp(p, u));
        cnt.visible = true; cnt.position.set(p.x, p.y + .35, .8); cnt.userData.draw(`${isT ? (dt >= 0 ? '+' : '') + (dt).toFixed(3) + ' UI' : (dv >= 0 ? '+' : '') + (dv*1000).toFixed(1) + ' mV'}  err=${errs}`);
        probe.material.color.setHex(errs > o.limit ? COL.bad : errs > 0 ? COL.amber : 0xffffff);
        if (errs > o.limit) {
          ui.addLog(`Step Margin ${isT ? (dir > 0 ? '右' : '左') : (dir > 0 ? '上' : '下')} 第 ${s} 步：MErrorCount=${errs} > ${o.limit}，状态 00b（Too many errors），自动回到默认采样点`, 'bad');
          break;
        }
        lastOk = s; await wait(.04);
      }
      const back = new THREE.Vector3(0, Y0 + mid*sy(), .7); await tween(.25, u => probe.position.lerp(back, u)); probe.material.color.setHex(0xffffff);
      return lastOk;
    }
    act('开始 Lane Margining', async () => {
      if (!(m.eh > 0 && m.ew > 0)) { ui.addLog('眼已闭合，链路处于这种状态时根本进不了 L0，先降低损耗或噪声。', 'bad'); return; }
      ui.log.innerHTML = '';
      ui.addLog('读取能力：MNumTimingSteps=16，MMaxTimingOffset=50%，MNumVoltageSteps=64，MMaxVoltageOffset=10%（100 mV）', 'ts');
      const res = {};
      for (const [k, d, n] of [['t', 1, '右'], ['t', -1, '左'], ['v', 1, '上'], ['v', -1, '下']]) { res[n] = await sweep(k, d); ui.addLog(`${n}余量：${res[n]} 步 = ${k === 't' ? (res[n]*TSTEP).toFixed(3) + ' UI' : (res[n]*VSTEP*1000).toFixed(1) + ' mV'}`, 'ok'); }
      cnt.visible = false;
      const mid = m.worst.mid, z = .66;
      const h = polyline(2, COL.ok, marks); h.userData.set(i => [i ? res['右']*TSTEP*sx : -res['左']*TSTEP*sx, Y0 + mid*sy(), z]);
      const v = polyline(2, COL.ok, marks); v.userData.set(i => [0, Y0 + (mid + (i ? res['上'] : -res['下'])*VSTEP)*sy(), z]);
      ui.addLog(`结果：时间余量 −${(res['左']*TSTEP).toFixed(3)} / +${(res['右']*TSTEP).toFixed(3)} UI，电压余量 +${(res['上']*VSTEP*1000).toFixed(1)} / −${(res['下']*VSTEP*1000).toFixed(1)} mV`, 'ok');
    });
    return { views: [{ label: '正视', cam: [0, 3.6, 13], target: [0, 3.6, 0] }] };
  }
};
