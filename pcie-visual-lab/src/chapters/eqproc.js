import { THREE, COL, CSS, state, ui, chip, trace, label, place, act, tween, wait, P, fly, kill, stdMat, table, polyline } from '../core.js';
import { heat } from '../eye3d.js';
import { PRESETS, ffeOf, pulseResponse, peakDistortionEH } from '../sim.js';

const STEP = .025, NC = 11, NP = 17, LF = 1/3;   // c−1: 0…−0.25，c+1: 0…−0.40
const legal = (a, b) => Math.abs(a) <= .25 + 1e-9 && 1 - 2*(Math.abs(a) + Math.abs(b)) >= LF - 1e-9;

// 接收端对某组 TX 系数的评价：CTLE 在 0/3/6 dB 三档里自适应，DFE 1 抽头（与 8 GT/s 参考接收器同级），取最大眼高
function evaluate(loss, cm1, cp1, nDfe) {
  if (!legal(cm1, cp1)) return null;
  let best = -1;
  for (const c of [0, 3, 6]) best = Math.max(best, peakDistortionEH(pulseResponse({ ffe: ffeOf(cm1, cp1), loss, ctleDb: c }).rx, nDfe));
  return best;
}
function buildGrid(loss, nDfe) {
  const g = []; let mx = -1, mn = 1;
  for (let r = 0; r < NP; r++) for (let c = 0; c < NC; c++) { const v = evaluate(loss, -c*STEP, -r*STEP, nDfe); g.push(v); if (v !== null) { mx = Math.max(mx, v); mn = Math.min(mn, v); } }
  return { g, mx, mn, at: (c, r) => g[r*NC + c] };
}

export default {
  key: 'eqproc', nav: '均衡流程 Phase 0–3', title: '链路均衡流程 Phase 0–3', sub: '两端怎样隔着链路互相调参数',
  lead: `<p>8 GT/s 起，每个速率首次使用前都要做一次<b>链路均衡</b>。难点在于：发送端的 FFE 系数好不好，只有<b>对端的接收器</b>知道。所以流程设计成“接收端评估、请求对方改 TX 系数”，靠 TS1 有序集中的 <b>EC（Equalization Control）</b>字段区分阶段。</p>
<p>左侧是 Downstream Port（如 Root Port）和 Upstream Port（如 NVMe SSD），中间飞的是 TS1/TS2。右侧曲面是接收端对对方每一组 TX 系数 (c<sub>−1</sub>, c<sub>+1</sub>) 评估得到的眼高，灰色区域是不合法的系数。白球是当前设置，线是搜索路径。</p>`,
  points: [
    '<b>Phase 0</b>：还在低速率（8 GT/s 均衡时为 2.5/5 GT/s）时，DSP 通过 EQ TS2 告诉 USP 切速后先用哪个 TX Preset（来自 Lane Equalization Control 寄存器）。',
    '<b>Phase 1</b>（EC=01b）：切到新速率，双方用初始 Preset 把链路拉起到 BER < 10<sup>−4</sup>，能可靠交换 TS1 即可；同时通告各自的 FS、LF。',
    '<b>Phase 2</b>（EC=10b）：<b>USP 调 DSP 的发送端</b>。USP 在 TS1 里请求 Preset 或具体系数，DSP 须在 500 ns 内生效并在 TS1 中回显；非法请求以 Reject Coefficient Values 位拒绝。',
    '<b>Phase 3</b>（EC=11b）：反过来，<b>DSP 调 USP 的发送端</b>。DSP 发 EC=00b 的 TS1 表示均衡结束，回到 Recovery.RcvrLock。',
    '结果记录在 Link Status 2（8 GT/s）或 16/32 GT/s Status 寄存器：Phase 1/2/3 Successful 与 Equalization Complete。Gen5 链路要在 8、16、32 GT/s 依次各做一遍。',
    '搜索算法由各家实现决定，规范只规定“握手”。本演示用“先扫 Preset、再逐步爬坡微调系数”的常见策略。',
    'wiki 原文把 Phase 1 写成“发送端轮流用多组 Preset、接收端评估”，又把 Phase 3 写成“可选旁路”，与规范不符：Preset 的评估发生在 Phase 2/3，Phase 3 是反方向的调整。'
  ],
  src: 'PCIe 5.0 Base Spec §4.2.3（Link Equalization Procedure）、§4.2.6.4.2（Recovery.Equalization）、§7.7.3.x Link Status 2',
  cam: [-1, 9, 13], target: [0, 1, .6],
  build() {
    const o = { speed: 2 };
    const dsp = chip({ w: 2.4, h: .5, d: 2, pos: [-10, 0, 0], color: 0x6a4a2c, text: 'Downstream Port\n（Root Port）' });
    const usp = chip({ w: 2.4, h: .5, d: 2, pos: [-3.2, 0, 0], color: 0x3a4e66, text: 'Upstream Port\n（端点）' });
    trace([[-8.7, .03, -.45], [-4.5, .03, -.45]], COL.copper, .12);
    trace([[-8.7, .03, .45], [-4.5, .03, .45]], COL.copper, .12);
    place(label('DSP TX → USP RX', { size: .17, bg: false, color: CSS.tx }), -6.6, .12, -1.0);
    place(label('USP TX → DSP RX', { size: .17, bg: false, color: CSS.rx }), -6.6, .12, 1.0);
    const rateLb = place(label('2.5 GT/s', { size: .3, mono: true }), -6.6, 1.3, 0);
    const phaseLb = place(label('准备', { size: .34 }), -6.6, 2.1, 0);
    const down = P([[-8.7, .35, -.45], [-4.5, .35, -.45]]), up = P([[-4.5, .35, .45], [-8.7, .35, .45]]);

    // 曲面
    const SX = 1.2, SZ = -3.6, W = 7, D = 7.6, HS = 3.2;
    const surfG = new THREE.Group(); state.R.add(surfG);
    const titleLb = place(label(' ', { size: .26 }), SX + W/2, 4.4, SZ + D/2);
    place(label('c−1 (预冲) →', { size: .2, bg: false, color: CSS.rx }), SX + W/2, .1, SZ - .45);
    place(label('c+1 (去加重) →', { size: .2, bg: false, color: CSS.tx }), SX - .9, .1, SZ + D/2);
    const X = c => SX + c/(NC - 1)*W, Z = r => SZ + r/(NP - 1)*D;
    let grid = null, surf = null, trail = [], trailLine = null;
    const marker = new THREE.Mesh(new THREE.SphereGeometry(.16, 18, 12), new THREE.MeshBasicMaterial({ color: 0xffffff })); state.R.add(marker); marker.visible = false;
    const Hof = v => v === null ? 0 : .08 + HS*Math.max(0, (v - grid.mn)/(grid.mx - grid.mn || 1));
    function showSurface(gr, title) {
      grid = gr; if (surf) kill(surf);
      const pos = [], col = [], idx = [], tmp = new THREE.Color();
      for (let r = 0; r < NP; r++) for (let c = 0; c < NC; c++) {
        const v = gr.at(c, r); pos.push(X(c), Hof(v), Z(r));
        if (v === null) tmp.setHex(0x3a4447); else heat(.15 + .85*Math.max(0, (v - gr.mn)/(gr.mx - gr.mn || 1)), tmp);
        col.push(tmp.r, tmp.g, tmp.b);
        if (r < NP - 1 && c < NC - 1) { const a = r*NC + c; idx.push(a, a + NC, a + 1, a + 1, a + NC, a + NC + 1); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      surf = new THREE.Group();
      surf.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .7 })));
      surf.add(new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: 0x0a1316, transparent: true, opacity: .35 })));
      // Preset 位置标注
      for (const p of PRESETS) { const c = Math.round(-p.cm1/STEP), r = Math.round(-p.cp1/STEP); if (c >= NC || r >= NP) continue;
        const l = label(p.id, { size: .17, bg: false, color: '#fff' }); l.position.set(X(c), Hof(gr.at(c, r)) + .25, Z(r)); surf.add(l); }
      surfG.add(surf); titleLb.userData.draw(title);
      trail = []; if (trailLine) { kill(trailLine); trailLine = null; }
    }
    function moveMarker(c, r, ok = true) {
      const target = [X(c), Hof(grid.at(c, r)) + .18, Z(r)];
      marker.visible = true; marker.material.color.setHex(ok ? 0xffffff : COL.bad);
      const from = marker.position.clone();
      if (ok) { trail.push(target); if (trailLine) kill(trailLine); trailLine = polyline(trail.length, COL.copper); trailLine.userData.set(i => trail[i]); }
      return tween(.45/o.speed, u => marker.position.lerpVectors(from, new THREE.Vector3(...target), u));
    }
    async function ts(dir, text, col) {
      const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(.5, .24, .34), stdMat(col)));
      const l = label(text, { size: .17, mono: true }); l.position.y = .42; g.add(l); state.R.add(g);
      await fly(g, dir === 'down' ? down : up, .9/o.speed); kill(g);
    }
    const regs = { p1: false, p2: false, p3: false, done: false };
    const showRegs = extra => ui.setStatus('<b>Link Status 2 寄存器（8.0 GT/s）</b>' + table([
      ['Equalization 8.0 GT/s Complete', regs.done ? '1' : '0'], ['… Phase 1 Successful', regs.p1 ? '1' : '0'],
      ['… Phase 2 Successful', regs.p2 ? '1' : '0'], ['… Phase 3 Successful', regs.p3 ? '1' : '0']]) + (extra || ''));

    // 一个方向上的搜索：先扫 Preset，再爬坡微调
    async function tune(dirReq, dirResp, loss, nDfe, who, tx) {
      const presets = ['P4', 'P1', 'P0', 'P7', 'P8', 'P9', 'P5', 'P3'];
      let best = null;
      for (const id of presets) {
        const p = PRESETS.find(q => q.id === id), c = Math.round(-p.cm1/STEP), r = Math.round(-p.cp1/STEP), v = grid.at(c, r);
        await ts(dirReq, `TS1 EC=${who}\nUse Preset=1 · ${id}`, COL.amber);
        await ts(dirResp, `TS1 回显 ${id}`, dirResp === 'down' ? COL.tx : COL.rx);
        await moveMarker(c, r);
        ui.addLog(`${tx} 改用 ${id}，接收端评估眼高 ${(v*1000).toFixed(1)} mV`, 'ts');
        if (!best || v > best.v) best = { c, r, v, id };
      }
      ui.addLog(`Preset 扫描完毕，最好的是 ${best.id}（${(best.v*1000).toFixed(1)} mV），开始逐步微调系数。`, 'ok');
      let cur = best;
      await ts(dirReq, `TS1 EC=${who}\nUse Preset=1 · ${best.id}`, COL.amber); await moveMarker(cur.c, cur.r);
      for (let it = 0; it < 10; it++) {
        let next = null;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const c = cur.c + dc, r = cur.r + dr; if (c < 0 || r < 0 || c >= NC || r >= NP) continue;
          const v = grid.at(c, r);
          const txt = `TS1 EC=${who} · Use Preset=0\nc−1=${(-c*STEP).toFixed(3)} c+1=${(-r*STEP).toFixed(3)}`;
          await ts(dirReq, txt, COL.amber);
          if (v === null) {
            await ts(dirResp, 'Reject Coefficient=1', COL.bad); await moveMarker(c, r, false);
            ui.addLog(`请求 c−1=${(-c*STEP).toFixed(3)}, c+1=${(-r*STEP).toFixed(3)} 超出 FS/LF 约束，被拒绝，TX 保持原值`, 'bad');
            await moveMarker(cur.c, cur.r); continue;
          }
          await ts(dirResp, '系数已生效', dirResp === 'down' ? COL.tx : COL.rx);
          await moveMarker(c, r);
          if (v > cur.v + 1e-4 && (!next || v > next.v)) next = { c, r, v };
          await moveMarker(cur.c, cur.r);
        }
        if (!next) break;
        cur = next; await moveMarker(cur.c, cur.r);
        ui.addLog(`爬坡一步：c−1=${(-cur.c*STEP).toFixed(3)}, c+1=${(-cur.r*STEP).toFixed(3)}，眼高 ${(cur.v*1000).toFixed(1)} mV`, 'ts');
      }
      ui.addLog(`${tx} 最终系数 c−1=${(-cur.c*STEP).toFixed(3)}, c+1=${(-cur.r*STEP).toFixed(3)}，眼高 ${(cur.v*1000).toFixed(1)} mV（初始 P4 为 ${(grid.at(0, 0)*1000).toFixed(1)} mV）`, 'ok');
      return cur;
    }

    const gA = buildGrid(24, 1), gB = buildGrid(20, 1);
    showSurface(gA, 'USP 评估 DSP 的 TX（信道 A，24 dB）');
    showRegs();
    ui.seg('动画速度', [{ label: '0.5×', value: .5 }, { label: '1×', value: 1 }, { label: '2×', value: 2 }, { label: '4×', value: 4 }], 2, v => o.speed = v);
    act('运行完整均衡流程（8 GT/s）', async () => {
      Object.assign(regs, { p1: false, p2: false, p3: false, done: false }); showRegs(); ui.log.innerHTML = '';
      showSurface(gA, 'USP 评估 DSP 的 TX（信道 A，24 dB）'); marker.visible = false;
      rateLb.userData.draw('2.5 GT/s'); phaseLb.userData.draw('Phase 0');
      ui.addLog('Recovery.RcvrCfg（2.5 GT/s）：DSP 发 EQ TS2，告诉 USP 切速后的 TX Preset 和 RX Preset Hint。');
      await ts('down', 'EQ TS2\nUSP Tx Preset=P7', COL.dllp); usp.flash(COL.dllp);
      await ts('down', 'EQ TS2 · speed_change=1', COL.dllp);
      await tween(.6/o.speed, u => { if (u > .5) rateLb.userData.draw('8.0 GT/s'); });
      ui.addLog('切速到 8.0 GT/s，进入 Recovery.Equalization。', 'ok');
      phaseLb.userData.draw('Phase 1  EC=01b');
      await ts('down', 'TS1 EC=01b\nFS=63 LF=21 · P4', COL.tx);
      await ts('up', 'TS1 EC=01b\nFS=63 LF=21 · P7', COL.rx);
      ui.addLog('Phase 1：双方用初始 Preset 让链路能交换 TS1（BER < 1e-4），并互相通告 FS / LF。');
      regs.p1 = true; showRegs();
      phaseLb.userData.draw('Phase 2  EC=10b'); dsp.flash(COL.amber, 2);
      await ts('down', 'TS1 EC=10b', COL.tx);
      ui.addLog('Phase 2：DSP 发 EC=10b，由 USP 来调 DSP 的发送端。');
      await tune('up', 'down', 24, 1, '10b', 'DSP 发送端');
      regs.p2 = true; showRegs();
      phaseLb.userData.draw('Phase 3  EC=11b');
      await ts('up', 'TS1 EC=11b', COL.rx);
      ui.addLog('USP 发 EC=11b 进入 Phase 3：轮到 DSP 来调 USP 的发送端。');
      showSurface(gB, 'DSP 评估 USP 的 TX（信道 B，20 dB）'); marker.visible = false;
      await tune('down', 'up', 20, 1, '11b', 'USP 发送端');
      regs.p3 = true;
      await ts('down', 'TS1 EC=00b', COL.tx);
      regs.done = true; phaseLb.userData.draw('完成 → Recovery.RcvrLock');
      showRegs('<br>Gen5 链路接下来还要在 16 GT/s、32 GT/s 各做一遍，结果分别记在 16.0 GT/s 和 32.0 GT/s Status 寄存器里。');
      ui.addLog('DSP 发 EC=00b，均衡结束，回到 Recovery.RcvrLock → L0。', 'ok');
    });
    ui.button('查看另一方向的曲面', () => { if (state.busy) return; showSurface(grid === gA ? gB : gA, grid === gA ? 'DSP 评估 USP 的 TX（信道 B，20 dB）' : 'USP 评估 DSP 的 TX（信道 A，24 dB）'); marker.visible = false; });
    return { views: [{ label: '看曲面', cam: [SX + W/2 + 6, 7, SZ + D + 4], target: [SX + W/2, 1, SZ + D/2] }, { label: '看握手', cam: [-6.6, 4.5, 6], target: [-6.6, .6, 0] }] };
  }
};
