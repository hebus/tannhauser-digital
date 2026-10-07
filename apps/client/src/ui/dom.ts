/** Petit constructeur DOM (aucun innerHTML : tout texte passe par textContent). */
export type Child = Node | string | null | undefined | false;

export interface Props {
  readonly class?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly on?: Readonly<Record<string, (event: Event) => void>>;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  for (const [name, value] of Object.entries(props.attrs ?? {})) {
    if (value === undefined || value === false) continue;
    el.setAttribute(name, value === true ? '' : String(value));
  }
  for (const [type, handler] of Object.entries(props.on ?? {})) el.addEventListener(type, handler);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

/** Conserve le focus clavier à travers un re-rendu : retrouve l'élément portant le même `data-fid`. */
export function withFocusKept(root: HTMLElement, render: () => void): void {
  const active = document.activeElement;
  const fid = active instanceof HTMLElement && root.contains(active) ? active.getAttribute('data-fid') : null;
  render();
  if (fid) root.querySelector<HTMLElement>(`[data-fid="${CSS.escape(fid)}"]`)?.focus();
}

/** Vrai si la cible d'un événement clavier est un champ de saisie (les raccourcis globaux ne doivent pas l'intercepter). */
export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
}
