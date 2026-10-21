import { CSS, ui, plot, throttle, act, wait } from '../core.js';
import { makeEye } from '../eye3d.js';
import { GENS, PRESETS, runChain, peakDistortionEH, pulseResponse, Q12 } from '../sim.js';

// 规范 Rx 参考眼（经参考 CTLE + DFE 后，BER 1e-12）
export const REF_EYE = { 3: { eh: 25, ew: .3 }, 4: { eh: 15, ew: .3 }, 5: { eh: 15, ew: .3 }, 6: null };
export const DEF_LOSS = { 3: 13, 4: 16, 5: 18, 6: 11 };

export function readout(m, g, extra = '') {
  const ref = REF_EYE[g], ui_ps = GENS[g].ui;
  const pass = ref && m.eh*1000 >= ref.eh && m.ew >= ref.ew;
  return `<div class="readout">
    <div><span>眼高 EH @1e-12</span><strong>${m.eh > 0 ? (m.eh*1000).toFixed(1) + ' mV' : '闭合'}</strong></div>
    <div><span>眼宽 EW @1e-12</span><strong>${m.ew > 0 ? m.ew.toFixed(3) + ' UI' : '闭合'}</strong></div>
    <div><span>仅 ISI 时的眼高</span><strong>${(m.ehIsi*1000).toFixed(1)} mV</strong></div>
    <div><span>眼宽换算</span><strong>${(m.ew*ui_ps).toFixed(1)} ps</strong></div>
  </div>` + (ref ? `规范参考眼 ${ref.eh} mV × ${ref.ew} UI：${pass ? '<span class="chip ok">满足</span>' : '<span class="chip bad">不满足</span>'}` : 'PAM4：三个眼分别测量，取最差的一个。') + extra;
}

export default {
  key: 'eye', nav: '3D 眼图实验室', title: '3D 眼图实验室', sub: '把成千上万个 UI 叠在一起看',
  lead: `<p>把接收波形按 UI 切成一段段，每段取 2 个 UI 宽，全部对齐叠在一起，就得到<b>眼图</b>。中间空白的“眼睛”越大，接收端越不容易判错。</p>
<p>这里的眼图是三维的：横轴是时间，纵轴是电压，<b>高度和颜色表示波形经过该点的次数</b>（对数刻度）。绿色菱形是外推到 BER 10<sup>−12</sup> 的眼罩，白点是 CDR 选的采样点。调左边的参数，观察眼图怎么变化。</p>`,
  points: [
    '<b>眼高 EH</b>：采样时刻上下两条“眼皮”的最小间距，扣掉噪声在 BER 1e-12 下的展宽（约 ±7σ）。<b>眼宽 EW</b>：眼睛在水平方向张开的宽度，扣掉随机抖动（±7σ）和周期抖动。',
    '眼皮的“厚度”来源不同：ISI 让眼皮分成若干条清晰的轨迹（确定性），噪声和随机抖动把轨迹糊开（随机性）。',
    '规范不在接收引脚直接看眼，而是在经过<b>参考 CTLE + DFE</b> 之后再看：8 GT/s 要求 25 mV × 0.3 UI，16 和 32 GT/s 要求 15 mV × 0.3 UI。引脚上的眼往往已经完全闭合。',
    'Gen6 改用 <b>PAM4</b>：每个符号 4 个电平、携带 2 比特，波特率仍是 32 GBd，所以奈奎斯特频率不变，但一个眼被切成三个，每个眼只有原来的 1/3 高，对噪声敏感得多。',
    '「自动寻优」做的事情和 Phase 2/3 均衡里接收端做的一样：在 Preset 和 CTLE 的组合里找眼面积最大的那个。'
  ],
  src: 'PCIe 5.0 Base Spec §8.4.1.5（参考接收器）、表 8-12/8-13（8/16/32 GT/s 眼限值）、§8.3.3.3（TX Preset）',
  cam: [4.5, 5.5, 12.5], target: [0, 3.4, 0],
  build() {
    const o = { gen: 5, stage: 'dfe', loss: DEF_LOSS[5], preset: 'P7', ctle: 9, dfe: 3, noise: 1.2, rj: .008, sj: .02, xt: 0 };
    const eye = makeEye({ w: 10, h: 6, nx: 64, ny: 110, zScale: 1.15, pos: [0, 3.6, 0] });
    const cv = ui.canvas('浴盆曲线：采样相位 vs log₁₀(BER)', 170);
    const g0 = ui.group('链路');
    ui.seg('代际', [3, 4, 5, 6].map(g => ({ label: `${GENS[g].name} ${GENS[g].rate} GT/s`, value: g })), o.gen, v => { o.gen = v; o.loss = DEF_LOSS[v]; sLoss.set(o.loss); run(); }, g0);
    ui.seg('观察点', [['tx', 'TX 引脚'], ['ch', '信道之后'], ['rx', 'CTLE 之后'], ['dfe', 'DFE 之后']].map(([v, l]) => ({ label: l, value: v })), o.stage, v => { o.stage = v; run(); }, g0);
    const sLoss = ui.slider('信道插损 @ 奈奎斯特', { min: 0, max: 26, step: 1, value: o.loss, fmt: v => v + ' dB' }, v => { o.loss = v; tr(); }, g0);
    const g1 = ui.group('均衡');
    const segP = ui.seg('TX Preset', PRESETS.map(p => ({ label: p.id, value: p.id, title: `preshoot ${p.pre} dB, 去加重 ${p.de ?? 'LF'} dB` })), o.preset, v => { o.preset = v; run(); }, g1);
    const sCt = ui.slider('RX CTLE 峰化', { min: 0, max: 18, step: 1, value: o.ctle, fmt: v => v + ' dB' }, v => { o.ctle = v; tr(); }, g1);
    ui.slider('RX DFE 抽头数', { min: 0, max: 6, step: 1, value: o.dfe, fmt: v => v + ' 个' }, v => { o.dfe = v; tr(); }, g1);
    const g2 = ui.group('噪声与抖动');
    ui.slider('随机噪声 σ（接收端输入）', { min: 0, max: 5, step: .25, value: o.noise, fmt: v => v.toFixed(2) + ' mV' }, v => { o.noise = v; tr(); }, g2);
    ui.slider('随机抖动 RJ σ', { min: 0, max: .03, step: .002, value: o.rj, fmt: v => v.toFixed(3) + ' UI' }, v => { o.rj = v; tr(); }, g2);
    ui.slider('正弦抖动 SJ 幅度', { min: 0, max: .12, step: .01, value: o.sj, fmt: v => v.toFixed(2) + ' UI' }, v => { o.sj = v; tr(); }, g2);
    ui.slider('邻道串扰', { min: 0, max: 15, step: 1, value: o.xt, fmt: v => v + ' mV' }, v => { o.xt = v; tr(); }, g2);
    act('自动寻优 Preset + CTLE', async () => {
      const ffeIds = PRESETS.map(p => p.id); let best = null;
      for (const id of ffeIds) for (let c = 0; c <= 18; c += 2) {
        const pr = pulseResponse({ ffe: PRESETS.find(p => p.id === id), loss: o.loss, ctleDb: c });
        const eh = peakDistortionEH(pr.rx, o.dfe);
        if (!best || eh > best.eh) best = { id, c, eh };
      }
      ui.addLog(`峰值失真法搜索 ${ffeIds.length} × 10 种组合，最佳：${best.id} + CTLE ${best.c} dB`, 'ok');
      o.preset = best.id; o.ctle = best.c; segP.set(best.id); sCt.set(best.c); await wait(.05); run();
    });

    function run() {
      const g = GENS[o.gen];
      const r = runChain({ mod: g.mod, loss: o.loss, ffe: PRESETS.find(p => p.id === o.preset), ctleDb: o.ctle, dfeTaps: o.dfe,
        noiseMv: o.noise, rjUi: o.rj, sjUi: o.sj, xtalkMv: o.xt, nSym: g.mod === 'pam4' ? 2000 : 2600 }, [o.stage]);
      const st = r[o.stage];
      eye.update(st.eye); eye.overlay(st.m, st.vmax);
      const S = r.S;
      ui.setStatus(readout(st.m, o.gen, `<br><span style="color:var(--muted)">噪声 σ：输入 ${(S.sigmaIn*1000).toFixed(2)} mV → CTLE 后 ${(S.sigmaOut*1000).toFixed(2)} mV · 主游标 h0 ${(S.pr.rx.h0*1000).toFixed(0)} mV${S.dfe.length ? ' · DFE 抽头 ' + S.dfe.map(d => (d*1000).toFixed(1)).join(' / ') + ' mV' : ''}</span>`));
      const W = st.m.worst, data = W.bathtub.map((b, j) => [(j - 32)/32, b]);
      plot(cv, { x: [-1, 1], y: [-16, 0], xTicks: [-1, -.5, 0, .5, 1], yTicks: [0, -4, -8, -12, -16], xLabel: '采样相位（UI，0 为中心）', yLabel: 'log₁₀ BER',
        series: [{ data, color: CSS.copper, width: 2, fill: 'rgba(217,149,74,.12)' }],
        hlines: [{ y: -12, label: 'BER 1e-12', color: CSS.ok }],
        vlines: st.m.ew > 0 ? [{ x: -st.m.ew/2, color: CSS.ok }, { x: st.m.ew/2, color: CSS.ok, label: `EW ${st.m.ew.toFixed(2)} UI` }] : [] });
    }
    const tr = throttle(run);
    run();
    return { views: [{ label: '正视（示波器）', cam: [0, 3.6, 14], target: [0, 3.6, 0] }, { label: '贴近看密度', cam: [8, 4.4, 4], target: [0, 3.4, 0] }] };
  }
};
