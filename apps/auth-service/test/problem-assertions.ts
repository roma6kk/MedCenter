import type request from 'supertest';

/** RFC 7807 envelope of an error answer: status, catalogued `errorCode` and the correlation id. */
export function expectProblem(response: request.Response, status: number, errorCode: string): void {
  expect(response.status).toBe(status);
  expect(response.headers['content-type']).toContain('application/problem+json');
  expect(response.body).toMatchObject({ status, errorCode });
  expect(response.body.requestId).toEqual(expect.any(String));
}
