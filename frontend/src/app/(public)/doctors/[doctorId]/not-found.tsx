import type { ReactNode } from 'react';
import { DoctorNotFound } from '@/components/catalog/doctor-not-found';

/** `notFound()` of the profile page: a real 404 status with the catalog frame around the message and a way back to the list. */
export default function DoctorProfileNotFound(): ReactNode {
  return <DoctorNotFound />;
}
