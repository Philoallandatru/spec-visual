import { chapters, units, references, glossary } from './course.js';
import { QueueLab, DurabilityLab, ZoneLab, prpLayout, addressRange, performanceModel, doorbellOffset } from './model.js';
import { LabScene } from './scene.js';

const $ = s => document.querySelector(s);
const stage = new LabScene();
const storageKey = 'nvme-visual-lab-progress-v1';
let completed = new Set();
try { const saved = JSON.parse(localStorage.getItem(storageKey) || '[]'); if (Array.isArray(saved)) completed = new Set(saved.filter(id => chapters.some(c => c.id === id))); } catch { /* Storage can be disabled in private or embedded browsers. */ }
let current = 0, stepIndex = 0, playing = false, timer = null;
let parameters, models, labOutput, labError = false, bootMessage = '';
const defaults = () => ({ nsid: 1, slba: 8, nlb: 1, blockSize: 4096, bytes: 8192, offset: 0, qid: 1, stride: 0, batch: 4, queues: 3, shared: false, mode: 'batch', qd: 8, kib: 4, latencyUs: 100, bandwidthGBs: 4, temp: 45, aer: false, event: false, power: 0, invalid: 3, gc: false, transport: 'tcp' });
const chapter = () => chapters[current];
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const fmt = value => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value);
const hex = value => '0x' + value.toString(16).toUpperCase();

function stop() { playing = false; clearTimeout(timer); timer = null; $('#play').textContent = '播放讲解'; stage.playing = false; }
function schedule() {
  clearTimeout(timer);
  if (!playing) return;
  timer = setTimeout(() => {
    if (stepIndex >= chapter().steps.length - 1) { stop(); return; }
    stepIndex++; renderStep(); schedule();
  }, Number($('#speed').value));
}
function goStep(index) { stop(); stepIndex = Math.max(0, Math.min(chapter().steps.length - 1, index)); renderStep(); }
function navigate(index) {
  if (index < 0 || index >= chapters.length) return;
  const id = chapters[index].id;
  if (location.hash === '#' + id) load(index); else location.hash = id;
}
function load(index) {
  stop(); current = index; stepIndex = 0; parameters = defaults();
  models = { queue: new QueueLab(8), durability: new DurabilityLab(), zone: new ZoneLab() };
  bootMessage = ''; labError = false;
  const c = chapter();
  document.title = `${String(index + 1).padStart(2, '0')} · ${c.short} | NVMe 交互实验室`;
  $('#unit-label').textContent = units[c.unit]; $('#read-time').textContent = `约 ${c.minutes} 分钟`;
  $('#lesson-title').textContent = c.title; $('#lesson-question').textContent = c.question; $('#lesson-analogy').textContent = c.analogy;
  $('#scene-title').textContent = c.sceneTitle;
  $('#chapter-counter').textContent = `${String(index + 1).padStart(2, '0')} / ${chapters.length}`;
  $('#footer-topic').textContent = `${String(index + 1).padStart(2, '0')} / ${c.short}`;
  $('#chapter-prev').disabled = index === 0; $('#chapter-next').disabled = index === chapters.length - 1;
  $('#chapter-next').textContent = index === chapters.length - 1 ? '已到最后一章' : '下一章 →';
  $('#explanation').replaceChildren(...c.notes.map(html => { const p = el('p'); p.innerHTML = html; return p; }));
  $('#misconception').textContent = c.misconception;
  buildQuiz(c); buildSources(c); buildLab(c); renderStep(); updateProgress();
  $('#lesson-scroll').scrollTop = 0; stage.resetCamera();
  if (matchMedia('(max-width: 760px)').matches) window.scrollTo(0, 0);
}
function renderStep() {
  const c = chapter(), s = c.steps[stepIndex];
  $('#step-count').textContent = `STEP ${String(stepIndex + 1).padStart(2, '0')} / ${String(c.steps.length).padStart(2, '0')}`;
  $('#step-title').textContent = s.title; $('#step-body').textContent = s.body;
  $('#step-prev').disabled = stepIndex === 0; $('#step-next').disabled = stepIndex === c.steps.length - 1;
  $('#scene-caption').textContent = s.title;
  const dots = c.steps.map((s, i) => { const b = el('button', i === stepIndex ? 'active' : ''); b.type = 'button'; b.setAttribute('aria-label', `第 ${i + 1} 步：${s.title}`); b.setAttribute('aria-current', i === stepIndex ? 'step' : 'false'); b.title = s.title; b.addEventListener('click', () => goStep(i)); return b; });
  $('#step-dots').replaceChildren(...dots);
  refresh();
}
function refresh() {
  stage.draw(chapter(), stepIndex, parameters, models); renderMetrics(); updateLabOutput();
}
function renderMetrics() {
  const c = chapter(), p = parameters, q = models.queue;
  let metrics;
  switch (c.lab) {
    case 'queue': case 'phase': metrics = [['SQ Tail', q.sqTail, '/ 8'], ['设备 SQ Head', q.sqHeadDevice, ''], ['主机期待 P', q.expectedPhase, ''], ['未回收请求', q.outstanding.size, '条']]; break;
    case 'address': { const r = addressRange(p.slba, p.nlb, p.blockSize, 32); metrics = [['实际块数', r.blocks, '块'], ['传输量', fmt(r.bytes / 1024), 'KiB'], ['最后 LBA', r.last, '/ 31'], ['范围检查', r.valid ? '有效' : '越界', '']]; break; }
    case 'doorbell': metrics = [['每批命令', p.batch, '条'], ['提交 32 条', Math.ceil(32 / p.batch), '次 SQ 门铃'], ['SQ 偏移', hex(doorbellOffset(p.qid, p.stride)), ''], ['CQ 偏移', hex(doorbellOffset(p.qid, p.stride, true)), '']]; break;
    case 'prp': { const r = prpLayout(p.bytes, p.offset); metrics = [['覆盖内存', r.pages, '页'], ['第一页', r.firstBytes, 'B'], ['PRP2', { unused: '不使用', page: '数据页', list: '列表' }[r.prp2], ''], ['列表条目', r.listEntries, '个']]; break; }
    case 'boot': metrics = [['CC.EN', stepIndex >= 2 ? 1 : 0, ''], ['CSTS.RDY', stepIndex >= 2 ? 1 : 0, '阶段结束时'], ['管理通道', stepIndex >= 2 ? '可用' : '准备中', ''], ['I/O 队列', stepIndex >= 4 ? '已创建' : '等待', '']]; break;
    case 'multi': metrics = [['提交队列', p.queues, '个'], ['完成队列', p.shared ? 1 : p.queues, '个'], ['映射模式', p.shared ? '多对一' : '一对一', 'PCIe']]; break;
    case 'interrupts': metrics = [['完成记录', 16, '条'], ['通知次数', p.mode === 'poll' ? 0 : p.mode === 'batch' ? Math.ceil(16 / p.batch) : 16, '次 / 示意'], ['CPU 策略', p.mode === 'poll' ? '持续检查' : '通知后处理', '']]; break;
    case 'performance': { const r = performanceModel(p); metrics = [['吞吐', fmt(r.iops / 1000), 'k IOPS'], ['数据量', fmt(r.mbps), 'MB/s'], ['平均响应', fmt(r.responseUs), 'μs'], ['当前瓶颈', r.bottleneck, '']]; break; }
    case 'durability': metrics = [['易失写', models.durability.volatile.length, '条'], ['持久写', models.durability.durable.length, '条'], ['掉电已丢失', models.durability.lost.length, '条']]; break;
    case 'health': metrics = [['示意温度', p.temp, '°C'], ['在途 AER', p.aer ? 1 : 0, '条'], ['事件状态', p.event ? '已通知' : '未通知', '']]; break;
    case 'power': metrics = [['示意功耗', [5,1,.1][p.power], 'W'], ['退出延迟', [0,100,2000][p.power], 'μs'], ['首次响应', [100,200,2100][p.power], 'μs / 模型']]; break;
    case 'ftl': metrics = [['旧块失效页', p.gc ? 0 : p.invalid, '/ 8'], ['需要搬迁', 8-p.invalid, '有效页'], ['旧块状态', p.gc ? '已擦除' : '待回收', '']]; break;
    case 'zone': metrics = [['写指针 WP', models.zone.wp, ''], ['Zone 容量', 12, '块'], ['示意状态', models.zone.wp === 12 ? 'Full' : models.zone.wp ? 'Implicitly Open' : 'Empty', '']]; break;
    case 'fabrics': metrics = [['传输绑定', p.transport === 'tcp' ? 'TCP' : 'RDMA', ''], ['I/O 队列映射', '1 : 1', ''], ['门铃模型', '消息', '非本地 MMIO']]; break;
    default: metrics = c.id === 'recovery' ? [['当前步骤', stepIndex+1, '/ 5'], ['核心问题', '旧请求状态', '']] : [['命令描述', 64, 'B'], ['完成记录', 16, 'B'], ['主线传输', 'PCIe', '']];
  }
  $('#metrics').replaceChildren(...metrics.map(([name, val, unit]) => { const d = el('div', 'metric'); d.append(el('span', '', name)); const line=el('div');line.append(el('b','',String(val)),el('small','',unit));d.append(line);return d; }));
}
function addSlider(parent, name, key, min, max, step = 1, format = String) {
  const label = el('label','field'), row=el('span','field-line'); const output=el('output','',format(parameters[key])); row.append(el('span','',name),output);
  const input=el('input'); input.type='range'; input.id=`lab-${key}`;input.min=min;input.max=max;input.step=step;input.value=parameters[key]; output.htmlFor=input.id;
  input.addEventListener('input',()=>{parameters[key]=Number(input.value);output.textContent=format(parameters[key]);if(key==='invalid')parameters.gc=false;if(key==='temp'){parameters.event=false;}refresh();});
  label.append(row,input);parent.append(label);
}
function addSelect(parent,name,key,options) {
  const label=el('label','field',name),select=el('select');select.id=`lab-${key}`;
  options.forEach(([value,title])=>{const option=el('option','',title);option.value=String(value);select.append(option);}); select.value=String(parameters[key]);
  select.addEventListener('change',()=>{const old=parameters[key];parameters[key]=typeof old==='number'?Number(select.value):typeof old==='boolean'?select.value==='true':select.value;refresh();});
  label.append(select);parent.append(label);
}
function addActions(parent,actions) {
  const row=el('div','actions');actions.forEach(([name,fn,primary=false])=>{const b=el('button',primary?'primary':'outline',name);b.type='button';b.addEventListener('click',()=>{stop();fn();refresh();});row.append(b);});parent.append(row);
}
function buildLab(c) {
  const root=$('#experiment');root.replaceChildren(); labOutput=null;
  if(!c.lab)return;
  root.append(el('h3','','动手试一试'));
  const hint = text => root.append(el('p','hint',text));
  const p=parameters;
  switch(c.lab) {
    case 'queue': case 'phase':
      hint(c.lab==='phase'?'连续完成 8 条，观察 CQ 从 7 绕回 0。下面也可手动制造乱序完成。':'建议依次点：写 SQ → 敲 SQ 铃 → 设备取走 → 完成 → 消费 CQE → 敲 CQ 铃。故意跳一步，看看为何不能继续。');
      if(c.lab==='phase')addActions(root,[['一条完整往返',()=>models.queue.cycle(),true],['推进 8 条',()=>{for(let i=0;i<8;i++){if(!models.queue.cycle())break;}}]]);
      addActions(root,[['写 SQ',()=>models.queue.submit()],['敲 SQ 铃',()=>models.queue.ringSQ()],['设备取走',()=>models.queue.fetch()]]);
      addActions(root,[['完成一条',()=>models.queue.complete()],['最后一条先完成',()=>models.queue.complete(true)]]);
      addActions(root,[['消费 CQE',()=>models.queue.consume()],['敲 CQ 铃',()=>models.queue.ringCQ()],['清空实验',()=>{models.queue=new QueueLab();}]]);break;
    case 'address':
      hint('选择 32 块的小型命名空间。把起点拖到 31，再增加 NLB，观察哪里开始越界。');
      addSelect(root,'命名空间','nsid',[[1,'NSID 1'],[2,'NSID 2']]);
      addSelect(root,'逻辑块大小','blockSize',[[4096,'4 KiB / LBA'],[512,'512 B / LBA']]);
      addSlider(root,'SLBA · 起始块','slba',0,31);addSlider(root,'NLB · 零基计数','nlb',0,7);break;
    case 'doorbell':
      hint('固定提交 32 条命令，比较不同批量的 SQ 门铃次数。地址是相对寄存器基址的偏移。');
      addSelect(root,'每批命令数','batch',[[1,'1 条'],[2,'2 条'],[4,'4 条'],[8,'8 条']]);
      addSlider(root,'队列 ID','qid',0,4);addSelect(root,'CAP.DSTRD','stride',[[0,'0 → 跨距 4 B'],[1,'1 → 跨距 8 B'],[2,'2 → 跨距 16 B']]);break;
    case 'prp':
      hint('先选 8 KiB、偏移 0，再把偏移增加到 256 B。看 PRP2 如何从数据页地址变成列表地址。');
      addSelect(root,'数据长度','bytes',[[1024,'1 KiB'],[4096,'4 KiB'],[8192,'8 KiB'],[16384,'16 KiB']]);addSlider(root,'首地址页内偏移','offset',0,3840,256,v=>`${v} B`);break;
    case 'boot':
      hint('在不同启动阶段尝试发 I/O，观察当前缺少什么前提。用“下一步”推进初始化。');
      addActions(root,[['尝试发 I/O',()=>{bootMessage=stepIndex>=4?'前提具备：Admin 就绪，I/O CQ 与 SQ 已创建，可以提交示意 I/O。':'尚不能发 I/O：'+(stepIndex<2?'管理通道还未就绪。':'还没有完成 Identify、能力协商和 I/O 队列创建。');labError=stepIndex<4;},true]]);break;
    case 'multi':
      hint('比较一个 CQ 服务多个 SQ，与每个 SQ 使用独立 CQ 的结构。这里不预测加速倍数。');
      addSlider(root,'软件提交队列数','queues',1,4);addSelect(root,'CQ 映射','shared',[[false,'每个 SQ 对应一个 CQ'],[true,'多个 SQ 共用一个 CQ']]);break;
    case 'interrupts':
      hint('假设已经产生 16 条完成。选择通知方式，看通知次数与完成记录数量为何不同。');
      addSelect(root,'通知策略','mode',[['irq','每条立即通知（示意）'],['batch','按批合并通知（示意）'],['poll','CPU 轮询 CQ']]);
      addSelect(root,'合并批量','batch',[[1,'1 个'],[2,'2 个'],[4,'4 个'],[8,'8 个']]);break;
    case 'performance':
      hint('这是解析教学模型。先固定 4 KiB 和 100 μs，再提升 QD，观察何时饱和。');
      addSlider(root,'在途 I/O 数量 QD','qd',1,128);addSelect(root,'I/O 大小','kib',[[4,'4 KiB'],[16,'16 KiB'],[128,'128 KiB']]);
      addSlider(root,'基础延迟','latencyUs',20,500,20,v=>`${v} μs`);addSlider(root,'可用数据带宽','bandwidthGBs',1,8,1,v=>`${v} GB/s`);break;
    case 'durability':
      hint('先普通写两次，再 FUA 写一次，然后模拟掉电；重置后改为普通写 → Flush → 掉电，比较结果。');
      addActions(root,[['普通写',()=>models.durability.write(),true],['FUA 写',()=>models.durability.write(true)],['Flush',()=>models.durability.flush()]]);
      addActions(root,[['模拟掉电',()=>models.durability.powerLoss()],['重新开始',()=>{models.durability=new DurabilityLab();}]]);break;
    case 'health':
      hint('示意阈值 70 °C。先提交 AER，把温度调高，再触发检查；通知会消耗这条在途 AER。');
      addSlider(root,'模拟温度','temp',30,85,1,v=>`${v} °C`);
      addActions(root,[['提交 / 补充 AER',()=>{p.aer=true;p.event=false;},true],['检查示意事件',()=>{if(p.aer&&p.temp>=70){p.event=true;p.aer=false;}else{p.event=false;}}]]);break;
    case 'power':
      hint('这是三种人为设定的状态。比较空闲功耗和恢复后首个 I/O 的示意响应。');
      addSelect(root,'电源状态','power',[[0,'PS0 · 工作'],[1,'PS1 · 浅休眠'],[2,'PS2 · 深休眠']]);break;
    case 'ftl':
      hint('一个 8 页示意擦除块中，只需搬走还有效的页，再擦除整个旧块。改变失效页数量进行比较。');
      addSlider(root,'失效页数','invalid',1,7);addActions(root,[['搬迁并回收旧块',()=>{p.gc=true;},true],['回到回收前',()=>{p.gc=false;}]]);break;
    case 'zone':
      hint('依次追加到满，或试着写回 LBA 0。这个实验不会访问真实存储。');
      addActions(root,[['Write 到 WP',()=>models.zone.write(models.zone.wp),true],['Zone Append',()=>models.zone.append()]]);
      addActions(root,[['尝试 Write LBA 0',()=>models.zone.write(0)],['Reset Zone',()=>models.zone.reset()]]);break;
    case 'fabrics':
      hint('切换高层传输标签。TCP 与 RDMA 的实际数据通路不同，这里只画共有的连接关系。');
      addSelect(root,'传输绑定','transport',[['tcp','NVMe/TCP'],['rdma','NVMe/RDMA']]);break;
  }
  labOutput=el('div','experiment-output');labOutput.setAttribute('role','status');root.append(labOutput);
  const preview=el('button','outline scene-jump','查看 3D 图解 ↑');preview.type='button';
  preview.addEventListener('click',()=>$('#stage').scrollIntoView({block:'start'}));root.append(preview);
}
function updateLabOutput() {
  if(!labOutput)return;
  const p=parameters,c=chapter();let text='',error=false;
  switch(c.lab){
    case 'queue':case 'phase':text=models.queue.message;error=models.queue.error;break;
    case 'address':{const r=addressRange(p.slba,p.nlb,p.blockSize,32);text=`NSID=${p.nsid} · LBA ${p.slba}…${r.last} · ${r.blocks} 块 × ${p.blockSize} B = ${r.bytes} B。${r.valid?'范围有效。':'越过 LBA 31，拒绝请求。'}`;error=!r.valid;break;}
    case 'doorbell':text=`32 条命令需要 ${Math.ceil(32/p.batch)} 次 SQ 门铃。stride=${4*2**p.stride} B；SQ${p.qid}=${hex(doorbellOffset(p.qid,p.stride))}。图中槽位仅作缩略表示。`;break;
    case 'prp':{const r=prpLayout(p.bytes,p.offset);text=`ceil((${p.offset}+${p.bytes})/4096)=${r.pages} 页。PRP2 ${r.prp2==='unused'?'不使用':r.prp2==='page'?'直接指向第二数据页':`指向列表，列出后续 ${r.listEntries} 个数据页`}。`;break;}
    case 'boot':text=bootMessage||'按讲解步骤推进，再点“尝试发 I/O”。';error=!!bootMessage&&labError;break;
    case 'multi':text=`${p.queues} 个 SQ → ${p.shared?1:p.queues} 个 CQ。${p.shared?'通过 SQID+CID 区分完成来源。':'软件可独立回收各队列的完成。'}`;break;
    case 'interrupts':text=p.mode==='poll'?'没有依赖完成中断；CPU 主动反复检查 CQ。此处不估算 CPU 占用百分比。':p.mode==='batch'?`每批 ${p.batch} 条，16 条完成约 ${Math.ceil(16/p.batch)} 次通知。等待凑批可能增加时延；未建模定时器。`:'为了比较，假设每条完成各触发一次通知，共 16 次。';break;
    case 'performance':{const r=performanceModel(p);text=`min(QD/L₀, B/size, 500k) = ${fmt(r.iops)} IOPS。${p.qd} / ${fmt(r.iops)} × 10⁶ ≈ ${fmt(r.responseUs)} μs。`;break;}
    case 'durability':text=models.durability.message;break;
    case 'health':text=p.event?'示意高温事件已由 AER 完成报告；请读取日志并按规则重新布防。':p.aer?(p.temp>=70?'条件已达教学阈值，点击“检查示意事件”。':'AER 等待中；当前未达到教学阈值。'):'没有在途 AER。先提交一条通知请求，再检查事件条件。';break;
    case 'power':text=`人为设定 PS${p.power}：${[5,1,.1][p.power]} W，退出延迟 ${[0,100,2000][p.power]} μs。不是本机 SSD 的能力值。`;break;
    case 'ftl':text=p.gc?`搬迁 ${8-p.invalid} 个有效页，旧块擦除；映射指向新位置。`:`旧块有 ${8-p.invalid} 个有效页、${p.invalid} 个失效页。回收时不能丢掉有效数据。`;break;
    case 'zone':text=models.zone.message;error=models.zone.error;break;
    case 'fabrics':text=p.transport==='tcp'?'NVMe/TCP 用其传输协议交付命令、数据与响应；本图没有运行真实 TCP 会话。':'NVMe/RDMA 使用相应 RDMA 传输语义；本图不是逐包级 RDMA 时序。';break;
  }
  labOutput.textContent=text;labOutput.classList.toggle('error',error);
}
function buildQuiz(c) {
  const root=$('#quiz');root.replaceChildren(el('p','',c.quiz.question));const feedback=el('p','feedback');feedback.setAttribute('role','status');
  c.quiz.options.forEach((answer,index)=>{const b=el('button','',`${String.fromCharCode(65+index)} · ${answer}`);b.type='button';b.addEventListener('click',()=>{root.querySelectorAll('button').forEach(x=>x.classList.remove('correct','wrong'));b.classList.add(index===c.quiz.answer?'correct':'wrong');feedback.textContent=(index===c.quiz.answer?'答对了。':'再想一想。')+c.quiz.why;});root.append(b);});root.append(feedback);
}
function buildSources(c) {
  const root=$('#sources');root.replaceChildren(el('p','',c.boundary));
  if(c.base?.length){root.append(el('p','','基线：NVMe Base 2.1（2024-08-05）。下面是本地规范摘录的 PDF 物理页码，不是页脚印刷页码。'));
    c.base.forEach(page=>{const a=el('a','',`PDF p.${page}`);a.href=`/sources/base/page-${String(page).padStart(3,'0')}.md`;a.target='_blank';a.rel='noopener';root.append(a);});}
  for(const key of c.refs||[]){const r=references[key],a=el('a','',r.title);a.href=r.url;a.target='_blank';a.rel='noopener noreferrer';root.append(a);}
  root.append(el('p','','本课程是机制教学，不是实测工具或规范的完整替代；官方入口可能展示比本课基线更新的修订。'));
}
function updateProgress(){
  $('#total-progress').textContent=`已学 ${completed.size} / ${chapters.length}`;$('#progress-fill').style.width=`${completed.size/chapters.length*100}%`;
  $('#mark-done').textContent=completed.has(chapter().id)?'✓ 已学会':'标记已学会';$('#mark-done').setAttribute('aria-pressed',String(completed.has(chapter().id)));
  buildCatalog();
}
function buildCatalog(){
  const root=$('#catalog');root.replaceChildren();
  units.forEach((name,unit)=>{const section=el('section','catalog-unit');section.append(el('h3','',name));const grid=el('div','catalog-grid');
    chapters.forEach((c,i)=>{if(c.unit!==unit)return;const b=el('button','catalog-item');b.type='button';b.setAttribute('aria-current',String(i===current));b.append(el('span','',String(i+1).padStart(2,'0')),el('b','',c.short),el('i','',completed.has(c.id)?'✓':`${c.minutes}m`));b.addEventListener('click',()=>{$('#catalog-dialog').close();navigate(i);});grid.append(b);});section.append(grid);root.append(section);});
}
function renderGlossary(){const query=$('#glossary-search').value.trim().toLowerCase();const list=glossary.filter(row=>(row[0]+row[1]).toLowerCase().includes(query));
  $('#glossary').replaceChildren(...list.map(([name,text,id])=>{const row=el('div','term'),head=el('div');head.append(el('h3','',name));const a=el('a','','进入相关章节 →');a.href='#'+id;a.addEventListener('click',()=>$('#glossary-dialog').close());head.append(a);row.append(head,el('p','',text));return row;}));
  if(!list.length)$('#glossary').append(el('p','','没有匹配的术语，试试缩写或中文名称。'));
}
$('#play').addEventListener('click',()=>{if(playing){stop();return;}if(stepIndex===chapter().steps.length-1){stepIndex=0;renderStep();}playing=true;stage.playing=true;$('#play').textContent='暂停讲解';schedule();});
$('#speed').addEventListener('change',schedule);$('#step-prev').addEventListener('click',()=>goStep(stepIndex-1));$('#step-next').addEventListener('click',()=>goStep(stepIndex+1));$('#restart').addEventListener('click',()=>load(current));
$('#view-reset').addEventListener('click',()=>stage.resetCamera());$('#view-top').addEventListener('click',()=>stage.resetCamera(true));
$('#chapter-prev').addEventListener('click',()=>navigate(current-1));$('#chapter-next').addEventListener('click',()=>navigate(current+1));
$('#mark-done').addEventListener('click',()=>{const id=chapter().id;if(completed.has(id))completed.delete(id);else completed.add(id);try{localStorage.setItem(storageKey,JSON.stringify([...completed]));}catch{}updateProgress();});
$('#catalog-open').addEventListener('click',()=>$('#catalog-dialog').showModal());$('#glossary-open').addEventListener('click',()=>{renderGlossary();$('#glossary-dialog').showModal();$('#glossary-search').focus();});
$('#glossary-search').addEventListener('input',renderGlossary);
$('.skip').addEventListener('click',e=>{e.preventDefault();$('#lesson-title').focus();$('#lesson-title').scrollIntoView({block:'start'});});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
document.addEventListener('keydown',e=>{if(e.target.closest('input,select,textarea,button,summary,a')||document.querySelector('dialog[open]'))return;if(e.key==='ArrowRight'){e.preventDefault();goStep(stepIndex+1);}if(e.key==='ArrowLeft'){e.preventDefault();goStep(stepIndex-1);}if(e.code==='Space'){e.preventDefault();$('#play').click();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
window.addEventListener('hashchange',()=>{let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{id='overview';}const index=chapters.findIndex(c=>c.id===id);load(index<0?0:index);});
let initialId;try{initialId=decodeURIComponent(location.hash.slice(1));}catch{initialId='overview';}
load(Math.max(0,chapters.findIndex(c=>c.id===initialId)));
