import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Exempts a route from `JwtAuthGuard` — only for genuinely public endpoints. */
export const Public = (): MethodDecorator => SetMetadata(IS_PUBLIC_KEY, true);
