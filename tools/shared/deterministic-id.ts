import { createHash } from 'node:crypto';

export const SEED_ID_NAMESPACE = 'ae424c0d-0ea9-47ae-80fb-75a33f1f3573';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidV5(name: string, namespace: string = SEED_ID_NAMESPACE): string {
  if (!UUID_PATTERN.test(namespace)) {
    throw new Error(`uuidV5: namespace "${namespace}" is not a UUID`);
  }
  const namespaceBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const bytes = createHash('sha1').update(namespaceBytes).update(name, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

export function seedResourceId(resourceType: string, key: string): string {
  return uuidV5(`${resourceType}/${key}`);
}
