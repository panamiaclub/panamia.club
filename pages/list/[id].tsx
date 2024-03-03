import type { GetServerSideProps, NextPage } from 'next'
import { useRouter } from 'next/router';
import { QueryClient, dehydrate } from '@tanstack/react-query';
import Link from 'next/link';

import styles from '@/styles/list/List.module.css';
import PageMeta from '@/components/PageMeta';
import Spinner from '@/components/Spinner';
import { profilePublicQueryKey } from '@/lib/query/profile';
import { serialize } from '@/lib/standardized';
import { useUserlistPublic } from '@/lib/query/userlist';
import { ProfileInterface } from '@/lib/interfaces';
import PanaButton from '@/components/PanaButton';
import PanaLinkButton from '@/components/PanaLinkButton';

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

  const { data: userlistData, isLoading } = useUserlistPublic(list_id);

  if (!userlistData) {
    return (
      <div>
        <Spinner />
      </div>
    )
  }

  let profilesElements = [<div key="0"></div>];
  if (userlistData && userlistData.profiles.length > 0) {
    profilesElements = userlistData.profiles.map((item: ProfileInterface, index: number) => {
      return (
        <article className={styles.userlistCard} key={index}>
          <div className={styles.listCardImage}>
            { item?.images?.primaryCDN && 
            <img src={item.images?.primaryCDN} /> ||
            <img src="/img/bg_coconut_blue.jpg" />
            }
          </div>
          <div className={styles.listCardName}>
            {item.name}
          </div>
          <div className={styles.listCardAction}>
            <PanaLinkButton><Link href={`/profile/${item.slug}`}><a>View</a></Link></PanaLinkButton>
          </div>
        </article>
      ) });
  } else {
    profilesElements = [(
      <article className={styles.profileListEmpty} key={0}>
        <div>There's no profiles on this list yet.</div>
      </article>
    )];
  }
  
  return (
    <main className={styles.app}>
      <PageMeta
        title={`List: ${userlistData.list?.name}`}
        desc={userlistData.list?.desc}
        />
      <div className={styles.main}>
        <h2>List: {userlistData.list?.name}</h2>
        { userlistData.list?.desc && 
        <p>{userlistData.list?.desc}</p>}
        { profilesElements }
      </div>
    </main>
  )
}

export default List_Public
