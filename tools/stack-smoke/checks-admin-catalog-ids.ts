/** Ids that the steps of one lifecycle hand to each other. */
export interface Ids {
  room: string;
  /** A second room, made only to prove that a rename to a taken identifier is refused. */
  otherRoom: string;
  service: string;
  schedule: string;
  futureSchedule: string;
  /** The room two parallel creates raced for; removed with the other test data. */
  raceRoom: string;
  /** What the delete steps removed, kept so the journal check can still name it. */
  removed: { room: string; service: string; schedule: string };
}
