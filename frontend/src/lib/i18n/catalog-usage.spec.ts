import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC: string = join(__dirname, '..', '..');

type Catalog = { readonly [key: string]: string | Catalog };

const RU: Catalog = JSON.parse(readFileSync(join(SRC, 'messages', 'ru.json'), 'utf8')) as Catalog;

/**
 * Keys that are put together at run time, so their last segment never stands in the code as it is: `t(`path${step}Title`)`,
 * `t(`${key}Hint`)`, or a value of a FHIR enum that the API sends. A key goes here only with the reason.
 */
const COMPOSED: ReadonlyArray<string> = [
  // home-path.tsx: t(`path${step}Title`), t(`path${step}Text`)
  'home.path1Title',
  'home.path1Text',
  'home.path2Title',
  'home.path2Text',
  'home.path3Title',
  'home.path3Text',
  'home.path4Title',
  'home.path4Text',
  // prescription-list.tsx: t(`${key}Hint`)
  'patientPrescriptions.emptyActiveHint',
  'patientPrescriptions.emptyClosedHint',
  // values of FHIR enums that the API sends, looked up by value: MedicationRequest.status and ContactPoint.system
  'patient.prescriptions.status.on-hold',
  'doctor.patient.telecom.sms',
];

function leafKeys(node: Catalog, prefix: string = ''): ReadonlyArray<string> {
  return Object.entries(node).flatMap(([key, value]) => (typeof value === 'string' ? [`${prefix}${key}`] : leafKeys(value, `${prefix}${key}.`)));
}

/** The application code: every .ts/.tsx under `src` except the catalogues and the specs (a key only a test mentions is dead). */
function codeFiles(dir: string): ReadonlyArray<string> {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path: string = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'messages' ? [] : codeFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.(spec|test)\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('message catalogue usage', () => {
  it('should hold no key whose name is nowhere in the code, so a table that moved to another control leaves no labels behind', () => {
    const code: string = codeFiles(SRC)
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    const unused: ReadonlyArray<string> = leafKeys(RU).filter((key) => {
      const name: string = key.slice(key.lastIndexOf('.') + 1);
      return !new RegExp(`(?<![\\w-])${escapeRegExp(name)}(?![\\w-])`).test(code) && !COMPOSED.includes(key);
    });

    expect(unused).toEqual([]);
  });

  it('should list only keys that exist when a key is allowed as composed at run time', () => {
    const keys: ReadonlyArray<string> = leafKeys(RU);

    expect(COMPOSED.filter((key) => !keys.includes(key))).toEqual([]);
  });
});
