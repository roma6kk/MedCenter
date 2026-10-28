import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';

import { LoginAssetsController } from './login-assets.controller';
import { LOGIN_FONT_FILES } from './login-page';

function fakeResponse(): { readonly response: Response; readonly sent: Buffer[]; readonly headers: Record<string, string> } {
  const sent: Buffer[] = [];
  const headers: Record<string, string> = {};
  const response: Record<string, unknown> = {
    status: (): unknown => response,
    set: (values: Record<string, string>): unknown => {
      Object.assign(headers, values);
      return response;
    },
    send: (body: Buffer): void => {
      sent.push(body);
    },
  };
  return { response: response as unknown as Response, sent, headers };
}

describe('LoginAssetsController', () => {
  const controller = new LoginAssetsController();

  it.each(Object.values(LOGIN_FONT_FILES))('should serve %s as a long-cached WOFF2 when its name is asked for', (file) => {
    const { response, sent, headers } = fakeResponse();

    controller.font(file, response);

    expect(headers['Content-Type']).toBe('font/woff2');
    expect(headers['Cache-Control']).toContain('immutable');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    // WOFF2 magic number: the base64 text decoded to a real font, not to garbage.
    expect(sent[0]?.subarray(0, 4).toString('latin1')).toBe('wOF2');
  });

  it.each(['../../etc/passwd', 'onest-cyrillic.woff', ''])('should answer 404 when %p is asked for', (file) => {
    const { response } = fakeResponse();

    expect(() => controller.font(file, response)).toThrow(NotFoundException);
  });
});
