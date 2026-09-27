/** Tiny DOM helpers: every screen is built from these, no framework. */

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls = '', text = '', on?: (e: Event) => void,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  if (text) el.textContent = text
  if (on) el.addEventListener('click', (e) => { e.stopPropagation(); on(e) })
  return el
}

export function btn(text: string, cls: string, on: () => void): HTMLButtonElement {
  return h('button', 'btn ' + cls, text, on)
}

/** A full-screen layer; showing one replaces whatever layer had the same id. */
export function layer(id: string, cls = 'layer'): HTMLDivElement {
  closeLayer(id)
  const el = h('div', cls)
  el.id = id
  document.getElementById('ui')!.appendChild(el)
  return el
}

export function closeLayer(id: string): void {
  const el = document.getElementById(id)
  if (el) el.parentNode?.removeChild(el)
}

export const fmt = (n: number): string =>
  n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : String(Math.floor(n))

/** A short toast in the middle of the screen. */
export function toast(text: string, ms = 1600): void {
  const el = h('div', 'toast', text)
  document.getElementById('ui')!.appendChild(el)
  setTimeout(() => el.parentNode?.removeChild(el), ms)
}
