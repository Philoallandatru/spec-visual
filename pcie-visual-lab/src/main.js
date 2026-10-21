import { camera, controls, moveCam, resetScene, state, ui, V } from './core.js';
import diff from './chapters/diff.js';
import isi from './chapters/isi.js';
import eye from './chapters/eye.js';
import ffe from './chapters/ffe.js';
import rxeq from './chapters/rxeq.js';
import eqproc from './chapters/eqproc.js';
import margin from './chapters/margin.js';

const CH = [diff, isi, eye, ffe, rxeq, eqproc, margin];
const $ = s => document.querySelector(s);
const navEl = $('#nav'), viewbar = $('#viewbar');
let idx = 0;

CH.forEach((c, i) => {
  const b = document.createElement('button'); b.type = 'button';
  b.innerHTML = `<i>${String(i + 1).padStart(2, '0')}</i><span>${c.nav}</span>`;
  b.addEventListener('click', () => load(i)); navEl.appendChild(b);
});

function camFor(cam, target) {
  const t = V(...target), off = V(...cam).sub(t), a = camera.aspect;
  const k = a < .8 ? 1.7 : a < 1.25 ? 1.25 : 1;
  return [t.clone().add(off.multiplyScalar(k)).toArray(), target];
}

function load(i) {
  resetScene(); idx = i;
  const ch = CH[i];
  $('#eyebrow').textContent = `第 ${i + 1} 章 / 共 ${CH.length} 章`;
  $('#title').innerHTML = `${ch.title}<small>${ch.sub}</small>`;
  $('#lead').innerHTML = ch.lead;
  $('#points').innerHTML = ch.points.map(p => `<li>${p}</li>`).join('');
  $('#src').innerHTML = ch.src ? '依据：' + ch.src : '';
  navEl.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-current', String(j === i)));
  $('#prev').disabled = i === 0; $('#next').disabled = i === CH.length - 1;
  const res = ch.build() || {};
  state.update = res.update || null;
  viewbar.innerHTML = '';
  const views = [{ label: '默认视角', cam: ch.cam, target: ch.target }, ...(res.views || [])];
  views.forEach(v => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = v.label; b.addEventListener('click', () => moveCam(...camFor(v.cam, v.target), .8)); viewbar.appendChild(b); });
  moveCam(...camFor(ch.cam, ch.target), 1.0);
  try { history.replaceState(null, '', '#' + ch.key); } catch {}
  const sc = $('#scroll'); if (sc.scrollHeight > sc.clientHeight) sc.scrollTop = 0;
}

$('#prev').addEventListener('click', () => idx > 0 && load(idx - 1));
$('#next').addEventListener('click', () => idx < CH.length - 1 && load(idx + 1));
document.addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input,textarea,select')) return;
  if (e.key === 'ArrowRight' && idx < CH.length - 1) load(idx + 1);
  if (e.key === 'ArrowLeft' && idx > 0) load(idx - 1);
});

const h = (location.hash || '').slice(1);
const first = Math.max(0, CH.findIndex(c => c.key === h));
camera.position.set(8, 12, 18); controls.target.set(0, 1, 0);
load(first);
