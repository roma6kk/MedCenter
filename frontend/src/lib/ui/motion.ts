// The global prefers-reduced-motion rule covers CSS only: smooth scrolls started from script go through here.
export function motionSafeScrollBehavior(): 'smooth' | 'auto' {
  const isReduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return isReduced ? 'auto' : 'smooth';
}
