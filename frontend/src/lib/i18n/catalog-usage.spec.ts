import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC: string = join(__dirname, '..', '..');

type Catalog = { readonly [key: string]: string | Catalog };

const RU: Catalog = JSON.parse(readFileSync(join(SRC, 'messages', 'ru.json'), 'utf8')) as Catalog;

const COMPOSED: ReadonlyArray<string> = [
  'home.path1Title',
  'home.path1Text',
  'home.path2Title',
  'home.path2Text',
  'home.path3Title',
  'home.path3Text',
  'home.path4Title',
  'home.path4Text',
  'patientPrescriptions.emptyActiveHint',
  'patientPrescriptions.emptyClosedHint',
  'patient.prescriptions.status.on-hold',
  'doctor.patient.telecom.sms',
];

function leafKeys(node: Catalog, prefix: string = ''): ReadonlyArray<string> {
  return Object.entries(node).flatMap(([key, value]) => (typeof value === 'string' ? [`${prefix}${key}`] : leafKeys(value, `${prefix}${key}.`)));
}

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
