/** Injected clock, so period defaults ("last 30 days") are testable. */
export type Clock = () => Date;

export const CLOCK = Symbol('CLOCK');

export const systemClock: Clock = () => new Date();
