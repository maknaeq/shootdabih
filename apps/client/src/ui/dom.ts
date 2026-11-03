/** Petit utilitaire de création d'éléments, sans framework. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean | ((e: Event) => void)> = {}, ...children: Array<Node | string | null | undefined>): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v as EventListener);
    else if (typeof v === 'boolean') { if (v) el.setAttribute(k, ''); }
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) if (c !== null && c !== undefined) el.append(c);
  return el;
}

export const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export function loadName(): string { try { return localStorage.getItem('sdb-name') ?? ''; } catch { return ''; } }
export function saveName(n: string) { try { localStorage.setItem('sdb-name', n); } catch { /* stockage indisponible */ } }

export function wakeText(s: number) { return s < 4 ? 'Connexion au serveur…' : `Réveil du serveur… ${s} s (ça peut prendre une minute la première fois)`; }
