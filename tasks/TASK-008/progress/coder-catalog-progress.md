# coder-catalog progress

## Item 1 (Q3 + Q10): stale free slots - done
- New `stale-slots.ts` (`removeStaleFreeSlots`): searches free slots in a date range, deletes (or retires, if an appointment still references one) those not on the planned grid (start+end). Reuses `deleteOrRetire` from `schedule-removal.ts`.
- Called from `SlotGeneratorService.generate` (before the existing-slot search) and from `SchedulesService.update` when windows / duration / horizon change (searches old and new horizon, grid planned over the new horizon).
- Tests: `stale-slots.spec.ts`; older generator specs adapted (status-aware search mock `searchesFor`; the 30->20 min test now uses busy slots).
- Frontend texts checked: no change needed. docs/pz: not checked in depth; any text saying old free slots stay after regeneration is outdated.
