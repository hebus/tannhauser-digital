import type { EditorDoc } from './model';

/**
 * Brouillon local (navigateur) du plateau en cours d'édition : filet de sécurité si la page se recharge avant
 * l'enregistrement. Effacé à chaque enregistrement réussi. Lecture et écriture tolèrent un stockage indisponible.
 */

const key = (id: string): string => `tannhauser.boardEditor.draft.${id}`;

export function readDraft(id: string): EditorDoc | null {
  try {
    const text = localStorage.getItem(key(id));
    return text ? (JSON.parse(text) as EditorDoc) : null;
  } catch {
    return null;
  }
}

export function writeDraft(id: string, doc: EditorDoc): void {
  try {
    localStorage.setItem(key(id), JSON.stringify(doc));
  } catch {
    // stockage plein ou bloqué : le brouillon est un confort, pas une garantie
  }
}

export function clearDraft(id: string): void {
  try {
    localStorage.removeItem(key(id));
  } catch {
    // idem
  }
}
