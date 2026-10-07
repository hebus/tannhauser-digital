import type { BannerPlan, BannerText } from '@tannhauser/renderer';
import { hasKey, t } from './i18n';
import type { Labeler } from './labels';

/** Titre + sous-titre (localisés) des bannières animées du plateau. Pur : plan + noms lisibles → textes. */
export function bannerText(plan: BannerPlan, labels: Labeler): BannerText {
  const player = plan.playerId ? labels.player(plan.playerId) : null;
  switch (plan.kind) {
    case 'turnStart':
      return {
        title: t('banner.turnStart.title', { n: plan.turn }),
        subtitle: player ? t('banner.turnStart.subtitle', { player }) : t('banner.turnStart.subtitleNoPlayer'),
      };
    case 'overwatchPhase':
      return { title: t('banner.overwatchPhase.title'), subtitle: t('banner.overwatchPhase.subtitle', { player: player ?? '—' }) };
    case 'activationPhase':
      return { title: t('banner.activationPhase.title'), subtitle: t('banner.activationPhase.subtitle', { player: player ?? '—' }) };
    case 'turnOf':
      return { title: t('banner.turnOf.title', { player: player ?? '—' }), subtitle: t('banner.turnOf.subtitle') };
    case 'reaction':
      return {
        title: t('banner.reaction.title'),
        subtitle:
          plan.overwatcherId && plan.targetId
            ? t('banner.reaction.subtitle', { overwatcher: labels.character(plan.overwatcherId), target: labels.character(plan.targetId) })
            : t('banner.reaction.subtitleNoTarget', { player: player ?? '—' }),
      };
    case 'victory':
      return {
        title: t('banner.victory.title'),
        // Sous-titre propre à la raison de victoire quand il existe (ex. drapeaux plantés), sinon le texte générique.
        subtitle: player ? t(plan.reason && hasKey(`banner.victory.subtitle.${plan.reason}`) ? `banner.victory.subtitle.${plan.reason}` : 'banner.victory.subtitle', { player }) : t('banner.victory.subtitleNoPlayer'),
      };
  }
}
