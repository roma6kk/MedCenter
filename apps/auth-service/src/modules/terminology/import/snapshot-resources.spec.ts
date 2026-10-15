/*
 * The drift guard reads the CLI seed's builders on purpose: the service image cannot
 * contain `tools/`, so the only place both copies meet is this (non-shipped) spec.
 */
/* eslint-disable @nx/enforce-module-boundaries */
import {
  buildCodeSystems as buildCliCodeSystems,
  buildExpansionChecks as buildCliExpansionChecks,
  buildValueSets as buildCliValueSets,
} from '../../../../../../tools/terminology-seed/terminology-resources';
/* eslint-enable @nx/enforce-module-boundaries */
import { seededValueSetOf } from '../seeded-value-sets';
import { SNAPSHOT_VERSION, buildCodeSystems, buildExpansionChecks, buildValueSets } from './snapshot-resources';

describe('snapshot-resources', () => {
  describe('parity with tools/terminology-seed', () => {
    it('should build the CodeSystems the CLI seed builds when the snapshot is bundled', () => {
      expect(buildCodeSystems()).toEqual(buildCliCodeSystems());
    });

    it('should build the ValueSets the CLI seed builds when the snapshot is bundled', () => {
      expect(buildValueSets()).toEqual(buildCliValueSets());
    });

    it('should build the expansion checks the CLI seed builds when the snapshot is bundled', () => {
      expect(buildExpansionChecks()).toEqual(buildCliExpansionChecks());
    });
  });

  describe('buildCodeSystems', () => {
    it('should publish fragment CodeSystems under fhir.by with deterministic ids when the snapshot is built', () => {
      const codeSystems = buildCodeSystems();

      expect(codeSystems.map((resource) => resource.id)).toEqual([
        'cs-nsi-services',
        'cs-nsi-observations',
        'cs-atc',
        'cs-icd10',
      ]);
      expect(codeSystems.every((resource) => resource.content === 'fragment')).toBe(true);
    });

    it('should not re-publish UCUM as a CodeSystem when the snapshot is built', () => {
      const systems = buildCodeSystems().map((resource) => resource.url);

      expect(systems).not.toContain('http://unitsofmeasure.org');
    });
  });

  describe('buildValueSets', () => {
    it('should list the UCUM concepts inline when the system is external', () => {
      const ucum = buildValueSets().find((resource) => resource.id === 'vs-ucum');

      expect(ucum?.compose.include[0]?.concept?.map((concept) => concept.code)).toContain('Cel');
    });

    it('should bind every code system to the ValueSet the read API validates against when the snapshot is built', () => {
      const pairs = buildExpansionChecks().map((check) => [check.systemUrl, check.valueSetUrl]);

      expect(pairs.every(([system, valueSet]) => seededValueSetOf(system as string) === valueSet)).toBe(true);
    });
  });

  describe('SNAPSHOT_VERSION', () => {
    it('should be the НСИ release carried by the НСИ resources when the snapshot is built', () => {
      const services = buildValueSets().find((resource) => resource.id === 'vs-nsi-services');

      expect(services?.version).toBe(SNAPSHOT_VERSION);
    });
  });
});
