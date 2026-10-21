export const modDistance = (head, tail, size) => (tail - head + size) % size;

export class QueueLab {
  constructor(size = 8) {
    if (!Number.isInteger(size) || size < 2) throw new RangeError('Queue size must be at least two');
    this.size = size;
    this.sq = Array(size).fill(null);
    this.cq = Array.from({ length: size }, () => ({ phase: 0, cid: null, consumed: true }));
    this.sqTail = this.sqHeadDevice = this.sqHeadHost = this.sqTailDoorbell = 0;
    this.cqTail = this.cqHead = this.cqHeadDoorbell = 0;
    this.producerPhase = this.expectedPhase = 1;
    this.inFlight = [];
    this.outstanding = new Set();
    this.nextCid = this.submitted = this.completed = this.reaped = this.sqDoorbells = this.cqDoorbells = 0;
    this.message = '所有指针从 0 开始。CQ 内存 P=0，主机期待 P=1。先写入一条命令。';
    this.error = false;
  }
  result(ok, message) { this.error = !ok; this.message = message; return ok; }
  get canSubmit() { return (this.sqTail + 1) % this.size !== this.sqHeadHost; }
  get canFetch() { return this.sqHeadDevice !== this.sqTailDoorbell; }
  get canComplete() { return this.inFlight.length > 0 && (this.cqTail + 1) % this.size !== this.cqHeadDoorbell; }
  get canConsume() { return this.cq[this.cqHead].phase === this.expectedPhase; }
  submit() {
    if (!this.canSubmit) return this.result(false, '主机认为 SQ 已满：要先消费携带新 SQHD 的完成记录，才能安全复用槽位。');
    while (this.outstanding.has(this.nextCid % 65536)) this.nextCid++;
    const cid = this.nextCid++ % 65536, slot = this.sqTail;
    this.sq[slot] = { cid, state: 'staged' };
    this.outstanding.add(cid); this.submitted++;
    this.sqTail = (slot + 1) % this.size;
    return this.result(true, `已写 SQ[${slot}]，CID=${cid}；主机 Tail=${this.sqTail}。还没有敲铃，控制器看不到这批新提交。`);
  }
  ringSQ() {
    const count = modDistance(this.sqTailDoorbell, this.sqTail, this.size);
    if (!count) return this.result(false, '没有新的 SQ 条目需要通知。');
    let slot = this.sqTailDoorbell;
    while (slot !== this.sqTail) { this.sq[slot].state = 'submitted'; slot = (slot + 1) % this.size; }
    this.sqTailDoorbell = this.sqTail; this.sqDoorbells++;
    return this.result(true, `一次 MMIO 写 Tail=${this.sqTail}，公布 ${count} 条命令；门铃中没有传输文件数据。`);
  }
  fetch() {
    if (!this.canFetch) return this.result(false, '设备已取完所有公布的命令。先写命令并敲 SQ 门铃。');
    const entry = this.sq[this.sqHeadDevice];
    entry.state = 'fetched'; this.inFlight.push(entry.cid);
    this.sqHeadDevice = (this.sqHeadDevice + 1) % this.size;
    return this.result(true, `控制器取走 CID=${entry.cid}，设备 SQ Head=${this.sqHeadDevice}；取走不代表执行完成，主机已知 SQHD 暂时仍是 ${this.sqHeadHost}。`);
  }
  complete(outOfOrder = false) {
    if (!this.inFlight.length) return this.result(false, '没有已取走的命令可以完成。');
    if (!this.canComplete) return this.result(false, '设备认为 CQ 已满。主机处理 CQE 后，还需要敲 CQ Head 门铃释放空间。');
    const cid = outOfOrder ? this.inFlight.pop() : this.inFlight.shift(), slot = this.cqTail;
    this.cq[slot] = { cid, sqid: 1, sqhd: this.sqHeadDevice, phase: this.producerPhase, consumed: false };
    this.cqTail = (slot + 1) % this.size;
    if (this.cqTail === 0) this.producerPhase ^= 1;
    this.completed++;
    return this.result(true, `发布 CQ[${slot}]：SQID=1，CID=${cid}，SQHD=${this.sqHeadDevice}，P=${this.cq[slot].phase}。${outOfOrder ? '选取最后取走的命令完成，展示乱序。' : ''}`);
  }
  consume() {
    if (!this.canConsume) return this.result(false, `CQ[${this.cqHead}] 的 P=${this.cq[this.cqHead].phase}，与期待值 ${this.expectedPhase} 不同：这里没有新完成。`);
    const slot = this.cqHead, entry = this.cq[slot];
    entry.consumed = true;
    this.sqHeadHost = entry.sqhd; this.outstanding.delete(entry.cid); this.reaped++;
    this.cqHead = (slot + 1) % this.size;
    if (this.cqHead === 0) this.expectedPhase ^= 1;
    return this.result(true, `消费 CID=${entry.cid}；主机 SQHD 更新为 ${this.sqHeadHost}，CQ Head=${this.cqHead}，期待 P=${this.expectedPhase}。旧 CQE 留在内存，尚未通知设备释放槽位。`);
  }
  ringCQ() {
    if (this.cqHeadDoorbell === this.cqHead) return this.result(false, '没有新的 CQ 空间需要归还。');
    this.cqHeadDoorbell = this.cqHead; this.cqDoorbells++;
    return this.result(true, `写 CQ Head 门铃=${this.cqHead}，设备现在可以复用主机已处理的完成槽位。`);
  }
  cycle() {
    if (!this.submit()) return false;
    this.ringSQ(); this.fetch(); this.complete(); this.consume(); this.ringCQ();
    return this.result(true, `完成一轮读写。累计回收 ${this.reaped} 条；CQ Head=${this.cqHead}，主机期待 P=${this.expectedPhase}。`);
  }
}

export function prpLayout(bytes, offset = 0, pageSize = 4096) {
  if (![bytes, offset, pageSize].every(Number.isInteger) || bytes <= 0 || offset < 0 || offset >= pageSize || offset % 4 || pageSize < 4096 || Math.log2(pageSize) % 1) throw new RangeError('Invalid PRP layout');
  const pages = Math.ceil((offset + bytes) / pageSize);
  const firstBytes = Math.min(bytes, pageSize - offset);
  return { bytes, offset, pageSize, pages, firstBytes, prp2: pages === 1 ? 'unused' : pages === 2 ? 'page' : 'list', listEntries: pages > 2 ? pages - 1 : 0 };
}

export function addressRange(slba, nlb, blockSize = 4096, capacity = 32) {
  const valid = [slba, nlb, blockSize, capacity].every(Number.isInteger) && slba >= 0 && nlb >= 0 && nlb <= 65535 && blockSize > 0 && slba + nlb < capacity;
  return { valid, blocks: nlb + 1, last: slba + nlb, bytes: (nlb + 1) * blockSize, byteOffset: slba * blockSize };
}

export function doorbellOffset(qid, dstrd = 0, completion = false) {
  return 0x1000 + (2 * qid + (completion ? 1 : 0)) * (4 * 2 ** dstrd);
}

export function performanceModel({ qd = 1, kib = 4, latencyUs = 100, bandwidthGBs = 4, maxIops = 500000 }) {
  const latencyBound = qd * 1e6 / latencyUs;
  const bandwidthBound = bandwidthGBs * 1e9 / (kib * 1024);
  const iops = Math.min(latencyBound, bandwidthBound, maxIops);
  return { iops, mbps: iops * kib * 1024 / 1e6, responseUs: qd / iops * 1e6, latencyBound, bandwidthBound, bottleneck: iops === latencyBound ? '在途命令数' : iops === bandwidthBound ? '数据带宽' : '设备处理能力' };
}

export class DurabilityLab {
  constructor() { this.volatile = []; this.durable = []; this.lost = []; this.next = 1; this.message = '假设：有易失写缓存且已启用，没有掉电保护。每条写写入不同的示意 LBA。'; }
  write(fua = false) { const id = this.next++; (fua ? this.durable : this.volatile).push(id); this.message = `写 W${id} 返回成功。${fua ? 'FUA 使这条写在成功前持久化；没有顺带保证其他写。' : '数据还在易失缓存，突然掉电可能丢失。'}`; }
  flush() { const n = this.volatile.length; this.durable.push(...this.volatile); this.volatile = []; this.message = `Flush 成功，先前已完成的 ${n} 条缓存写已进入非易失存储。`; }
  powerLoss() { this.lost.push(...this.volatile); const n = this.volatile.length; this.volatile = []; this.message = `模拟掉电：丢失 ${n} 条易失写，${this.durable.length} 条持久写保留。`; }
}

export class ZoneLab {
  constructor(capacity = 12) { this.capacity = capacity; this.wp = 0; this.error = false; this.message = '示意 Zone 从 LBA 0 开始，容量 12 块，WP=0。'; }
  write(lba, count = 1) {
    if (lba !== this.wp || count < 1 || this.wp + count > this.capacity) { this.error = true; this.message = '写入被拒绝：普通 Write 必须从 WP 开始，并且不能越过 Zone 容量。'; return false; }
    const start = this.wp; this.wp += count; this.error = false; this.message = `写入 LBA ${start}，WP 推进到 ${this.wp}。${this.wp === this.capacity ? 'Zone 已满。' : ''}`; return true;
  }
  append() { const start = this.wp; if (!this.write(start)) return false; this.message = `Zone Append 成功；控制器选择 LBA ${start} 并返回该位置，WP=${this.wp}。`; return true; }
  reset() { this.wp = 0; this.error = false; this.message = 'Reset 后旧内容不再有效，Zone 回到 Empty，WP=0。这只是页面内模拟。'; }
}
