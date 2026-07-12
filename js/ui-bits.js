// ---------- shared UI primitives: toasts + modals ----------
import { el } from './util.js';
import { SFX } from './audio.js';

export function toast(msg, bad = false) {
  const t = el(`<div class="toast ${bad ? 'bad' : ''}">${msg}</div>`);
  document.getElementById('toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; }, 2400);
  setTimeout(() => t.remove(), 2900);
}

export function showModal(html, { dismissable = true } = {}) {
  const layer = document.getElementById('modal-layer');
  const box = document.getElementById('modal-box');
  box.innerHTML = html;
  layer.classList.remove('hidden');
  layer.onclick = dismissable ? (e) => { if (e.target === layer) closeModal(); } : null;
  return box;
}

export function closeModal() {
  document.getElementById('modal-layer').classList.add('hidden');
}

export function confirmModal(title, bodyHtml, onYes, yesLabel = 'Confirm') {
  const box = showModal(`
    <h2>${title}</h2>
    <p class="dim" style="margin-top:8px">${bodyHtml}</p>
    <div class="modal-btns">
      <button class="btn" id="cm-no">Cancel</button>
      <button class="btn primary" id="cm-yes">${yesLabel}</button>
    </div>`);
  box.querySelector('#cm-no').onclick = () => { SFX.click(); closeModal(); };
  box.querySelector('#cm-yes').onclick = () => { SFX.click(); closeModal(); onYes(); };
}
