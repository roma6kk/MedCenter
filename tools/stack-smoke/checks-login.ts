import type { SmokeAccounts } from './smoke-accounts';
import { SmokeAssertionError, expectEqual, expectTrue } from './smoke-assert';
import type { SmokeRunner } from './smoke-runner';
import { signIn } from './smoke-session';
import type { Session, SmokeAccount, SmokeConfig, SmokeRole } from './smoke-types';
import type { SmokeSessions } from './suite';

const GROUP = 'login (PKCE)';

const EXPECTED_SCOPES: Readonly<Record<SmokeRole, { readonly has: readonly string[]; readonly lacks: readonly string[] }>> = {
  ADMIN: { has: ['launch', 'user/*.read', 'user/*.write'], lacks: ['patient/*.read', 'patient/*.write'] },
  DOCTOR: { has: ['launch', 'user/*.read', 'user/*.write'], lacks: ['patient/*.read', 'patient/*.write'] },
  PATIENT: { has: ['launch', 'patient/*.read', 'patient/*.write'], lacks: ['user/*.read', 'user/*.write'] },
};

/** The token says what the role may do (API §0 scope matrix) and carries the right identity claims. */
function assertGrant(session: Session, account: SmokeAccount): void {
  const granted = session.grantedScope.split(' ');
  const expected = EXPECTED_SCOPES[account.role];
  for (const scope of expected.has) {
    expectTrue(granted.includes(scope), `${account.role} token lacks scope ${scope} (granted: "${session.grantedScope}")`);
  }
  for (const scope of expected.lacks) {
    expectTrue(!granted.includes(scope), `${account.role} token carries foreign scope ${scope}`);
  }
  expectEqual(session.claims.role, account.role, 'role claim');
  if (account.role === 'PATIENT') {
    expectTrue(/^Patient\/.+/.test(session.claims.fhirUser ?? ''), 'a PATIENT token must carry fhirUser = Patient/{id}');
    expectTrue((session.claims.patient ?? '').length > 0, 'a PATIENT token must carry the patient compartment claim');
  }
  if (account.role === 'DOCTOR') {
    expectEqual(session.claims.fhirUser, `PractitionerRole/${account.practitionerRoleId}`, 'fhirUser of a DOCTOR token');
  }
}

async function login(runner: SmokeRunner, config: SmokeConfig, label: string, account: SmokeAccount): Promise<Session | undefined> {
  let session: Session | undefined;
  await runner.check(GROUP, `${label}: authorize -> login form -> code -> token`, async () => {
    session = await signIn(config, account);
    assertGrant(session, account);
  });
  return session;
}

/** The three roles log in through the real browser flow; one wrong password proves the form refuses it. */
export async function loginAll(runner: SmokeRunner, config: SmokeConfig, accounts: SmokeAccounts): Promise<SmokeSessions | undefined> {
  const admin = await login(runner, config, 'admin', accounts.admin);
  const doctor = await login(runner, config, 'doctor', accounts.doctor);
  const otherDoctor = await login(runner, config, 'second doctor', accounts.otherDoctor);
  const patient = await login(runner, config, 'patient', accounts.patient);
  const otherPatient = await login(runner, config, 'second patient', accounts.otherPatient);
  const thirdPatient = await login(runner, config, 'third patient', accounts.thirdPatient);
  await runner.check(GROUP, 'a wrong password is refused by the login form', async () => {
    const wrong: SmokeAccount = { ...accounts.patient, password: `${accounts.patient.password}-wrong` };
    const refused = await signIn(config, wrong).then(
      () => false,
      (error: unknown) => error instanceof Error && error.message.includes('credentials rejected'),
    );
    if (!refused) {
      throw new SmokeAssertionError('the login form accepted a wrong password or failed for another reason');
    }
  });
  if (!admin || !doctor || !otherDoctor || !patient || !otherPatient || !thirdPatient) {
    return undefined;
  }
  return { admin, doctor, otherDoctor, patient, otherPatient, thirdPatient };
}
