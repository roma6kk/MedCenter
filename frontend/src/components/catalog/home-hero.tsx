'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button-variants';
import { useT } from '@/lib/i18n/use-t';
import { SECTION_CLASS } from './catalog-styles';
import { HeroIllustration } from './hero-illustration';
import { HOME_ANCHORS } from './home-content';

/** First screen: what the clinic is, the way to the departments, and the booking as one of the ways in. */
export function HomeHero(): ReactNode {
  const t = useT('home');
  return (
    <section aria-labelledby="home-title" className={`${SECTION_CLASS} grid items-center gap-10 py-14 md:grid-cols-2 md:py-16`}>
      <div className="flex flex-col gap-5">
        <p className="text-sm font-bold uppercase tracking-[0.08em] text-primary-soft-foreground">{t('eyebrow')}</p>
        <h1 id="home-title" className="text-4xl font-bold leading-[1.08] tracking-tight md:text-[50px]">{t('heroTitle')}</h1>
        <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">{t('lead')}</p>
        <div className="flex flex-wrap gap-3">
          <Link href={`#${HOME_ANCHORS.directions}`} className={buttonVariants({ size: 'lg' })}>{t('chooseDirection')}</Link>
          <Link href="/booking" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>{t('book')}</Link>
        </div>
      </div>
      <div className="relative min-h-[320px] md:min-h-[400px]">
        <HeroIllustration />
        <div className="absolute inset-x-4 bottom-4 flex items-center gap-4 rounded-card border border-border bg-card p-4 shadow-lg">
          <span aria-hidden="true" className="flex h-11 w-11 flex-none items-center justify-center rounded-control bg-primary text-primary-foreground">
            <FileText className="h-5 w-5" />
          </span>
          <span className="flex flex-col">
            <span className="font-bold">{t('recordTitle')}</span>
            <span className="text-sm text-muted-foreground">{t('recordText')}</span>
          </span>
        </div>
      </div>
    </section>
  );
}
