import { THREE, COL, CSS, state, ui, label, place, ribbon, polyline, plot, table, clearGroup } from '../core.js';
import { SPU, PRESETS, pulseResponse, prbs } from '../sim.js';

const PATTERNS = {
  iso:  { label: '孤立的 1', bits: '00000001000000' },
  run:  { label: '连 1 后接 0', bits: '11111110100000' },
  alt:  { label: '1010 交替', bits: '10101010101010' },
  prbs: { label: 'PRBS 片段', bits: Array.from(prbs(14, 7, 0x2b)).join('') }
};

export default {
  key: 'isi', nav: '损耗与码间干扰 ISI', title: '信道损耗与码间干扰', sub: '一个比特的能量，怎样漏进邻居的时间槽',
  lead: `<p>PCB 走线对高频的衰减比低频大，一个方方正正的比特经过信道后会变矮、变胖、拖出长尾巴，这条曲线叫<b>脉冲响应</b>。在主采样点上的值叫<b>主游标 h0</b>，在后续各 UI 采样点上残留的值叫<b>后游标 h1、h2…</b>，提前出现的叫<b>前游标 h−1</b>。</p>
<p>接收到的波形就是每个比特的脉冲响应叠加起来。场景后方每一排是一个比特单独的贡献，最前面的铜色粗线是它们的总和。拖动「观察第几个采样点」，竖条会显示这个采样时刻每个比特各贡献了多少。</p>`,
  points: [
    '<b>ISI（码间干扰）</b> = 采样时刻里来自其他比特的成分。它与噪声不同：它是确定性的，取决于前后比特的组合，所以可以被均衡器预测并抵消。',
    '最坏情况是“长串相同比特之后突然翻转”：拖尾累加起来最大，翻转后的那个比特最难判对。',
    '插入损耗通常在<b>奈奎斯特频率</b>（数据率的一半，如 32 GT/s 时为 16 GHz）上标注。同一块板子速率翻倍，奈奎斯特频率翻倍，损耗的 dB 数大致也会成倍上升。',
    '后游标可以靠 TX 去加重（预先削弱拖尾）或 RX 的 DFE（判决后减掉）来消除；前游标只能靠 TX 的 preshoot 或 CTLE 处理，因为 DFE 只能抵消已经判决过的比特。'
  ],
  src: 'PCIe 5.0 Base Spec §8.4.1（通道合规方法、脉冲响应）；仿真为教学用多极点信道模型',
  cam: [3.5, 4.5, 11], target: [3.6, .8, -1.5],
  build() {
    const opt = { loss: 14, pat: 'run', sample: 7, show: true, preset: 'P4' };
    const G = new THREE.Group(); state.R.add(G);
    const cv = ui.canvas('脉冲响应（单个比特经过信道后的样子）与各游标采样值', 180);
    const g1 = ui.group('信道与比特图样');
    ui.slider('信道插损 @ 奈奎斯特', { min: 0, max: 24, step: 1, value: opt.loss, fmt: v => v + ' dB' }, v => { opt.loss = v; draw(); }, g1);
    ui.seg('比特图样', Object.entries(PATTERNS).map(([k, v]) => ({ label: v.label, value: k })), opt.pat, v => { opt.pat = v; draw(); }, g1);
    ui.seg('TX Preset', ['P4', 'P1', 'P7'].map(p => ({ label: p + (p === 'P4' ? ' 无均衡' : p === 'P1' ? ' 去加重' : ' 去加重+预冲'), value: p })), opt.preset, v => { opt.preset = v; draw(); }, g1);
    const sl = ui.slider('观察第几个采样点', { min: 1, max: 13, step: 1, value: opt.sample, fmt: v => '#' + v }, v => { opt.sample = v; draw(); }, g1);
    ui.toggle('显示各比特单独贡献', true, v => { opt.show = v; draw(); }, g1);

    const T = .62, YS = 3.8, ZSTEP = .42, ZF = 1.1;
    function draw() {
      clearGroup(G);
      const ffe = PRESETS.find(p => p.id === opt.preset);
      const pr = pulseResponse({ ffe, loss: opt.loss });
      const pw = pr.ch.wave, start = pr.start, off = pr.ch.off;           // pw[start + t] 为 t 采样点处的响应
      const bits = PATTERNS[opt.pat].bits.split('').map(c => c === '1' ? 1 : -1), M = bits.length;
      const tailUI = 6, n = (M + tailUI)*SPU;
      const contrib = bits.map((a, k) => { const arr = new Float32Array(n); for (let t = 0; t < n; t++) { const j = start + t - k*SPU; arr[t] = j >= 0 && j < pw.length ? a*pw[j] : 0; } return arr; });
      const sum = new Float32Array(n); for (const c of contrib) for (let t = 0; t < n; t++) sum[t] += c[t];
      const X = t => t/SPU*T, step = 2;
      // 各比特贡献
      if (opt.show) contrib.forEach((c, k) => {
        const pts = []; for (let t = 0; t < n; t += step) pts.push([X(t), 1.7 + YS*c[t], -k*ZSTEP]);
        ribbon(pts, bits[k] > 0 ? COL.tx : COL.rx, .035, G, .55);
        const lb = label(`b${k} = ${bits[k] > 0 ? 1 : 0}`, { size: .15, bg: false, color: bits[k] > 0 ? CSS.tx : CSS.rx, anchor: 'right' }); lb.position.set(-.15, 1.7, -k*ZSTEP); G.add(lb);
      });
      // 理想比特（虚线）和接收波形（铜色）
      const ideal = []; for (let k = 0; k < M; k++) { const y = 1.7 + YS*.4*bits[k]; ideal.push([X(k*SPU + off - SPU/2), y, ZF], [X(k*SPU + off + SPU/2), y, ZF]); }
      const il = polyline(ideal.length, 0xd9e5e7, G, { dashed: true, opacity: .5 }); il.userData.set(i => ideal[i]);
      const sp = []; for (let t = 0; t < n; t += step) sp.push([X(t), 1.7 + YS*sum[t], ZF]);
      ribbon(sp, COL.copper, .07, G);
      const zl = polyline(2, 0x3f6a72, G); zl.userData.set(i => [i ? X(n) : 0, 1.7, ZF]);
      place(label('接收波形 = 各比特贡献之和', { size: .24 }), X(n)/2, 1.7 + YS*.62, ZF, G);
      // 采样点
      let errs = 0;
      for (let k = 0; k < M; k++) {
        const t = k*SPU + off, v = sum[t], ok = Math.sign(v) === bits[k]; if (!ok) errs++;
        const dot = new THREE.Mesh(new THREE.SphereGeometry(k === opt.sample ? .09 : .06, 12, 8), new THREE.MeshBasicMaterial({ color: ok ? COL.ok : COL.bad }));
        dot.position.set(X(t), 1.7 + YS*v, ZF + .02); G.add(dot);
      }
      // 选中采样点的分解竖条
      const s = Math.min(opt.sample, M - 1), ts = s*SPU + off;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(M*ZSTEP + 1.6, 3.6), new THREE.MeshBasicMaterial({ color: 0xd9954a, transparent: true, opacity: .06, side: THREE.DoubleSide, depthWrite: false }));
      plane.rotation.y = Math.PI/2; plane.position.set(X(ts), 1.7, -(M - 1)*ZSTEP/2 + .5); G.add(plane);
      let pre = 0, post = 0;
      contrib.forEach((c, k) => {
        const v = c[ts]; if (k < s) post += v; else if (k > s) pre += v;
        if (!opt.show || Math.abs(v) < 1e-4) return;
        const h = YS*v, bar = new THREE.Mesh(new THREE.BoxGeometry(.1, Math.abs(h), .1), new THREE.MeshBasicMaterial({ color: k === s ? 0xffffff : v > 0 ? COL.tx : COL.rx }));
        bar.position.set(X(ts), 1.7 + h/2, -k*ZSTEP); G.add(bar);
      });
      const main = contrib[s][ts], tot = sum[ts];
      ui.setStatus(`<b>采样点 #${s}</b>（发送比特 ${bits[s] > 0 ? 1 : 0}）` + table([
        ['主游标贡献', `${(main*1000).toFixed(1)} mV`],
        ['前面比特拖尾（后游标 ISI）', `${(post*1000).toFixed(1)} mV`],
        ['后面比特提前到达（前游标 ISI）', `${(pre*1000).toFixed(1)} mV`],
        ['合计 → 判决', `${(tot*1000).toFixed(1)} mV → ${tot > 0 ? 1 : 0} ${Math.sign(tot) === bits[s] ? '<span class="chip ok">正确</span>' : '<span class="chip bad">误判</span>'}`],
        ['本图样误判数', `${errs} / ${M}`]
      ]));
      // 2D 脉冲响应
      const data = []; for (let t = -2*SPU; t < 12*SPU; t++) { const j = pr.ch.peak + t; data.push([t/SPU, j >= 0 && j < pw.length ? pw[j]*1000 : 0]); }
      const stems = []; for (let c = -2; c <= 10; c++) stems.push([c, pr.ch.h[c + 3]*1000]);
      plot(cv, { x: [-2, 12], y: [-60, 420], xTicks: [-2, 0, 2, 4, 6, 8, 10, 12], yTicks: [0, 100, 200, 300, 400], xLabel: '相对主游标的 UI', yLabel: 'mV',
        series: [{ data, color: CSS.copper, width: 2 }, { data: stems, color: CSS.tx, stems: true }],
        points: [{ x: 0, y: pr.ch.h0*1000, color: '#fff', label: `h0 ${(pr.ch.h0*1000).toFixed(0)}` }, { x: 1, y: pr.ch.h[4]*1000, color: CSS.tx, label: `h1 ${(pr.ch.h[4]*1000).toFixed(0)}` }, { x: -1, y: pr.ch.h[2]*1000, color: CSS.rx, label: `h−1 ${(pr.ch.h[2]*1000).toFixed(0)}` }],
        hlines: [{ y: 0 }] });
    }
    draw();
    return { views: [{ label: '正视叠加', cam: [3.6, 1.7, 16], target: [3.6, 1.7, 0] }, { label: '侧看分解', cam: [-6, 4, 2], target: [4, 1.5, -2.5] }] };
  }
};
