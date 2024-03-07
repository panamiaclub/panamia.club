import type { GetServerSideProps, NextPage } from 'next'
import { NextRouter, useRouter } from 'next/router';
import Link from 'next/link';
import { IconUserCircle, IconHeart, IconExternalLink, IconBrandInstagram,
  IconBrandFacebook, IconForms, IconSearch, IconStar, IconFilter,
  IconMap, IconCategory, IconMapPin, IconCurrentLocation, IconList, 
  IconSortDescending, IconMapPins, IconHeartBroken} from '@tabler/icons';
import { QueryClient, dehydrate } from '@tanstack/react-query';
import { FormEvent } from 'react';

import styles from '@/styles/Directory.module.css'
import PanaButton from '@/components/PanaButton';
import { ProfileSocialsInterface } from '@/lib/interfaces';
import { forceInt, forceString, serialize } from '@/lib/standardized';
import PageMeta from '@/components/PageMeta';
import { countyList, profileCategoryList } from '@/lib/lists';
import { directorySearchKey, useSearch, SearchResultsInterface } from '@/lib/query/directory';
import { calcDistance, getGeoPosition } from '@/lib/geolocation';
import { useUser } from '@/lib/query/user';

function getSearchParams(q: any) {
  const pageNum = q.p ? forceInt(q.p as string, 1) : 1;
  const pageLimit = q.l ? forceInt(q.l as string, 20) : 20;
  const searchTerm = q.q ? q.q as string : "";
  const random = q.random ? forceInt(q.random as string, 0) : 0;
  const geolat =  q.geolat ? q.geolat : null;
  const geolng =  q.geolng ? q.geolng : null;
  const filterLocations = q.floc ? q.floc as string : "";
  const filterCategories = q.fcat ? q.fcat as string : "";
  const resultsView = q.v ? q.v as string : "list";

  return { pageNum, pageLimit, searchTerm, geolat, geolng,
    filterLocations, filterCategories, random, resultsView}
}

export const getServerSideProps: GetServerSideProps = async function (context) {
  const params = getSearchParams(context.query);

  let searchData = [];
  if (params.searchTerm || params.random) {
    const directoryLib = await import("@/lib/server/directory");
    searchData = serialize(await directoryLib.getSearch(params)).data
  }

  const queryClient = new QueryClient();
  // console.log("searchData", searchData);
  console.log("server:params", params);
  await queryClient.prefetchQuery({
    queryKey: [ directorySearchKey, params],
    initialData: searchData,
  });

  return {
    props: {
      dehydratedState: dehydrate(queryClient)
    },
  }
}


function detailLimit(details: String) {
  if (details?.length > 100) {
    return `${details.substring(0, 50)}...`;
  }
  return details;
}

function SearchResults(
  {data, isLoading, params}: {data: SearchResultsInterface[], isLoading: boolean, params: any}
  ) {

  const { data: userData } = useUser();
 
  // console.log("data", data, "isLoading", isLoading)
  if (isLoading === true) {
    return (
      <div className={styles.noResults}>
        <p>Loading...</p>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className={styles.noResults}>
        <p>Your search returned no results. You can leave
        the search field empty and click search to explore locals near you!</p>
        <p>Select an option below to try out these popular categories!</p>
        <p>
          <Link href="/account/admin/panaprofiles/?q=music"><a>Music</a></Link>&emsp;
          <Link href="/account/admin/panaprofiles/?q=food"><a>Food</a></Link>&emsp;
          <Link href="/account/admin/panaprofiles/?q=clothing"><a>Clothing</a></Link>&emsp;
        </p>
      </div>
    )
  }

  const searchResults = data.map((item: SearchResultsInterface, index: number) => {
    const socials = item.socials as ProfileSocialsInterface;
    const lat = (item?.geo?.coordinates) ? item.geo.coordinates[1] : null;
    const lng = (item?.geo?.coordinates) ? item.geo.coordinates[0] : null;
    let distance = 0;
    if (params?.geolat && params?.geolng && lat && lng) {
      distance = calcDistance(params.geolat, params.geolng, lat, lng);
    }
    const profileId = item._id as string;
    
    
    return (
      <article key={index} className={styles.profileCard} data-score={item.score}>
        <div className={styles.profileCardImage}>
          { item?.images?.primaryCDN && 
          <img src={item.images.primaryCDN} /> ||
          <img src="/img/bg_coconut_blue.jpg" />
          }
        </div>
        <div className={styles.cardName}>
          {item.name}
         
        </div>
        <div className={styles.cardLocationContainer}>
        { item?.primary_address?.city && 
            <div className={styles.cardLocation}>
              <IconMapPin height="20" />{item.primary_address.city}
              { distance > 0 && 
                <small>&nbsp;{distance.toFixed(2)} miles away</small>
              }
              </div>
          }
        </div>
        <div className={styles.cardDetails}>{detailLimit(item.details)}</div>
        <div className={styles.cardActions}>
        {/* {item?.active && <button className={styles.deActivateButton} onClick={() => deactivate(item._id)}>Deactivate Profile</button> }
        {!item?.active && <button className={styles.activateButton} onClick={() => activate(item._id)}>Activate Profile</button> } */}
          <Link href={'manageprofile/' + item.slug}><a><IconUserCircle height="20" />Manage Profile</a></Link>&emsp;
        
          <div className={styles.cardlinks} hidden>
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
        <div className={styles.profileCardInfo}>
          
        </div>
      </article>
    );
  });
  return (
    <>
    {searchResults}
    </>
  )
}

const Pana_Profiles: NextPage = (props: any) => {
  const router = useRouter();
  const params = getSearchParams(router.query);
  console.log("client:params", params);
  const geo_toggle = (params.geolat && params.geolng) ? true : false;
  // const sortby = params.s ? params.s : "score";

  const { data, isLoading, refetch } = useSearch(params);

  function submitSearchForm(e: FormEvent, formData: FormData) {
    e.preventDefault();
    formData.forEach((value, key) => console.log(key, value));
    const searchTerm = formData.get("search_term") ? formData.get("search_term") as string : "";
    const qs = new URLSearchParams();
    qs.append("q", searchTerm);
    router.push(`/account/admin/panaprofiles/?${qs}`);
  }

  

  function applyView(e: FormEvent) {
    // TODO: list (default) or map
  }

  function applyFilters(e: FormEvent, formData: FormData) {
    e.preventDefault();
    let selectedLoc: string[] = [];
    let selectedCat: string[] = [];
    formData.forEach((value, key) => {
      if (key.substring(0,4) === "loc_") {
        selectedLoc.push(value as string);
      }
      if (key.substring(0,4) === "cat_") {
        selectedCat.push(value as string);
      }
    }
    );
    const filtersLoc = selectedLoc.join("+");
    console.log(filtersLoc);
    const filtersCat = selectedCat.join("+");
    console.log(filtersCat);
    const params = new URLSearchParams(window.location.search);
    params.set("floc", filtersLoc);
    params.set("fcat", filtersCat);
    console.log("filter:params", `${params}`.replace("%2B","+"))
    router.push(`/directory/search/?${params}`);
    // console.log(window.location.search);
  }

  const setPage = async (e: FormEvent, newPage: number) => {
    e.preventDefault();
    const params = new URLSearchParams(window.location.search);
    params.set("p", newPage.toString());
    router.push(`/directory/search/?${params}`);
  }

  const applyGeo = async (e: FormEvent) => {
    e.preventDefault();
    const geo_toggle = document.getElementById('geo_toggle') as HTMLInputElement;
    const params = new URLSearchParams(window.location.search);
    if (params.get("geolng") && params.get("geolat")) {
      params.delete("geolat");
      params.delete("geolng");
      router.push(`/directory/search/?${params}`);
    } else {
      const location = await getGeoPosition();
      params.set("geolat", location.coords.latitude);
      params.set("geolng", location.coords.longitude);
      router.push(`/directory/search/?${params}`);
    }
  }

  function useFiltersModal(e:any) {
    const dialog = (document.getElementById('dialog-search-filters') as HTMLDialogElement)
    if (dialog.open) {
      dialog.close();
    } else {
      dialog.show();
    }
  }

  function useSortModal(e:any) {
    const dialog = (document.getElementById('dialog-search-sort') as HTMLDialogElement)
    if (dialog.open) {
      dialog.close();
    } else {
      dialog.show();
    }
  }

  function searchRandom() {
    router.push("/directory/search/?random=1");
    // TO-DO: Every random search should invalidate the query
  }

  function getQueryString(router: NextRouter) {
    const queryPos =  router.asPath.indexOf("?");
    return (queryPos > 0 ? router.asPath.substring(queryPos) : "");
  }


  function FiltersStatus() {
    const params = new URLSearchParams(getQueryString(router));
    const locationsParams = params.get("floc")?.split("+") ||  [];
    const categoryParams = params.get("fcat")?.split("+") || [];
    let locationsSelected = [];
    countyList.forEach((item) => {
      if (locationsParams.includes(item.value)) {
        locationsSelected.push(item.desc);
      }
    });
    let categoriesSelected = [];
    profileCategoryList.forEach((item) => {
      if (categoryParams.includes(item.value)) {
        categoriesSelected.push(item.desc);
      }
    });
    let filterString = "";
    if (locationsSelected.length > 0) {
      filterString = filterString + (filterString.length > 0 ? ", " : "");
      filterString = filterString + `Location: [${locationsSelected.length}]`;
    }
    if (categoriesSelected.length > 0) {
      filterString = filterString + (filterString.length > 0 ? ", " : "");
      filterString = filterString + `Category: [${categoriesSelected.length}]`;
    }
    if (filterString.length === 0) {
      filterString = "none";
    }
    return (
      <>{filterString}</>
    );
  }

  
  const totalResults = data ? data[0]?.meta?.count?.total : 0;
  const totalPages = totalResults ? Math.ceil(totalResults / params.pageLimit) : 1;
  const pagination = {
    previous: params.pageNum - 1,
    current: params.pageNum,
    next: params.pageNum < totalPages ? params.pageNum + 1 : 0,
    pages: totalPages,
    results: totalResults,
  }
  // console.log("pagination", pagination);

  return (
    <main className={styles.app}>
      <PageMeta title="Search for locals"
        desc="Search our directory of South Florida locals to find amazing creatives and businesses" />
      <div className={styles.mainAdminSearch}>
        <section className={styles.header}>
          <h2>Welcome to the Pana Admin Directory</h2>
          <h3>Manage our panas</h3> <img src="https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExdDZzNnhua21rYnVyd2RkenBuYmYwZmJrcnI4eDh1NGQzaWFodmsyeiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/UyIFcEJpzq5La/giphy.gif" width="200px"></img>
        </section>
        <section className={styles.searchFormContainer}>
          <form role="search" className={styles.searchForm} onSubmit={(e) => submitSearchForm(e, new FormData(e.currentTarget))}>
            <label htmlFor="search-field">Enter a name, keyword or search by location to find local creatives and businesses!</label><br />
            <fieldset className={styles.searchFieldBar}>
            <input name="search_term" type="search" defaultValue={params.searchTerm} required
              className={styles.searchField}
              placeholder="Search Pana Mia" role="searchbox" />
              <div className={styles.searchButton} title="Click to search!">
                <PanaButton color="blue" type="submit"><span className="sr-only">Click to Search</span><IconSearch height="18" /></PanaButton>
              </div>
            </fieldset>
          </form>
        </section>
       
        <div className={styles.allSearch}>
          <section className={styles.searchFilters}>
            <div className={styles.viewButtonGroup} hidden>
              <PanaButton color="gray" compact={true} group="left"
                title="Select to view search results as a List">
                <IconList height="20" />
              </PanaButton>
              <PanaButton color="gray" compact={true} group="right"
                title="Select to view search results as a Map">
                <IconMap height="20" />
              </PanaButton>
              <PanaButton color="blue" compact={true} onClick={(e: any) => {applyGeo(e)}}>
                <IconCurrentLocation height="20" />
                <span>Location:&nbsp;</span>
                <small>{geo_toggle ? "on" : "off"}</small>
              </PanaButton>
            </div>
            <div title="Click to get random results!" hidden>
              <PanaButton compact={true} color="yellow" onClick={searchRandom}>
                <IconStar height="20" />
                <span className="sr-only">Click to get random results</span>
              </PanaButton>
            </div>
            <div>
              <button className={styles.filtersButton} style={{marginRight:"5px"}} onClick={ () => {router.push('/account/admin/')}}>Back</button> 

                <button className={styles.filtersButton}
                onClick={useFiltersModal}>
                  <IconFilter height="20" />
                  <span>Filters:&nbsp;</span>
                  <small><FiltersStatus /></small>
                </button>
                <dialog id="dialog-search-filters" className={styles.filtersModal}>
                  <form onSubmit={(e) => {applyFilters(e, new FormData(e.currentTarget))}}>
                    <div className={styles.filtersCategory}>
                      <strong><IconCategory height="20" />&nbsp;Category</strong><br />
                      {profileCategoryList && 
                        profileCategoryList.map((item, index) => {
                          return (
                            <label key={index}>
                              <input type="checkbox" name={`cat_${item.value}`} value={item.value}/>&nbsp;{item.desc}
                              </label>
                          )
                        })
                      }
                    </div>
                    <div className={styles.filtersLocation}>
                      <strong><IconMap height="20" />&nbsp;Location</strong><br />
                      {countyList && 
                        countyList.map((item, index) => {
                          return (
                            <label key={index}>
                              <input type="checkbox" name={`loc_${item.value}`} value={item.value}/>&nbsp;{item.desc}
                            </label>
                          )
                        })
                      }
                    </div>
                    <PanaButton compact={true} type="submit">Apply</PanaButton>
                    <PanaButton compact={true} onClick={useFiltersModal}>Close</PanaButton>
                  </form>
                </dialog>
                <button className={styles.filtersButton} hidden
                  onClick={useSortModal}>
                  <IconSortDescending height="20" />
                  <span>Sort:&nbsp;</span>
                  <small></small>
                </button>
                <dialog id="dialog-search-sort" className={styles.filtersModal}>
                  <form>
                      <ul>
                        <li><IconStar />&nbsp;Best Match</li>
                        <li><IconMapPins />&nbsp;Distance</li>
                        <li><IconHeart />&nbsp;Most Popular</li>
                        <li><IconSortDescending />&nbsp;Newest</li>
                      </ul>
                  </form>
                </dialog>
              </div>
          </section>
          <section className={styles.searchBody}>
            { params.searchTerm.length == 0 && 
            <div className={styles.noResults}>
              <p>You haven't searched anything yet, explore some of our local profiles below!</p>
            </div>
            }
            <SearchResults data={data ? data : []} isLoading={isLoading} params={params} />
            { (data && data?.length > 0) &&
            <nav className={styles.pagination}>
              <PanaButton compact={true}
                color={pagination.previous > 0 ?  "blue" : "gray"}
                disabled={pagination.previous > 0 ?  false : true}
                onClick={(e:any) => {setPage(e, pagination.previous)}}>
                &laquo;&nbsp;Previous</PanaButton>
              { pagination.current > 0 && 
              <span>Page {pagination.current} of {pagination.pages}</span>
              }
              <PanaButton compact={true}
                color={pagination.next > 0 ?  "blue" : "gray"}
                disabled={pagination.next > 0 ?  false : true}
                onClick={(e:any) => {setPage(e, pagination.next)}}>
                Next&nbsp;&raquo;</PanaButton>
                { pagination.results && 
                <div className={styles.resultsCount}>{pagination.results} result(s)</div>
                }
            </nav>
            }
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
          <section className={styles.directoryReferrals}>
            <p>Don't see your favorite local spot here? <Link href="/form/contact-us">Send us a recommendation!</Link></p>
          </section>
        </div>
      </div>
  </main>
  )

}

export default Pana_Profiles;
