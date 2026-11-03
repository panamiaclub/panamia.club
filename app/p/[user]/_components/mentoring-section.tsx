'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookSessionButton } from './book-session-button';
import { Video, Globe } from 'lucide-react';

interface MentoringSectionProps {
  mentoring: {
    bio: string;
    expertise: string[];
    languages: string[];
    videoIntroUrl?: string;
    hourlyRate?: number;
  };
  handle: string;
  preview?: boolean;
}

export function MentoringSection({
  mentoring,
  handle,
  preview = false,
}: MentoringSectionProps) {
  return (
    <div className="space-y-4">
      {/* Mentoring Badge & CTA */}
      <Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <Badge className="bg-blue-600 text-white">Mentor Available</Badge>
              <span className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                {mentoring.hourlyRate === 0 || !mentoring.hourlyRate
                  ? 'Free Mentoring'
                  : `$${mentoring.hourlyRate}/hour`}
              </span>
            </div>
            {!preview && <BookSessionButton handle={handle} />}
          </div>
        </CardContent>
      </Card>

      {/* Mentoring Bio */}
      <Card>
        <CardHeader>
          <CardTitle>About This Mentor</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="leading-relaxed text-gray-700 dark:text-gray-300">
            {mentoring.bio}
          </p>
        </CardContent>
      </Card>

      {/* Expertise */}
      {mentoring.expertise && mentoring.expertise.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Expertise</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {mentoring.expertise.map((skill) => (
                <Badge key={skill} variant="secondary">
                  {skill}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Languages */}
      {mentoring.languages && mentoring.languages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" aria-hidden="true" />
              Languages
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {mentoring.languages.map((lang) => (
                <Badge key={lang} variant="outline">
                  {lang}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Video Introduction */}
      {mentoring.videoIntroUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" aria-hidden="true" />
              Video Introduction
            </CardTitle>
          </CardHeader>
          <CardContent>
            <video
              src={mentoring.videoIntroUrl}
              controls
              playsInline
              preload="metadata"
              className="w-full rounded-lg"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
