import Link from 'next/link';
import {
  CalendarDays,
  FileText,
  Users,
  MessageCircle,
  Search,
  Gift,
  Radio,
} from 'lucide-react';

// Static features page — cache at the edge, revalidate hourly (Workers Cache).
export const revalidate = 3600;

const features: {
  title: string;
  description: string;
  href: string;
  icon: typeof CalendarDays;
  id?: string;
}[] = [
  {
    // id anchors the deep-link from the article editor's "Publishing
    // cross-posts this Article to the Pana Resilience Network" caption.
    id: 'resilience',
    title: 'Pana Resilience Network',
    description:
      'A community-run Nostr relay. Published Articles are cross-posted here as long-form notes, mirrored across the network for resilience.',
    href: '/r',
    icon: Radio,
  },
  {
    title: 'Events',
    description:
      'Discover and host community events — from local meetups to virtual gatherings across the diaspora.',
    href: '/e',
    icon: CalendarDays,
  },
  {
    title: 'Articles',
    description:
      'Read and publish community stories, guides, and perspectives written by members of the network.',
    href: '/a',
    icon: FileText,
  },
  {
    title: 'Mentoring',
    description:
      'Connect with mentors and mentees for one-on-one video sessions on career, culture, and community topics.',
    href: '/m',
    icon: Users,
  },
  {
    title: 'Timeline',
    description:
      'Share updates, photos, and quick posts with the community in a social timeline feed.',
    href: '/timeline',
    icon: MessageCircle,
  },
  {
    title: 'Directory',
    description:
      'Search the member directory to find and connect with people across the Pana Mia community.',
    href: '/directory/search',
    icon: Search,
  },
  {
    title: 'Support Us',
    description:
      'Help sustain the platform through donations that fund development, events, and community programs.',
    href: '/support-pana',
    icon: Gift,
  },
];

export default function FeaturesPage() {
  return (
    <div className="container mx-auto max-w-6xl px-4 py-12">
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Site Features
        </h1>
        <p className="text-muted-foreground mt-4 text-lg">
          Everything you can do on Pana Mia — all in one place.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <Link
            key={feature.href}
            id={feature.id}
            href={feature.href}
            className="group border-border bg-card hover:border-primary/40 scroll-mt-24 rounded-xl border p-6 transition-colors"
          >
            <feature.icon className="text-primary mb-4 h-8 w-8" />
            <h2 className="mb-2 text-xl font-semibold">{feature.title}</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {feature.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
