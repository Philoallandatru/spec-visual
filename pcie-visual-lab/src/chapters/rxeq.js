import { THREE, COL, CSS, state, ui, label, place, plot, throttle, trace } from '../core.js';
import { makeEye } from '../eye3d.js';
import { PRESETS, runChain, channelMag, ctleMag, ffeMag } from '../sim.js';

export default {
  key: 'rxeq', nav: 'RX 均衡 CTLE + DFE', title: '沿着链路看眼：CTLE 与 DFE', sub: '眼睛是怎样一步步被“救”回来的',
  lead: `<p>同一串数据，在链路的四个位置各看一次眼图：<b>TX 引脚 → 信道之后 → CTLE 之后 → DFE 之后</b>。</p>
<p><b>CTLE</b>（连续时间线性均衡器）是一个模拟高通滤波器：压低低频、相对抬高高频，把被信道削掉的边沿“拉直”，但会同时放大高频噪声和串扰。<b>DFE</b>（判决反馈均衡器）利用已经判决出的前几个比特，按后游标 h1、h2… 的大小把它们留下的拖尾直接减掉。DFE 不放大噪声，但只能处理后游标。</p>`,
  points: [
    'CTLE 的峰化量要和信道匹配：太小拖尾残留，太大会造成过冲（负的后游标）并放大噪声。在「3D 眼图实验室」里把噪声调大再扫 CTLE，能看到最佳点向更小的峰化移动。',
    'DFE 的第 1 个抽头最关键：它必须在 1 个 UI 内完成“判决 → 乘系数 → 反馈相减”，这是高速 SerDes 设计里最紧的时序回路，常用“展开（loop-unrolled）”结构绕开。',
    'DFE 有<b>错误传播</b>：一旦判错，减掉的拖尾也是错的，可能连带后面几个比特出错。规范参考接收器在 8 GT/s 时 d1 范围为 ±30 mV。',
    '规范的参考接收器（Behavioral Reference Receiver）是 CTLE + DFE（8 GT/s 为 1 阶 CTLE + 1 抽头，16 GT/s 为 1 阶 CTLE + 2 抽头，32 GT/s 为 2 阶 CTLE + 3 抽头），合规测试中的眼图要求都是在它之后测的。'
  ],
  src: 'PCIe 5.0 Base Spec §8.3.4–§8.3.5（参考 CTLE/DFE）、§8.4.1.5、表 8-12',
  cam: [0, 5.2, 15], target: [0, 2.3, 0],
  build() {
    const o = { loss: 18, preset: 'P7', ctle: 9, dfe: 3, noise: 1.2 };
    const pos = [-7.8, -2.6, 2.6, 7.8], names = ['① TX 引脚', '② 信道之后', '③ CTLE 之后', '④ DFE 之后'], keys = ['tx', 'ch', 'rx', 'dfe'];
    const eyes = keys.map((k, i) => makeEye({ w: 4.4, h: 3.2, nx: 64, ny: 80, zScale: .7, title: names[i], pos: [pos[i], 2.4, 0], compact: true }));
    const mLbs = keys.map((k, i) => place(label(' ', { size: .2, mono: true }), pos[i], .25, .6));
    for (let i = 0; i < 3; i++) {
      trace([[pos[i] + 2.35, .05, 0], [pos[i+1] - 2.35, .05, 0]], COL.copper, .08);
      place(label(['信道', 'CTLE', 'DFE'][i], { size: .22, color: CSS.copper }), (pos[i] + pos[i+1])/2, .35, 0);
    }
    const cvB = ui.canvas('频率响应：信道 × TX FFE × CTLE', 190);
    const cvD = ui.canvas('后游标 h1…h6（CTLE 之后）与 DFE 抽头', 150);
    const g = ui.group('参数');
    ui.slider('信道插损 @ 奈奎斯特', { min: 0, max: 26, step: 1, value: o.loss, fmt: v => v + ' dB' }, v => { o.loss = v; tr(); }, g);
    ui.seg('TX Preset', PRESETS.map(p => ({ label: p.id, value: p.id })), o.preset, v => { o.preset = v; run(); }, g);
    ui.slider('CTLE 峰化', { min: 0, max: 18, step: 1, value: o.ctle, fmt: v => v + ' dB' }, v => { o.ctle = v; tr(); }, g);
    ui.slider('DFE 抽头数', { min: 0, max: 6, step: 1, value: o.dfe, fmt: v => v + ' 个' }, v => { o.dfe = v; tr(); }, g);
    ui.slider('随机噪声 σ', { min: 0, max: 5, step: .25, value: o.noise, fmt: v => v.toFixed(2) + ' mV' }, v => { o.noise = v; tr(); }, g);

    function run() {
      const ffe = PRESETS.find(p => p.id === o.preset);
      const r = runChain({ loss: o.loss, ffe, ctleDb: o.ctle, dfeTaps: o.dfe, noiseMv: o.noise, rjUi: .006, sjUi: .01, nSym: 2000, ny: 80 }, keys);
      keys.forEach((k, i) => {
        eyes[i].update(r[k].eye); eyes[i].overlay(r[k].m, r[k].vmax, { quiet: false });
        const m = r[k].m; mLbs[i].userData.draw(m.eh > 0 && m.ew > 0 ? `EH ${(m.eh*1000).toFixed(1)} mV · EW ${m.ew.toFixed(2)} UI` : '眼闭合');
      });
      const ch = [], ct = [], fx = [], tot = []; const f0 = ffeMag(0, ffe);
      for (let i = 1; i <= 120; i++) { const f = i/160; const a = 20*Math.log10(channelMag(f, o.loss)), b = 20*Math.log10(ctleMag(f, o.ctle)), c = 20*Math.log10(ffeMag(f, ffe)/f0); ch.push([f, a]); ct.push([f, b]); fx.push([f, c]); tot.push([f, a + b + c]); }
      plot(cvB, { x: [0, .75], y: [-40, 10], xTicks: [0, .25, .5, .75], yTicks: [10, 0, -10, -20, -30, -40], xLabel: '频率（周期/UI）', yLabel: 'dB', xFmt: v => v.toFixed(2),
        series: [{ data: ch, color: CSS.rx, width: 1.6 }, { data: fx, color: CSS.tx, width: 1.6 }, { data: ct, color: CSS.amber, width: 1.6 }, { data: tot, color: '#fff', width: 2.2 }],
        vlines: [{ x: .5, label: '奈奎斯特', color: CSS.muted }], legend: [['信道', CSS.rx], ['FFE', CSS.tx], ['CTLE', CSS.amber], ['合计', '#fff']] });
      const h = r.S.pr.rx.h, hs = [], ds = []; for (let i = 1; i <= 6; i++) { hs.push([i - .12, h[i + 3]*1000]); if (i <= r.S.dfe.length) ds.push([i + .12, r.S.dfe[i-1]*1000]); }
      const ymax = Math.max(20, ...hs.map(p => Math.abs(p[1])))*1.2;
      plot(cvD, { x: [.5, 6.5], y: [-ymax, ymax], xTicks: [1, 2, 3, 4, 5, 6], yTicks: [-Math.round(ymax*.8), 0, Math.round(ymax*.8)], xLabel: '后游标序号', yLabel: 'mV', xFmt: v => 'h' + v,
        series: [{ data: hs, color: CSS.tx, stems: true }, { data: ds, color: CSS.copper, stems: true }], hlines: [{ y: 0 }], legend: [['后游标', CSS.tx], ['DFE 抵消量', CSS.copper]] });
      ui.setStatus(`主游标 h0 = <b>${(r.S.pr.rx.h0*1000).toFixed(0)} mV</b>，CTLE 后噪声 σ = <b>${(r.S.sigmaOut*1000).toFixed(2)} mV</b>（输入 ${(r.S.sigmaIn*1000).toFixed(2)} mV）。<br>CTLE 的直流增益为 −${o.ctle} dB：它不是把高频放大，而是把低频压下去，所以 ③ 的眼整体变矮但变“方”。`);
    }
    const tr = throttle(run);
    run();
    return { views: [{ label: '正视', cam: [0, 2.4, 17], target: [0, 2.4, 0] }] };
  }
};
