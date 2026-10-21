const step = (title, body, focus = [], flow = []) => ({ title, body, focus, flow });
const quiz = (question, options, answer, why) => ({ question, options, answer, why });

export const units = ['01 / 建立全景', '02 / 跟着一次读写', '03 / 看懂控制与性能', '04 / 运维与扩展'];
export const chapters = [
  {
    id: 'overview', unit: 0, title: '先看懂，谁在和谁说话', short: 'NVMe 全景', minutes: 5, scene: 'topology', sceneTitle: 'HOST MEMORY → CONTROLLER → STORAGE',
    question: '点开一个文件时，CPU、PCIe 和 SSD 分别做了什么？',
    analogy: '把它看成一家仓库：主机填订单，控制器安排取货，PCIe 负责运输。NVMe 规定订单怎么写、怎样交接。',
    steps: [
      step('应用提出需求', '应用请求读一段数据。操作系统把文件偏移转换成块请求，驱动准备 NVMe 命令；控制器通常不认识你的文件名。', ['cpu']),
      step('订单和货物分开存放', 'SQ 是提交队列，CQ 是完成队列，数据缓冲区放实际内容。本课把它们放在主机内存中，三者承担不同角色。', ['sq', 'cq', 'buffer'], [['cpu', 'sq']]),
      step('控制器通过 PCIe 与主机交互', '驱动用 MMIO 写门铃，控制器读取命令、搬运数据并写完成记录。PCIe 承载这些访问，NVMe 赋予它们存储语义。', ['doorbell', 'ctrl'], [['sq', 'ctrl']]),
      step('介质在协议边界之后', '控制器把逻辑块请求交给内部存储系统。图中的 NAND 只是常见 SSD 实现；NVMe 本身并没有规定必须采用哪种闪存组织。', ['ctrl', 'media'], [['ctrl', 'media']]),
      step('完成记录回到主机', 'CQE 告诉驱动哪条命令完成、结果如何。驱动再通知操作系统与应用。后面的课程会把每一次交接拆开。', ['cq', 'cpu'], [['ctrl', 'cq'], ['cq', 'cpu']])
    ],
    notes: ['<strong>NVMe 是协议，PCIe 是一种传输。</strong>M.2 是外形与连接规范的一部分，不能只看外形就断定设备使用 NVMe。这里聚焦本地 PCIe NVMe。', '<strong>三个地址世界：</strong>应用看到虚拟地址，控制器使用驱动提供的 DMA 可访问地址，存储位置则由 Namespace 和 LBA 指定。它们不能互换。', '<strong>本图是逻辑布局。</strong>SQ、CQ 与缓冲区画成相邻区域是为了讲清关系，不要求它们在真实内存里相邻。CMB 等特殊放置方式留作扩展。'],
    misconception: '“CPU 把每一个数据字节写进 SSD 寄存器”并不是这里的数据路径。CPU 建立描述与映射，控制器通过 DMA 访问数据缓冲区。',
    quiz: quiz('下面哪个对象保存读回来的文件内容？', ['SQ 中的命令', '主机数据缓冲区', '门铃寄存器'], 1, 'SQ 描述要做什么，门铃公布队列进度，实际 payload 位于数据缓冲区。'),
    base: [41, 42, 43, 44], boundary: '普通 PCIe 主机内存队列；图中面积、距离和动画时长不代表实际硬件。'
  },
  {
    id: 'namespace', unit: 0, title: '找到数据的逻辑地址', short: 'Namespace 与 LBA', minutes: 6, scene: 'namespace', sceneTitle: 'NAMESPACE / LOGICAL BLOCK ADDRESSING', lab: 'address',
    question: '同一台控制器下面，怎样准确描述“读哪一块”？',
    analogy: 'NSID 像仓库编号，LBA 像该仓库内部的货位号。两个仓库都可以有 0 号货位，但不是同一个位置。',
    steps: [
      step('先选择一个命名空间', 'Namespace 是主机可以访问的逻辑存储空间。NSID 标识它；一个控制器可以访问多个命名空间，具体取决于设备能力与配置。', ['ns1', 'ns2']),
      step('再选择起始逻辑块', 'SLBA 是起始逻辑块地址。LBA 是逻辑坐标，不是 NAND 页号；内部映射可能随着写入与垃圾回收改变。', ['ns1', 'lba']),
      step('块大小决定字节数', '假设一个 LBA 是 4 KiB，从 SLBA=8 读取 2 块，就是从该命名空间的第 32 KiB 处读取 8 KiB。真实格式应通过 Identify Namespace 获取。', ['lba']),
      step('NLB 要加一再理解', 'Read/Write 命令中的 NLB 使用零基计数：NLB=0 表示 1 块。请求最后一块是 SLBA+NLB，不能超出命名空间边界。', ['lba', 'ns1'])
    ],
    notes: ['<strong>容量与格式要查询。</strong>Identify Namespace 给出命名空间大小与 LBA 格式等信息。示例中可以切换 512 B 和 4 KiB，但这不是在格式化真实设备。', '<strong>Namespace 不等于分区。</strong>分区通常由操作系统在一个块设备内部进一步划分；命名空间由 NVMe 子系统暴露。', '<strong>同一个 LBA 可以映射到新的物理位置。</strong>协议维持逻辑寻址的一致性，控制器负责内部映射。不要用本图推断闪存物理布局。'],
    misconception: '把 NLB=1 当成“1 块”会多读或多写一块。命令字段与自然语言的块数相差 1。',
    quiz: quiz('块大小 4 KiB，NLB=3，这次请求传输多少？', ['3 KiB', '12 KiB', '16 KiB'], 2, '实际块数是 3+1=4；4×4 KiB=16 KiB。'),
    base: [36, 52, 53, 97], refs: ['nvm'], boundary: '两个小型示意 Namespace，真实容量、LBA 格式和元数据能力必须查询设备。'
  },
  {
    id: 'read', unit: 1, title: '一次读：从请求到数据', short: 'Read 的完整旅程', minutes: 8, scene: 'topology', sceneTitle: 'READ / DEVICE → HOST',
    question: '读命令很小，几 KiB 的数据是怎么回来的吗？',
    analogy: '订单上写收货地址，仓库按地址送货，最后再发一张完成回执。订单、货物、回执是三件不同的东西。',
    steps: [
      step('1 / 准备接收数据的内存', '驱动准备 DMA 可访问的缓冲区，填写 NSID、SLBA、NLB 和数据指针。Read 的缓冲区是数据的目的地。', ['cpu', 'buffer'], [['cpu', 'buffer']]),
      step('2 / 写 SQE，再敲门铃', '驱动把命令描述写入 SQ，保证所需的内存可见性与顺序，然后写 SQ Tail 门铃。门铃只公布新的尾指针。', ['sq', 'doorbell'], [['cpu', 'sq'], ['cpu', 'doorbell']]),
      step('3 / 控制器取走命令', '控制器通过 PCIe 读取 SQE，解析要访问的逻辑块和数据指针。取走命令并不等于已经读完数据。', ['sq', 'ctrl'], [['sq', 'ctrl']]),
      step('4 / 数据进入主机缓冲区', '控制器读取介质中的逻辑块，并把数据 DMA 写入主机缓冲区。对 NVMe Read 而言，payload 方向是设备到主机。', ['media', 'buffer'], [['media', 'ctrl'], ['ctrl', 'buffer']]),
      step('5 / 发布 CQE', '完成记录包含 CID、SQID 和状态等。成功完成时，数据传输已按协议结束；驱动依照 DMA 与内存顺序规则安全读取结果。', ['ctrl', 'cq'], [['ctrl', 'cq']]),
      step('6 / 驱动回收并归还 CQ 空间', '驱动通过轮询或中断发现 CQE，匹配原请求，推进 CQ Head 并敲门铃，最后把读结果交给上层。', ['cq', 'cpu', 'doorbell'], [['cq', 'cpu'], ['cpu', 'doorbell']])
    ],
    notes: ['<strong>命令和 payload 的大小无须相同。</strong>经典 NVM Read 命令描述是 64 B，数据可以覆盖多个逻辑块；最大传输受设备能力等限制。', '<strong>DMA 不代表 CPU 完全没有工作。</strong>内存映射、命令构造、提交和完成回收仍由软件完成；通常省下的是逐字节搬运。', '<strong>中断只是提示。</strong>即使收到中断，驱动也要检查 CQ 的实际条目与状态。第 12 章对比轮询和中断。'],
    misconception: 'CQE 不是读到的数据包。通常的 16 B 完成记录只能描述结果，文件内容写进的是 PRP/SGL 指向的缓冲区。',
    quiz: quiz('Read 的主要数据传输方向是？', ['控制器 → 主机缓冲区', '主机缓冲区 → 控制器', 'SQ → CQ'], 0, 'Read 是主机取回存储数据；控制器对主机内存执行数据写入。'),
    base: [42, 43, 107, 108, 160, 161], refs: ['nvm'], boundary: '省略文件系统缓存命中、IOMMU 建表和 PCIe 包级细节；假设请求确实到达设备。'
  },
  {
    id: 'write', unit: 1, title: '一次写：控制器来取数据', short: 'Write 与 DMA 方向', minutes: 6, scene: 'topology', sceneTitle: 'WRITE / HOST → DEVICE',
    question: '写数据时，是主机把整段数据塞进 SQ 吗？',
    analogy: '订单告诉仓库“到这个地址取货”。控制器取走订单后，再到缓冲区取真正的货物。',
    steps: [
      step('1 / 准备写入内容', '驱动准备包含待写数据的 DMA 缓冲区。在命令完成或可靠终止之前，这份数据与映射必须保持有效。', ['cpu', 'buffer'], [['cpu', 'buffer']]),
      step('2 / 提交的是描述符', 'Write SQE 描述目标 Namespace、逻辑块范围和源数据指针。实际文件内容不会自动嵌在这条 64 B 命令里。', ['sq', 'doorbell'], [['cpu', 'sq'], ['cpu', 'doorbell']]),
      step('3 / 控制器读取主机数据', '控制器取 SQE 后，用数据指针从主机内存 DMA 读取 payload。虽然 NVMe 操作叫 Write，在 PCIe 上这部分是设备发起对主机内存的读取。', ['buffer', 'ctrl'], [['sq', 'ctrl'], ['buffer', 'ctrl']]),
      step('4 / 存储并返回状态', '控制器处理数据并发布完成。是否已经能承受掉电，取决于缓存配置、FUA 与持久化语义；普通成功完成不能一概当作“已写入 NAND”。', ['ctrl', 'media', 'cq'], [['ctrl', 'media'], ['ctrl', 'cq']]),
      step('5 / 上层获得完成', '驱动读取状态并回收请求。数据库或文件系统若需要耐久性，还要按它们的协议安排 Flush、FUA 或其他持久化步骤。', ['cpu', 'cq'], [['cq', 'cpu']])
    ],
    notes: ['<strong>两个“读写”视角。</strong>NVMe Read/Write 描述对存储的操作；PCIe Memory Read/Write 描述总线上的内存事务。名称不一定同方向。', '<strong>先让数据可见，再公布命令。</strong>驱动要使用平台规定的 DMA API 与屏障；不能假设任意处理器上普通赋值的顺序就足够。', '<strong>依赖请求要显式建立顺序。</strong>如果后一条读必须看到前一条写，主机应等待所需完成并遵循相应语义。队列排在前面不等于先执行完。'],
    misconception: 'SQ 槽位已经被控制器取走，不代表数据缓冲区也可以立即覆盖。SQE 的存储与命令引用的数据有不同的生命周期。',
    quiz: quiz('控制器如何拿到普通 Write 的 payload？', ['从 CQ 中取', '从门铃寄存器中取', '按 PRP/SGL 读取主机数据缓冲区'], 2, '指针告诉控制器去哪里 DMA 取数据。'),
    base: [42, 108, 161, 173, 174], refs: ['nvm'], boundary: '普通非内联 PCIe NVM Write；缓存与掉电的细节在第 14 章展开。'
  },
  {
    id: 'queues', unit: 1, title: '两个环，四个指针', short: 'SQ / CQ 队列工坊', minutes: 10, scene: 'queues', sceneTitle: 'QUEUE OWNERSHIP / HOST ↔ CONTROLLER', lab: 'queue',
    question: '队列放在主机内存，为什么主机和设备还会“看到不同进度”？',
    analogy: '两条传送带：一条传订单，一条传回执。放东西的人推进尾部，拿东西的人推进头部；对方需要通过交接获知变化。',
    steps: [
      step('主机生产 SQ 条目', '主机在 SQ Tail 指向的槽位写命令并推进 Tail。敲门铃后，控制器知道哪些新槽位已经可以读取。', ['sq']),
      step('设备消费 SQ 条目', '设备按队列顺序取命令并推进内部 SQ Head。它可以稍后才执行，也可以让命令乱序完成。', ['sq', 'ctrl']),
      step('设备生产 CQ 条目', '命令完成后，设备在 CQ Tail 写回执，再推进 Tail。CQE 中的 SQHD 告诉主机，某个 SQ 已经消费到哪里。', ['ctrl', 'cq']),
      step('主机消费 CQ 条目', '主机检查 P 位，读取状态与标识，推进 CQ Head。写 CQ Head 门铃之后，控制器才获知哪些完成槽位已归还。', ['cq']),
      step('留一个槽位区分满与空', '这个内存队列模型中，Head=Tail 表示空，(Tail+1) mod N=Head 表示满。这里 N=8，所以最多同时占用 7 个未消费槽位。', ['sq', 'cq'])
    ],
    notes: ['<strong>指针所有权：</strong>SQ Tail 由主机推进，SQ Head 由控制器推进；CQ Tail 由控制器推进，CQ Head 由主机推进。', '<strong>SQHD 不是“完成到第几条”。</strong>它报告控制器取走 SQE 的进度。一个尚未完成的命令，其 SQE 槽位也可能已允许复用，但数据与 CID 仍需要有效。', '<strong>主机视图可能滞后。</strong>实验只有在消费 CQE 后才更新主机已知 SQHD。因此，即使控制器已经取完命令，主机也可能暂时认为 SQ 满。'],
    misconception: '队列有 8 个槽位，并不表示这个环能无条件塞满 8 个未消费条目；也不能把 SQ 占用数等同于所有 outstanding 命令数。',
    quiz: quiz('哪一个门铃由主机写，用来归还完成队列空间？', ['SQ Head 门铃', 'CQ Head 门铃', 'CQ Tail 门铃'], 1, '主机消费 CQE 后写 CQ Head；控制器维护 CQ Tail。'),
    base: [107, 108, 109, 161, 171], boundary: '8 槽小型模型，保留一槽；默认一个 SQ 关联一个 CQ，正常成功完成。'
  },
  {
    id: 'doorbell', unit: 1, title: '门铃只说：进度到这里了', short: '门铃与批量提交', minutes: 6, scene: 'topology', sceneTitle: 'MMIO / PUBLISH THE NEW TAIL', lab: 'doorbell',
    question: '能不能放好四张订单，只敲一次门铃？',
    analogy: '门铃不是快递包裹。它像一张“新订单写到第几个位置”的告示，控制器照着新的边界去取。',
    steps: [
      step('先放入一批命令', '主机可以连续填写多个空闲 SQE。这些命令的数据指针和其他字段先准备妥当。', ['sq'], [['cpu', 'sq']]),
      step('一次公布新的 Tail', '主机写 SQ Tail 门铃，设备从旧进度读到新进度。队列环绕时按模数解释，不能把 Tail 的数值当作累计命令数。', ['doorbell'], [['cpu', 'doorbell']]),
      step('设备主动取命令', '门铃更新本身没有携带 SQE，也没有携带文件数据。设备再访问主机内存获取已公布的命令。', ['ctrl', 'sq'], [['sq', 'ctrl']]),
      step('批量的收益与等待代价', '批量可减少 MMIO 次数，但凑够一批可能让最早的请求多等一会。真实驱动通常结合负载与提交策略决定何时敲铃。', ['doorbell', 'cpu'])
    ],
    notes: ['<strong>PCIe 门铃地址计算：</strong>跨距为 <code>4×2^CAP.DSTRD</code> 字节。相对控制器寄存器基址，SQ q 的偏移为 <code>0x1000+2q×stride</code>，CQ q 则加一个 stride。', '<strong>写入值是索引。</strong>主机写的是新的 SQ Tail 或 CQ Head，并不是“加一”或“刚提交几个”。', '<strong>实验的 MMIO 统计只计 SQ 门铃。</strong>没有把 CQ 回收、其他寄存器访问和总线协议开销算进来。'],
    misconception: '“一次门铃只能对应一条命令”并不成立。批量公布是队列接口的重要优势之一。',
    quiz: quiz('连续准备 4 条 SQE 后只敲一次铃，门铃写的是什么？', ['4 条命令的完整内容', '最后一条的 CID', '新的 SQ Tail 索引'], 2, '新 Tail 划出已公布命令的边界；设备仍要去 SQ 中取命令。'),
    base: [42, 107, 108], refs: ['pcie'], boundary: '传统 MMIO 门铃，不模拟 Doorbell Buffer Config；偏移不含 BAR 的实际基址。'
  },
  {
    id: 'completion', unit: 1, title: '一张回执，怎样认出新旧', short: 'CQE、CID 与 Phase Tag', minutes: 9, scene: 'queues', sceneTitle: 'COMPLETION / IDENTITY & PHASE', lab: 'phase',
    question: '队列绕了一圈，旧内存还在，怎么知道是不是新完成？',
    analogy: '回执盖两种轮换的章：第一圈盖 1，下一圈盖 0。读者也知道自己在等哪种章，不需要把每张旧回执擦掉。',
    steps: [
      step('从初始化约定开始', '主机把 CQ 中的 Phase Tag 初始化为 0。首轮新 CQE 带 P=1，主机首先期待 1。', ['cq']),
      step('用身份找到原请求', '完成记录的 SQID 与 CID 组合匹配命令。不同 SQ 可以使用相同 CID；同一 SQ 内还在 outstanding 的命令不能重用同一 CID。', ['sq', 'cq']),
      step('读到队尾，再回到零', '设备在最高槽位发布完成后，下一圈使用相反的 P。主机消费位置绕回零时，也翻转自己的期待 P。', ['cq']),
      step('旧记录可以留在内存里', '主机检查当前 CQ Head 槽位的 P。只有等于期待值，才有新完成可消费；不同就停下，不能把旧 CID 再回收一遍。', ['cq']),
      step('完成顺序可以改变', '在实验中先取走两条命令，再点“最后一条先完成”。看看 CQE 的 CID 为什么比提交顺序更可靠。', ['ctrl', 'cq'])
    ],
    notes: ['<strong>P 不是成功位。</strong>它只说明条目是否属于当前消费轮次。成功还是失败要读 Status 字段。', '<strong>每个 CQ 有自己的轮次。</strong>不要把一个队列的期待 P 复制到另一个运行进度不同的队列。', '<strong>Fabrics 有不同的完成投递机制。</strong>本章的内存 P 位模型用于内存传输；不能原样套在 NVMe/TCP 的响应胶囊上。'],
    misconception: '不是“每完成一条，P 就在 0 和 1 间交替”。同一轮连续槽位使用同一个 P，绕回队首才换一轮。',
    quiz: quiz('CQ 首轮用 P=1。主机绕回队首后期待什么？', ['仍然是 1', '变成 0', '由 CID 奇偶决定'], 1, '每次完整环绕翻转期待的 P；内存中留下的旧条目不能因此被重复消费。'),
    base: [160, 161, 171, 172, 173], boundary: '在实验中使用“一条完整往返”推进到第 8 次，可以直接观察环绕；内存条目没有被消费动作清零。'
  },
  {
    id: 'prp', unit: 1, title: '数据散在内存里，也能找到', short: 'PRP 与 SGL', minutes: 9, scene: 'prp', sceneTitle: 'DATA POINTERS / SCATTERED MEMORY', lab: 'prp',
    question: '一段连续的应用数据，在物理内存中不连续怎么办？',
    analogy: '送货清单可以列出多个地址。控制器按清单访问分散的页，不要求货物全堆在一个连续大房间。',
    steps: [
      step('PRP1 指向数据起点', 'PRP1 指向第一段数据，可以带页内偏移。页大小由 CC.MPS 配置；本实验取 4 KiB。起点偏移减少了第一页还能容纳的字节数。', ['cmd', 'p0'], [['cmd', 'p0']]),
      step('只跨到第二页', '若剩余数据只需要一页，PRP2 直接指向第二个数据页。第二页的数据地址按页对齐，不能随意加偏移。', ['cmd', 'p1'], [['cmd', 'p1']]),
      step('超过两页就需要列表', '若第一页之后还需要多个数据页，PRP2 改为指向 PRP List。列表里的地址指向后续数据页，并不重复 PRP1 所描述的第一页。', ['list', 'p1', 'p2'], [['cmd', 'list'], ['list', 'p1'], ['list', 'p2']]),
      step('SGL 使用另一种描述', 'SGL 以描述符描述地址、长度等。它与 PRP 都是描述数据位置的机制；能否使用某种 SGL 类型，必须检查控制器和传输支持。', ['cmd', 'list'])
    ],
    notes: ['<strong>先算覆盖几页。</strong>页数 = <code>ceil((页内偏移 + 字节数) / 页大小)</code>。同样 8 KiB，偏移为 0 时是两页，偏移 256 B 时就是三页。', '<strong>PRP2 的含义由数据范围决定。</strong>一页内时不使用；再需要一页时是数据页地址；再需要多页时是列表地址。', '<strong>DMA 地址由驱动建立。</strong>真实平台可能经 IOMMU 映射。图中离散地址仅作示意，不是可以直接交给硬件的有效地址。'],
    misconception: 'PRP2 并不总是“第二页数据的地址”。进入三页及以上的例子时，它通常变成列表的地址。',
    quiz: quiz('页大小 4 KiB，8 KiB 数据从页内偏移 256 B 开始，PRP2 是？', ['不使用', '第二数据页地址', 'PRP List 地址'], 2, '第一页只能放 3840 B，后面还需两个数据页，PRP2 因而指向列表。'),
    base: [173, 174, 175, 176, 177], boundary: '只演示单个 PRP List；多页列表链和各种 SGL 子类型没有实现。偏移实验按 256 B 递增，满足 dword 对齐。'
  },
  {
    id: 'command', unit: 1, title: '拆开一条 64 字节命令', short: 'SQE 的字段与错误', minutes: 7, scene: 'command', sceneTitle: 'NVM READ / COMMAND ANATOMY', lab: 'address',
    question: '控制器如何知道做什么、对谁做、做多大、数据放哪里？',
    analogy: '一张订单有业务类型、订单号、仓库号、货位范围和收货地址。每栏有明确含义，填错一栏就可能被拒绝。',
    steps: [
      step('Opcode 和 CID', 'Opcode 选择操作；在 NVM I/O 命令集中 Read 是 02h、Write 是 01h。CID 由主机分配，用于匹配完成，不能只凭 Opcode 区分请求。', ['opcode', 'cid']),
      step('NSID 和逻辑块范围', 'NSID 选择命名空间；Read/Write 的命令专属字段包含 SLBA、NLB 等。最后一块越过命名空间大小，不能当作正常读取。', ['nsid', 'slba', 'nlb']),
      step('Data Pointer', '数据指针字段放 PRP 或 SGL 描述，不是文件内容。不同命令对这些字段的解释与有效性要求不同。', ['dptr']),
      step('失败也要返回结果', '控制器可以在 CQE 中返回失败状态。驱动应该检查 Status，而不只是“看到 CQE 就算成功”；是否重试还要看状态类型与 DNR 等信息。', ['status'])
    ],
    notes: ['<strong>画出的格子不是按字节精确缩放。</strong>公共头部与数据指针由 Base 定义，Read/Write 的专属字段由 NVM Command Set 定义。', '<strong>Opcode 必须结合上下文。</strong>同一个数值在不同命令集或 Admin/I/O 上可能代表不同操作；例如 Admin 01h 不是 NVM Write。', '<strong>实验只校验逻辑块范围。</strong>真实设备还要检查命令支持、保留字段、指针、权限与传输大小等，不能把这张示意单当完整校验器。'],
    misconception: 'CID 是命令的身份，不是 SQ 槽位索引；SQ 槽位循环复用时，CID 的生命周期仍要跟随 outstanding 命令。',
    quiz: quiz('收到 CQE 就一定意味着命令成功了吗？', ['是，CQ 只放成功结果', '否，还要检查 Status', '只看 CID 大小就知道'], 1, '错误命令也可以通过 CQE 报告结果。'),
    base: [155, 156, 157, 160, 161, 162], refs: ['nvm'], boundary: '以经典 NVM Read/Write 的 64 B SQE、16 B CQE 为例；不泛化到未来命令集的所有格式。'
  },
  {
    id: 'bootstrap', unit: 2, title: '让一块新设备开始工作', short: '控制器初始化', minutes: 9, scene: 'boot', sceneTitle: 'BOOTSTRAP / RESPECT THE DEPENDENCIES', lab: 'boot',
    question: '还没有 I/O 队列时，创建队列的命令从哪里发？',
    analogy: '先开一个管理窗口，完成登记，再开放业务窗口。管理窗口本身先通过寄存器搭起来。',
    steps: [
      step('1 / 读取能力，等待禁用状态', '完成 PCIe 侧准备后，驱动读取 CAP 等能力，确保前一次复位结束并等待 CSTS.RDY=0。不能在前一轮仍工作时随意重写队列配置。', ['cap', 'csts']),
      step('2 / 配置 Admin 队列', '设置 AQA、ASQ、ACQ，分别给出管理队列大小与基地址；CQ 的 P 位按要求初始化。Admin 的队列标识符为 0。', ['aqa', 'asq', 'acq']),
      step('3 / 选择配置并使能', '选择受支持的命令集、页大小与仲裁方式，设置 CC.EN=1；随后等待 CSTS.RDY=1，并按能力限制处理超时。', ['cc', 'csts']),
      step('4 / Identify 和协商数量', '通过 Admin 队列识别控制器、命令集与活动 Namespace，并协商 I/O 队列数量。请求多少不等于一定得到多少。', ['admin', 'cap']),
      step('5 / 先建 CQ，再建 SQ', '先创建完成队列，再创建关联它的提交队列。这样每条新命令才有明确的回执目的地；删除顺序则相反。', ['iocq', 'iosq'])
    ],
    notes: ['<strong>启动是有依赖的状态序列。</strong>动画中 EN 是主机请求，RDY 是控制器报告；两者不会因为主机写一个变量就必然同时改变。', '<strong>能力值决定配置。</strong>页大小范围、最大队列条目数、连续内存要求、支持的命令集等都应查询，不要把教学默认值写死进驱动。', '<strong>本章省略传输侧枚举细节。</strong>PCIe BAR 映射、Bus Master、DMA/IOMMU 和中断配置必须正确完成；该序列不是可直接执行的驱动代码。'],
    misconception: '创建 I/O 队列的命令由 Admin 队列发送，不是依赖尚不存在的 I/O SQ。Admin 队列也不是用 Create I/O SQ 命令建立的。',
    quiz: quiz('正确的 I/O 队列创建顺序是？', ['先 CQ，后关联的 SQ', '先 SQ，后 CQ', '必须同时创建'], 0, 'SQ 创建时就要指定一个已经存在的 CQ。'),
    base: [107, 124, 125, 441, 443], refs: ['pcie'], boundary: '常见 PCIe I/O Controller 初始化简图；不是完整覆盖所有可选能力的驱动状态机。'
  },
  {
    id: 'multiqueue', unit: 2, title: '多队列，把并行用起来', short: '多核、映射与乱序', minutes: 7, scene: 'multi', sceneTitle: 'PARALLELISM / MANY PRODUCERS', lab: 'multi',
    question: '很多 CPU 核同时读写，为什么不都抢一个队列？',
    analogy: '多个收单窗口可以减少门口争抢，但后面的仓库和运输能力依然有限。窗口数量不等于仓库处理能力。',
    steps: [
      step('软件可以分散提交路径', '驱动可为不同 CPU 或工作线程配置不同队列，减少共享锁与缓存争用。这是常见软件策略，并不是 NVMe 强制一个核对应一对队列。', ['core0', 'core1', 'sq0', 'sq1'], [['core0', 'sq0'], ['core1', 'sq1']]),
      step('控制器仲裁要取哪些命令', '多个 SQ 都有请求时，控制器按配置的仲裁机制选择服务机会。轮询以及可选的加权机制影响调度，但不保证某个固定的最终时延。', ['sq0', 'sq1', 'ctrl'], [['sq0', 'ctrl'], ['sq1', 'ctrl']]),
      step('执行与完成可以乱序', '控制器按顺序从一个 SQ 取条目，执行和完成则可能重排。依赖上一条写结果的读，不应该仅依赖“排在后面”。', ['ctrl', 'cq0'], [['ctrl', 'cq0']]),
      step('PCIe 可以多个 SQ 共用 CQ', '一对一和多对一都可能出现。共用 CQ 的完成记录用 SQID+CID 区分来源；NVMe-oF 的队列映射规则不同。', ['cq0', 'cq1'])
    ],
    notes: ['<strong>更多队列也要付成本。</strong>队列内存、中断向量、软件管理与设备资源都会限制实际配置。先协商能力，再选择合理数量。', '<strong>把取走、执行、完成分开看。</strong>SQHD 说明取走进度，CID 说明完成身份，两者不是同一个顺序概念。', '<strong>简单依赖案例：</strong>若读必须看到前一条写的结果，先等待写达到所需完成条件，再提交依赖读。耐久性还要额外考虑第 14 章。'],
    misconception: '“有 64 个队列就一定快 64 倍”忽略了共享介质、控制器计算、总线带宽与负载规模。',
    quiz: quiz('同一个 SQ 中两条独立命令，完成顺序必须等于提交顺序吗？', ['必须', '不一定', '只有 CID 相同时才不一定'], 1, '独立命令可能重排；完成关联必须依赖标识。'),
    base: [42, 43, 59, 60, 119, 427], boundary: '实验只改变软件队列拓扑，不模拟完整加权仲裁算法，也不预测性能倍数。'
  },
  {
    id: 'interrupts', unit: 2, title: '完成以后，要不要叫醒 CPU', short: '中断、合并与轮询', minutes: 7, scene: 'interrupts', sceneTitle: 'NOTIFICATION / WAKE UP OR KEEP WATCHING', lab: 'interrupts',
    question: '等待结果时，是一直盯着回执箱，还是等别人通知？',
    analogy: '轮询像坐在窗口前一直看；中断像收到提醒再走过去；合并像把几次提醒攒成一次。',
    steps: [
      step('结果先发布在 CQ', '设备发布 CQE。驱动要检查的是内存中的完成记录；中断本身不包含整个请求结果。', ['cq']),
      step('中断通知处理器', '合适的中断配置可以在有完成时通知 CPU。处理函数读取 CQ，可能一次回收多条完成，而不是一条中断只对应一条命令。', ['msix', 'cpu'], [['cq', 'msix'], ['msix', 'cpu']]),
      step('合并减少通知频率', 'I/O 中断合并可按时间或数量条件减少通知。节省开销的同时，最早到达的完成可能需要额外等待；Admin 完成不采用这种合并。', ['timer', 'msix']),
      step('轮询主动检查 CQ', '轮询可以减少某些唤醒开销，但需要不断消耗 CPU 时间。低负载或需要省电时，这个代价可能不合算。', ['cpu', 'cq'], [['cq', 'cpu']])
    ],
    notes: ['<strong>模式选择取决于工作负载。</strong>CPU 预算、延迟目标、I/O 强度与调度策略都会影响结果，没有普遍最优的模式。', '<strong>模型只比较通知次数。</strong>实验把 16 个完成平均分批；不仿真 PCIe 消息、真实中断合并字段编码和定时器竞争。', '<strong>CPU 数量不是向量数量。</strong>完成队列与中断向量的实际映射由配置决定，资源不足时可能共享。'],
    misconception: '中断被合并不意味着 CQE 也被合成一条。每条命令仍有自己的完成语义与标识。',
    quiz: quiz('把多个完成攒成一次通知，主要权衡是什么？', ['较少通知开销与可能增加的等待', '数据精度和画质', '所有数据自动变得持久'], 0, '合并主要改变通知时机；不会替代数据持久化机制。'),
    base: [428, 429], refs: ['pcie'], boundary: '固定 16 个完成的批量通知示意；计数不是实测 CPU 利用率或规范字段值。'
  },
  {
    id: 'performance', unit: 2, title: 'QD 变大，为什么后来不快了', short: '吞吐、延迟与瓶颈', minutes: 10, scene: 'performance', sceneTitle: 'PERFORMANCE / CONCURRENCY HAS A LIMIT', lab: 'performance',
    question: '排队越多就越快吗？IOPS 很高为什么 MB/s 不一定高？',
    analogy: '快递车多到足以让仓库不停工后，再加车通常只会排队。小包裹件数多，也不代表运输的总重量更大。',
    steps: [
      step('QD 是在途请求数量', '这里 QD 指应用维持的 outstanding I/O 数量，不是 SQ 中尚未被取走的条目数，也不是分配出来的队列槽位总数。', ['pending']),
      step('先用并发掩盖等待', '一个请求平均服务需要 100 μs，QD=1 的理想上限约为 10,000 IOPS。增加并发，可能让多个请求的等待重叠。', ['pending', 'ctrl'], [['pending', 'ctrl']]),
      step('瓶颈会转移', '当设备处理能力或数据带宽饱和后，继续加 QD 无法突破瓶颈。更多请求留在系统里，平均响应时间随之增加。', ['ctrl', 'media'], [['ctrl', 'media']]),
      step('把 IOPS 换成数据量', '带宽约等于 IOPS×每次请求的字节数。4 KiB 与 128 KiB 请求即使 IOPS 相同，也需要完全不同的数据带宽。', ['media']),
      step('用 Little 定律检查单位', '稳态下，在途数量≈吞吐率×平均响应时间。本实验在饱和后用 QD/IOPS 估算响应时间，只展示瓶颈趋势。', ['pending', 'ctrl', 'media'])
    ],
    notes: ['<strong>本模型的公式：</strong><code>IOPS=min(QD/L₀, 带宽/块大小, 500k)</code>；平均响应时间用 <code>QD/IOPS</code>。L₀ 是设定的基础延迟，不是每个 QD 下测得的总延迟。', '<strong>单位明确：</strong>块大小使用 KiB=1024 B；带宽读数使用 MB/s=10⁶ B/s、GB/s=10⁹ B/s。', '<strong>真实 SSD 更复杂。</strong>读写比例、随机性、缓存、后台 GC、温度、队列分布与尾延迟都没有建模。不能据此声称某块 SSD 的实测成绩。'],
    misconception: 'QD 并不等于队列数量。一个队列可以承载多条在途请求，多队列也可以各只有很小的并发。',
    quiz: quiz('设备已经饱和，维持更多 outstanding 请求通常首先增加什么？', ['平均排队与响应时间', 'LBA 大小', '协议规定的最高带宽'], 0, '吞吐上限不变时，由 QD≈IOPS×平均响应时间可见等待会增加。'),
    base: [123], refs: ['little'], boundary: '解析教学模型，固定 500k IOPS 处理上限；无随机延迟分布，不能提供 p99 或真实 SSD benchmark。'
  },
  {
    id: 'durability', unit: 2, title: '写成功，和掉电不丢', short: '缓存、Flush 与 FUA', minutes: 9, scene: 'durable', sceneTitle: 'PERSISTENCE / ACKNOWLEDGED ≠ ALWAYS DURABLE', lab: 'durability',
    question: '刚收到“写入成功”，立刻掉电，数据一定还在吗？',
    analogy: '签收可能只是放到临时工作台；耐久保存要送进保险柜。两种承诺不同，必须看对方在什么条件下签字。',
    steps: [
      step('普通写进入易失缓存', '在“启用易失写缓存且没有掉电保护”的本实验条件下，普通写可能在数据仍位于缓存时成功完成。', ['host', 'cache'], [['host', 'cache']]),
      step('Flush 形成持久化保证', '先等待目标写完成，再提交覆盖相应 Namespace 的 Flush；Flush 成功后，其范围内先前已完成写的数据与元数据按规定进入非易失存储。', ['cache', 'media'], [['cache', 'media']]),
      step('FUA 约束这一条写', '设置 FUA 的 Write 必须按该命令的持久化要求完成。本实验只把这条写直接放入持久集合，不擅自把其他未 Flush 的写也算持久。', ['host', 'media'], [['host', 'media']]),
      step('模拟突然掉电', '掉电会清空本模型的易失缓存，非易失集合保留。比较普通写、Flush 后和 FUA 写三种结果；页面按钮不会操作任何真实磁盘。', ['cache', 'media'])
    ],
    notes: ['<strong>先写完，再 Flush。</strong>如果目标写和 Flush 无依赖地同时在途，不要仅靠提交顺序假定 Flush 覆盖所有写。应用、文件系统与驱动需要共同建立正确的先后关系。', '<strong>掉电保护改变实现条件。</strong>具有合适掉电保护的设备可能用不同内部路径满足承诺；NVMe 关注主机可观察的保证，而非限定必须何时写入哪一片 NAND。', '<strong>实验每条写使用不同示意块。</strong>不模拟同一 LBA 覆盖、文件系统日志、原子写粒度或 torn write。Flush 不是数据库事务本身。'],
    misconception: 'FUA 不是“顺便把设备所有缓存都刷掉”的通用开关；它针对该命令的要求，不能代替对其他写的持久化安排。',
    quiz: quiz('普通写已成功，想保证这批先前已完成写的耐久性，应观察哪个完成？', ['只观察 SQ Tail', '相应范围 Flush 的成功完成', 'CPU 已经空闲'], 1, '本实验条件下，Flush 成功才给出对其覆盖范围的持久化保证。'),
    base: [344, 398, 399], refs: ['nvm'], boundary: '明确假定易失缓存启用、无掉电保护；所有操作都是浏览器里的集合模型。'
  },
  {
    id: 'health', unit: 3, title: '看健康，也要听事件', short: 'Identify、日志与 AER', minutes: 7, scene: 'health', sceneTitle: 'OBSERVABILITY / ASK & SUBSCRIBE', lab: 'health',
    question: '怎么知道设备有什么能力、目前怎么样、什么时候发生异常？',
    analogy: 'Identify 像设备名片，Get Log Page 像查仪表盘，AER 像先留一个“有事通知我”的工单。',
    steps: [
      step('Identify 回答“我是谁”', '读取控制器和 Namespace 的身份、格式、容量与能力。软件用这些字段决定哪些功能能安全使用。', ['admin', 'ctrl'], [['admin', 'ctrl']]),
      step('日志回答“现在怎样”', 'Get Log Page 获取 SMART/Health、错误信息等。温度、寿命指标和错误计数有各自单位与定义，不能只看一个数字。', ['log', 'host'], [['log', 'host']]),
      step('先提交 AER 等待事件', '主机提前提交 Asynchronous Event Request。它可以长期保持未完成；出现适用事件时，控制器用该请求的完成告知事件类别等。', ['admin', 'event']),
      step('事件后读取细节并重新布防', '收到通知后主机按事件与日志规则读取详细信息、清除需要处理的条件，并补充 AER。事件通知不是完整诊断报告。', ['event', 'log', 'host'], [['event', 'host'], ['log', 'host']])
    ],
    notes: ['<strong>AER 是一条先发出的命令。</strong>不是设备随意凭空生成任意 CQE；主机还要遵守 AER 数量限制、配置与事件屏蔽规则。', '<strong>SMART 数值要按字段解释。</strong>例如温度字段、百分比寿命指标和数据计数都有特定编码。本实验用已经换算的示意温度。', '<strong>采样和事件可以配合。</strong>周期性读取获取背景趋势，异步事件帮助及时发现变化；这不保证单靠一份日志就能确定根因。'],
    misconception: 'AER 长时间没有完成，不一定是设备卡死；它本来就是等待未来事件的请求，不能套用普通 I/O 的直觉。',
    quiz: quiz('设备发出异步事件通知后，主机通常还要做什么？', ['只凭通知立即断定故障原因', '读取相关日志并按规则重新布防', '把所有 I/O 当作成功'], 1, '通知提供事件线索，详细诊断需要相关日志与上下文。'),
    base: [195, 196, 197, 231, 232, 233, 234], boundary: '温度与事件阈值均为教学设定；不读取或监控本机 SSD。'
  },
  {
    id: 'recovery', unit: 3, title: '超时后，先弄清命令在哪', short: '错误、超时与复位', minutes: 8, scene: 'recovery', sceneTitle: 'RECOVERY / STOP, ACCOUNT, REBUILD',
    question: '主机等不到完成，能立刻把同一条写再发一遍吗？',
    analogy: '电话断了，不代表仓库没发货。要先确认旧订单的状态，再决定取消、恢复连接还是重新下单。',
    steps: [
      step('超时只是主机的观察', '等待过久可能来自设备慢、通知丢失、路径异常或其他问题。超时并不等价于“命令肯定没有执行”。', ['host', 'timeout']),
      step('收集状态并控制新请求', '主机检查队列、控制器状态和路径，根据恢复策略暂停相关提交。旧 DMA 可能仍存在时，不能随意回收它引用的内存。', ['host', 'ctrl']),
      step('尝试中止或升级恢复', '在支持和适用条件下可以使用 Abort 等机制。请求中止与确认已中止不同；处理结果仍需要按规范和驱动恢复流程判断。', ['admin', 'ctrl'], [['admin', 'ctrl']]),
      step('确认旧状态终止再重建', '需要队列级恢复时通常先停止相关流量，删除 SQ 后删除 CQ，随后先 CQ 后 SQ 重建。控制器复位则有更大的状态影响范围。', ['io', 'admin']),
      step('决定哪些工作可以重试', '在清楚旧命令不再 outstanding 后，上层结合操作是否幂等、持久化需求和错误状态决定重试。复位也不是抹掉介质数据的命令。', ['host', 'io'])
    ],
    notes: ['<strong>状态错误与路径超时不同。</strong>一条明确返回失败 CQE 的命令，与没有收到响应的命令，给主机的信息量不一样。', '<strong>共享 CQ 需要一起协调。</strong>删除一个 CQ 前，所有仍引用它的 SQ 都必须按规则处理。', '<strong>恢复矩阵需要专门设计。</strong>本章展示依赖关系，不提供在真实机器上试复位的按钮，也不承诺一种恢复顺序覆盖全部异常。'],
    misconception: '“超时就释放数据内存再重发”可能与仍在执行的 DMA 冲突。超时是恢复的起点，不是资源安全回收的证明。',
    quiz: quiz('没有收到写完成时，可以断定什么？', ['设备一定没有写', '设备一定已持久化', '主机尚未获得可靠完成结论'], 2, '通信观察和设备执行状态不同，必须经过恢复和状态确认。'),
    base: [123, 124, 140, 141, 194, 195, 441, 442, 444], boundary: '概念恢复路线，不是完整的操作系统驱动错误恢复实现。'
  },
  {
    id: 'power', unit: 3, title: '省电，是带着唤醒代价的选择', short: '电源状态与 APST', minutes: 6, scene: 'power', sceneTitle: 'POWER STATES / IDLE & WAKE', lab: 'power',
    question: '为什么空闲很久后的第一笔 I/O，有时比后面的更慢？',
    analogy: '工作台一直开着，随时能接单；关灯休息能省电，重新开工却需要时间。',
    steps: [
      step('认识工作与低功耗状态', '控制器公布所支持的电源状态及相关特性。状态编号和数量来自设备，不能假定所有 SSD 的 PS1 都具有相同含义。', ['ps0', 'ps1', 'ps2']),
      step('空闲满足策略后转入低功耗', '支持 APST 时，可配置空闲时间与状态转换策略。系统是否启用以及使用什么策略，还受操作系统和平台条件影响。', ['ps1', 'ps2'], [['ps0', 'ps2']]),
      step('新的工作触发恢复', '从非工作低功耗状态恢复需要时间。首次请求的响应可能包含退出延迟，后续持续 I/O 则处在不同条件下。', ['ps0', 'ps2'], [['ps2', 'ps0']]),
      step('按目标选择策略', '笔记本续航、空闲功耗与低延迟服务可能需要不同取舍。实验的功耗与退出时间是人为设置，用于理解权衡。', ['ps0', 'ps1', 'ps2'])
    ],
    notes: ['<strong>NVMe 电源状态与 PCIe 链路状态相关但不相同。</strong>不能把本章的 PS 状态直接等同于 PCIe L0/L1。', '<strong>能力描述不是体验保证。</strong>实际延迟还受到平台电源管理、处理器唤醒和软件路径影响。', '<strong>实验按简单加法估算。</strong>示意首次响应 = 100 μs 基础延迟 + 退出延迟，不包含进入过程与随机波动。'],
    misconception: '低编号不总是“更先进”，高编号也不自动适合所有负载；必须理解设备公布的状态能力与目标。',
    quiz: quiz('更深的低功耗状态可能带来什么？', ['更低空闲功耗与更长唤醒时间', '所有请求都零延迟', '自动扩大 Namespace'], 0, '省电和恢复时间存在权衡，具体数值由设备报告。'),
    base: [396, 400, 401, 557, 558], refs: ['base'], boundary: '三种虚构教学状态；APST 只作概念介绍，不复现完整表项和状态约束。'
  },
  {
    id: 'ssd', unit: 3, title: '协议背后，SSD 在忙什么', short: 'FTL、擦除与垃圾回收', minutes: 8, scene: 'ftl', sceneTitle: 'BEHIND THE INTERFACE / FLASH TRANSLATION', lab: 'ftl',
    question: '同样是写 4 KiB，为什么设备内部的工作量可能不同？',
    analogy: '修改账本时不在原位置反复涂写，而是先写新位置、更新索引；一页废稿攒多了，再搬走有效内容并整页清理。',
    steps: [
      step('LBA 经映射找到物理位置', '在常见 NAND SSD 中，FTL 把逻辑块映射到物理介质。主机看见稳定的 LBA，物理位置由控制器管理。', ['lba', 'map'], [['lba', 'map']]),
      step('覆盖写通常写到新位置', '由于闪存写入和擦除约束，控制器可能把新版本写到空闲页，再让旧版本失效。图中颜色表示有效、失效与空闲。', ['map', 'flash'], [['map', 'flash']]),
      step('垃圾回收搬走仍有效的数据', '回收某个擦除块前，仍有效的数据需要搬到其他位置；之后才能擦除并重新使用空间。这个背景工作会占用内部资源。', ['flash', 'spare'], [['flash', 'spare']]),
      step('额外搬运形成写放大', '内部写入量可能超过主机写入量。真实 GC、磨损均衡和缓存策略因设备不同；NVMe 协议没有规定必须使用图中这一种算法。', ['map', 'flash', 'spare'])
    ],
    notes: ['<strong>这是 SSD 背景知识。</strong>NVMe 规定主机接口，FTL 和具体 NAND 管理算法属于实现。不要把图上的通道、页数或策略当成标准要求。', '<strong>逻辑块与 NAND 页大小没有固定一一对应。</strong>控制器可以聚合、拆分或缓存操作，具体由硬件与固件决定。', '<strong>性能有历史。</strong>空盘、填满后的稳态、连续写和随机覆盖可能让设备内部处于不同状态，单次数字不能代表所有条件。'],
    misconception: '主机发一条 4 KiB Write，设备内部不一定恰好只编程一个 4 KiB NAND 页。',
    quiz: quiz('FTL 的逻辑到物理映射属于哪一层？', ['SQ 的固定字段', '常见 SSD 内部实现', 'PCIe 电气编码'], 1, 'FTL 是常见 NAND SSD 的内部管理机制，不是 NVMe SQE 的物理页表。'),
    refs: ['micron'], boundary: '极简示意闪存块；不模拟 ECC、写放大数值或真实厂商 GC。'
  },
  {
    id: 'zns', unit: 3, title: '把顺序写，变成接口约定', short: 'ZNS 与 Zone Append', minutes: 9, scene: 'zone', sceneTitle: 'ZONED NAMESPACE / FOLLOW THE WRITE POINTER', lab: 'zone',
    question: '如果主机愿意配合存储布局，接口可以怎样改变？',
    analogy: '把仓库分成按顺序填入的长条货架。每条货架有一个“下一个空位”的指针，清空整条后再从头使用。',
    steps: [
      step('Namespace 再划分为 Zone', 'ZNS 是一种 I/O 命令集。顺序写要求的 Zone 有起始位置、大小、可用容量与状态；容量不一定等于 Zone Size。', ['zone']),
      step('普通 Write 跟随 WP', '对这里的 Sequential Write Required Zone，普通写应从当前写指针 WP 开始。跳过 WP 或写入已写过的位置，会违反本模型的顺序写规则。', ['wp', 'zone']),
      step('Append 让设备选择落点', 'Zone Append 指定目标 Zone，让控制器在当前合法位置追加，并在完成中返回实际写入位置。应用仍需要记录返回的 LBA。', ['append', 'zone'], [['append', 'zone']]),
      step('满了换一个 Zone', 'WP 到达 Zone 容量后，本 Zone 不能继续普通追加。系统需要选择另一个可写 Zone，并管理有效数据与生命周期。', ['zone', 'wp']),
      step('Reset 重新开始一轮', 'Zone Reset 使旧数据不再有效，并把可写位置恢复到起点。真实系统必须先确认其中没有还需要保留的数据。', ['zone'])
    ],
    notes: ['<strong>ZNS 不是所有 NVMe 盘都有。</strong>必须识别支持的命令集与能力，不能把普通 NVM Namespace 当 ZNS 操作。', '<strong>顺序追加不等于不要管理数据。</strong>主机承担更多数据布局与回收协调，可能换来更可控的内部工作量；收益依赖系统设计。', '<strong>本实验只有一个 Zone。</strong>完整规范还有状态转换、开放与活动 Zone 数量限制、读行为和可选能力，需要另做专题。'],
    misconception: 'Zone Append 成功时，不能假定实际写入 LBA 就等于主机猜测的位置；应使用命令完成返回的地址。',
    quiz: quiz('Zone Append 结束后，主机需要保存什么重要结果？', ['设备返回的实际写入 LBA', '固定为 0 的地址', 'PRP List 页数'], 0, '控制器决定合法落点，并通过完成返回它；后续读取需要这个位置。'),
    refs: ['zns'], boundary: '仅 Sequential Write Required 单 Zone、无 ZRWA；12 块是教学容量，Reset 只修改页面状态。'
  },
  {
    id: 'fabrics', unit: 3, title: '当控制器在网络的另一端', short: 'NVMe over Fabrics', minutes: 8, scene: 'fabrics', sceneTitle: 'NVMe-oF / SAME STORAGE CONCEPTS, NEW TRANSPORT', lab: 'fabrics',
    question: '远程存储还能保留 NVMe 的命令与队列思路吗？',
    analogy: '订单的内容仍然熟悉，但交付从本地传送带改成网络快递。通信规则改变了，不能隔着网络直接按本地门铃。',
    steps: [
      step('存储概念仍然保留', 'Host、Controller、Namespace 和命令完成这些概念继续存在。传输可以采用 NVMe/TCP 或 NVMe/RDMA 等绑定。', ['host', 'remote']),
      step('先建连接，再建立关联', '主机建立传输连接，通过 Fabrics Connect 建立管理队列与关联；根据配置可能需要认证，再设置控制器并建立 I/O 队列。', ['host', 'network', 'remote'], [['host', 'network'], ['network', 'remote']]),
      step('命令通过胶囊传递', '消息模型使用命令胶囊与响应胶囊。数据搬运方式由传输定义，不能照搬本地 MMIO 门铃、主机 CQ P 位的整个流程。', ['capsule', 'remote'], [['capsule', 'remote']]),
      step('队列映射与故障边界不同', 'Fabrics 的 I/O SQ/CQ 是一对一关联。连接中断还牵涉关联与重连语义；网络延迟也成为端到端延迟的一部分。', ['remote', 'cq'], [['remote', 'cq']]),
      step('回到一开始的问题', '无论本地还是远程，都可以沿“描述请求 → 提交 → 传数据 → 收完成”来理解。区别在每次交接由哪种传输保证。', ['host', 'network', 'remote', 'cq'])
    ],
    notes: ['<strong>NVMe/TCP 不等于普通文件共享协议。</strong>它是承载 NVMe 命令与数据的传输绑定，不直接把文件名当 Namespace 地址。', '<strong>不要把 TCP 与 RDMA 当成同一种数据路径。</strong>两者在协议封装、数据传输与资源管理上不同，本图只展示共有的高层关系。', '<strong>下一步可继续深挖。</strong>Discovery、NQN、认证、ANA 多路径与连接级恢复都值得独立课程；它们不是这张示意图已经实现的功能。'],
    misconception: 'NVMe-oF 不是把 PCIe 门铃的 MMIO 地址直接发到远端照写。它使用相应传输定义的连接与消息机制。',
    quiz: quiz('本地 PCIe 队列与 Fabrics 队列的区别之一是？', ['Fabrics 也必须读取同一块本地主机 CQ 内存的 P 位', 'Fabrics I/O SQ/CQ 使用一对一关联', 'Fabrics 没有命令完成'], 1, '不能把 PCIe 多 SQ 共用 CQ 的映射直接照搬到 Fabrics。'),
    base: [43, 44, 45, 114, 115, 125, 126], refs: ['tcp', 'rdma'], boundary: '传输架构示意，不运行网络协议、认证或真实远程连接。'
  }
];

export const references = {
  base: { title: 'NVM Express Base 规范入口', url: 'https://nvmexpress.org/specification/nvm-express-base-specification/' },
  pcie: { title: 'NVMe over PCIe Transport 规范', url: 'https://nvmexpress.org/specification/nvme-over-pcie-transport-specification/' },
  nvm: { title: 'NVM Command Set 规范', url: 'https://nvmexpress.org/specification/nvm-command-set-specification/' },
  zns: { title: 'ZNS 命令集与规范', url: 'https://nvmexpress.org/specification/nvme-zoned-namespaces-zns-command-set-specification/' },
  tcp: { title: 'NVMe/TCP Transport 规范', url: 'https://nvmexpress.org/specification/tcp-transport-specification/' },
  rdma: { title: 'NVMe/RDMA Transport 规范', url: 'https://nvmexpress.org/specification/rdma-transport-specification/' },
  micron: { title: 'Micron：NOR / NAND Flash Guide', url: 'https://assets.micron.com/adobe/assets/urn:aaid:aem:e98bc653-e42d-45a7-9b8c-03cb3d488f05/renditions/original/as/nor-nand-flash-guide.pdf' },
  little: { title: 'Little (1961)：L = λW', url: 'https://doi.org/10.1287/opre.9.3.383' }
};

export const glossary = [
  ['NVMe', '主机与非易失存储子系统之间的协议，定义控制器、队列、命令与完成等行为。', 'overview'],
  ['PCIe', '本地高速互连，可承载 NVMe 的内存访问与寄存器访问；不等同于 NVMe。', 'overview'],
  ['Controller 控制器', '向主机暴露能力、处理命令并返回结果的接口实体。图中以常见 I/O Controller 为主。', 'overview'],
  ['Namespace 命名空间', '由 NVMe 暴露的逻辑存储空间；NSID 标识它。它不等同于操作系统分区。', 'namespace'],
  ['LBA / SLBA', '逻辑块地址 / 起始逻辑块地址。指向命名空间中的块，不是 NAND 的物理页号。', 'namespace'],
  ['NLB', 'Read/Write 中的零基块数：实际逻辑块数为 NLB+1。', 'namespace'],
  ['SQ / SQE', '提交队列 / 提交队列条目。主机写入命令，控制器取走命令。', 'queues'],
  ['CQ / CQE', '完成队列 / 完成队列条目。控制器发布结果，主机消费结果。', 'completion'],
  ['Head / Tail', 'Head 指向下一个待消费位置；Tail 指向下一个生产位置。生产者推进 Tail，消费者推进 Head。', 'queues'],
  ['Doorbell 门铃', '用于公布 SQ Tail 或 CQ Head 进度的接口；传统 PCIe 模型通过 MMIO 写寄存器。', 'doorbell'],
  ['MMIO', 'Memory-Mapped I/O：用处理器的内存地址空间访问设备寄存器。', 'doorbell'],
  ['DMA', '设备按驱动建立的映射直接访问内存数据；CPU 仍负责准备和协调。', 'read'],
  ['CID / SQID', '命令 ID / 提交队列 ID；组合起来匹配完成的原始命令。', 'completion'],
  ['SQHD', '完成记录中的 SQ Head 进度快照，用于告知已取走、可复用的 SQE 槽位。', 'queues'],
  ['Phase Tag / P', '内存 CQ 中的新旧轮次标记。主机按当前期待 P 检查新完成，完整环绕后翻转期待。', 'completion'],
  ['PRP', '按内存页描述数据缓冲区的指针机制。PRP2 可为第二数据页地址，也可为列表地址。', 'prp'],
  ['SGL', 'Scatter Gather List：通过地址、长度与类型等描述分散的数据区域，支持程度需查询。', 'prp'],
  ['Admin Queue', '队列 ID 为 0 的管理队列，处理识别、配置和 I/O 队列创建等操作。', 'bootstrap'],
  ['CAP / CC / CSTS', '控制器能力 / 控制器配置 / 控制器状态。EN 是使能请求，RDY 是就绪报告。', 'bootstrap'],
  ['QD', '本实验指在途 I/O 数量；不是队列个数，也不等于尚未取走的 SQE 数量。', 'performance'],
  ['IOPS', '每秒完成的 I/O 次数。带宽还要乘以每次 I/O 的数据大小。', 'performance'],
  ['Flush / FUA', 'Flush 提供对所覆盖先前已完成写的持久化保证；FUA 对该条写施加持久化要求。', 'durability'],
  ['AER', 'Asynchronous Event Request：主机预先提交、等待异步事件的一类管理命令。', 'health'],
  ['APST', 'Autonomous Power State Transition：在支持条件下，按配置策略自动转换电源状态。', 'power'],
  ['FTL / GC', '常见 SSD 的逻辑物理映射层 / 垃圾回收；属于内部实现，不是 NVMe 强制的一种算法。', 'ssd'],
  ['ZNS / WP', 'Zoned Namespace / Write Pointer：分区顺序写接口与当前写入位置。', 'zns'],
  ['NVMe-oF', 'NVMe over Fabrics：通过 TCP、RDMA 等传输使用 NVMe 概念与命令，交接机制不同于本地 PCIe。', 'fabrics']
];
