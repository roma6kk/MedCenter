import type { UserDetailsResponseDto } from './user-response.dto';

/** API §2.2.7 `GET /api/v1/me`: the caller's own account with its `ExternalLink` rows. */
export type MeResponseDto = UserDetailsResponseDto;
