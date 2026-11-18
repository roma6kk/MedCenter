'use client';

import type { ReactNode } from 'react';
import { FileText } from 'lucide-react';
import { BrandMark } from '@/components/brand/brand-mark';
import { useT } from '@/lib/i18n/use-t';
import { SECTION_CLASS } from './catalog-styles';
import type { Doctor } from './catalog-types';
import { HeroEcg } from './hero-ecg';
import { HeroWindows } from './hero-windows';
import { HomeActions } from './home-actions';

function HeroPanel({ doctors }: { readonly doctors: ReadonlyArray<Doctor> }): ReactNode {
  const t = useT('home');
  return (
    <div className="relative overflow-hidden rounded-panel bg-primary-soft p-5 md:p-6">
      <span aria-hidden="true" className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-warm-soft" />
      <span aria-hidden="true" className="absolute right-4 top-4"><BrandMark size={112} /></span>
      <div className="relative flex flex-col gap-5">
        <div className="flex min-h-[112px] max-w-[calc(100%-8.5rem)] flex-col justify-center gap-1">
          <FileText aria-hidden="true" className="mb-1 h-6 w-6 text-primary" />
          <p className="font-bold">{t('recordTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('recordText')}</p>
        </div>
        <HeroEcg />
        <HeroWindows doctors={doctors} />
      </div>
    </div>
  );
}

export function HomeHero({ doctors }: { readonly doctors: ReadonlyArray<Doctor> }): ReactNode {
  const t = useT('home');
  return (
    <section aria-labelledby="home-title" className="warm-ambient">
      <div className={`${SECTION_CLASS} grid items-center gap-10 py-14 md:grid-cols-2 md:py-16`}>
        <div className="flex flex-col gap-5">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary-soft-foreground">{t('eyebrow')}</p>
          <h1 id="home-title" className="max-w-[22ch] text-4xl font-bold leading-[1.08] tracking-tight">{t('heroTitle')}</h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">{t('lead')}</p>
          <HomeActions />
        </div>
        <HeroPanel doctors={doctors} />
      </div>
    </section>
  );
}
