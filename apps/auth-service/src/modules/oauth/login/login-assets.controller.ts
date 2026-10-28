import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '@medcenter/common';

import { ONEST_CYRILLIC_WOFF2_BASE64, ONEST_LATIN_WOFF2_BASE64 } from './login-fonts';
import { LOGIN_FONT_FILES } from './login-page';

/** Looked up by exact name in a fixed map: nothing of the request reaches a file path, so there is no traversal to guard. */
const FONTS: ReadonlyMap<string, Buffer> = new Map([
  [LOGIN_FONT_FILES.cyrillic, Buffer.from(ONEST_CYRILLIC_WOFF2_BASE64, 'base64')],
  [LOGIN_FONT_FILES.latin, Buffer.from(ONEST_LATIN_WOFF2_BASE64, 'base64')],
]);

const ONE_YEAR_SECONDS = 31_536_000;

/**
 * The fonts of the login page (assumption UI-1). The page's CSP allows only this origin, so the same Onest the web client
 * uses is served from here. Static page furniture, not part of the API, hence outside the OpenAPI document. The files never change under a name, hence a year of caching marked immutable.
 */
@ApiExcludeController()
@Controller('oauth/assets/fonts')
export class LoginAssetsController {
  @Public()
  @Get(':file')
  font(@Param('file') file: string, @Res() response: Response): void {
    const bytes = FONTS.get(file);
    if (bytes === undefined) {
      throw new NotFoundException();
    }
    response
      .status(200)
      .set({
        'Content-Type': 'font/woff2',
        'Content-Length': String(bytes.length),
        'Cache-Control': `public, max-age=${ONE_YEAR_SECONDS}, immutable`,
        'X-Content-Type-Options': 'nosniff',
      })
      .send(bytes);
  }
}
