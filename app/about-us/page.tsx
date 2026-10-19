'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function AboutUsPage() {
  const { t } = useTranslation('about');
  return (
    <div className="flex min-h-screen flex-col">
      {/* Hero Section */}
      <section
        className="relative bg-cover bg-center py-32 text-center md:py-48"
        style={{ backgroundImage: 'url(/img/about/florida.jpg)' }}
      >
        <div className="absolute inset-0 bg-black/30" />
        <div className="relative container mx-auto px-4">
          <h1 className="mb-4 text-5xl font-bold text-white md:text-6xl">
            {t('hero.title')}
          </h1>
          <p className="text-2xl text-white md:text-3xl">
            {t('hero.subheadline')}
          </p>
        </div>
      </section>

      {/* Mission & Vision Section */}
      <section className="bg-pana-navy py-16 text-white md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl space-y-8">
            <div className="space-y-4">
              <h2 className="text-3xl font-bold">{t('mission.title')}</h2>
              <p className="text-lg leading-relaxed">{t('mission.body')}</p>
            </div>
            <div className="space-y-4">
              <h2 className="text-3xl font-bold">{t('vision.title')}</h2>
              <h3 className="text-2xl font-semibold">
                {t('vision.subheadline')}
              </h3>
              <p className="text-lg">{t('vision.body')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Our Story Section */}
      <section id="our-story" className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl">
            <div className="flex flex-col items-start gap-6 md:flex-row">
              <div className="w-full md:w-1/3">
                <Image
                  src="/img/about/clari_and_anette.webp"
                  alt="Clari and Anette, founders of Pana MIA"
                  width={300}
                  height={400}
                  className="w-full rounded-lg"
                />
              </div>
              <div className="w-full space-y-4 md:w-2/3">
                <h2 className="text-3xl font-bold">{t('story.title')}</h2>
                <p className="text-lg leading-relaxed">{t('story.p1')}</p>
                <p className="text-lg leading-relaxed">{t('story.p2')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Our Projects Section */}
      <section
        id="collaborative-projects"
        className="bg-cover bg-center py-16 md:py-24"
        style={{ backgroundImage: 'url(/img/about/bubbles_navy.jpg)' }}
      >
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-8 text-center text-3xl font-bold text-white">
              {t('projects.title')}
            </h2>
            <Tabs defaultValue="directorio" className="w-full">
              <TabsList className="grid h-auto w-full grid-cols-3 gap-0 bg-transparent p-0">
                <TabsTrigger
                  value="directorio"
                  className="border-pana-blue hover:bg-pana-blue data-[state=active]:bg-pana-blue data-[state=inactive]:text-pana-blue rounded-t-lg rounded-b-none border-4 py-3 transition-colors hover:text-white data-[state=active]:text-white data-[state=inactive]:bg-white"
                >
                  {t('projects.tab1')}
                </TabsTrigger>
                <TabsTrigger
                  value="leolero"
                  className="border-pana-yellow hover:bg-pana-yellow data-[state=active]:bg-pana-yellow data-[state=inactive]:text-pana-yellow rounded-t-lg rounded-b-none border-4 py-3 transition-colors hover:text-white data-[state=active]:text-white data-[state=inactive]:bg-white"
                >
                  {t('projects.tab2')}
                </TabsTrigger>
                <TabsTrigger
                  value="panavizion"
                  className="border-pana-pink hover:bg-pana-pink data-[state=active]:bg-pana-pink data-[state=inactive]:text-pana-pink-deep rounded-t-lg rounded-b-none border-4 py-3 transition-colors hover:text-white data-[state=active]:text-white data-[state=inactive]:bg-white"
                >
                  {t('projects.tab3')}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="directorio" className="mt-0">
                <Card className="border-pana-blue rounded-t-none border-4">
                  <CardContent className="p-8">
                    <p className="text-lg leading-relaxed">
                      {t('projects.directorio')}
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="leolero" className="mt-0">
                <Card className="border-pana-yellow rounded-t-none border-4">
                  <CardContent className="p-8">
                    <p className="text-lg leading-relaxed">
                      {t('projects.leolero')}
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="panavizion" className="mt-0">
                <Card className="border-pana-pink rounded-t-none border-4">
                  <CardContent className="p-8">
                    <p className="text-lg leading-relaxed">
                      {t('projects.panavizion')}
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </section>

      {/* Our Board Section */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl space-y-12">
            <h2 className="text-center text-3xl font-bold">
              {t('board.title')}
            </h2>

            {/* Anette Mago */}
            <div className="flex flex-col items-start gap-6 md:flex-row">
              <div className="w-full md:w-1/3">
                <Image
                  src="/img/about/anette_mago.jpg"
                  alt="Anette Mago"
                  width={320}
                  height={400}
                  className="w-full rounded-lg"
                />
              </div>
              <div className="w-full space-y-4 md:w-2/3">
                <h3 className="text-2xl font-semibold">
                  {t('board.anette.name')}
                </h3>
                <p className="text-lg leading-relaxed">
                  {t('board.anette.bio')}
                </p>
              </div>
            </div>

            {/* Claribel Avila */}
            <div className="flex flex-col items-start gap-6 md:flex-row-reverse">
              <div className="w-full md:w-1/3">
                <Image
                  src="/img/about/claribel_avila.jpg"
                  alt="Claribel Avila"
                  width={320}
                  height={400}
                  className="w-full rounded-lg"
                />
              </div>
              <div className="w-full space-y-4 md:w-2/3">
                <h3 className="text-2xl font-semibold">
                  {t('board.claribel.name')}
                </h3>
                <p className="text-lg leading-relaxed">
                  {t('board.claribel.bio')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Our Team Section */}
      <section
        id="meet-the-team"
        className="bg-cover bg-fixed bg-center py-16 md:py-24"
        style={{ backgroundImage: 'url(/img/about/parallax2.jpg)' }}
      >
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-8 text-center text-3xl font-bold text-white">
              {t('team.title')}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card className="text-center">
                <CardContent className="p-4">
                  <Image
                    src="/img/about/bee_maria.jpg"
                    alt="Bee Maria"
                    width={200}
                    height={200}
                    className="mb-3 w-full rounded-lg"
                  />
                  <h3 className="text-lg font-semibold">Bee Maria</h3>
                  <p className="text-muted-foreground text-sm">
                    {t('team.copywriter')}
                  </p>
                </CardContent>
              </Card>
              <Card className="text-center">
                <CardContent className="p-4">
                  <Image
                    src="/img/about/jdowns.jpg"
                    alt="Jeremy Downs"
                    width={200}
                    height={200}
                    className="mb-3 w-full rounded-lg"
                  />
                  <h3 className="text-lg font-semibold">Jeremy Downs</h3>
                  <p className="text-muted-foreground text-sm">
                    {t('team.technicalAdvisor')}
                  </p>
                </CardContent>
              </Card>
              <Card className="text-center">
                <CardContent className="p-4">
                  <Image
                    src="/img/about/gbarrios.jpg"
                    alt="Genesis Barrios"
                    width={200}
                    height={200}
                    className="mb-3 w-full rounded-lg"
                  />
                  <h3 className="text-lg font-semibold">Genesis Barrios</h3>
                  <p className="text-muted-foreground text-sm">
                    {t('team.webDeveloper')}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Support Our Club Section */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl">
            <div className="flex flex-col items-center gap-8 md:flex-row">
              <div className="w-full md:w-1/3">
                <Image
                  src="/img/about/floridamap_panamia.jpg"
                  alt="Florida map with Pana MIA"
                  width={320}
                  height={400}
                  className="w-full rounded-lg"
                />
              </div>
              <div className="w-full space-y-6 md:w-2/3">
                <h2 className="text-3xl font-bold">{t('support.title')}</h2>
                <p className="text-lg leading-relaxed">{t('support.p1')}</p>
                <Button
                  size="lg"
                  className="bg-pana-pink hover:bg-pana-pink/90"
                  asChild
                >
                  <Link href="/donate">{t('support.cta')}</Link>
                </Button>
                <p className="text-lg leading-relaxed">{t('support.p2')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
