'use client';

import type { ReactNode } from 'react';
import { Mail, Phone } from 'lucide-react';
import { WRAP_TEXT } from '../wrap-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { ageInYears } from '@/lib/clinic-time';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import type { AccountProfile, PatientProfile } from '../patient-types';
import type { Completeness } from './profile-completeness';
import { phoneOf } from './profile-completeness';

const GENDER_KEYS: Readonly<Record<string, string>> = { male: 'genderMale', female: 'genderFemale', other: 'genderOther' };
const RING_RADIUS = 34;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

export function displayName(account: AccountProfile | undefined, patient: PatientProfile | null | undefined): string {
  const fromParts: string = patient === null || patient === undefined ? '' : [patient.lastName, patient.firstName].filter(Boolean).join(' ');
  return account?.name ?? (fromParts !== '' ? fromParts : account !== undefined ? `${account.lastName} ${account.firstName}`.trim() : '');
}

/** Two letters of the name for the round avatar: the first of the surname and of the given name. */
export function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => Array.from(part)[0]?.toUpperCase() ?? '').join('');
}

function Chip({ tone, icon, children }: { readonly tone: 'neutral' | 'warning' | 'success' | 'destructive'; readonly icon?: ReactNode; readonly children: ReactNode }): ReactNode {
  const toneClass: string = { neutral: 'bg-secondary text-foreground', warning: 'bg-warning-soft text-warning', success: 'bg-success-soft text-success', destructive: 'bg-destructive-soft text-destructive' }[tone];
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm', tone === 'neutral' ? '' : 'font-semibold', toneClass, WRAP_TEXT)}>
      {icon === undefined ? null : <span aria-hidden="true" className="flex-none">{icon}</span>}
      {children}
    </span>
  );
}

function CompletenessRing({ completeness }: { readonly completeness: Completeness }): ReactNode {
  const t = useT('patientProfile.completeness');
  const done: number = (completeness.score / 100) * RING_LENGTH;
  return (
    <div className="flex min-w-[280px] flex-[1_1_300px] items-center gap-[18px] rounded-card bg-background p-[18px]" data-testid="profile-completeness">
      <svg width="84" height="84" viewBox="0 0 84 84" role="img" aria-label={t('ringLabel', { score: completeness.score })} className="flex-none">
        <circle cx="42" cy="42" r={RING_RADIUS} fill="none" strokeWidth="10" className="stroke-border" />
        <circle cx="42" cy="42" r={RING_RADIUS} fill="none" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${done} ${RING_LENGTH}`} transform="rotate(-90 42 42)" className="stroke-primary" />
        <text x="42" y="47" textAnchor="middle" fontSize="17" fontWeight="700" className="fill-foreground">{completeness.score}%</text>
      </svg>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-base font-bold">{t('title', { score: completeness.score })}</span>
        <span className="text-sm leading-[1.45] text-muted-foreground">
          {completeness.missing.length === 0 ? t('done') : `${t('missingLead', { items: completeness.missing.map((item) => t(`item.${item}`)).join(', ') })} ${t('howToFill')}`}
        </span>
      </div>
    </div>
  );
}

interface ProfileHeaderProps {
  readonly account: AccountProfile;
  /** `null`: the patient has no card (or it could not be read); the header then shows the account only. */
  readonly patient: PatientProfile | null;
  /** `null` while the card is unknown (loading or failed): a ring computed from nothing would lie. */
  readonly completeness: Completeness | null;
}

/** Name, avatar, chips and the completeness ring: the first thing the patient sees. */
export function ProfileHeader({ account, patient, completeness }: ProfileHeaderProps): ReactNode {
  const t = useT('patientProfile');
  const tProfile = useT('patient.profile');
  const format = useClinicFormat();
  const name: string = displayName(account, patient);
  const age: number | null = patient?.birthDate === undefined ? null : ageInYears(patient.birthDate);
  const gender: string | undefined = GENDER_KEYS[patient?.gender ?? ''];
  const facts: string[] = [
    ...(age === null ? [] : [t('ageLine', { age })]),
    ...(gender === undefined ? [] : [tProfile(gender)]),
    ...(account.createdAt === undefined ? [] : [t('sinceLine', { date: format.date(account.createdAt) })]),
  ];
  return (
    <Card as="section" radius="panel" padding="none" aria-labelledby="profile-name" className="flex flex-wrap items-center gap-7 p-7">
      <Avatar src={patient?.photoUrl} initials={initialsOf(name)} className="h-24 w-24 text-[34px]" />
      <div className="flex min-w-0 flex-[999_1_360px] flex-col gap-2.5">
        <h1 id="profile-name" className={cn('text-[28px] font-bold tracking-tight sm:text-[32px]', WRAP_TEXT)}>{name}</h1>
        {facts.length > 0 ? <p className="text-base text-muted-foreground">{facts.join(' · ')}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Chip tone="neutral" icon={<Mail size={16} />}>{account.email}</Chip>
          {phoneOf(patient) === undefined && patient !== null ? <Chip tone="warning" icon={<Phone size={16} />}>{t('chipNoPhone')}</Chip> : null}
          <Chip tone={account.isActive ? 'success' : 'destructive'}>{account.isActive ? t('chipActive') : t('chipInactive')}</Chip>
        </div>
      </div>
      {completeness === null ? null : <CompletenessRing completeness={completeness} />}
    </Card>
  );
}
