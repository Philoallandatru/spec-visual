import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { addressRange, prpLayout, performanceModel } from './model.js';

const C = { cyan: 0x6ed5e3, copper: 0xdfa65c, green: 0xa4d6a0, dim: 0x305260, dark: 0x162e39, red: 0xf09b8f, board: 0x153b3e };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class LabScene {
  constructor() {
    this.stage = document.querySelector('#stage'); this.labelsEl = document.querySelector('#scene-labels');
    this.labels = []; this.nodes = new Map(); this.movers = []; this.root = new THREE.Group(); this.active = true;
    this.playing = false; this.motionTime = 0; this.lastFrame = 0;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#scene'), antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.35;
      this.scene = new THREE.Scene(); this.scene.fog = new THREE.FogExp2(0x0c1b24, .012);
      this.camera = new THREE.PerspectiveCamera(37, 1, .1, 160);
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true; this.controls.dampingFactor = .075; this.controls.minDistance = 10; this.controls.maxDistance = 58;
      this.controls.maxPolarAngle = Math.PI * .48;
      this.scene.add(new THREE.HemisphereLight(0xd3eae7, 0x0c2029, 2));
      const key = new THREE.DirectionalLight(0xffecd0, 3); key.position.set(2, 16, 8); this.scene.add(key);
      const rim = new THREE.DirectionalLight(0x74d7e3, 2); rim.position.set(-12, 4, -8); this.scene.add(rim);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), new THREE.MeshStandardMaterial({ color: 0x0d2029, roughness: .9, metalness: .2 }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = -.65; this.scene.add(floor);
      const grid = new THREE.GridHelper(100, 100, 0x24444d, 0x1b343e); grid.position.y = -.63; grid.material.transparent = true; grid.material.opacity = .45; this.scene.add(grid);
      this.scene.add(this.root); this.resetCamera();
      this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(this.stage);
      document.addEventListener('visibilitychange', () => { this.active = !document.hidden; });
      this.animate = this.animate.bind(this); requestAnimationFrame(this.animate);
      this.renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); document.querySelector('#fallback').hidden = false; });
    } catch (error) {
      this.failed = true; document.querySelector('#fallback').hidden = false; console.warn('WebGL unavailable:', error.message);
    }
  }
  resize() {
    if (this.failed) return;
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.lastWidth !== w) { this.resetCamera(); this.lastWidth = w; }
  }
  resetCamera(top = false) {
    if (this.failed) return;
    const aspect = this.stage.clientWidth / this.stage.clientHeight;
    const scale = Math.max(1, 1.15 / aspect);
    this.camera.position.set(top ? 0 : 12 * scale, (top ? 31 : 22) * scale, (top ? .05 : 27) * scale);
    this.controls.target.set(0, .8, 0); this.controls.update();
  }
  clear() {
    this.root.traverse(o => { o.geometry?.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); });
    this.root.clear(); this.labelsEl.replaceChildren(); this.labels = []; this.nodes.clear(); this.movers = [];
  }
  label(text, pos, kind = '', nodeId = '') {
    const el = document.createElement('div'); el.className = `scene-label ${kind}`; el.textContent = text;
    if (this.focused(nodeId)) el.classList.add('active');
    this.labelsEl.append(el); this.labels.push({ el, pos: V(...pos), priority: kind.includes('mini') ? 0 : 1 }); return el;
  }
  focused(id) { return id && this.focus.some(f => f === id || id.startsWith(f + '-')); }
  box(x, y, z, w, h, d, color, opacity = 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: .42, metalness: .28, transparent: opacity < 1, opacity }));
    mesh.position.set(x, y + h / 2, z); this.root.add(mesh); return mesh;
  }
  block(id, text, x, z, w = 2.1, d = 1.4, color = C.dim, y = .05, h = .65, label = true) {
    const mesh = this.box(x, y, z, w, h, d, color);
    if (this.focused(id)) { mesh.material.emissive.set(color); mesh.material.emissiveIntensity = .32; }
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: this.focused(id) ? C.cyan : 0x577783, transparent: true, opacity: this.focused(id) ? .8 : .3 }));
    edges.position.copy(mesh.position); this.root.add(edges);
    this.box(x, y + h, z, w * .88, .025, d * .82, 0x0d212b);
    this.box(x - w * .34, y + h + .03, z - d * .28, Math.min(.32, w * .3), .035, .07, this.focused(id) ? C.copper : color);
    this.nodes.set(id, { pos: V(x, y + h + .2, z), mesh, width: w, depth: d });
    if (label) this.label(text, [x, y + h + .75, z], '', id);
    return mesh;
  }
  plate(text, x, z, w, d, color = C.board) {
    this.box(x, -.35, z, w, .25, d, color);
    this.label(text, [x, -.02, z - d / 2 - .48], 'title');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .02, 12), new THREE.MeshStandardMaterial({ color: 0x8baba7, metalness: .9, roughness: .2 }));
      screw.position.set(x + sx * (w / 2 - .18), -.08, z + sz * (d / 2 - .18)); this.root.add(screw);
    }
  }
  link(a, b, color = C.cyan, force = false, bend = 1) {
    const start = this.nodes.get(a)?.pos, end = this.nodes.get(b)?.pos;
    if (!start || !end) return;
    const active = force || this.flows.some(pair => pair[0] === a && pair[1] === b);
    const mid = start.clone().lerp(end, .5); mid.y += bend;
    const curve = new THREE.CatmullRomCurve3([start, mid, end]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 30, active ? .037 : .018, 6, false), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: active ? .8 : .15 })); this.root.add(tube);
    const at = curve.getPoint(.65), tangent = curve.getTangent(.65);
    const arrow = new THREE.ArrowHelper(tangent, at, .35, color, .22, .16); arrow.line.visible = false; arrow.cone.material.transparent = true; arrow.cone.material.opacity = active ? 1 : .22; this.root.add(arrow);
    if (active) {
      for (let i = 0; i < 3; i++) {
        const packet = new THREE.Mesh(new THREE.BoxGeometry(.12, .12, .24), new THREE.MeshBasicMaterial({ color })); this.root.add(packet);
        this.movers.push({ packet, curve, offset: i / 3 });
      }
    }
  }
  draw(ch, index, p, models) {
    if (this.failed) return;
    this.clear(); this.focus = ch.steps[index].focus; this.flows = ch.steps[index].flow; this.ch = ch;
    switch (ch.scene) {
      case 'topology': this.topology(ch, p); break;
      case 'namespace': this.namespace(p); break;
      case 'queues': this.queues(models.queue, ch); break;
      case 'prp': this.prp(p); break;
      case 'command': this.command(p); break;
      case 'boot': this.boot(index); break;
      case 'multi': this.multi(p); break;
      case 'interrupts': this.interrupts(p); break;
      case 'performance': this.performance(p); break;
      case 'durable': this.durable(models.durability); break;
      case 'health': this.health(p); break;
      case 'recovery': this.recovery(index); break;
      case 'power': this.power(p); break;
      case 'ftl': this.ftl(p); break;
      case 'zone': this.zone(models.zone); break;
      case 'fabrics': this.fabrics(p); break;
    }
    this.positionLabels();
  }
  topology(ch, p) {
    this.plate('HOST / 主机内存', -5.1, 0, 7.5, 9, 0x18363f);
    this.plate('NVMe DEVICE', 5.3, 0, 7.1, 8.2, 0x183b38);
    this.block('cpu', 'CPU / NVMe 驱动', -5.2, -3, 3.2, 1.45, C.dim, 0, .85);
    this.block('sq', 'SQ · 命令描述', -6.9, -.1, 1.6, 2.7, C.cyan, 0, .28);
    this.block('cq', 'CQ · 完成记录', -3.5, -.1, 1.6, 2.7, C.green, 0, .28);
    for (let i = 0; i < 6; i++) {
      this.box(-6.9, .31, -1.16 + i * .43, 1.35, .07, .3, ch.id === 'doorbell' && i < p.batch ? C.cyan : 0x285568);
      this.box(-3.5, .31, -1.16 + i * .43, 1.35, .07, .3, 0x3b574d);
    }
    this.block('buffer', '数据缓冲区 · payload', -5.2, 3, 4.7, 1.2, C.green, 0, .32);
    for (let i = 0; i < 10; i++) this.box(-7.1 + i * .42, .37, 3, .24, .08, .77, i < 5 ? C.green : 0x396756);
    this.block('doorbell', 'MMIO 门铃', 2.6, -2.4, 1.6, 1.3, C.copper, 0, .5);
    this.block('ctrl', 'NVMe 控制器', 4.7, .2, 2.8, 2.7, C.copper, 0, 1.05);
    for (let i = 0; i < 8; i++) {
      this.box(3.2, .1, -.86 + i * .3, .2, .07, .12, 0x9e9b75); this.box(6.2, .1, -.86 + i * .3, .2, .07, .12, 0x9e9b75);
    }
    this.block('media', '非易失存储 / NAND 示例', 6.8, 2.8, 2.6, 1.65, C.green, 0, .6);
    this.block('media-extra', '', 7.2, -2, 1.55, 1.35, 0x234d47, 0, .5, false);
    for (let i = 0; i < 3; i++) this.box(-.25 + i * .28, -.12, 0, .15, .05, 2.5, C.copper);
    this.label('PCIe', [.05, .4, 2.2], 'accent');
    [['cpu','buffer',C.cyan],['cpu','sq',C.cyan],['cpu','doorbell',C.copper],['sq','ctrl',C.cyan],['ctrl','media',C.green],['media','ctrl',C.green],['ctrl','buffer',C.green],['buffer','ctrl',C.green],['ctrl','cq',C.green],['cq','cpu',C.cyan]].forEach(([a,b,c]) => this.link(a,b,c));
  }
  namespace(p) {
    const range = addressRange(p.slba, p.nlb, p.blockSize, 32);
    for (let n = 0; n < 2; n++) {
      const center = n === 0 ? -4.6 : 4.6;
      this.plate(`NSID ${n + 1} / 32 LOGICAL BLOCKS`, center, 0, 7.7, 6.5);
      this.nodes.set(`ns${n+1}`, { pos: V(center, 1, 0) });
      for (let i = 0; i < 32; i++) {
        const selected = n + 1 === p.nsid && i >= p.slba && i <= range.last;
        this.block(`lba-${n}-${i}`, '', center - 2.8 + (i % 8) * .8, -1.6 + Math.floor(i / 8) * 1.05, .65, .8, selected ? (range.valid ? C.green : C.red) : C.dim, .05, selected ? .7 : .25, false);
        this.label(String(i), [center - 2.8 + (i % 8) * .8, selected ? 1.03 : .58, -1.6 + Math.floor(i / 8) * 1.05], 'mini');
      }
    }
    this.label(`SLBA ${p.slba} · ${range.blocks} BLOCKS · ${range.bytes} B`, [0, .4, 4.5], 'accent');
  }
  queues(q) {
    this.plate('HOST MEMORY / QUEUE ARRAYS', 0, 0, 17.2, 9.8);
    for (let row = 0; row < 2; row++) {
      const isCQ = row === 1, entries = isCQ ? q.cq : q.sq, z = isCQ ? 2.15 : -2.15;
      this.nodes.set(isCQ ? 'cq' : 'sq', { pos: V(0, .8, z) });
      this.label(isCQ ? 'CQ / 设备写 · 主机读' : 'SQ / 主机写 · 设备读', [-5.8, .7, z - 1.1], 'title');
      for (let i = 0; i < q.size; i++) {
        const x = -6.65 + i * 1.9, e = entries[i];
        const color = isCQ ? (e.cid === null ? C.dark : e.consumed ? C.dim : C.green) : !e ? C.dark : e.state === 'staged' ? C.copper : e.state === 'submitted' ? C.cyan : C.dim;
        this.block(`${isCQ?'cq':'sq'}-${i}`, '', x, z, 1.45, 1.1, color, .05, .4, false);
        this.label(isCQ ? (e.cid === null ? `P=${e.phase}` : `C${e.cid} · P${e.phase}`) : e ? `CID ${e.cid}` : '—', [x, .82, z], 'mini');
        this.label(String(i), [x, .03, z + .85], 'mini');
      }
      const head = isCQ ? q.cqHead : q.sqHeadDevice, tail = isCQ ? q.cqTail : q.sqTail;
      this.box(-6.65 + head * 1.9, .15, z + 1.42, .9, .1, .13, C.green);
      this.label(`H ${head}`, [-6.65 + head * 1.9, .45, z + 1.52], 'mini');
      this.box(-6.65 + tail * 1.9, .15, z - .93, .9, .1, .13, C.copper);
      this.label(`T ${tail}`, [-6.65 + tail * 1.9, .45, z - .95], 'mini');
      const curve = new THREE.CatmullRomCurve3([V(7.4,.18,z),V(8.3,.18,z+.75),V(0,.18,z+1.08),V(-8.2,.18,z+.75),V(-7.4,.18,z)]);
      this.root.add(new THREE.Mesh(new THREE.TubeGeometry(curve,50,.02,5,false),new THREE.MeshBasicMaterial({color:0x42606a})));
    }
    this.label(`主机已知 SQHD=${q.sqHeadHost}  |  SQ 门铃=${q.sqTailDoorbell}`, [0, 1.35, -.15], 'accent');
    this.label(`期待 P=${q.expectedPhase}  |  CQ 门铃=${q.cqHeadDoorbell}  |  执行中 ${q.inFlight.length}`, [0, .25, 4.95], 'accent');
  }
  prp(p) {
    const layout = prpLayout(p.bytes, p.offset);
    this.plate('COMMAND / DATA POINTER', -5.8, 0, 4, 6.4);
    this.block('cmd', 'SQE · PRP1 / PRP2', -5.8, -1.9, 3, 1.4, C.cyan);
    if (layout.prp2 === 'list') this.block('list', `PRP List · ${layout.listEntries} 个地址`, -5.8, 1.5, 2.6, 1.6, C.copper, 0, .35);
    else this.label(layout.prp2 === 'unused' ? 'PRP2：本次不使用' : 'PRP2：第二数据页', [-5.8, .7, 1.6], 'accent');
    this.plate('DMA-ACCESSIBLE PAGES / 散布页', 3.2, 0, 10, 7.7);
    const positions = [[-.3,-2.2],[3.4,-1.5],[6.7,-2],[1,2],[5.5,2.4]];
    let remaining = p.bytes;
    for (let i = 0; i < layout.pages; i++) {
      const [x,z] = positions[i], off = i === 0 ? p.offset : 0, used = Math.min(4096 - off, remaining); remaining -= used;
      this.block(`p${i}`, `页 ${i} · ${used} B`, x, z, 2.5, 1.75, C.dim, 0, .22);
      const depth = 1.45 * used / 4096;
      this.box(x, .27, z - .725 + 1.45 * off / 4096 + depth/2, 2.15, .07, depth, C.green);
      this.label(`0x${(0x100000 + i*0x7000).toString(16)}`, [x,.15,z+1.35], 'mini');
      this.link(i === 0 || layout.prp2 === 'page' ? 'cmd' : 'list', `p${i}`, i === 0 ? C.cyan : C.green, true);
    }
    if (layout.prp2 === 'list') this.link('cmd','list',C.copper,true);
  }
  command(p) {
    this.plate('64-BYTE SQE / 不是按字节比例绘制', 0, -1.2, 16, 6);
    const specs = [['opcode','Opcode = 02h',-5.5,-2.6,2.7,C.cyan],['cid','CID = 17',-1.8,-2.6,2.7,C.cyan],['nsid',`NSID = ${p.nsid}`,3.2,-2.6,4.8,C.copper],['dptr','DPTR · PRP / SGL',-4.6,.1,4.5,C.green],['slba',`SLBA = ${p.slba}`,1,.1,4,C.copper],['nlb',`NLB = ${p.nlb}`,5.1,.1,2.5,C.copper]];
    specs.forEach(([id,t,x,z,w,c])=>this.block(id,t,x,z,w,1.8,c,0,.4));
    const r = addressRange(p.slba,p.nlb,p.blockSize,32);
    this.block('status',r.valid?'CQE · 成功示意':'CQE · LBA 越界',1,3.8,7,1.3,r.valid?C.green:C.red,0,.4);
    this.link('slba','status',r.valid?C.green:C.red,true);
  }
  boot(index) {
    this.plate('CONTROLLER REGISTERS', -4.4, 0, 7.3, 8.3);
    this.plate('ADMIN → I/O QUEUES', 4.7, 0, 6.5, 8.3);
    const vals = [['cap','CAP · 能力',-6.1,-2.4,C.copper],['csts',`CSTS.RDY=${index>=2?1:0}`,-2.8,-2.4,index>=2?C.green:C.dim],['aqa',`AQA · ${index>=1?'已设置':'待配置'}`,-6.1,.1,C.cyan],['cc',`CC.EN=${index>=2?1:0}`,-2.8,.1,C.copper],['asq','ASQ · 基址',-6.1,2.6,C.cyan],['acq','ACQ · 基址',-2.8,2.6,C.green]];
    vals.forEach(([id,t,x,z,c])=>this.block(id,t,x,z,2.45,1.35,c,0,.4));
    this.block('admin', index>=3?'Admin · Identify':'Admin Queue',4.7,-2.3,4.5,1.4,index>=1?C.copper:C.dim);
    this.block('iocq',index>=4?'I/O CQ · 先创建':'I/O CQ · 等待',3.2,1.6,2,2,index>=4?C.green:C.dim);
    this.block('iosq',index>=4?'I/O SQ · 后创建':'I/O SQ · 等待',6.2,1.6,2,2,index>=4?C.cyan:C.dim);
    this.link('admin','iocq',C.green,index>=4); this.link('iocq','iosq',C.cyan,index>=4);
  }
  multi(p) {
    this.plate('HOST / CPU & SUBMISSION', -4.7, 0, 7.5, 9.8);
    this.plate('COMPLETION', 5.8, 0, 4.3, 9.8);
    this.block('ctrl','仲裁 / 执行',.8,0,2.2,3,C.copper,0,.9);
    for(let i=0;i<p.queues;i++) {
      const z=(i-(p.queues-1)/2)*2.3;
      this.block(`core${i}`,`CPU ${i}`,-7,z,1.6,1.2,C.dim);
      this.block(`sq${i}`,`SQ ${i+1}`,-3.5,z,2,1.2,C.cyan,0,.3);
      this.link(`core${i}`,`sq${i}`,C.cyan,true); this.link(`sq${i}`,'ctrl',C.cyan,true);
      if(!p.shared) { this.block(`cq${i}`,`CQ ${i+1}`,5.8,z,2.5,1.2,C.green,0,.3); this.link('ctrl',`cq${i}`,C.green,true); }
    }
    if(p.shared) { this.block('cq0','共享 CQ · SQID+CID',5.8,0,2.8,3.5,C.green,0,.4); this.link('ctrl','cq0',C.green,true); }
  }
  interrupts(p) {
    this.plate('COMPLETION NOTIFICATION',0,0,16.8,8);
    this.block('cq','CQ · 16 个完成',-5.6,0,3.4,4,C.green,0,.35);
    for(let i=0;i<16;i++) this.box(-6.7+(i%4)*.7,.42,-1.4+Math.floor(i/4)*.85,.46,.12,.57,C.green);
    this.block('msix',p.mode==='poll'?'通知路径未使用':'MSI-X 通知',0,-2,3,1.4,p.mode==='poll'?C.dim:C.copper);
    this.block('timer',p.mode==='batch'?`每 ${p.batch} 个完成通知`:'通知策略',0,2,3,1.4,C.dim);
    this.block('cpu','CPU / 完成处理',5.8,0,3,3,C.cyan,0,1);
    if(p.mode==='poll') this.link('cq','cpu',C.cyan,true,2.5);
    else {this.link('cq','msix',C.green,true);this.link('msix','cpu',C.copper,true);}
  }
  performance(p) {
    const r=performanceModel(p);
    this.plate('IN-FLIGHT',-5.7,0,5,8); this.plate('SERVICE & BANDWIDTH',3.6,0,9.1,8);
    this.nodes.set('pending',{pos:V(-5.7,1,0)});this.nodes.set('app',{pos:V(-5.7,1,-2)});
    const count=Math.min(p.qd,32);
    for(let i=0;i<count;i++) this.block(`pending-${i}`,'',-7+(i%4)*.87,-2.5+Math.floor(i/4)*.7,.65,.47,r.bottleneck==='在途命令数'?C.cyan:C.copper,0,.2+Math.floor(i/16)*.16,false);
    this.label(p.qd>32?`QD ${p.qd} · 仅画 32 个代表`:`QD ${p.qd}`,[-5.7,1.4,-3.1],'accent');
    this.block('ctrl','处理上限 500k IOPS',1,0,3.2,2.6,C.copper,0,1.15);
    this.block('media',`${p.bandwidthGBs} GB/s`,6,0,2.8,3.5,C.green,0,.6);
    this.link('pending','ctrl',C.cyan,true);this.link('ctrl','media',C.green,true);
    const utilization=Math.min(1,r.iops/500000);
    for(let i=0;i<10;i++)this.box(-.4+i*.32,.02,2.6,.22,.18+(i<utilization*10?.8:0),.6,i<utilization*10?C.copper:C.dim);
  }
  durable(d) {
    this.plate('HOST',-6,0,3.6,6);this.plate('DEVICE',2.4,0,12,8);
    this.block('host','写请求',-6,0,2.3,2,C.cyan,0,.8);
    this.block('cache','易失缓存 / 无掉电保护',-.7,-.1,4.3,4.5,C.dim,0,.3);
    this.block('media','非易失存储',5.4,-.1,4.3,4.5,C.green,0,.3);
    for(const [list,x,color] of [[d.volatile,-.7,C.copper],[d.durable,5.4,C.green]]) {
      list.slice(-12).forEach((id,i)=>{this.box(x-1.25+(i%3)*1.25,.37,-1.35+Math.floor(i/3)*.85,.9,.3,.55,color);this.label(`W${id}`,[x-1.25+(i%3)*1.25,1,-1.35+Math.floor(i/3)*.85],'mini');});
    }
    this.link('host','cache',C.copper,d.volatile.length>0);this.link('cache','media',C.green,d.durable.length>0);
    if(d.lost.length)this.label(`掉电丢失：${d.lost.map(n=>'W'+n).slice(-8).join(' ')}`,[0,.4,4.6],'accent');
  }
  health(p) {
    this.plate('HOST / ADMIN PATH',-5,0,5.5,7.4);this.plate('CONTROLLER TELEMETRY',4.3,0,9,7.4);
    this.block('host','主机管理软件',-5,-2,3,1.7,C.cyan);
    this.block('admin',p.aer?'AER · 等待事件':'没有在途 AER',-5,1.4,3,1.8,p.aer?C.copper:C.dim);
    this.block('ctrl','Identify / 能力',2,-2,3,1.6,C.copper);
    this.block('log',`Health Log · ${p.temp} °C`,6,1.8,3.2,2,C.green);
    this.block('event',p.event?'事件已报告':'事件等待中',1.5,1.8,3,1.8,p.event?C.red:C.dim);
    this.link('admin','event',C.copper,p.aer);this.link('event','host',C.red,p.event);this.link('log','host',C.green,true,3);
  }
  recovery(index) {
    this.plate('RECOVERY / 有序推进',0,0,17.5,8.7);
    const specs=[['host','主机',-6.6,-1.8,C.cyan],['timeout','超时观察',-3.3,1.6,C.red],['ctrl','控制器状态',0,-1.8,C.copper],['admin','Abort / 恢复协调',3.3,1.6,C.copper],['io','队列重建',6.6,-1.8,C.green]];
    specs.forEach(([id,t,x,z,c],i)=>this.block(id,t,x,z,2.4,1.8,i<=index?c:C.dim,0,.4+(i===index?.5:0)));
    for(let i=0;i<4;i++)this.link(specs[i][0],specs[i+1][0],C.copper,i<index,1.4);
  }
  power(p) {
    this.plate('ILLUSTRATIVE STATES / 教学参数',0,0,17,8);
    const names=['工作状态','浅休眠','深休眠'], heights=[3.6,1.5,.55];
    for(let i=0;i<3;i++) {this.block(`ps${i}`,`PS${i} · ${names[i]}`,-5.5+i*5.5,0,3.3,3,i===p.power?C.copper:C.dim,0,heights[i]);this.label(['5 W / 0 μs','1 W / 100 μs','0.1 W / 2000 μs'][i],[-5.5+i*5.5,.4,3.1],'mini');}
    this.link('ps0',`ps${p.power}`,C.green,p.power>0);
  }
  ftl(p) {
    this.plate('LOGICAL ADDRESS',-6.2,0,3.4,7.5);this.plate('NAND / SIMPLIFIED BLOCKS',3,0,12,8);
    this.block('lba','LBA 7',-6.2,-1.6,2.2,1.7,C.cyan);
    this.block('map','FTL 映射',-2.2,-1.6,2.7,2,C.copper);
    this.block('flash','待回收擦除块',3,-1.6,4.7,2.8,C.dim,0,.25);
    this.block('spare',p.gc?'搬迁后的有效页':'空闲擦除块',3,2.2,4.7,2.8,p.gc?C.green:C.dim,0,.25);
    for(let i=0;i<8;i++){
      this.box(1.2+(i%4)*1.2,.31,-2.25+Math.floor(i/4)*1.1,.85,.18,.7,p.gc?C.dark:i<p.invalid?C.red:C.green);
      this.box(1.2+(i%4)*1.2,.31,1.55+Math.floor(i/4)*1.1,.85,.18,.7,p.gc&&i<8-p.invalid?C.green:C.dark);
    }
    this.link('lba','map',C.cyan,true);this.link('map',p.gc?'spare':'flash',C.green,true);this.link('flash','spare',C.copper,p.gc);
    this.label('绿色 = 有效 · 红色 = 失效 · 深色 = 空闲',[2,.4,4.6],'mini');
  }
  zone(z) {
    this.plate('ONE SEQUENTIAL-WRITE-REQUIRED ZONE',0,0,17,6.2);
    this.nodes.set('zone',{pos:V(0,1,0)});
    for(let i=0;i<z.capacity;i++) {const x=-7.15+i*1.3;this.block(`zone-${i}`,'',x,0,1.05,2,i<z.wp?C.green:C.dim,0,.4,false);if(this.stage.clientWidth>=600||i%2===0)this.label(String(i),[x,.9,0],'mini');}
    const x=-7.15+Math.min(z.wp,z.capacity-1)*1.3;
    this.nodes.set('wp',{pos:V(x,1.4,0)});
    this.label(z.wp===z.capacity?'FULL · WP 到达容量':`WP → ${z.wp}`,[x,1.8,-1.4],'accent');
    this.block('append','Zone Append',-4.5,3.8,3.3,1.2,C.copper,0,.5);this.link('append','wp',C.copper,true);
    this.label(`${z.wp} / ${z.capacity} 块已写入`,[4.5,.7,3.8],'accent');
  }
  fabrics(p) {
    this.plate('HOST',-6.3,0,4.3,7.8);this.plate('REMOTE SUBSYSTEM',5.5,0,6.5,7.8);
    this.block('host','NVMe Host',-6.3,-1.7,3,2,C.cyan,0,.8);
    this.block('capsule','命令胶囊',-6.3,2,3,1.5,C.copper,0,.35);
    this.block('network',p.transport==='tcp'?'TCP / 网络传输':'RDMA / 网络传输',-.6,0,3.2,3,C.dim,0,1.1);
    this.block('remote','远程控制器',5.5,-1.7,3.6,2.2,C.copper,0,.9);
    this.block('cq','响应胶囊 / 完成',5.5,2.1,3.6,1.5,C.green,0,.35);
    this.link('host','network',C.cyan,true);this.link('network','remote',C.cyan,true);this.link('capsule','remote',C.copper,true,3.3);this.link('remote','cq',C.green,true);this.link('cq','host',C.green,true,3.3);
  }
  positionLabels() {
    if(this.failed)return;
    const w=this.stage.clientWidth,h=this.stage.clientHeight;
    const sorted=[...this.labels].sort((a,b)=>b.priority-a.priority), rects=[];
    for(const l of sorted){
      const v=l.pos.clone().project(this.camera),x=(v.x*.5+.5)*w,y=(-v.y*.5+.5)*h;
      l.el.style.left=`${x}px`;l.el.style.top=`${y}px`;
      const outside=v.z>1||v.z< -1||x<8||x>w-8||y<110||y>h-125;
      const width=l.el.offsetWidth||60,height=l.el.offsetHeight||20;
      const r={x:x-width/2,y:y-height/2,w:width,h:height};
      const collision=rects.some(a=>r.x<a.x+a.w&&r.x+r.w>a.x&&r.y<a.y+a.h&&r.y+r.h>a.y);
      l.el.style.visibility=outside||collision?'hidden':'visible';
      if(!outside&&!collision)rects.push(r);
    }
  }
  animate(time) {
    requestAnimationFrame(this.animate);
    const delta=Math.min(100,time-this.lastFrame);this.lastFrame=time;
    if(!this.active)return;
    if(this.playing&&!this.reducedMotion)this.motionTime+=delta;
    this.controls.update();
    for(const {packet,curve,offset} of this.movers){const t=this.reducedMotion?offset:(this.motionTime*.00028+offset)%1;packet.position.copy(curve.getPoint(t));packet.lookAt(curve.getPoint(Math.min(.999,t+.01)));}
    this.renderer.render(this.scene,this.camera);this.positionLabels();
  }
}
