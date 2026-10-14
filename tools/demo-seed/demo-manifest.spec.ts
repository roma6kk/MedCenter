import fsPromises, { chmod, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { demoIds } from './demo-ids';
import {
  buildFhirManifest,
  readManifest,
  writeManifest,
  type DemoManifest,
  type DemoUsersSection,
} from './demo-manifest';
import type { DemoFhirSummary } from './seed-demo-fhir';

const SUMMARY: DemoFhirSummary = {
  horizon: { from: '2026-11-02', to: '2026-11-15' },
  writes: {},
  slots: [{ scheduleKey: 'ivanova-primary', scheduleId: demoIds.schedule('ivanova-primary'), planned: 80, created: 8 }],
  seededCounts: {},
};

const USERS: DemoUsersSection = {
  generatedAt: '2026-11-02T10:00:00.000Z',
  authBaseUrl: 'http://localhost:8081',
  accounts: [{ role: 'ADMIN', email: 'admin@medcenter.test', status: 'exists' }],
};

describe('buildFhirManifest', () => {
  const manifest = buildFhirManifest(SUMMARY, 'http://localhost:8080/fhir', '2026-11-02T10:00:00.000Z');

  it('should list the deterministic ids of the clinic, rooms and doctors', () => {
    expect(manifest.organizationId).toBe(demoIds.organization());
    expect(manifest.rooms.map((room) => room.id)).toContain(demoIds.room('room-101'));
    expect(manifest.practitioners.find((doctor) => doctor.key === 'ivanova')).toEqual({
      key: 'ivanova',
      id: demoIds.practitioner('ivanova'),
      fullName: 'Иванова Мария Сергеевна',
    });
  });

  it('should link each role to its practitioner, services and rooms for the users step', () => {
    const role = manifest.practitionerRoles.find((candidate) => candidate.key === 'petrov');

    expect(role).toMatchObject({
      id: demoIds.practitionerRole('petrov'),
      practitionerId: demoIds.practitioner('petrov'),
      specialty: { system: 'http://snomed.info/sct', code: '394579002', display: 'Кардиология' },
    });
    expect(role?.healthcareServiceIds).toEqual([demoIds.service('card-primary'), demoIds.service('ecg')]);
  });

  it('should carry the clinic-time windows and the slot counts of every schedule', () => {
    const ivanova = manifest.schedules.find((schedule) => schedule.key === 'ivanova-primary');
    const kozlov = manifest.schedules.find((schedule) => schedule.key === 'kozlov-primary');

    expect(ivanova).toMatchObject({ slotsPlanned: 80, slotsCreated: 8, slotDurationMin: 30 });
    expect(ivanova?.windows[0]).toEqual({ dayOfWeek: 'MO', startTime: '09:00', endTime: '13:00' });
    expect(kozlov).toMatchObject({ slotsPlanned: 0, slotsCreated: 0 });
  });
});

describe('manifest file', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'demo-manifest-'));
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it('should read an absent manifest as empty', async () => {
    expect(await readManifest(join(directory, 'missing.json'))).toEqual({});
  });

  it('should refuse a manifest that is not a JSON object instead of treating it as empty', async () => {
    const path = join(directory, 'broken.json');
    await writeFile(path, '[1, 2]');

    await expect(readManifest(path)).rejects.toThrow(/is not a JSON object/);
  });

  it('should refuse a manifest that is not valid JSON', async () => {
    const path = join(directory, 'garbage.json');
    await writeFile(path, '{ not json');

    await expect(readManifest(path)).rejects.toThrow(SyntaxError);
  });

  it('should keep the FHIR part when the users step writes and vice versa', async () => {
    const path = join(directory, 'nested', 'demo-manifest.json');
    const fhir: DemoManifest = buildFhirManifest(SUMMARY, 'http://localhost:8080/fhir', '2026-11-02T10:00:00.000Z');

    await writeManifest(path, fhir);
    await writeManifest(path, { users: USERS });
    const merged = await readManifest(path);

    expect(merged.organizationId).toBe(demoIds.organization());
    expect(merged.users).toEqual(USERS);
  });

  it('should replace a section on a re-run rather than append to it', async () => {
    const path = join(directory, 'demo-manifest.json');
    await writeManifest(path, { users: USERS });

    await writeManifest(path, { users: { ...USERS, accounts: [] } });

    expect((await readManifest(path)).users?.accounts).toEqual([]);
  });

  it('should leave only the manifest in the directory when a write succeeds', async () => {
    const path = join(directory, 'demo-manifest.json');

    await writeManifest(path, { users: USERS });
    await writeManifest(path, { users: { ...USERS, accounts: [] } });

    expect(await readdir(directory)).toEqual(['demo-manifest.json']);
  });

  it('should keep the previous manifest and leave no temporary file when the replacement fails', async () => {
    // Arrange
    const path = join(directory, 'demo-manifest.json');
    await writeManifest(path, { users: USERS });
    const before = await readFile(path, 'utf8');
    jest.spyOn(fsPromises, 'rename').mockRejectedValueOnce(new Error('disk full'));

    // Act
    const attempt = writeManifest(path, { users: { ...USERS, accounts: [] } });

    // Assert
    await expect(attempt).rejects.toThrow('disk full');
    expect(await readFile(path, 'utf8')).toBe(before);
    expect(await readdir(directory)).toEqual(['demo-manifest.json']);
  });

  it('should tighten the permissions of a manifest that was created with wider ones', async () => {
    const path = join(directory, 'demo-manifest.json');
    await writeFile(path, '{}');
    await chmod(path, 0o644);

    await writeManifest(path, { users: USERS });

    expect((await stat(path)).mode & 0o077).toBe(0);
  });

  it('should write the file readable by its owner only because it can hold generated passwords', async () => {
    const path = join(directory, 'demo-manifest.json');

    await writeManifest(path, { users: USERS });

    expect((await stat(path)).mode & 0o077).toBe(0);
    expect(JSON.parse(await readFile(path, 'utf8'))).toHaveProperty('users');
  });
});
