import { OfferingFrontPage } from '@/components/offerings/offering-front-page';

/**
 * The get-involved front page.
 *
 * The only one of the six whose whole point is the call to action, so both
 * buttons are the ask: join the directory, or fund the thing that runs it.
 */

// Static marketing page — cache at the edge, revalidate hourly (Workers Cache).
export const revalidate = 3600;

export const metadata = {
  title: 'Get Involved | Pana MIA Club',
  description:
    'Pana MIA is built by the people inside it. There is a way in for whatever you have to give.',
};

export default function GetInvolvedFrontPage() {
  return (
    <OfferingFrontPage
      id="getInvolved"
      actions={{ primary: '/form/get-listed', secondary: '/support-pana' }}
    />
  );
}
