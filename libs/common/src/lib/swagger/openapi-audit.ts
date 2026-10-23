import type { Type } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';

interface ModuleMetadataLike {
  readonly module?: Type<unknown>;
  readonly controllers?: Type<unknown>[];
  readonly imports?: unknown[];
}

/**
 * Every controller reachable from `root` through `@Module({ imports })` (dynamic modules included),
 * without starting any provider. Lets a unit test build a service's OpenAPI document from a bare
 * `Test.createTestingModule({ controllers })` with auto-mocked dependencies.
 */
export function collectModuleControllers(root: Type<unknown> | ModuleMetadataLike): Type<unknown>[] {
  const seen = new Set<unknown>();
  const controllers = new Set<Type<unknown>>();
  const visit = (entry: unknown): void => {
    if (entry === undefined || entry === null || seen.has(entry)) {
      return;
    }
    seen.add(entry);
    if (entry instanceof Promise) {
      return;
    }
    const dynamic = typeof entry === 'object' ? (entry as ModuleMetadataLike) : undefined;
    const moduleClass = dynamic?.module ?? (typeof entry === 'function' ? (entry as Type<unknown>) : undefined);
    const own = (moduleClass ? (Reflect.getMetadata('controllers', moduleClass) as Type<unknown>[] | undefined) : undefined) ?? [];
    const imports = (moduleClass ? (Reflect.getMetadata('imports', moduleClass) as unknown[] | undefined) : undefined) ?? [];
    [...own, ...(dynamic?.controllers ?? [])].forEach((controller) => controllers.add(controller));
    [...imports, ...(dynamic?.imports ?? [])].forEach(visit);
  };
  visit(root);
  return [...controllers];
}

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head'] as const;

/**
 * API §10 conventions, checked on a built document: every operation has a tag, a summary and a
 * 2xx/3xx response. Returns one line per violation (empty = conforming).
 */
export function findUndocumentedOperations(document: OpenAPIObject): string[] {
  const problems: string[] = [];
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = item[method];
      if (!operation) {
        continue;
      }
      const label = `${method.toUpperCase()} ${path}`;
      if (!operation.tags || operation.tags.length === 0) {
        problems.push(`${label}: no @ApiTags`);
      }
      if (!operation.summary) {
        problems.push(`${label}: no @ApiOperation summary`);
      }
      if (!Object.keys(operation.responses ?? {}).some((status) => /^[23]/.test(status))) {
        problems.push(`${label}: no success @ApiResponse`);
      }
    }
  }
  return problems;
}
