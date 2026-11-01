import { diagnoseBoard } from '@tannhauser/content/src/loaders';
import { zoneAt } from './geometry';
import type { EditorDoc } from './model';

/**
 * Diagnostic en direct du plateau édité. Les ERREURS sont celles du chargement du jeu (`diagnoseBoard` : schéma et
 * validation du moteur) : un plateau en erreur ne peut pas être enregistré. Les AVERTISSEMENTS et INFOS signalent ce
 * qui gênera la partie sans empêcher l'enregistrement.
 */

export type DiagnosticLevel = 'error' | 'warning' | 'info';

export interface Diagnostic {
  readonly level: DiagnosticLevel;
  readonly code: string;
  readonly message: string;
  /** Cases concernées (clic sur le diagnostic = les sélectionner). */
  readonly nodeIds: readonly string[];
}

/** Équipes complètes : 2 joueurs × 5 personnages (`MAX_TEAM_SIZE`). */
const FULL_TEAMS = 10;
/** Capture du drapeau : 2 équipes × 3 drapeaux (`FLAGS_PER_PLAYER`). */
const CTF_OBJECTIVES = 6;

/** Cases dont l'identifiant apparaît dans un message du moteur. */
function mentionedNodes(doc: EditorDoc, message: string): string[] {
  const words = new Set(message.split(/[^A-Za-z0-9_.-]+/));
  return doc.nodes.filter((n) => words.has(n.id)).map((n) => n.id);
}

export function diagnose(doc: EditorDoc, hasTranslation: (key: string) => boolean = () => true): Diagnostic[] {
  const out: Diagnostic[] = diagnoseBoard(doc, doc.id).map((message) => {
    const code = /^([A-Z_]+) : /.exec(message)?.[1] ?? 'CONTENT';
    return { level: 'error', code, message, nodeIds: mentionedNodes(doc, message) };
  });
  const warn = (level: DiagnosticLevel, code: string, message: string, nodeIds: readonly string[] = []): void => {
    out.push({ level, code, message, nodeIds });
  };

  // Une caisse (fermée) rend sa case impraticable : même règle que le moteur (`isPassable`).
  const crated = new Set((doc.crates ?? []).map((c) => c.nodeId));
  const passable = doc.nodes.filter((n) => n.properties?.passable !== false && !crated.has(n.id));
  if (doc.nodes.length > 0 && passable.length < FULL_TEAMS) {
    warn('warning', 'FEW_NODES', `${passable.length} cases praticables : moins de ${FULL_TEAMS}, des équipes complètes ne tiendront pas.`);
  }
  const entries = doc.nodes.filter((n) => n.properties?.kind === 'ENTRY_POINT');
  if (doc.nodes.length > 0 && entries.length < 2) {
    warn('info', 'NO_ENTRIES', 'Moins de 2 cases d’entrée : les équipes seront placées sur les cases les plus éloignées.');
  }
  const objectives = passable.filter((n) => n.properties?.kind === 'OBJECTIVE');
  const blockedEntries = entries.filter((n) => crated.has(n.id)).map((n) => n.id);
  if (blockedEntries.length > 0) warn('warning', 'CRATE_ON_ENTRY', `${blockedEntries.length} case(s) d’entrée sous une caisse : personne ne pourra y être placé.`, blockedEntries);
  if (doc.nodes.length > 0 && (objectives.length < CTF_OBJECTIVES || entries.length < 2)) {
    warn('info', 'NO_CTF', `Capture du drapeau indisponible : il faut ${CTF_OBJECTIVES} cases objectif praticables (${objectives.length}) et 2 cases d’entrée (${entries.length}).`);
  }

  if (doc.layout) {
    const zones = new Set([...doc.layout.rooms.map((r) => r.id), ...doc.layout.corridors.map((c) => c.id)]);
    const outside = doc.nodes.filter((n) => zoneAt(doc.layout, n) === undefined).map((n) => n.id);
    if (outside.length > 0) warn('warning', 'OUTSIDE_LAYOUT', `${outside.length} case(s) hors des pièces et couloirs : les murs 3D les couperont.`, outside);
    const unknown = doc.nodes.filter((n) => n.zoneId !== undefined && !zones.has(n.zoneId)).map((n) => n.id);
    if (unknown.length > 0) warn('warning', 'UNKNOWN_ZONE', `${unknown.length} case(s) rattachée(s) à une zone absente du plan.`, unknown);
    for (const room of doc.layout.rooms) {
      if (!doc.nodes.some((n) => n.zoneId === room.id)) warn('info', 'EMPTY_ROOM', `La pièce ${room.id} n’a aucune case.`);
      if (room.nameKey && !hasTranslation(room.nameKey)) warn('info', 'UNTRANSLATED', `Nom de pièce sans traduction : ${room.nameKey} (affiché tel quel).`);
    }
  }
  const usedDoors = new Set(doc.edges.flatMap((e) => (e.doorId ? [e.doorId] : [])));
  for (const door of doc.doors ?? []) if (!usedDoors.has(door.id)) warn('warning', 'UNUSED_DOOR', `La porte ${door.id} n’est posée sur aucune arête.`);
  if (!hasTranslation(doc.nameKey)) warn('info', 'UNTRANSLATED', `Nom du plateau sans traduction : ${doc.nameKey} (l’écran de mise en place affichera ${doc.id}).`);
  return out;
}

export const hasErrors = (diagnostics: readonly Diagnostic[]): boolean => diagnostics.some((d) => d.level === 'error');
