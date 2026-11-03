'use client';

import { useSession } from '@/lib/auth-client';
import { FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';

import PageMeta from '@/components/PageMeta';
import { ProfileInterface } from '@/lib/interfaces';
import Status401_Unauthorized from '@/components/Page/Status401_Unauthorized';
import { useProfile, useMutateProfileGenteDePana } from '@/lib/query/profile';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function AccountProfileGenteDePana() {
  const { data: session, status } = useSession();
  const mutation = useMutateProfileGenteDePana();
  const { data, isLoading } = useProfile();
  const profile = data as ProfileInterface;

  const submitForm = (e: FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);

    const updates = {
      discount_code: formData.get('code'),
      discount_percentage: formData.get('percentage'),
      discount_details: formData.get('details'),
    };

    mutation.mutate(updates);
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!session) {
    return <Status401_Unauthorized />;
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500">No profile found</div>
      </div>
    );
  }

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <PageMeta title="Gente dePana Offers | Edit Profile" desc="" />

      <h2 className="mb-8 text-3xl font-bold">
        Profile - Edit Gente dePana Offers
      </h2>

      <Card className="mb-8">
        <CardContent className="pt-6">
          <form onSubmit={submitForm} className="space-y-6">
            <div className="mb-6 flex justify-between gap-4">
              <Button variant="outline" asChild>
                <Link href="/account/profile/edit">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Link>
              </Button>
              <Button type="submit" disabled={isLoading || mutation.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {mutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="code">Discount Code</Label>
              <Input
                id="code"
                name="code"
                type="text"
                defaultValue={profile?.gentedepana?.code}
                placeholder="e.g., PANAMIA2024"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="percentage">Discount Percentage</Label>
              <Input
                id="percentage"
                name="percentage"
                type="text"
                defaultValue={profile?.gentedepana?.percentage}
                placeholder="e.g., 10%"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="details">Discount Details</Label>
              <Textarea
                id="details"
                name="details"
                rows={4}
                maxLength={500}
                defaultValue={profile?.gentedepana?.details}
                placeholder="Add specific details or exemptions"
              />
              <p className="text-sm text-gray-500">
                For adding specific details or exemptions that apply to the
                discount provided.
              </p>
            </div>

            {mutation.isError && (
              <div className="rounded-md bg-red-50 p-4 text-red-600">
                Failed to update profile. Please try again.
              </div>
            )}

            {mutation.isSuccess && (
              <div className="rounded-md bg-green-50 p-4 text-green-600">
                Profile updated successfully!
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Help & FAQs Section */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="mb-4 text-xl font-bold">Help &amp; FAQs</h3>

          <div className="space-y-6">
            <div>
              <h4 className="mb-2 text-lg font-semibold">
                What are Gente dePana Discounts?
              </h4>
              <div className="space-y-2 text-gray-700">
                <p>
                  Gente dePana is Pana MIA Club's subscription membership.
                  Discount codes are one of the perks of our subscription
                  membership and can be used by our Gente dePana. Users will
                  have the capability to filter by Pana Members offering
                  discounts.
                </p>
                <p>
                  Pana MIA Club is a nonprofit, which means we depend on
                  external funding to manage all our operations. Instead of
                  relying on special interest sponsors, we want to remain a
                  grassroots organization. This means many small donors. You can
                  check out the{' '}
                  <Link
                    href="/support-pana#giving-circle"
                    className="text-blue-600 hover:underline"
                  >
                    membership tiers
                  </Link>
                  .
                </p>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-lg font-semibold">
                How does the discount work?
              </h4>
              <p className="text-gray-700">
                As the business/service provider, you control the details of the
                discount. You can decide the value of the discount, how often it
                can be used, etc. You will then build in the discount in your
                shopcart software and add the details on your Pana MIA profile
                account.
              </p>
            </div>

            <div>
              <h4 className="mb-2 text-lg font-semibold">
                Is there a benefit for me to offer a Gente dePana Discount?
              </h4>
              <p className="text-gray-700">
                At the end of the year please run a report for the total debit
                amount offered for the specific Gente dePana discount. Pana MIA
                Club will issue your business a Donation Receipt for the total
                amount which you can use as a donation on your taxes.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
