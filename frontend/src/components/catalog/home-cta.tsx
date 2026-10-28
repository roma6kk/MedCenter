'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { BrandMark } from '@/components/brand/brand-mark';
import { buttonVariants } from '@/components/ui/button-variants';
import { useT } from '@/lib/i18n/use-t';
import { SECTION_CLASS } from './catalog-styles';

/** The closing band of the landing (VA4): a warm panel that asks for the one action the page is about. */
export function HomeCta(): ReactNode {
  const t = useT('home');
  return (
    <section aria-labelledby="home-cta" className={`${SECTION_CLASS} reveal-on-scroll pt-16`}>
      <div className="relative overflow-hidden rounded-panel bg-warm-soft p-8 md:p-10">
        <span aria-hidden="true" className="absolute -right-10 -top-10 opacity-60"><BrandMark size={220} /></span>
        <div className="relative flex max-w-xl flex-col items-start gap-4">
          <h2 id="home-cta" className="text-3xl font-bold tracking-tight">{t('ctaTitle')}</h2>
          <p className="text-lg leading-relaxed text-warm-foreground">{t('ctaText')}</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/booking" className={buttonVariants({ size: 'lg' })}>{t('book')}</Link>
            <Link href="/doctors" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>{t('findDoctor')}</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
