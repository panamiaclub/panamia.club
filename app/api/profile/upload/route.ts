// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { profiles } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { deleteFile, uploadFile } from '@/lib/blob/api';
import {
  getActiveProfileId,
  getEditableProfile,
} from '@/lib/server/active-profile';
import { ensureProfile, revalidatePublicListing } from '@/lib/server/profile';
import { syncActorFromProfile } from '@/lib/federation/wrappers/actor';
import { canAdministerProfile } from '@/lib/server/profile-owners';

type ProfileImages = Pick<
  typeof profiles.$inferSelect,
  'primaryImageCdn' | 'galleryImages'
>;

function savedImageUrls(profile: ProfileImages | undefined): Set<string> {
  const urls = new Set<string>();
  if (profile?.primaryImageCdn) urls.add(profile.primaryImageCdn);
  if (profile?.galleryImages && typeof profile.galleryImages === 'object') {
    for (const [field, url] of Object.entries(profile.galleryImages)) {
      if (field.endsWith('CDN') && typeof url === 'string' && url)
        urls.add(url);
    }
  }
  return urls;
}

async function cleanupUnreferencedImages(profileId: string, urls: string[]) {
  if (urls.length === 0) return;

  let retained: Set<string>;
  try {
    const current = await db.query.profiles.findFirst({
      where: eq(profiles.id, profileId),
      columns: { primaryImageCdn: true, galleryImages: true },
    });
    retained = savedImageUrls(current);
  } catch (error) {
    // A failed commit can have an uncertain outcome. Keep objects if we cannot
    // establish that the database no longer references them.
    console.error('Could not verify profile image cleanup:', {
      profileId,
      error,
    });
    return;
  }

  for (const url of new Set(urls)) {
    if (retained.has(url)) continue;
    try {
      if (!(await deleteFile(url))) {
        console.error('Profile image cleanup failed:', { profileId, url });
      }
    } catch (error) {
      console.error('Profile image cleanup failed:', { profileId, url, error });
    }
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'No user session available' },
      { status: 401 }
    );
  }
  const userId = session.user.id;

  /* Resolve the same row the rest of the account does. This looked the profile
     up by email, while /api/getProfile -- which is what the settings page and
     the images page read back from -- resolves the *active* profile for the
     signed-in user: a cookie selection they can administer, else their own row
     by userId. Those are not always the same record. Anyone acting as a
     business listing wrote their picture to one profile and then displayed
     another, and several rows can share an email, so findFirst could pick a
     different one on either side. Writing where the page is looking is the
     difference between a saved picture appearing and vanishing. */
  const listingId = request.nextUrl.searchParams.get('listingId');
  const scopedListing =
    listingId !== null ? await getEditableProfile(userId, listingId) : null;
  if (listingId !== null && !scopedListing) {
    return NextResponse.json(
      { success: false, error: 'You do not manage that business listing.' },
      { status: 403 }
    );
  }
  const activeId =
    listingId !== null ? scopedListing?.id : await getActiveProfileId(userId);

  const existingProfile = activeId
    ? await db.query.profiles.findFirst({
        where: eq(profiles.id, activeId),
        with: { user: { columns: { screenname: true } } },
      })
    : await ensureProfile(userId, session.user.email ?? undefined);

  if (!existingProfile) {
    return NextResponse.json(
      { success: false, error: 'Could not find profile' },
      { status: 401 }
    );
  }

  // Use screenname for storage path, fall back to profile id
  const handle = existingProfile.user?.screenname || existingProfile.id;
  const stagedUrls: string[] = [];

  try {
    // Use Web API formData() instead of busboy
    const formData = await request.formData();
    const uploadedFiles: {
      fieldname: string;
      filename: string;
      data: Buffer;
      ext: string;
    }[] = [];

    const acceptedFields = ['primary', 'gallery1', 'gallery2', 'gallery3'];

    /* R2 needs an extension to serve the file back with a usable content
       type, so anything not in here cannot be stored. It is reported rather
       than skipped: quietly dropping a file the member chose, and then
       answering "success", is what let this endpoint look like it worked
       while saving nothing at all. */
    const extByType: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };

    const rejected: string[] = [];

    // Process each form entry
    for (const [fieldname, value] of formData.entries()) {
      if (!(value instanceof File) || !acceptedFields.includes(fieldname)) {
        continue;
      }

      /* An untouched file input still submits, as an empty file. That is not
         a member choosing something unusable, so it is passed over without
         complaint -- the images page posts four slots at once and usually
         means only one of them. */
      if (value.size === 0) {
        continue;
      }

      console.log('onFile', fieldname, value.name, value.type, value.size);

      const ext = extByType[value.type];
      if (!ext) {
        rejected.push(
          `${value.name || fieldname} (${value.type || 'unrecognised type'})`
        );
        continue;
      }

      // Convert File to Buffer
      const arrayBuffer = await value.arrayBuffer();
      const data = Buffer.from(arrayBuffer);

      const fileName = `profile/${handle}/${fieldname}-${crypto.randomUUID()}.${ext}`;
      console.log('fileName', fileName);
      uploadedFiles.push({
        data: data,
        filename: fileName,
        fieldname: fieldname,
        ext: ext,
      });
    }

    if (rejected.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Could not use ${rejected.join(', ')}. Images need to be JPG, PNG, or WebP.`,
        },
        { status: 400 }
      );
    }

    if (uploadedFiles.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No image was received.' },
        { status: 400 }
      );
    }

    // Track updates for primary image and gallery images
    let primaryImageUpdate: {
      primaryImageId?: string;
      primaryImageCdn?: string;
    } = {};
    const galleryImagesUpdate: Record<string, string> = {};

    // Process all uploaded files
    for (const file of uploadedFiles) {
      const filePath = await uploadFile(file.filename, file.data);
      /* Storage refusing the file used to be skipped over, which meant the
         member was told the picture had saved while nothing had been
         written. If it cannot be stored, say so. */
      if (!filePath) {
        await cleanupUnreferencedImages(existingProfile.id, stagedUrls);
        return NextResponse.json(
          {
            success: false,
            error: 'The image could not be saved to storage. Please try again.',
          },
          { status: 500 }
        );
      }
      stagedUrls.push(filePath);
      console.log('filePath', filePath);

      if (file.fieldname === 'primary') {
        primaryImageUpdate = {
          primaryImageId: file.filename,
          primaryImageCdn: filePath,
        };
      } else {
        galleryImagesUpdate[file.fieldname] = file.filename;
        galleryImagesUpdate[file.fieldname + 'CDN'] = filePath;
      }
    }

    // Network uploads finish before locking. Merge only the selected slots
    // into the current row, not the snapshot taken before those uploads.
    const saved = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(profiles)
        .where(eq(profiles.id, existingProfile.id))
        .for('update');
      if (
        !current ||
        !(listingId !== null
          ? await getEditableProfile(userId, listingId, tx)
          : await canAdministerProfile(userId, current.id, tx))
      ) {
        return null;
      }

      const currentGallery =
        current.galleryImages && typeof current.galleryImages === 'object'
          ? current.galleryImages
          : {};
      const [updatedProfile] = await tx
        .update(profiles)
        .set({
          ...primaryImageUpdate,
          ...(Object.keys(galleryImagesUpdate).length > 0
            ? {
                galleryImages: {
                  ...currentGallery,
                  ...galleryImagesUpdate,
                },
              }
            : {}),
        })
        .where(eq(profiles.id, current.id))
        .returning();
      if (!updatedProfile) throw new Error('The edited profile was not saved.');

      const retained = savedImageUrls(updatedProfile);
      const cleanupUrls = [
        ...new Set([...savedImageUrls(current), ...stagedUrls]),
      ].filter((url) => !retained.has(url));
      return { updatedProfile, cleanupUrls };
    });

    if (!saved) {
      await cleanupUnreferencedImages(existingProfile.id, stagedUrls);
      return NextResponse.json(
        { success: false, error: 'You do not manage that profile.' },
        { status: 403 }
      );
    }
    const { updatedProfile, cleanupUrls } = saved;
    await cleanupUnreferencedImages(updatedProfile.id, cleanupUrls);

    console.log('save');
    try {
      revalidatePublicListing(updatedProfile.id, updatedProfile.screenname);
    } catch (error) {
      console.error(
        'Profile image save committed but revalidation failed:',
        error
      );
    }

    /* Pana Social draws avatars from social_actors.icon_url, a copy of the
       picture kept alongside the actor because federation serves it to other
       servers from there. That copy was written once, when the actor was
       created, and never again: syncActorFromProfile exists for precisely this
       and had no callers anywhere in the codebase. So a picture set or changed
       after enrolling stayed on the profile and never reached the feed, the
       composer, or anyone following from another server -- the account chrome
       reads the profile directly, which is why it was the only place the new
       picture appeared. */
    if (primaryImageUpdate.primaryImageCdn) {
      try {
        await syncActorFromProfile(updatedProfile.id);
      } catch (error) {
        /* The picture is already stored and the profile already updated, so
           failing the request here would be its own kind of lie. Log it and
           let the save stand: the avatar is correct everywhere that reads the
           profile, and stale only on the social copy. */
        console.error('Actor icon sync failed:', error);
      }
    }

    return NextResponse.json(
      { success: true, data: updatedProfile },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('Upload error:', error);
    await cleanupUnreferencedImages(existingProfile.id, stagedUrls);
    return NextResponse.json(
      {
        success: false,
        error:
          'Upload failed: ' +
          (error instanceof Error ? error.message : String(error)),
      },
      { status: 500 }
    );
  }
}
