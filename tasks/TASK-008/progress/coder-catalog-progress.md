# coder-catalog progress

## Item 1 (Q3 + Q10): stale free slots - done
- New `stale-slots.ts` (`removeStaleFreeSlots`): searches free slots in a date range, deletes (or retires, if an appointment still references one) those not on the planned grid (start+end). Reuses `deleteOrRetire` from `schedule-removal.ts`.
- Called from `SlotGeneratorService.generate` (before the existing-slot search) and from `SchedulesService.update` when windows / duration / horizon change (searches old and new horizon, grid planned over the new horizon).
- Tests: `stale-slots.spec.ts`; older generator specs adapted (status-aware search mock `searchesFor`; the 30->20 min test now uses busy slots).
- Frontend texts checked: no change needed. docs/pz: not checked in depth; any text saying old free slots stay after regeneration is outdated.

## Item 2 (Q11): room overlap - done
- `assertNoScheduleOverlap` now searches schedules with `actor=PractitionerRole/{id},Location/{roomId}` (one search, comma = OR) and reuses the same window/horizon comparison; create and PATCH pass `roomId`.
- Test added in `schedule-overlap.spec.ts`. Demo seed: no schedule shares a room with another doctor (ivanova uses room-101 twice at non-overlapping hours), so no collision. The seed does not call this check; its jest tests were not run separately.
- docs/pz: any text saying SCHEDULE_OVERLAP checks only the doctor is outdated.
