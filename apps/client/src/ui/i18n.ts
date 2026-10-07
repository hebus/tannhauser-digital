/**
 * Localisation minimale de l'interface : clés plates, paramètres `{nom}`, repli locale → français → clé.
 * Aucun texte joueur ne doit être écrit en dur dans la logique : on passe par `t('clé')`.
 * Les messages de règle du moteur (`RuleError.message`, `explainCombat`) restent en français ;
 * `reasonText` propose une traduction par code de règle quand elle existe.
 */
export type Locale = 'fr' | 'en';
export type Messages = Readonly<Record<string, string>>;
export type Params = Readonly<Record<string, string | number>>;

export const FR: Messages = {
  'app.title': 'Tannhäuser Digital',

  // Statut
  'status.turn': 'Tour {n}',
  'status.activePlayer': 'Joue : {player}',
  'status.commandPoints': 'Points de commandement',
  'status.pc': '{n} PC',
  'status.activeCharacter': 'Personnage actif',
  'status.noActive': 'Aucun personnage activé',
  'status.health': 'Santé {current}/{max}',
  'status.stats': 'Caractéristiques',
  'status.stat.combat': 'Combat',
  'status.stat.physical': 'Physique',
  'status.stat.mental': 'Mental',
  'status.stat.combat.short': 'C',
  'status.stat.physical.short': 'P',
  'status.stat.mental.short': 'M',
  'status.movementLeft': 'PM restants : {n}',
  'status.action.available': 'Action : disponible',
  'status.action.used': 'Action : utilisée',
  'status.overwatch': 'En Overwatch',
  'status.finished': 'Partie terminée',
  'status.reaction': 'Réaction en attente',
  'status.seed': 'Graine : {seed}',
  'status.seed.copy': 'Copier le lien de rejeu',
  'status.seed.copied': 'Lien copié.',
  'status.hint.select': 'Choisissez un personnage à activer.',

  // Actions
  'actions.title': 'Actions',
  'actions.roster': 'Personnages à activer',
  'actions.rosterEmpty': 'Aucun personnage à activer.',
  'action.SELECT': 'Activer',
  'action.MOVE': 'Se déplacer',
  'action.ATTACK': 'Attaquer',
  'action.OVERWATCH': 'Overwatch',
  'action.OPEN_DOOR': 'Ouvrir une porte',
  'action.CLOSE_DOOR': 'Fermer une porte',
  'action.END_ACTIVATION': "Fin d'activation",
  'action.PASS': 'Passer',
  'actions.move.title': 'Choisir une destination',
  'actions.attack.title': 'Choisir une cible et une arme',
  'actions.door.title': 'Choisir une porte',
  'actions.cancel': 'Annuler',
  'actions.move.option': '{node} ({cost} PM)',
  'actions.attack.option': '{target} — {weapon}',
  'actions.door.option': 'Porte {door}',
  'actions.key': 'Raccourci : {key}',
  'actions.unavailable': 'Indisponible',
  'actions.accepted.move': '{name} se déplace.',
  'actions.refused': 'Refusé : {reason}',

  // Réaction
  'reaction.title': "Réaction d'Overwatch",
  'reaction.text': '{overwatcher} voit {target} : tirer ?',
  'reaction.waitingFor': 'Au tour de {player} de répondre.',
  'reaction.fire': 'Tirer ({weapon})',
  'reaction.decline': 'Refuser',
  'reaction.cannotFire': 'Tir impossible : {reason}',

  // Saisies ignorées
  'input.reactionPending': "Une réaction d'Overwatch attend votre réponse : Tirer ou Refuser.",
  'input.gameFinished': 'La partie est terminée.',
  'input.noActive': "Sélectionnez d'abord un de vos personnages dans la liste ou sur le plateau.",
  'input.nothingHere': "Rien à faire sur cette case : elle n'est ni atteignable ni occupée par une cible.",
  'input.noReaction': "Aucune réaction d'Overwatch à résoudre.",

  // Journal
  'log.title': 'Journal de combat',
  'log.collapse': 'Replier le journal',
  'log.expand': 'Déplier le journal',
  'log.empty': 'Rien à signaler pour le moment.',
  'log.exchange': '{attacker} attaque {target} ({weapon}) : {result}',
  'log.exchange.hit': '{wounds} dégât(s)',
  'log.exchange.missed': 'aucun dégât',
  'log.exchange.defeated': 'hors de combat',
  'log.details': 'Détail du jet',
  'log.event.GAME_STARTED': 'La partie commence.',
  'log.event.TURN_STARTED': 'Tour {turn}.',
  'log.event.COMMAND_POINTS_REFRESHED': '{player} : {amount} PC.',
  'log.event.INITIATIVE_ROLLED': 'Initiative : {winner} ({rolls}).',
  'log.event.INITIATIVE_CHANGED': "{winner} prend l'initiative.",
  'log.event.CHARACTER_ACTIVATION_STARTED': '{character} est activé.',
  'log.event.CHARACTER_MOVED': '{character} se déplace ({cost} PM) vers {node}.',
  'log.event.CHARACTER_ACTIVATION_ENDED': '{character} termine son activation.',
  'log.event.OVERWATCH_PLACED': '{character} se met en Overwatch.',
  'log.event.OVERWATCH_TRIGGERED': 'Overwatch : {overwatcher} voit {target} en {node}.',
  'log.event.OVERWATCH_RESOLVED.fired': "{overwatcher} tire en réaction.",
  'log.event.OVERWATCH_RESOLVED.declined': "{overwatcher} renonce à tirer.",
  'log.event.DOOR_OPENED': '{character} ouvre la porte {door}.',
  'log.event.DOOR_CLOSED': '{character} ferme la porte {door}.',
  'log.event.PLAYER_PASSED': '{player} passe.',
  'log.event.TURN_ENDED': 'Fin du tour {turn}.',
  'log.event.CHARACTER_DEFEATED': '{character} est hors de combat.',
  'log.event.VICTORY': 'Victoire de {winner} !',
  'log.refusal': '✖ {reason}',

  // Menu / fin de partie
  'menu.button': 'Menu',
  'menu.title': 'Nouvelle partie',
  'menu.replay': 'Rejouer avec la même graine',
  'menu.new': 'Nouvelle configuration',
  'menu.close': 'Fermer',
  'end.victory': 'Victoire de {winner}',
  'end.reason.DEATHMATCH_ELIMINATION': "Tous les adversaires sont hors de combat.",
  'end.replay': 'Rejouer (même graine)',
  'end.new': 'Nouvelle partie',
  'end.dismiss': 'Voir le plateau',

  // Mise en place
  'setup.title': 'Mise en place',
  'setup.subtitle': 'Choisissez le plateau, les équipes et la graine, puis démarrez.',
  'setup.board': 'Plateau',
  'setup.team': 'Équipe de {player}',
  'setup.teamHint': 'Cochez les personnages (1 à {max}).',
  'setup.seed': 'Graine aléatoire (nombre entier)',
  'setup.seed.random': 'Aléatoire',
  'setup.seed.hint': 'La même graine rejoue exactement la même partie.',
  'setup.start': 'Démarrer',
  'setup.errors': 'Configuration invalide',
  'setup.preset.2v2': 'Équipes 2 contre 2',
  'setup.character': '{name} ({kind})',
  'kind.HERO': 'Héros',
  'kind.TROOP': 'Troupe',

  // Erreurs de configuration
  'setupError.UNKNOWN_BOARD': 'Plateau inconnu : {id}.',
  'setupError.TEAM_COUNT': 'Il faut exactement deux joueurs.',
  'setupError.TEAM_EMPTY': '{player} doit avoir au moins un personnage.',
  'setupError.TEAM_TOO_LARGE': '{player} ne peut pas aligner plus de {max} personnages.',
  'setupError.UNKNOWN_CHARACTER': 'Personnage inconnu : {id}.',
  'setupError.DUPLICATE_CHARACTER': '{player} a choisi deux fois {id}.',
  'setupError.BAD_SEED': 'La graine doit être un entier entre 0 et {max}.',
  'setupError.NOT_ENOUGH_NODES': "Le plateau n'a pas assez de cases pour {n} personnages.",

  // Noms de contenu
  'player.p1': 'Joueur 1',
  'player.p2': 'Joueur 2',
  'board.dev.name': 'Plateau de développement',
  'faction.alpha.name': 'Alpha',
  'faction.beta.name': 'Bêta',
  'char.alpha.hero.name': 'Héros Alpha',
  'char.alpha.troop.name': 'Troupe Alpha',
  'char.beta.hero.name': 'Héros Bêta',
  'char.beta.troop.name': 'Troupe Bêta',
  'weapon.unarmed.name': 'Mains nues',
  'weapon.melee.name': 'Corps à corps',
  'weapon.pistol.name': 'Pistolet',
  'weapon.mental.name': 'Arme mentale',
  'weapon.automatic.name': 'Arme automatique',

  // Raisons du moteur (clé = code de règle ; repli : message français du moteur)
  'reason.ACTION_ALREADY_USED': 'Impossible : l’unique action de l’activation est déjà utilisée.',
  'reason.NO_TARGET_IN_RANGE': 'Impossible : aucun ennemi à portée.',
  'reason.NO_ENEMY': 'Impossible : aucun ennemi en jeu.',
  'reason.NO_WEAPON': 'Impossible : aucune arme.',
  'reason.NO_MOVEMENT_LEFT': 'Impossible : plus aucun point de mouvement.',
  'reason.NO_REACHABLE_NODE': 'Impossible : aucune case atteignable.',
  'reason.NO_ADJACENT_DOOR': 'Impossible : aucune porte adjacente.',
  'reason.DOOR_ALREADY_OPEN': 'Impossible : la porte est déjà ouverte.',
  'reason.DOOR_ALREADY_CLOSED': 'Impossible : la porte est déjà fermée.',
  'reason.REACTION_PENDING': "Impossible : une réaction d'Overwatch est en attente.",
  'reason.GAME_FINISHED': 'La partie est terminée.',
  'reason.NOT_ACTIVE_CHARACTER': "Impossible : sélectionnez d'abord ce personnage.",
  'reason.NO_ACTIVE_CHARACTER': "Impossible : aucune activation en cours.",
  'reason.ACTIVATION_IN_PROGRESS': "Impossible : une activation est en cours (terminez-la d'abord).",
  'reason.ALREADY_ACTIVATED': 'Impossible : ce personnage a déjà été activé ce tour.',
  'reason.NOT_YOUR_TURN': "Impossible : ce n'est pas votre tour.",
  'reason.NOT_ACTIVE_PLAYER': "Impossible : ce n'est pas votre tour.",
  'reason.ALREADY_OVERWATCH': 'Impossible : déjà en Overwatch.',
  'reason.CHARACTERISTIC_ZERO': 'Impossible : Combat à 0.',
  'reason.NO_LINE_OF_SIGHT': 'Impossible : aucune ligne de vue sur la cible.',
  'reason.OUT_OF_RANGE': 'Impossible : cible hors de portée.',
  'reason.NOT_ADJACENT': 'Impossible : le corps à corps exige une cible adjacente.',
  'reason.CHARACTER_DEAD': 'Impossible : personnage hors de combat.',
};

export const EN: Messages = {
  'app.title': 'Tannhäuser Digital',
  'status.turn': 'Turn {n}',
  'status.activePlayer': 'Playing: {player}',
  'status.commandPoints': 'Command points',
  'status.pc': '{n} CP',
  'status.activeCharacter': 'Active character',
  'status.noActive': 'No character activated',
  'status.health': 'Health {current}/{max}',
  'status.stats': 'Stats',
  'status.stat.combat': 'Combat',
  'status.stat.physical': 'Physical',
  'status.stat.mental': 'Mental',
  'status.stat.combat.short': 'C',
  'status.stat.physical.short': 'P',
  'status.stat.mental.short': 'M',
  'status.movementLeft': 'Movement left: {n}',
  'status.action.available': 'Action: available',
  'status.action.used': 'Action: used',
  'status.overwatch': 'On Overwatch',
  'status.finished': 'Game over',
  'status.reaction': 'Reaction pending',
  'status.seed': 'Seed: {seed}',
  'status.seed.copy': 'Copy replay link',
  'status.seed.copied': 'Link copied.',
  'status.hint.select': 'Pick a character to activate.',
  'actions.title': 'Actions',
  'actions.roster': 'Characters to activate',
  'actions.rosterEmpty': 'No character left to activate.',
  'action.SELECT': 'Activate',
  'action.MOVE': 'Move',
  'action.ATTACK': 'Attack',
  'action.OVERWATCH': 'Overwatch',
  'action.OPEN_DOOR': 'Open a door',
  'action.CLOSE_DOOR': 'Close a door',
  'action.END_ACTIVATION': 'End activation',
  'action.PASS': 'Pass',
  'actions.move.title': 'Choose a destination',
  'actions.attack.title': 'Choose a target and a weapon',
  'actions.door.title': 'Choose a door',
  'actions.cancel': 'Cancel',
  'actions.key': 'Shortcut: {key}',
  'actions.unavailable': 'Unavailable',
  'actions.refused': 'Refused: {reason}',
  'reaction.title': 'Overwatch reaction',
  'reaction.text': '{overwatcher} sees {target}: fire?',
  'reaction.waitingFor': '{player} must answer.',
  'reaction.fire': 'Fire ({weapon})',
  'reaction.decline': 'Decline',
  'reaction.cannotFire': 'Cannot fire: {reason}',
  'log.title': 'Combat log',
  'log.collapse': 'Collapse the log',
  'log.expand': 'Expand the log',
  'log.empty': 'Nothing to report yet.',
  'log.details': 'Roll details',
  'menu.button': 'Menu',
  'menu.title': 'New game',
  'menu.replay': 'Replay with the same seed',
  'menu.new': 'New setup',
  'menu.close': 'Close',
  'end.victory': '{winner} wins',
  'end.replay': 'Replay (same seed)',
  'end.new': 'New game',
  'setup.title': 'Game setup',
  'setup.subtitle': 'Pick the board, the teams and the seed, then start.',
  'setup.board': 'Board',
  'setup.team': 'Team of {player}',
  'setup.teamHint': 'Tick characters (1 to {max}).',
  'setup.seed': 'Random seed (integer)',
  'setup.seed.random': 'Random',
  'setup.seed.hint': 'The same seed replays exactly the same game.',
  'setup.start': 'Start',
  'setup.errors': 'Invalid setup',
  'kind.HERO': 'Hero',
  'kind.TROOP': 'Troop',
  'player.p1': 'Player 1',
  'player.p2': 'Player 2',
  'board.dev.name': 'Development board',
  'char.alpha.hero.name': 'Alpha Hero',
  'char.alpha.troop.name': 'Alpha Troop',
  'char.beta.hero.name': 'Beta Hero',
  'char.beta.troop.name': 'Beta Troop',
  'weapon.unarmed.name': 'Unarmed',
  'weapon.melee.name': 'Melee',
  'weapon.pistol.name': 'Pistol',
  'weapon.mental.name': 'Mental weapon',
  'weapon.automatic.name': 'Automatic weapon',
  'reason.ACTION_ALREADY_USED': 'Impossible: the single action of this activation is already used.',
  'reason.NO_TARGET_IN_RANGE': 'Impossible: no enemy in range.',
  'reason.NO_ENEMY': 'Impossible: no enemy in play.',
  'reason.NO_MOVEMENT_LEFT': 'Impossible: no movement points left.',
  'reason.NO_REACHABLE_NODE': 'Impossible: no reachable node.',
  'reason.NO_ADJACENT_DOOR': 'Impossible: no adjacent door.',
  'reason.REACTION_PENDING': 'Impossible: an Overwatch reaction is pending.',
  'reason.GAME_FINISHED': 'The game is over.',
  'reason.NOT_ACTIVE_CHARACTER': 'Impossible: select this character first.',
  'reason.ACTIVATION_IN_PROGRESS': 'Impossible: an activation is in progress (end it first).',
  'reason.NOT_YOUR_TURN': 'Impossible: it is not your turn.',
};

const DICTIONARIES: Record<Locale, Messages> = { fr: FR, en: EN };

let current: Locale = 'fr';

export function setLocale(locale: Locale): void {
  current = locale;
}

export function getLocale(): Locale {
  return current;
}

/** Locale demandée par `?lang=en|fr` ; français par défaut. */
export function detectLocale(search: string): Locale {
  const lang = new URLSearchParams(search).get('lang');
  return lang === 'en' || lang === 'fr' ? lang : 'fr';
}

function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/** Traduit une clé : locale courante, puis français, puis la clé elle-même (jamais de texte vide). */
export function t(key: string, params?: Params, locale: Locale = current): string {
  return interpolate(DICTIONARIES[locale][key] ?? FR[key] ?? key, params);
}

/** Vrai si la clé existe au moins en français. */
export function hasKey(key: string): boolean {
  return key in FR;
}

/** Message d'un refus du moteur : traduction par code si connue, sinon texte français du moteur. */
export function reasonText(code: string | undefined, engineMessage: string | undefined, locale: Locale = current): string {
  if (code !== undefined) {
    const key = `reason.${code}`;
    const found = DICTIONARIES[locale][key] ?? (locale === 'fr' ? FR[key] : undefined);
    if (found) return found;
  }
  return engineMessage ?? t('actions.unavailable', undefined, locale);
}
