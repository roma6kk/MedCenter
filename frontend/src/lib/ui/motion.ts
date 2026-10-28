/**
 * The `behavior` for a scroll started from script (`scrollTo`, `scrollIntoView`). The global `prefers-reduced-motion` rule of
 * `globals.css` covers CSS motion only; a smooth scroll asked for in script ignores it, so every such call goes through here.
 */
export function motionSafeScrollBehavior(): 'smooth' | 'auto' {
  const isReduced: boolean = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return isReduced ? 'auto' : 'smooth';
}
