import type { ReactNode } from 'react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button-variants';

/** The one next step of an empty list of the cabinet: «Записаться». */
export function BookLink({ label }: { readonly label: string }): ReactNode {
  return <Link href="/booking" className={buttonVariants({ variant: 'primary' })}>{label}</Link>;
}
