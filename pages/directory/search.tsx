import type { NextPage } from 'next'
import { useRouter } from 'next/router';
import axios from 'axios';
import Link from 'next/link';
import { IconUserCircle, IconHeart, IconExternalLink, IconBrandInstagram,
   IconBrandFacebook, IconForms, IconSearch, IconStar } from '@tabler/icons';

import styles from '@/styles/Directory.module.css'
import PanaButton from '@/components/PanaButton';
import { useEffect, useState } from 'react';
import { ProfileSocialsInterface } from '@/lib/interfaces';
import { useQuery } from '@tanstack/react-query';
import { debounce } from '@/lib/standardized';
import PageMeta from '@/components/PageMeta';

interface searchResultsInterface {
  _id: String,
  score: number,
  name: String,
  details: String,
  five_words: String,
  socials: {},
}

const Directory_Search: NextPage = () => {
  const router = useRouter();
  console.log(router.query);
  let default_search_term = "";
  if (router.query.q) {
    default_search_term =router.query.q.toString();
  }
  let default_page_number = 1;
  if (router.query.page && !isNaN(Number(router.query.page))) {
    default_page_number = Number(router.query.page);
  }
  let default_page_limit = 20;
  if (router.query.limit && !isNaN(Number(router.query.limit))) {
    default_page_limit = Number(router.query.limit);
  }

  // const [searchValue, setSearchValue] = useState(default_page_number);

  // const state = { page_number: page_number, search: search_term };
  // const url = `/directory/search?${params}`;
  // history.pushState(state, "", url);

  const fetchSearch = async (pageLimit: number, pageNum: number, searchTerm: string) => {
    console.log('fetchSearch', pageLimit, pageNum, searchTerm);
    const params = new URLSearchParams();
    params.append("q", searchTerm);
    if (pageNum > 1) {
      params.append("page", pageNum.toString())
    }
    if (pageLimit !== 20) {
      params.append("limit", pageLimit.toString())
    }
    const searchResults = await axios
    .get(
        `/api/getDirectorySearch?${params}`,
        {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
        }
    )
    .catch((error) => {
        console.log(error);
    });
    if (searchResults) {
      return searchResults.data.data;
    }
    return {};
  }

  const SearchFormAndList = () => {
    const [pageLimit, setPageLimit] = useState(default_page_limit);
    const [pageNum, setPageNumber] = useState(default_page_number);
    const [searchTerm, setSearchTerm] = useState(default_search_term);
    const { data, isLoading, isFetching, refetch } = useQuery({
      queryKey: ['directorySearch', {pageLimit, pageNum, searchTerm}],
      queryFn: () => fetchSearch(pageLimit, pageNum, searchTerm),
      manual: true,
      enabled: false,
    });


    let searchResults = (
      <div className={styles.noResults}>
          <p>Your search returned no results or you haven't searched yet. You can leave
          the search field empty and click search to explore locals near you!</p>
          <p>Select an option below to try out these popular categories!</p>
          <p><a href="">Foo</a>&emsp;<a href="">Bar</a>&emsp;</p>
      </div>
    )
  
    if (isLoading) {
      searchResults = (
        <div className={styles.noResults}>
            <p>Loading...</p>
        </div>
      )
    }
    if (data && data.length > 0) {
      searchResults = data.map((item: searchResultsInterface, index: number) => {
        const socials = item.socials as ProfileSocialsInterface;
        return (
          <article key={index} className={styles.profileCard}>
            <div className={styles.profileCardImage}>
              <img src="/img/bg_coconut_blue.jpg" />
            </div>
            <div className={styles.profileCardInfo}>
              <div className={styles.cardName}>{item.name}</div>
              <div className={styles.cardFiveWords}>{item.five_words}</div>
              <div className={styles.cardDetails}>{item.details}</div>
              <div className={styles.cardActions}>
                <>
                <a href=""><IconUserCircle height="20" />View Profile</a>&emsp;
                <a href=""><IconHeart height="20" />Add to Favorites</a>
                </>
                <div className={styles.cardlinks}>
                  { socials?.website && 
                  <a href={socials.website.toString()}>
                    <IconExternalLink height="24" width="24" />
                  </a>
                  }
                  { socials?.instagram && 
                  <a href={socials.instagram.toString()}>
                    <IconBrandInstagram height="24" width="24" />
                  </a>
                  }
                  { socials?.facebook && 
                  <a href={socials.facebook.toString()}>
                    <IconBrandFacebook height="24" width="24" />
                  </a>
                  }
                </div>
              </div>
            </div>
          </article>
        );
      });
    } else {
      searchResults = (
        <div className={styles.noResults}>
            <p>Your search returned no results or you haven't searched yet. You can leave
            the search field empty and click search to explore locals near you!</p>
            <p>Select an option below to try out these popular categories!</p>
            <p><a href="">Foo</a>&emsp;<a href="">Bar</a>&emsp;</p>
        </div>
      )
    }

    return (
    <>
      <section className={styles.searchForm}>
        <form role="search">
          <label htmlFor="search-field">Enter a name, keyword or search by location to find local creatives and businesses!</label><br />
          <fieldset className={styles.searchFieldBar}>
          <input id="search-field" type="search" value={searchTerm} className={styles.searchField}
            placeholder="enter a search here" role="searchbox"
            onChange={(e:any) => {setSearchTerm(e.target.value)}} />
            <div title="Click to search!">
              <PanaButton color="blue" onClick={refetch}><span className="sr-only">Click to Search</span><IconSearch height="20" /></PanaButton>
            </div>
            <div title="Click to get random results!">
              <PanaButton color="yellow"><span className="sr-only">Click to get random results</span><IconStar height="20" /></PanaButton>
            </div>
          </fieldset>
        </form>
      </section>
      <section className={styles.searchBody}>
        { searchResults && 
          <div className={styles.searchLoginCallout}>
            <Link href="/signin"><a>Sign In</a></Link> to save <IconHeart height="20" color="red" fill="red" /> favorites and follow their updates! 
          </div>
        }
        {searchResults}
        <article className={styles.profileCardSignup}>
            <div className={styles.profileCardImage}>
              <img src="/img/bg_coconut.jpg" />
            </div>
            <div className={styles.profileCardInfo}>
              <div className={styles.cardName}>Your Profile Here!</div>
              <div className={styles.cardFiveWords}>Join the Pana Mia community</div>
              <div className={styles.cardDetails}>A listing is an awesome way to share your work 
                with the South Florida community.</div>
              <div className={styles.cardActions}>
                <>
                <Link href="/form/become-a-pana"><a><IconForms height="20" />Sign up to see your business listed!</a></Link>&emsp;
                </>
              </div>
            </div>
          </article>
      </section>
    </>
  )
  }

  return (
    <main className={styles.app}>
      <PageMeta title="Search for locals"
        desc="Search our directory of South Florida locals to find amazing creatives and businesses" />
        <div className={styles.main}>
          <section className={styles.header}>
            <h2>Welcome to the Pana Mia Directory</h2>
            <h3>Explore South Florida locals and communities</h3>
          </section>
          <SearchFormAndList />
          <section className={styles.directoryReferrals}>
            <p>Don't see your favorite local spot here? <Link href="/form/contact-us">Send us a recommendation!</Link></p>
          </section>
      </div>
  </main>
  )
}

export default Directory_Search
