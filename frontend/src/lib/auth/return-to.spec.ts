import { sanitizeReturnTo, parsePkceCookie } from './return-to';

describe('sanitizeReturnTo', () => {
  it.each([
    ['/booking'],
    ['/appointments/123'],
    ['/doctor/appointments?date=2026-10-05'],
    ['/booking#step-4'],
  ])('should allow same-origin path %s', (path) => {
    expect(sanitizeReturnTo(path)).toBe(path);
  });

  it.each([
    ['https://evil.example.com/phish', 'absolute URL with scheme'],
    ['http://evil.example.com', 'http scheme'],
    ['//evil.example.com/phish', 'protocol-relative URL'],
    ['///evil.example.com', 'triple-slash escape'],
    ['javascript:alert(1)', 'javascript scheme'],
    ['JaVaScRiPt:alert(1)', 'mixed-case javascript scheme'],
    ['data:text/html,<h1>x</h1>', 'data scheme'],
    ['vbscript:msgbox(1)', 'vbscript scheme'],
    ['https%3A%2F%2Fevil.example.com', 'encoded absolute URL'],
    ['%2F%2Fevil.example.com%2Fphish', 'encoded protocol-relative URL'],
    ['/\\evil.example.com', 'backslash escape'],
    ['/booking\\..\\admin', 'embedded backslash'],
    ['/https://evil.example.com', 'embedded scheme after slash'],
    ['https:evil', 'bare scheme without slashes'],
    ['/login\nSet-Cookie: x=1', 'header-splitting newline'],
    ['/booking\r\n', 'carriage return'],
    ['/book ing', 'space in path segment'],
    ['/booking<script>', 'angle brackets'],
    ['/booking"onmouseover="x', 'quote breakout'],
    ['', 'empty string'],
    ['   ', 'whitespace only'],
    ['booking', 'relative path without leading slash'],
    ['%E0%A4%A', 'malformed percent-encoding'],
  ])('should fall back to /booking for denylisted input %s (%s)', (input) => {
    expect(sanitizeReturnTo(input)).toBe('/booking');
  });

  it('should return null-safe fallback when input is null or undefined', () => {
    expect(sanitizeReturnTo(null)).toBe('/booking');
    expect(sanitizeReturnTo(undefined)).toBe('/booking');
  });

  it('should honour a custom fallback', () => {
    expect(sanitizeReturnTo('https://evil.example.com', '/login')).toBe('/login');
  });

  it('should decode a single-encoded legitimate path', () => {
    expect(sanitizeReturnTo('%2Fbooking%3Fstep%3D4')).toBe('/booking?step=4');
  });

  it('should reject double-encoded protocol-relative payloads', () => {
    // `%252F` decodes once to `%2F`, which still starts with `%` — not `/`.
    expect(sanitizeReturnTo('%252F%252Fevil.example.com')).toBe('/booking');
  });
});

describe('parsePkceCookie', () => {
  it('should parse a well-formed PKCE cookie', () => {
    const raw = JSON.stringify({ verifier: 'v123', state: 's456' });

    expect(parsePkceCookie(raw)).toEqual({ verifier: 'v123', state: 's456' });
  });

  it.each([
    ['not-json{{', 'malformed JSON'],
    ['"just-a-string"', 'JSON primitive'],
    ['123', 'JSON number'],
    ['null', 'JSON null'],
    [JSON.stringify({ verifier: 'v' }), 'missing state'],
    [JSON.stringify({ state: 's' }), 'missing verifier'],
    [JSON.stringify({ verifier: '', state: 's' }), 'empty verifier'],
    [JSON.stringify({ verifier: 'v', state: '' }), 'empty state'],
    [JSON.stringify({ verifier: 42, state: 's' }), 'non-string verifier'],
  ])('should return null for tampered cookie: %s', (raw) => {
    expect(parsePkceCookie(raw)).toBeNull();
  });

  it('should return null when cookie is missing', () => {
    expect(parsePkceCookie(null)).toBeNull();
    expect(parsePkceCookie(undefined)).toBeNull();
    expect(parsePkceCookie('')).toBeNull();
  });
});
