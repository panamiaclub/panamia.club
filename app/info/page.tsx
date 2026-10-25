import type { Metadata } from 'next';
import { InfoPage } from '@/components/info/info-page';
import { getInfoMetadata } from '@/lib/info-site';

export function generateMetadata(): Metadata {
  return getInfoMetadata();
}

export default function InfoRoute() {
  return <InfoPage />;
}
