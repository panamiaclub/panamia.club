import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { z } from 'zod';
import { checkAdminAuth } from '@/lib/server/admin-auth';
import { setDirectoryVisibility } from '@/lib/server/admin-directory';
import { revalidatePublicListing } from '@/lib/server/profile';

const bodySchema = z
  .object({
    active: z.boolean(),
    expectedActive: z.boolean(),
  })
  .strict()
  .refine((body) => body.active !== body.expectedActive);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await checkAdminAuth();
  if (!admin) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Could not read that request.' },
      { status: 400 }
    );
  }
  const body = bodySchema.safeParse(input);
  if (!body.success) {
    return NextResponse.json(
      {
        error: 'Provide the current and requested profile status as booleans.',
      },
      { status: 400 }
    );
  }

  try {
    const { id } = await params;
    const result = await setDirectoryVisibility({
      profileId: id,
      ...body.data,
      changedBy: admin.id,
    });
    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            result.reason === 'conflict'
              ? 'This profile changed while you were viewing it. Reload and try again.'
              : 'This business is not in the published directory. Review pending applications separately.',
        },
        { status: result.reason === 'conflict' ? 409 : 404 }
      );
    }
    revalidatePublicListing(id, result.screenname);
    revalidateTag('directory', { expire: 0 });
    revalidatePath('/directory/search');
    return NextResponse.json({ success: true, active: body.data.active });
  } catch (error) {
    console.error('Failed to change directory visibility', error);
    return NextResponse.json(
      {
        error:
          'Could not change profile visibility. Reload before trying again.',
      },
      { status: 500 }
    );
  }
}
