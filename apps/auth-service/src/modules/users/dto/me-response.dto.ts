import type { UserDetailsResponseDto } from './user-response.dto';

export interface AccountConsentDto {
  readonly at: string;
  readonly version: string;
}

export interface MeResponseDto extends UserDetailsResponseDto {
  readonly accountConsent: AccountConsentDto | null;
}
