import type { GetServerSideProps, NextPage } from 'next'
import { useRouter } from 'next/router';
import { QueryClient, dehydrate, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconExternalLink, IconBrandInstagram, IconBrandFacebook } from '@tabler/icons';

import styles from '@/styles/profile/Profile.module.css'
import PageMeta from '@/components/PageMeta';
import Spinner from '@/components/Spinner';
import { fetchPublicProfile, profilePublicQueryKey } from '@/lib/query/profile';
import { serialize } from '@/lib/standardized';

export const getServerSideProps: GetServerSideProps = async function (context) {
  const handle = context.query.handle as string;
  const queryClient = new QueryClient();
  const profileLib = await import("@/lib/server/profile");
  if (handle) {
    await queryClient.prefetchQuery({
      queryKey: [ profilePublicQueryKey, { handle }],
      initialData: serialize(await profileLib.getPublicProfile(handle)),
    });
  }
  return {
    props: {
      dehydratedState: dehydrate(queryClient),
    },
  }
}

const Profile_Public: NextPage = () => {
  const router = useRouter();
  const handle = router.query.handle as string;
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: [ profilePublicQueryKey, { handle }],
    queryFn: () => fetchPublicProfile(handle),
  });

  if (!data) {
    return (
      <article className={styles.profileCard}>
        <Spinner />
      </article>
    )
  }
  
  return (
    <main className={styles.app}>
      <PageMeta
        title={data.name}
        desc={data.details}
        />
      <div className={styles.main}>
        <article className={styles.profileCard}>
            <div className={styles.profileHeader}>
              <div className={styles.profileImage}>
                <img src="/img/bg_coconut_blue.jpg" />
              </div>
              <div className={styles.profilePrimary}>
                <h2>{data.name}</h2>
                <p className={styles.profileFiveWords}>{data.five_words}</p>
                <p>{data.details}</p>
              </div>
              <div className={styles.socialLinks}>
                <div>
                { data.socials?.website && 
                    <a href={data.socials.website.toString()}>
                      <IconExternalLink height="32" width="32" color="white" />
                    </a>
                    }
                    { data.socials?.instagram && 
                    <a href={data.socials.instagram.toString()}>
                      <IconBrandInstagram height="32" width="32" color="white" />
                    </a>
                    }
                    { data.socials?.facebook && 
                    <a href={data.socials.facebook.toString()}>
                      <IconBrandFacebook height="32" width="32" color="white" />
                    </a>
                    }
                </div>
              </div>
            </div>
            <div className={styles.profileInfo}>
              <div>
                <label>Background</label>
                <div>{data.background}</div>
              </div>
              <div>
                <label>Tags</label>
                <div>{data.tags}</div>
              </div>
            </div>
          </article>
        </div>
    </main>
  )

}

export default Profile_Public
