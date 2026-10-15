import { pipeline, violationsOf } from '../../../__tests__/validation-helper';
import { ImportTerminologyDto } from '../import/dto/import-terminology.dto';
import {
  ExpandByCanonicalQueryDto,
  ExpandQueryDto,
  ValidateCodeQueryDto,
  ValueSetUrlParamDto,
} from './terminology-query.dto';

const ICD10_VALUE_SET = 'https://fhir.by/ValueSet/InternClassificDiseases10';
const ICD10_SYSTEM = 'https://fhir.by/CodeSystem/InternClassificDiseases10';

type Params = Readonly<Record<string, unknown>>;
type InvalidCase = readonly [label: string, input: Params, property: string];

const CANONICAL_CASES: ReadonlyArray<InvalidCase> = [
  ['the canonical is on another host', { system: 'https://evil.example/ValueSet/x' }, 'system'],
  ['the canonical uses plain http', { system: 'http://fhir.by/ValueSet/x' }, 'system'],
  ['the canonical is a CodeSystem', { system: 'https://fhir.by/CodeSystem/x' }, 'system'],
  ['the canonical has a path below the id', { system: `${ICD10_VALUE_SET}/extra` }, 'system'],
  ['the canonical carries a query string', { system: `${ICD10_VALUE_SET}?x=1` }, 'system'],
  ['the canonical id is empty', { system: 'https://fhir.by/ValueSet/' }, 'system'],
  [
    'the canonical id is longer than 100 characters',
    { system: `https://fhir.by/ValueSet/${'a'.repeat(101)}` },
    'system',
  ],
  ['the canonical is missing', {}, 'system'],
];

const PAGING_CASES: ReadonlyArray<InvalidCase> = [
  ['count is zero', { count: '0' }, 'count'],
  ['count is above the maximum of 100', { count: '101' }, 'count'],
  ['count is not a number', { count: 'many' }, 'count'],
  ['offset is negative', { offset: '-1' }, 'offset'],
  ['offset is above the ceiling', { offset: '100001' }, 'offset'],
  ['offset is fractional', { offset: '0.5' }, 'offset'],
  ['filter is longer than 100 characters', { filter: 'x'.repeat(101) }, 'filter'],
];

describe('ExpandQueryDto (paging of both expand routes)', () => {
  it('should accept an empty query because paging and filter are optional', async () => {
    expect(await violationsOf(ExpandQueryDto, {}, 'query')).toEqual([]);
  });

  it('should turn count and offset into numbers when the query carries them as text', async () => {
    const dto = await pipeline(
      ExpandQueryDto,
      { filter: 'j06', count: '5', offset: '10' },
      'query',
    );

    expect(dto).toMatchObject({ filter: 'j06', count: 5, offset: 10 });
  });

  it.each(PAGING_CASES)('should reject the query when %s', async (_label, query, property) => {
    expect((await violationsOf(ExpandQueryDto, query, 'query')).join('; ')).toContain(property);
  });
});

describe('ExpandByCanonicalQueryDto (GET /terminology/expand)', () => {
  it('should accept a ValueSet canonical under https://fhir.by/ValueSet/', async () => {
    expect(
      await violationsOf(ExpandByCanonicalQueryDto, { system: ICD10_VALUE_SET }, 'query'),
    ).toEqual([]);
  });

  it.each(CANONICAL_CASES)('should reject the query when %s', async (_label, query, property) => {
    expect((await violationsOf(ExpandByCanonicalQueryDto, query, 'query')).join('; ')).toContain(
      property,
    );
  });

  it('should still apply the paging limits when the canonical is valid', async () => {
    const violations = await violationsOf(
      ExpandByCanonicalQueryDto,
      { system: ICD10_VALUE_SET, count: '101' },
      'query',
    );

    expect(violations.join('; ')).toContain('count');
  });
});

describe('ValueSetUrlParamDto (GET /terminology/value-sets/{url}/$expand)', () => {
  it('should accept the decoded canonical of a seeded ValueSet', async () => {
    expect(await violationsOf(ValueSetUrlParamDto, { url: ICD10_VALUE_SET }, 'param')).toEqual([]);
  });

  it.each([
    ['another host', 'https://internal.example/ValueSet/x'],
    ['a CodeSystem', ICD10_SYSTEM],
    ['plain text', 'InternClassificDiseases10'],
    ['an empty id', 'https://fhir.by/ValueSet/'],
    ['a path traversal', 'https://fhir.by/ValueSet/../CodeSystem/x'],
  ])('should reject the parameter when it is %s', async (_label, url) => {
    expect((await violationsOf(ValueSetUrlParamDto, { url }, 'param')).join('; ')).toContain('url');
  });
});

describe('ValidateCodeQueryDto (GET /terminology/validate)', () => {
  const INVALID: ReadonlyArray<InvalidCase> = [
    ['system is missing', { code: 'J06.9' }, 'system'],
    ['system is not an http(s) URI', { system: 'urn:oid:2.16.840', code: 'J06.9' }, 'system'],
    ['system contains whitespace', { system: 'https://fhir.by/a b', code: 'J06.9' }, 'system'],
    [
      'system is longer than 255 characters',
      { system: `https://fhir.by/${'a'.repeat(256)}`, code: 'J06.9' },
      'system',
    ],
    ['code is missing', { system: ICD10_SYSTEM }, 'code'],
    ['code is empty', { system: ICD10_SYSTEM, code: '' }, 'code'],
    ['code contains a space', { system: ICD10_SYSTEM, code: 'J06 9' }, 'code'],
    ['code is longer than 64 characters', { system: ICD10_SYSTEM, code: 'J'.repeat(65) }, 'code'],
    ['code is not ASCII', { system: ICD10_SYSTEM, code: 'Ж06.9' }, 'code'],
  ];

  it.each(['J06.9', 'J01FA10', 'Cel', 'mg/dL', '1.4.463'])(
    'should accept the code %s of a seeded system',
    async (code) => {
      expect(
        await violationsOf(ValidateCodeQueryDto, { system: ICD10_SYSTEM, code }, 'query'),
      ).toEqual([]);
    },
  );

  it.each(INVALID)('should reject the query when %s', async (_label, query, property) => {
    expect((await violationsOf(ValidateCodeQueryDto, query, 'query')).join('; ')).toContain(
      property,
    );
  });
});

describe('ImportTerminologyDto (POST /admin/terminology/import)', () => {
  it.each(['1', '1.4', '1.4.463', '1.2.3.4'])(
    'should accept the release number %s',
    async (snapshotVersion) => {
      expect(await violationsOf(ImportTerminologyDto, { snapshotVersion })).toEqual([]);
    },
  );

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['latest', 'latest'],
    ['a pre-release tag', '1.4.463-beta'],
    ['five dotted parts', '1.2.3.4.5'],
    ['longer than 32 characters', `1.${'0'.repeat(40)}`],
    ['a number', 1.4],
    ['JSON null', null],
  ])('should reject the body when snapshotVersion is %s', async (_label, snapshotVersion) => {
    const body = snapshotVersion === undefined ? {} : { snapshotVersion };

    expect((await violationsOf(ImportTerminologyDto, body)).join('; ')).toContain(
      'snapshotVersion',
    );
  });
});
