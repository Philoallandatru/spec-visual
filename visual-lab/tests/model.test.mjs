import test from 'node:test';
import assert from 'node:assert/strict';
import { QueueLab, prpLayout, addressRange, performanceModel, doorbellOffset, DurabilityLab, ZoneLab } from '../src/model.js';
import { isWithin } from '../serve.mjs';
import { chapters, units } from '../src/course.js';
import { resolve } from 'node:path';
import { access } from 'node:fs/promises';

test('SQ publishes only after doorbell and conservatively reserves one slot', () => {
  const q = new QueueLab(4);
  assert.equal(q.consume(), false);
  for (let i = 0; i < 3; i++) assert(q.submit());
  assert.equal(q.submit(), false); assert.equal(q.fetch(), false);
  q.ringSQ(); for (let i = 0; i < 3; i++) assert(q.fetch());
  assert.equal(q.fetch(), false); assert.equal(q.submit(), false);
  q.complete(); q.consume(); assert.equal(q.sqHeadHost, 3); assert(q.submit());
});
test('CQ cannot overwrite consumed entries before CQ head notification', () => {
  const q = new QueueLab(4);
  for (let i = 0; i < 3; i++) q.submit();
  q.ringSQ(); for (let i = 0; i < 3; i++) q.fetch();
  for (let i = 0; i < 3; i++) q.complete();
  q.consume(); q.submit(); q.ringSQ(); q.fetch();
  assert.equal(q.complete(), false); q.ringCQ(); assert(q.complete());
});
test('CQ phase flips at wrap, stale memory stays but is not a new completion', () => {
  const q = new QueueLab(4);
  for (let i = 0; i < 4; i++) assert(q.cycle());
  assert.equal(q.expectedPhase, 0); assert.equal(q.producerPhase, 0);
  assert.equal(q.cq[0].phase, 1); assert.equal(q.consume(), false);
  assert(q.cycle()); assert.equal(q.cq[0].phase, 0);
  for (let i = 0; i < 27; i++) assert(q.cycle());
  assert.equal(q.reaped, 32); assert.equal(q.outstanding.size, 0);
});
test('completion identifies out-of-order CID while SQHD reflects fetch progress', () => {
  const q = new QueueLab(); q.submit(); q.submit(); q.ringSQ(); q.fetch(); q.fetch();
  q.complete(true); assert.equal(q.cq[0].cid, 1); assert.equal(q.cq[0].sqhd, 2);
  q.consume(); assert(q.outstanding.has(0)); assert(!q.outstanding.has(1));
});
test('PRP2 meaning depends on covered pages, including first page offset', () => {
  assert.equal(prpLayout(4096).prp2, 'unused');
  assert.equal(prpLayout(4096, 256).prp2, 'page');
  assert.equal(prpLayout(8192).prp2, 'page');
  const p = prpLayout(8192, 256); assert.equal(p.prp2, 'list'); assert.equal(p.listEntries, 2);
  assert.equal(prpLayout(1, 4092).firstBytes, 1); assert.throws(() => prpLayout(4096, 3));
});
test('NLB is zero based and LBA must remain in namespace', () => {
  assert.equal(addressRange(0, 0).bytes, 4096); assert(addressRange(31, 0).valid);
  assert(!addressRange(31, 1).valid); assert(!addressRange(-1, 0).valid);
  assert.equal(addressRange(3, 7, 512).bytes, 4096);
});
test('doorbell offsets distinguish SQ/CQ and honor stride', () => {
  assert.equal(doorbellOffset(0), 0x1000); assert.equal(doorbellOffset(1), 0x1008);
  assert.equal(doorbellOffset(1, 0, true), 0x100c); assert.equal(doorbellOffset(1, 2, true), 0x1030);
});
test('performance obeys Little law and bandwidth units', () => {
  const low = performanceModel({ qd: 1 }); assert.equal(low.iops, 10000); assert.equal(low.mbps, 40.96);
  const high = performanceModel({ qd: 128, kib: 128, bandwidthGBs: 4 });
  assert.equal(high.mbps, 4000); assert.equal(high.bottleneck, '数据带宽');
  assert(Math.abs(high.iops * high.responseUs / 1e6 - 128) < 1e-8);
});
test('FUA protects its own write, Flush protects prior completed writes', () => {
  const d = new DurabilityLab(); d.write(); d.write(true); d.powerLoss();
  assert.deepEqual(d.lost, [1]); assert.deepEqual(d.durable, [2]);
  d.write(); d.flush(); d.powerLoss(); assert.deepEqual(d.durable, [2, 3]);
});
test('ZNS write pointer enforces placement and capacity', () => {
  const z = new ZoneLab(2); assert(!z.write(1)); assert.equal(z.wp, 0);
  assert(z.append()); assert(!z.write(0)); assert(z.append()); assert(!z.append());
  z.reset(); assert.equal(z.wp, 0); assert(z.write(0));
});
test('server path containment checks path segments rather than common prefixes', () => {
  const base = resolve('site'); assert(isWithin(base, resolve(base, 'index.html')));
  assert(!isWithin(base, resolve(base, '../site-secret/key'))); assert(!isWithin(base, resolve(base, '../key')));
});

test('course has 20 complete, uniquely addressable chapters', () => {
  assert.equal(chapters.length, 20);
  assert.equal(new Set(chapters.map(c => c.id)).size, chapters.length);
  for (const c of chapters) {
    assert(Number.isFinite(c.minutes) && c.minutes > 0, `${c.id}: minutes`);
    assert(Number.isInteger(c.unit) && c.unit >= 0 && c.unit < units.length, `${c.id}: unit`);
    assert(c.steps.length >= 4, `${c.id}: steps`);
    assert(c.steps.every(s => s.title && s.body && s.focus.length), `${c.id}: step copy`);
    assert(c.notes.length >= 3, `${c.id}: notes`);
    assert(c.quiz.options.length >= 3 && c.quiz.answer >= 0 && c.quiz.answer < c.quiz.options.length, `${c.id}: quiz`);
    assert(c.misconception && c.boundary, `${c.id}: boundary`);
  }
});

test('every cited local specification page exists', async () => {
  for (const page of new Set(chapters.flatMap(c => c.base || []))) {
    const path = resolve('../_source/pages', `page-${String(page).padStart(3, '0')}.md`);
    await access(path);
  }
});
