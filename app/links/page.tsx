'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ExternalLink,
  Music,
  Mail,
  Search,
  UserPlus,
  Calendar,
  Heart,
  Users,
} from 'lucide-react';

export default function LinksPage() {
  const { t } = useTranslation('links');

  return (
    <div className="from-background to-muted/20 flex min-h-screen flex-col bg-gradient-to-b">
      <div className="container mx-auto max-w-2xl px-4 py-12">
        {/* Logo and Header */}
        <div className="mb-8 text-center">
          <div className="mb-6 flex justify-center">
            <Image
              src="/logos/pana_logo_long_blue.png"
              alt="Pana MIA Club Logo"
              width={200}
              height={100}
              className="h-auto w-48"
              priority
            />
          </div>
          <h1 className="mb-2 text-3xl font-bold">Pana MIA Club</h1>
          <p className="text-muted-foreground text-lg">{t('tagline')}</p>
        </div>

        {/* Social Media Icons */}
        <div className="mb-8 flex justify-center gap-4">
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12 rounded-full"
            asChild
          >
            <Link
              href="https://twitter.com/panamiaclub"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('ariaTwitter')}
            >
              <ExternalLink className="h-5 w-5" aria-hidden="true" />
            </Link>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12 rounded-full"
            asChild
          >
            <Link
              href="https://www.instagram.com/panamiaclub/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('ariaInstagram')}
            >
              <ExternalLink className="h-5 w-5" aria-hidden="true" />
            </Link>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12 rounded-full"
            asChild
          >
            <Link
              href="https://www.tiktok.com/@panamiaclub"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('ariaTikTok')}
            >
              <Music className="h-5 w-5" aria-hidden="true" />
            </Link>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12 rounded-full"
            asChild
          >
            <Link href="mailto:info@panamia.club" aria-label={t('ariaEmail')}>
              <Mail className="h-5 w-5" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        {/* Main Links */}
        <div className="space-y-4">
          <Button size="lg" className="h-14 w-full text-lg" asChild>
            <Link
              href="/directory/search"
              className="flex items-center justify-center gap-2"
            >
              <Search className="h-5 w-5" aria-hidden="true" />
              {t('explore')}
            </Link>
          </Button>

          <Button
            size="lg"
            variant="outline"
            className="h-14 w-full text-lg"
            asChild
          >
            <Link
              href="/welcome"
              className="flex items-center justify-center gap-2"
            >
              <UserPlus className="h-5 w-5" aria-hidden="true" />
              {t('becomeAPana')}
            </Link>
          </Button>

          <Button
            size="lg"
            variant="outline"
            className="h-14 w-full text-lg"
            asChild
          >
            <Link
              href="https://shotgun.live/venues/pana-mia-club"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2"
            >
              <Calendar className="h-5 w-5" aria-hidden="true" />
              {t('ourEvents')}
            </Link>
          </Button>

          <Button
            size="lg"
            variant="outline"
            className="h-14 w-full text-lg"
            asChild
          >
            <Link
              href="/donate"
              className="flex items-center justify-center gap-2"
            >
              <Heart className="h-5 w-5" aria-hidden="true" />
              {t('supportMission')}
            </Link>
          </Button>

          <Button
            size="lg"
            variant="outline"
            className="h-14 w-full text-lg"
            asChild
          >
            <Link
              href="/form/join-the-team"
              className="flex items-center justify-center gap-2"
            >
              <Users className="h-5 w-5" aria-hidden="true" />
              {t('volunteer')}
            </Link>
          </Button>
        </div>

        {/* YouTube Playlist */}
        <Card className="mt-8 overflow-hidden">
          <CardContent className="p-0">
            <div className="aspect-video">
              <iframe
                width="100%"
                height="100%"
                src="https://www.youtube.com/embed/videoseries?list=PLzL8p8P4v6F03_6C9S_SthYiI6W96YJLY"
                title="Pana MIA YouTube Playlist"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                className="h-full w-full"
              />
            </div>
            <div className="p-4 text-center">
              <h2 className="text-lg font-semibold">{t('watchVideos')}</h2>
            </div>
          </CardContent>
        </Card>

        {/* Spotify Playlist */}
        <div className="mt-6 text-center">
          <Button
            size="lg"
            className="bg-green-600 text-lg text-white hover:bg-green-700"
            asChild
          >
            <Link
              href="https://open.spotify.com/user/ij9xugbz4bgqlllbmyjmkuzre?si=c1fb6e2bd9aa4a1b"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2"
            >
              <Music className="h-5 w-5" aria-hidden="true" />
              {t('listenSpotify')}
            </Link>
          </Button>
        </div>

        {/* Footer */}
        <div className="text-muted-foreground mt-12 text-center text-sm">
          <p>&copy; {new Date().getFullYear()} Pana MIA Club</p>
          <p className="mt-1">{t('localNetwork')}</p>
        </div>
      </div>
    </div>
  );
}
