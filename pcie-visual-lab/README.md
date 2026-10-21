# PCIe 物理层实验室（本地 3D 演示）

针对 wiki 中物理层最难懂的几章（电气规范、链路均衡、编码与速率），用 three.js 做的可交互图解。所有计算都在浏览器里完成，不需要联网。

## 启动

```bash
cd pcie-wiki/visual-lab
npm install      # 首次运行，只安装 three@0.170.0
npm start        # 等同于 node serve.mjs 5180
```

浏览器打开 <http://127.0.0.1:5180/>。服务只监听本机回环地址。换端口：`node serve.mjs 8080`。

直接双击 `index.html` 不行：浏览器禁止 `file://` 下的 ES Module 导入，必须走本地服务。

## 章节

| # | 章节 | 能做什么 |
|---|------|----------|
| 1 | 差分对与 TX/RX 前端 | D+/D− 波形在走线上传播；注入共模噪声、对内 skew、极性接反、信道损耗；Receiver Detect 充电曲线 |
| 2 | 损耗与码间干扰 ISI | 每个比特的脉冲响应分层排开，前排是叠加结果；选任意采样点看主游标 / 前游标 / 后游标各贡献多少 |
| 3 | 3D 眼图实验室 | PRBS 经过 TX FFE → 信道 → 噪声/串扰 → CTLE → DFE 后折叠成 3D 密度眼图；BER 1e-12 眼罩、浴盆曲线、与规范参考眼对比；Gen6 PAM4 |
| 4 | TX 均衡与 Preset | 规范表 8-1 的 P0–P10；Va/Vb/Vc/Vd 电平、预冲/去加重计算、系数合法区、频率响应 |
| 5 | RX 均衡 CTLE + DFE | 同一数据在 TX 引脚、信道后、CTLE 后、DFE 后四处的眼图并排；信道 × FFE × CTLE 的频率响应；后游标与 DFE 抽头 |
| 6 | 均衡流程 Phase 0–3 | EQ TS2 / TS1（EC 字段）握手动画；接收端评估对方 TX 系数的 3D 曲面与搜索路径；Reject Coefficient；Link Status 2 位 |
| 7 | Lane Margining 与抖动 | 接收器按步挪动采样点统计误码，画出实测余量十字；时间与电压浴盆；RJ/SJ 对 TJ 的贡献 |

URL 的 `#` 后面是章节键（`#diff #isi #eye #ffe #rxeq #eqproc #margin`），可以直接收藏某一章。

## 仿真模型说明

`src/sim.js` 是行为级教学模型：

- 信道 = 2 极点快路径 + 1 极点慢路径（模拟趋肤效应的长拖尾），按“奈奎斯特频率处插损 dB”反解截止频率。插损 dB 与真实背板的 dB 数不能一一对应，但损耗越大 → ISI 越重 → 需要越强均衡，这个趋势是对的。
- TX：3 抽头 FFE，满摆幅 800 mVpp，Preset 数值取自 PCIe 5.0 规范表 8-1；P10 取 LF/FS = 1/3 示例。
- RX：CTLE 用一个零点、一个极点，直流衰减 = 峰化 dB（与规范参考 CTLE 一致）；DFE 抽头取 CTLE 后脉冲响应的后游标。
- 眼高/眼宽：噪声按 ±7.03σ、RJ 按 ±7.03σ 外推到 BER 1e-12，SJ 按峰峰值扣除。
- 均衡流程中的搜索策略（先扫 Preset，再爬坡）是一种常见实现，规范只规定握手，不规定算法。

## 与 wiki 原文的差异（以规范为准）

制作时对照了 `PCI Express Base Specification.pdf`，发现以下几处 wiki 原文与规范不一致，图解按规范绘制：

1. `wiki/physical-layer/link-equalization.md` 的 Preset 表：原文把 P0 写成“无均衡”、P4 写成“典型去加重”。规范表 8-1 中 **P4 才是 0 dB / 0 dB（无均衡）**，P0 是 −6 dB 去加重。
2. 同一文件的均衡阶段：原文说 Phase 1 由发送端轮流尝试多组 Preset，Phase 3 是“可选旁路”。规范中 **Phase 1 只是把链路拉起到 BER < 1e-4**；Preset/系数评估在 **Phase 2（USP 调 DSP 的 TX）** 和 **Phase 3（DSP 调 USP 的 TX）**。
3. `wiki/physical-layer/electrical-spec.md` 的眼图规范：原文写 Gen4 > 100 mV、Gen5 > 80 mV。规范表中经参考均衡后的眼高为 **8 GT/s 25 mV、16 GT/s 15 mV、32 GT/s 15 mV，眼宽均为 0.3 UI**。

## 目录

```
visual-lab/
├── index.html           页面骨架与样式
├── serve.mjs            本地静态服务器
├── package.json
└── src/
    ├── main.js          章节切换
    ├── core.js          场景、3D 积木、面板控件、2D 曲线
    ├── sim.js           信号链路仿真（PRBS / FFE / 信道 / CTLE / DFE / 眼图 / 浴盆）
    ├── eye3d.js         3D 眼图曲面
    └── chapters/        7 个章节
```
