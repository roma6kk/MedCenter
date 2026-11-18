import type { ReactNode } from 'react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button-variants';

export function BookLink({ label }: { readonly label: string }): ReactNode {
  return <Link href="/booking" className={buttonVariants({ variant: 'primary' })}>{label}</Link>;
}
