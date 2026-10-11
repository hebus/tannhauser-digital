/**
 * Mode paysage sur mobile. Le verrouillage d'orientation n'est autorisé par les navigateurs qu'après un geste de
 * l'utilisateur et, sur Android, en plein écran ; iOS ne le permet pas. On tente donc le verrouillage au premier
 * toucher et, quand il échoue, l'avis « tournez l'appareil » (#rotate, CSS en portrait sur écran tactile) prend le relais.
 */
export function enforceLandscape(): void {
  if (!window.matchMedia('(pointer: coarse)').matches) return;
  const tryLock = async (): Promise<void> => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
    } catch {
      // Refus (iOS, navigateur de bureau, plein écran interdit) : l'avis de rotation reste la solution.
    }
  };
  window.addEventListener('pointerdown', () => void tryLock(), { once: true });
}
