type OAuthStep = 'authorize' | 'login' | 'token';

export class OAuthFlowError extends Error {
  constructor(
    readonly step: OAuthStep,
    message: string,
  ) {
    super(`OAuth ${step} step failed: ${message}`);
    this.name = 'OAuthFlowError';
  }
}
