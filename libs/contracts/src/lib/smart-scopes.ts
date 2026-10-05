export const SMART_SCOPES = {
  PATIENT_READ: 'patient/*.read',
  PATIENT_WRITE: 'patient/*.write',
  USER_READ: 'user/*.read',
  USER_WRITE: 'user/*.write',
  LAUNCH: 'launch',
} as const;

export type SmartScope = (typeof SMART_SCOPES)[keyof typeof SMART_SCOPES];