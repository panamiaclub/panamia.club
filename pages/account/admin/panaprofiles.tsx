import type { NextPage } from 'next';
import { GetServerSideProps } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../api/auth/[...nextauth]";
import { useSession } from 'next-auth/react';
import { useEffect, useState, FormEvent } from 'react';
import axios from 'axios';
import { NextRouter, useRouter } from 'next/router';
import { IconUser } from '@tabler/icons';
import { forceInt, serialize } from '@/lib/standardized';
import styles from '@/styles/account/Account.module.css';
import PageMeta from '@/components/PageMeta';
import { UserInterface, Pagination, ProfileInterface } from '@/lib/interfaces';
import { standardizeDateTime } from '@/lib/standardized';
import PanaButton from '@/components/PanaButton';
import AdminButton from '@/components/Admin/AdminButton';
import AdminMenu from '@/components/Admin/AdminHeader';
import { IconUserCircle, IconHeart, IconExternalLink, IconBrandInstagram,
  IconBrandFacebook, IconForms, IconSearch, IconStar, IconFilter,
  IconMap, IconCategory, IconMapPin, IconCurrentLocation, IconList, 
  IconSortDescending, IconMapPins} from '@tabler/icons';
import { directorySearchKey, useSearch, SearchResultsInterface } from '@/lib/query/directory';
import Link from 'next/link';
export const getServerSideProps: GetServerSideProps = async function (context) {
  return {
    props: {
      session: await getServerSession(
        context.req,
        context.res,
        authOptions
      ),
    },
  }
}

function getSearchParams(q: any) {
  const pageNum = q.p ? forceInt(q.p as string, 1) : 1;
  const pageLimit = q.l ? forceInt(q.l as string, 20) : 20;
  const searchTerm = q.q ? q.q as string : "";
  const random = q.random ? true : false;
  const geolat =  q.geolat ? q.geolat : null;
  const geolng =  q.geolng ? q.geolng : null;
  const filterLocations = q.floc ? q.floc as string : "";
  const filterCategories = q.fcat ? q.fcat as string : "";
  const resultsView = q.v ? q.v as string : "list";

  return { pageNum, pageLimit, searchTerm, geolat, geolng,
    filterLocations, filterCategories, random, resultsView}
}

const Account_Pana_Profiles: NextPage = (props) => {
  const router = useRouter();
  const params = getSearchParams(router.query);
  const { data, isLoading, refetch } = useSearch(params);

  //const { data: session } = useSession();
  const [page_number, setPageNumber] = useState(1);
  const [submissions_list, setSubmissionsList] = useState([]);
  const [pagination, setPagination] = useState({} as Pagination);
 
  
  console.log("client:params", params);
  
  function submitSearchForm(e: FormEvent, formData: FormData) {
    e.preventDefault();
    formData.forEach((value, key) => console.log(key, value));
    const searchTerm = formData.get("search_term") ? formData.get("search_term") as string : "";
    const qs = new URLSearchParams();
    qs.append("q", searchTerm);
    router.push(`/account/admin/panaprofiles/?${qs}`);
  }

  function deactivate(id: any){
    console.log(id);
  }

  function activate(id: any){
    console.log(id);
  }

  function createListElements() {
    if(isLoading){
      <h1>Loading...</h1>
    }else{
      const elements = data?.map((item: SearchResultsInterface, index) => {
        return (
          <div key={index} className={styles.submissionListItem}>
            <div className={styles.submissionListRow}>
              <div className={styles.submissionFieldsInternal}>
                <div>
                  <IconUser height="20" width="20" color="white" /><span className={styles.submissionListField}>&emsp;{item?.name}</span>
                </div>
              </div>
              
              <div className={styles.submissionListField}><label>Email</label>&emsp;{item?.email}</div>
              <div className={styles.submissionListField}><label>details</label>&emsp;{item?.details}</div>
              <div style={{margin:"2%"}}>
                {item?.active && <button className={styles.deActivateButton} onClick={() => deactivate(item._id)}>Deactivate Profile</button> }
                {!item?.active && <button className={styles.activateButton} onClick={() => activate(item._id)}>Activate Profile</button> }
                <AdminButton><Link href={`/account/admin/manageprofile/${item.slug}`}><a style={{color:'white'}}><IconUserCircle height="20" />View Profile</a></Link>&emsp;</AdminButton>
                
              </div>
            </div>
          </div>
        );
      });
      return elements;
    }
   
  }

  function getProfiles(){
    const params = new URLSearchParams()
    .append("page", page_number.toString());
    axios
      .get(
          `/api/getProfileList?${params}`,
          {
              headers: {
                  Accept: "application/json",
                  "Content-Type": "application/json",
              },
          }
      ).then((resp) => {
        console.log(resp.data.data)
        setSubmissionsList(resp.data.data);
        setPagination(resp.data.pagination);
        return resp;
      })
      .catch((error) => {
          console.log(error);
          return [];
      });
  }

  useEffect(() => {
    if(data){
      console.log('data from search')
      console.log(data);
    }
  }, [page_number]);

  if (data) {
    return (
      <main className={styles.app}>
        <PageMeta title="Users | Admin" desc="" />
        <AdminMenu />
        <div className={styles.main}>
          <h2 className={styles.accountTitle}>Pana Profiles</h2>
            <section className={styles.searchFormContainer}>
            <form role="search" className={styles.searchForm} onSubmit={(e) => submitSearchForm(e, new FormData(e.currentTarget))}>
              <label htmlFor="search-field">Enter a name, or keyword to search for profiles</label><br />
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
          <div className={styles.accountForm}>
            <div className={styles.submissionList}>
                {createListElements()}
            </div>
            <p>
              <small>&emsp;[Page: {pagination?.page_number}]&emsp;</small>
              <AdminButton 
                onClick={() => setPageNumber(page_number - 1)} 
                disabled={pagination?.page_number == 1}
                >Previous</AdminButton>
              <AdminButton
                onClick={() => setPageNumber(page_number + 1)} 
                disabled={(pagination?.page_number == pagination.total_pages)}
                >Next</AdminButton>
            </p>
          </div>
        </div>
      </main>
    )
  }
  return (
    <main className={styles.app}>
      <PageMeta title="Unauthorized" desc="" />
      <div className={styles.main}>
        <h2 className={styles.accountTitle}>UNAUTHORIZED</h2>
        <h3 className={styles.accountTitle}>You must be logged in to view this page.</h3>
      </div>
    </main>
  )
}

export default Account_Pana_Profiles;

