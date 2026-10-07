import { typeOf, label, tileLabel, isRed, glyph } from '../core/tiles.js';
/** Escape all variable text before inserting templates, especially names and
 * imported records. Tile data are always numeric internal IDs. */
export const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
export const num = (n) => Number(n).toLocaleString('ko-KR');
export const signed = (n) => `${n > 0 ? '+' : ''}${num(n)}`;
export const shantenText = (n) => (n < 0 ? '화료형' : n === 0 ? '텐파이' : `${n}샨텐`);
export const button = (text, action, extra = '', kind = '') =>
  `<button class="button ${kind}" data-action="${action}" ${extra}>${text}</button>`;
export const pill = (text, kind = '') => `<span class="pill ${kind}">${text}</span>`;
/** The CC0 artwork URL comes from the source repository's verified file list.
 * The Unicode layer is visible immediately and survives network/image errors. */
export function tile(
  id,
  {
    action = '',
    small = false,
    selected = false,
    disabled = false,
    back = false,
    aka = true,
    classes = '',
    attrs = '',
  } = {}
) {
  if (back) return '<span class="tile back" aria-label="뒷면"></span>';
  const t = typeOf(id),
    red = isRed(id, aka),
    name =
      t < 27
        ? ['Man', 'Pin', 'Sou'][Math.floor(t / 9)] + ((t % 9) + 1) + (red ? '-Dora' : '')
        : ['Ton', 'Nan', 'Shaa', 'Pei', 'Haku', 'Hatsu', 'Chun'][t - 27];
  const tag = action ? 'button' : 'span';
  return `<${tag} class="tile ${small ? 'small' : ''} ${selected ? 'selected' : ''} ${red ? 'red' : ''} ${classes}" data-t="${t}" data-id="${id}" ${action ? `data-action="${action}" type="button"` : ''} ${disabled ? 'disabled aria-disabled="true"' : ''} aria-label="${tileLabel(id, aka)}" title="${tileLabel(id, aka)}" ${attrs}><span class="tile-fallback" aria-hidden="true">${glyph(t)}&#xfe0e;</span><img src="https://raw.githubusercontent.com/FluffyStuff/riichi-mahjong-tiles/master/Regular/${name}.svg" alt="" draggable="false" decoding="async"><span class="tile-label" aria-hidden="true">${red ? '赤' : label(t)}</span>${classes.includes('tsumogiri') ? '<span class="cut-dot" aria-hidden="true"></span>' : ''}</${tag}>`;
}
export const tiles = (ids, opts = {}) => ids.map((id) => tile(id, opts)).join('');
/** Render all wait kinds and remaining copies without hiding exhausted waits. */
export function ukeireTiles(rows) {
  return rows
    .map(
      (x) =>
        `<span class="wait-tile">${tile(x.t * 4 + 1, { small: true })}<small>${x.left}장</small></span>`
    )
    .join('');
}
/** Build a compact analysis table shared by trainer, calculator and replay. */
export function analysisTable(rows, selected = null) {
  if (!rows?.length) return '<p class="muted">분석할 타패가 없습니다.</p>';
  const best = rows[0],
    max = Math.max(...rows.map((x) => x.total), 1);
  return `<div class="table-scroll"><table class="analysis-table"><thead><tr><th>타패</th><th>샨텐</th><th>유효패</th><th>남은 매수</th>${rows[0].twoStep !== undefined ? '<th>2회 쯔모</th>' : ''}</tr></thead><tbody>${rows.map((r) => `<tr class="${r.t === selected ? 'chosen' : ''} ${r.shanten === best.shanten && r.total === best.total ? 'best' : ''}"><td>${tile(r.t * 4 + 1, { small: true })}</td><td>${shantenText(r.shanten)}</td><td><div class="waits">${ukeireTiles(r.tiles)}</div></td><td><b>${r.total}</b><span class="bar"><i style="width:${(r.total / max) * 100}%"></i></span><small>${r.tiles.length}종</small></td>${r.twoStep !== undefined ? `<td>${(r.twoStep * 100).toFixed(1)}%<small>다음 유효패 ${r.expansion.toFixed(1)}장</small></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}
/** Numeric controls reuse names so native forms and mobile keyboards work. */
export const field = (text, name, value, step = 100) =>
  `<label class="field"><span>${text}</span><input type="number" name="${name}" value="${value}" step="${step}" inputmode="numeric"></label>`;
/** Image success replaces the fallback visually, not structurally. */
export function wireImages(root) {
  root.querySelectorAll('.tile img').forEach((img) => {
    const ready = () => img.parentElement?.classList.add('image-ready');
    if (img.complete && img.naturalWidth) ready();
    else img.addEventListener('load', ready, { once: true });
    img.addEventListener('error', () => img.remove(), { once: true });
  });
}
/** Apply tracker highlighting across rivers and exposed melds only. */
export function track(root, t) {
  root
    .querySelectorAll('[data-public] .tile')
    .forEach((el) => el.classList.toggle('tracked', t !== null && Number(el.dataset.t) === t));
}
/** Clipboard may be disallowed on file:// or embedded browsers; report failures
 * and retain the textarea/download as a usable fallback. */
export async function copyText(text) {
  await navigator.clipboard.writeText(text);
}
/** Client downloads never upload a user's replay anywhere. */
export function download(name, text, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
