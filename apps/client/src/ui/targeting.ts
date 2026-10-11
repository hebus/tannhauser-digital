/**
 * Mode « choisir une case au clic » pour lancer une grenade ou un fumigène. L'interface (HUD) l'ouvre après le choix de
 * l'objet, le plateau (main.ts) met en évidence les cases visables et envoie la commande au clic. Petit magasin sans DOM :
 * les cases visables viennent du moteur (`getLegalActions`), jamais recalculées ici.
 */
export interface ThrowTargeting {
  readonly characterId: string;
  readonly equipmentId: string;
  /** Cases que le moteur accepte pour ce lancer. */
  readonly nodeIds: readonly string[];
  /** Fumigène : la zone annoncée est la seule case visée ; grenade explosive : case + voisines. */
  readonly smoke: boolean;
}

type Listener = (current: ThrowTargeting | null) => void;

let current: ThrowTargeting | null = null;
const listeners = new Set<Listener>();

export function getTargeting(): ThrowTargeting | null {
  return current;
}

export function startTargeting(targeting: ThrowTargeting): void {
  current = targeting;
  for (const listener of [...listeners]) listener(current);
}

/** Quitte le mode ; renvoie `true` s'il était actif (rien n'est notifié sinon). */
export function cancelTargeting(): boolean {
  if (current === null) return false;
  current = null;
  for (const listener of [...listeners]) listener(null);
  return true;
}

export function subscribeTargeting(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** La case est-elle un choix valide dans le mode en cours ? */
export function isTargetable(nodeId: string): boolean {
  return current?.nodeIds.includes(nodeId) ?? false;
}
