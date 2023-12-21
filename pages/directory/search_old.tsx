import type { NextPage } from 'next'
import { useRouter } from 'next/router';
import axios from 'axios';
import Link from 'next/link';
import { IconUserCircle, IconHeart, IconExternalLink, IconBrandInstagram,
   IconBrandFacebook, IconForms, IconSearch, IconStar, IconFilter,
  IconMap, 
  IconLocation,
  IconCategory,
  IconMapPin,
  IconCurrentLocation} from '@tabler/icons';

import styles from '@/styles/Directory.module.css'
import PanaButton from '@/components/PanaButton';
import { useEffect, useState } from 'react';
import { ProfileSocialsInterface } from '@/lib/interfaces';
import { useQuery } from '@tanstack/react-query';
import { debounce, slugify } from '@/lib/standardized';
import PageMeta from '@/components/PageMeta';
import { countyList, profileCategoryList } from '@/lib/lists';

interface searchResultsInterface {
  _id: String,
  score: number,
  name: String,
  slug: String,
  details: String,
  five_words: String,
  primary_address?: { city?: String },
  socials: {},
}

const fetchSearch = async (pageLimit: number, pageNum: number, searchTerm: string) => {
  console.log(slugify("JOЯGE BARR"))
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
  const [pageLimit, setPageLimit] = useState(20);
  const [pageNum, setPageNumber] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFiltersLocation, setSelectedFiltersLocation] = useState([] as any[]);
  const [selectedFiltersCategory, setSelectedFiltersCategory] = useState([] as any[]);
  const [selectedFiltersAll, setSelectedFiltersAll] = useState([] as any[]);

  const { data, isLoading, isFetching, isRefetching, refetch } = useQuery({
    queryKey: ['directorySearch', {pageLimit, pageNum, searchTerm}],
    queryFn: () => fetchSearch(pageLimit, pageNum, searchTerm),
    enabled: false,
  });

  // console.log("isLoading", isLoading);
  // console.log("isFetching", isFetching);
  // console.log("isRefetching", isRefetching);
  function submitSearchForm(e: any) {
    e.preventDefault();
    const value = (document.getElementById('search-field') as HTMLInputElement).value
    console.log('submitSearchForm', value);
    setSearchTerm(value);
    refetch();
  }

  function useFiltersModal(e:any) {
    const dialog = (document.getElementById('dialog-search-filters') as HTMLDialogElement)
    if (dialog.open) {
      dialog.close()
    } else {
      dialog.show()
    }
  }

  function updateFiltersLocation(e:any) {
    const value = e.target.value;
    const valuePosition = selectedFiltersLocation.indexOf(value);
    if (valuePosition === -1) {
      const addedToArray = Array.from(selectedFiltersLocation);
      addedToArray.push(value);
      setSelectedFiltersLocation(addedToArray);
    } else {
      const removedFromArray = Array.from(selectedFiltersLocation);
      removedFromArray.splice(valuePosition, 1);
      setSelectedFiltersLocation(removedFromArray);
    }
    console.log(value, selectedFiltersLocation);
  }

  function updateFiltersCategory(e:any) {
    const value = e.target.value;
    const valuePosition = selectedFiltersCategory.indexOf(value);
    if (valuePosition === -1) {
      const addedToArray = Array.from(selectedFiltersCategory);
      addedToArray.push(value);
      setSelectedFiltersCategory(addedToArray);
    } else {
      const removedFromArray = Array.from(selectedFiltersCategory);
      removedFromArray.splice(valuePosition, 1);
      setSelectedFiltersCategory(removedFromArray);
    }
    console.log(value, selectedFiltersCategory);
  }

  function FiltersStatus() {
    let filterString = "";
    if (selectedFiltersLocation.length > 0) {
      filterString = filterString + (filterString.length > 0 ? ", " : "");
      filterString = filterString + `Location: [${selectedFiltersLocation.length}]`;
    }
    if (selectedFiltersCategory.length > 0) {
      filterString = filterString + (filterString.length > 0 ? ", " : "");
      filterString = filterString + `Category: [${selectedFiltersCategory.length}]`;
    }
    if (filterString.length === 0) {
      filterString = "none"
    }
    return (
      <>{filterString}</>
    );
  }


  let searchResults = (
    <div className={styles.noResults}>
        <p>Your search returned no results or you haven't searched yet. You can leave
        the search field empty and click search to explore locals near you!</p>
        <p>Select an option below to try out these popular categories!</p>
        <p>
          <a href="">Music</a>&emsp;
          <a href="">Food</a>&emsp;
          <a href="">Clothing</a>&emsp;
        </p>
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
            { item?.primary_address?.city && 
              <div className={styles.cardLocation}><IconMapPin height="20" />{item.primary_address.city}</div>
            }
            <div className={styles.cardDetails}>{item.details}</div>
            <div className={styles.cardActions}>
              <>
              <Link href={`/profile/${item.slug}`}><a><IconUserCircle height="20" />View Profile</a></Link>&emsp;
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
          <p>
            <a href="">Music</a>&emsp;
            <a href="">Food</a>&emsp;
            <a href="">Clothing</a>&emsp;
          </p>
      </div>
    )
  }

  return (
    <>
      <section className={styles.searchFormContainer}>
        <form role="search" className={styles.searchForm} onSubmit={submitSearchForm}>
          <label htmlFor="search-field">Enter a name, keyword or search by location to find local creatives and businesses!</label><br />
          <fieldset className={styles.searchFieldBar}>
          <input id="search-field" type="search" value={searchTerm}
            onChange={(e: any) => {setSearchTerm(e.target.value)}}
            className={styles.searchField}
            placeholder="Search Pana Mia" role="searchbox" />
            <div className={styles.searchButton} title="Click to search!">
              <PanaButton color="blue" type="submit"><span className="sr-only">Click to Search</span><IconSearch height="20" /></PanaButton>
            </div>
          </fieldset>
        </form>
      </section>
      <div className={styles.allSearch}>
        <section className={styles.searchFilters}>
          <div title="Click to get random results!">
            <PanaButton color="yellow">
              <IconStar height="20" />
              <span className="sr-only">Click to get random results</span>
            </PanaButton>
          </div>
          <div>
            <button className={styles.filtersButton}
            onClick={useFiltersModal}>
              <IconFilter height="20" />
              <span>Filters:&nbsp;</span>
              <small><FiltersStatus /></small>
            </button>
            <dialog id="dialog-search-filters" className={styles.filtersModal}>
              <div className={styles.filtersLocation}>
                <strong><IconMap height="20" />&nbsp;Location</strong><br />
                <label><input type="checkbox" value="mylocation" />&nbsp;Nearby <IconCurrentLocation height="20" /></label>
                {countyList && 
                  countyList.map((item, index) => {
                    return (
                      <label key={index}>
                        <input type="checkbox" value={item.value}
                        checked={selectedFiltersLocation.includes(item.value)}
                        onChange={updateFiltersLocation} />&nbsp;{item.desc}
                      </label>
                    )
                  })
                }
              </div>
              <div className={styles.filtersCategory}>
                <strong><IconCategory height="20" />&nbsp;Category</strong><br />
                {profileCategoryList && 
                  profileCategoryList.map((item, index) => {
                    return (
                      <label key={index}>
                        <input type="checkbox" value={item.value} 
                        checked={selectedFiltersCategory.includes(item.value)}
                        onChange={updateFiltersCategory} />&nbsp;{item.desc}
                        </label>
                    )
                  })
                }
              </div>
              <PanaButton>Apply</PanaButton>
              <PanaButton onClick={useFiltersModal}>Close</PanaButton>
            </dialog>
          </div>
        </section>
        <section className={styles.searchBody}>
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
          { searchResults && 
            <div className={styles.searchLoginCallout}>
              <Link href="/signin"><a>Sign In</a></Link> to save <IconHeart height="20" color="red" fill="red" /> favorites and follow their updates! 
            </div>
          }
        </section>
        <section className={styles.directoryReferrals}>
          <p>Don't see your favorite local spot here? <Link href="/form/contact-us">Send us a recommendation!</Link></p>
        </section>
      </div>
    </>
  )
}

const Directory_Search: NextPage = () => {
  const router = useRouter();
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
      </div>
  </main>
  )
}

export default Directory_Search
