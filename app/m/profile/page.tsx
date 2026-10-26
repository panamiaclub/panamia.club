import { auth } from '@/auth';
import { redirectToSignIn } from '@/lib/signin-redirect';
import { db } from '@/lib/db';
import { profiles } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { ProfileMentoring } from '@/lib/interfaces';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default async function MentoringProfilePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirectToSignIn('/m/profile');
  }

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, session.user.id),
  });

  const mentoring = profile?.mentoring as ProfileMentoring | null;

  const mentoringEnabled = mentoring?.enabled || false;

  return (
    <main className="container mx-auto max-w-5xl px-4 py-8">
      <div className="max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="mb-8 text-3xl font-bold">Mentoring Profile</h1>
          <Link href="/m/profile/edit">
            <Button>Edit Profile</Button>
          </Link>
        </div>

        {!mentoringEnabled && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
            <p className="text-yellow-800">
              Your mentoring profile is not enabled. Edit your profile to start
              mentoring.
            </p>
          </div>
        )}

        {mentoringEnabled && mentoring && (
          <div className="space-y-6">
            <div className="bg-card rounded-lg border p-6">
              <h2 className="mb-4 text-xl font-semibold">Bio</h2>
              <p>{mentoring.bio || 'No bio provided'}</p>
            </div>

            <div className="bg-card rounded-lg border p-6">
              <h2 className="mb-4 text-xl font-semibold">Expertise</h2>
              <div className="flex flex-wrap gap-2">
                {mentoring.expertise?.map((skill: string) => (
                  <span
                    key={skill}
                    className="rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800 dark:bg-blue-900 dark:text-blue-100"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-card rounded-lg border p-6">
              <h2 className="mb-4 text-xl font-semibold">Languages</h2>
              <div className="flex flex-wrap gap-2">
                {mentoring.languages?.map((lang: string) => (
                  <span
                    key={lang}
                    className="bg-muted rounded-full px-3 py-1 text-sm"
                  >
                    {lang}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-card rounded-lg border p-6">
              <h2 className="mb-4 text-xl font-semibold">Hourly Rate</h2>
              <p className="text-2xl font-bold">
                {mentoring.hourlyRate
                  ? `$${mentoring.hourlyRate}/hour`
                  : 'Free as in hugs'}
              </p>
            </div>

            {mentoring.goals && (
              <div className="bg-card rounded-lg border p-6">
                <h2 className="mb-4 text-xl font-semibold">Mentoring Goals</h2>
                <p>{mentoring.goals}</p>
              </div>
            )}

            {mentoring.videoIntroUrl && (
              <div className="bg-card rounded-lg border p-6">
                <h2 className="mb-4 text-xl font-semibold">
                  Video Introduction
                </h2>
                <video
                  src={mentoring.videoIntroUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
