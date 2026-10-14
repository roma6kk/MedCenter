export type OAuthStep = 'authorize' | 'login' | 'token';

/** A failed step of the programmatic login; the message never carries a credential. */
export class OAuthFlowError extends Error {
  constructor(
    readonly step: OAuthStep,
    message: string,
  ) {
    super(`OAuth ${step} step failed: ${message}`);
    this.name = 'OAuthFlowError';
  }
}
