# NVMe 交互实验室

一个本地运行的中文 NVMe 3D 教程。主线跟随一次真实的读写，把主机内存、队列、门铃、PCIe DMA、控制器、NAND、持久化与性能模型串成 20 章，共 91 个逐步讲解场景、60 条原理说明和 20 道自测题。

## 快速开始

需要 Node.js 20 或更新版本。

```powershell
cd nvme-wiki/visual-lab
npm install
npm start
```

浏览器打开 <http://127.0.0.1:5181/>。也可以直接访问章节，例如：

- `#overview`：NVMe 全景
- `#read`：一次读的完整旅程
- `#queues`：SQ/CQ 队列工坊
- `#prp`：PRP 与 SGL
- `#durability`：Flush、FUA 与掉电
- `#zns`：Zone 与 Zone Append

运行测试：

```powershell
npm test
```

## 学习路线

课程按 154 分钟的讲解阅读量设计，可以顺序学习，也可以从目录跳到具体问题。

| 单元 | 章节 | 要解决的问题 |
|---|---|---|
| 建立全景 | 01—02 | NVMe、PCIe、SSD 各自负责什么；Namespace 与 LBA 怎样定位数据 |
| 跟着一次读写 | 03—09 | Read/Write 生命周期、SQ/CQ、门铃、Phase Tag、PRP/SGL 与 SQE 字段 |
| 控制与性能 | 10—14 | 初始化、多队列、通知、QD/吞吐/延迟、Flush/FUA 与掉电 |
| 运维与扩展 | 15—20 | 健康日志与 AER、超时恢复、电源状态、FTL/GC、ZNS、NVMe-oF |

每一章都包含：

- 一个具体问题和生活类比
- 可播放、前后步进、键盘控制的 3D 场景
- 参数联动实验与实时读数
- 原理解释、常见误解和规范边界
- 一道带解释的自测题
- 本地规范页码或官方规范入口

## 交互实验

实验全部在浏览器内运行，不读取或操作本机磁盘。

- **队列**：写 SQ、敲门铃、取命令、完成、消费 CQE，观察满队列与乱序完成
- **寻址**：切换 Namespace、LBA 大小和 NLB，观察零基计数与越界拒绝
- **门铃**：比较批量提交次数及 `CAP.DSTRD` 对偏移的影响
- **PRP**：改变长度和页内偏移，观察 PRP2 在“不用、数据页、列表”之间切换
- **性能**：调节 QD、块大小、延迟和带宽，观察瓶颈转移
- **持久化**：组合普通写、FUA、Flush 和模拟掉电
- **健康**：提交 AER、调整示意温度并检查事件
- **FTL**：观察有效页搬迁、擦除与回收
- **ZNS**：顺序写、Append、写满与 Reset
- **NVMe-oF**：比较 TCP/RDMA 的高层传输关系

## 模型边界

- 规范基线是本地 PDF 的 **NVMe Base 2.1（2024-08-05）**，不是最新规范。NVM、ZNS、TCP、RDMA 的专属语义分别标注。
- 3D 面积、距离、动画速度、容量和功耗均为教学示意，不代表真实硬件或总线时序。
- 性能实验是解析模型，不模拟随机分布、缓存、GC、温度或真实 SSD 尾延迟。
- 持久化实验明确假设“易失写缓存启用且无掉电保护”，不是对任何具体设备的承诺。
- FTL/GC、NAND 组织和电源状态数值不是 NVMe 标准强制实现。
- 来源入口可能展示比本地基线更新的规范修订。

## 目录

```text
visual-lab/
  index.html          页面骨架
  style.css           桌面与移动端布局
  src/course.js       20 章课程内容
  src/model.js        可测试的队列、寻址、性能、持久化与 ZNS 模型
  src/scene.js        Three.js 三维场景
  src/main.js         导航、实验、自测与进度
  serve.mjs           本地静态服务器及来源文件映射
  tests/              Node 行为与内容完整性测试
  docs/PLAN.md        实施计划与后续路线
  docs/QA.md          验收记录与已知边界
```

## 内容来源

正文优先引用 `../_source/pages/page-###.md` 中的本地规范摘录，PDF 页码是物理页码而非页脚印刷页码。官方入口链接包括 NVM Express 的 Base、PCIe Transport、NVM Command Set、ZNS、TCP 和 RDMA 规范页面。

本教程用于机制理解，不替代规范正文、厂商数据手册、驱动源码审查或真实设备测试。
