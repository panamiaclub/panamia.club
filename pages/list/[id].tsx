import type { GetServerSideProps, NextPage } from 'next'
import { useRouter } from 'next/router';
import { QueryClient, dehydrate, useQuery } from '@tanstack/react-query';

import styles from '@/styles/profile/Profile.module.css'
import PageMeta from '@/components/PageMeta';
import Spinner from '@/components/Spinner';
import { profilePublicQueryKey } from '@/lib/query/profile';
import { serialize } from '@/lib/standardized';
import { fetchUserlistPublic, useUserlistPublic } from '@/lib/query/userlist';

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

const List_Public: NextPage = () => {
  const router = useRouter();
  const list_id = router.query.id as string;

  const { data, isLoading } = useUserlistPublic(list_id);

  if (!data) {
    return (
      <div>
        <Spinner />
      </div>
    )
  }
  
  return (
    <main className={styles.app}>
      <PageMeta
        title={data.name}
        desc={data.desc}
        />
      <div className={styles.main}>
        {data.name}
      </div>
    </main>
  )
}

export default List_Public
