import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const SRC: string = join(__dirname, '..', '..');

type Catalog = { readonly [key: string]: string | Catalog };

const CATALOGS: Readonly<Record<'ru' | 'en', Catalog>> = {
  ru: JSON.parse(readFileSync(join(SRC, 'messages', 'ru.json'), 'utf8')) as Catalog,
  en: JSON.parse(readFileSync(join(SRC, 'messages', 'en.json'), 'utf8')) as Catalog,
};

function resolves(catalog: Catalog, path: string): boolean {
  let node: string | Catalog | undefined = catalog;
  for (const segment of path.split('.')) {
    if (typeof node !== 'object') return false;
    node = node[segment];
  }
  return typeof node === 'string';
}

function codeFiles(dir: string): ReadonlyArray<string> {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path: string = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'messages' || entry.name === 'node_modules' ? [] : codeFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.(spec|test)\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function scopeOf(node: ts.Node): ts.Node {
  let current: ts.Node = node.parent;
  while (!ts.isBlock(current) && !ts.isSourceFile(current) && !ts.isArrowFunction(current) && !ts.isFunctionDeclaration(current) && !ts.isFunctionExpression(current)) {
    current = current.parent;
  }
  return current;
}

function usedKeys(file: string): ReadonlyArray<string> {
  const source: ts.SourceFile = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const declared = new Map<ts.Node, Map<string, string>>();
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined && ts.isCallExpression(node.initializer)) {
      const call: ts.CallExpression = node.initializer;
      const arg: ts.Expression | undefined = call.arguments[0];
      if (ts.isIdentifier(call.expression) && call.expression.text === 'useT' && arg !== undefined && ts.isStringLiteralLike(arg)) {
        const scope: ts.Node = scopeOf(node);
        declared.set(scope, (declared.get(scope) ?? new Map<string, string>()).set(node.name.text, arg.text));
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.arguments[0] !== undefined && ts.isStringLiteralLike(node.arguments[0])) calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls.flatMap((call) => {
    const name: string = (call.expression as ts.Identifier).text;
    for (let current: ts.Node | undefined = call.parent; current !== undefined; current = current.parent) {
      const namespace: string | undefined = declared.get(current)?.get(name);
      if (namespace !== undefined) return [`${namespace}.${(call.arguments[0] as ts.StringLiteralLike).text}`];
    }
    return [];
  });
}

describe('message catalogue keys that the code asks for', () => {
  it('should find every literal t(key) of a useT namespace in both catalogues, so a typo is not shown to the user as a raw path', () => {
    const missing: string[] = [];
    for (const file of codeFiles(SRC)) {
      for (const key of usedKeys(file)) {
        for (const language of ['ru', 'en'] as const) {
          if (!resolves(CATALOGS[language], key)) missing.push(`${language}: ${key} (${file.slice(SRC.length + 1)})`);
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
