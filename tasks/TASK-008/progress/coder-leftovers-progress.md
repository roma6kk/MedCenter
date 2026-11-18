# coder leftovers progress

## 1. Analytics day boundary
Not a problem any more. The frontend sends date-only from/to per column; analytics-service `date-range.ts` reads a date-only bound as a Europe/Minsk clinic day (`clinicDayStartMs`) and the spec "should count 00:00-02:59 Minsk time to the clinic day" covers it. No change. docs/pz: nothing new.

## 2. Patronymic in the doctor catalog
Mostly fixed earlier (b7df9b2e): the mapper returns `middleName`, `doctorLabel` in `frontend/src/lib/doctor-name.ts` is used by catalog, wizard and summary; a doctor without a patronymic renders without a gap. One leftover: the doctor choice in the admin account form skipped the patronymic. Fixed with `formatDoctorName`, commit 01e13ca7. docs/pz: the admin account form screenshot/description may show the label without the patronymic.

## 3. Terminology seeder first run
Not a problem any more. `seed-terminology.ts` retries HAPI-2788 and 5xx on $expand, $validate-code and key-code proof with a growing pause (about 47 s in total, `retryOnServerError`), tested in `seed-terminology.spec.ts`. No change.
