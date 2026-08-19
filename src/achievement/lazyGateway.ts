import type { AchievementGateway } from './types';

let loaded: Promise<AchievementGateway> | null = null;

const gateway = () => {
  loaded ??= import('./firebaseGateway').then(module => module.firebaseAchievementGateway);
  return loaded;
};

export const lazyAchievementGateway: AchievementGateway = {
  load: (...args) => gateway().then(value => value.load(...args)),
  finish: (...args) => gateway().then(value => value.finish(...args)),
  revokeReuse: (...args) => gateway().then(value => value.revokeReuse(...args))
};
