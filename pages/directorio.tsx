import type { NextPage } from 'next'
import Link from 'next/link';
import Head from 'next/head'
import Image from 'next/image'
import stylesHome from '../styles/Home.module.css'
import styles from '../styles/Profile.module.css'
import {
    createStyles,
    Menu,
    Center,
    Header,
    Container,
    Group,
    Burger,
    Grid, Input, 
    Card,
    Button, Text, Box, Alert, MantineProvider, MANTINE_COLORS
  } from '@mantine/core';
  import { BeatLoader } from 'react-spinners';
import {useRouter} from "next/router";
import { Field, Form, Formik } from "formik";
import { CgProfile } from 'react-icons/cg';
import {FiEdit2, FiInstagram, FiTwitter, FiGlobe, FiMail, FiMapPin} from 'react-icons/fi'
import {FiArchive} from 'react-icons/fi';
import {useSession ,signIn, signOut} from 'next-auth/react';
import { userAgent } from 'next/server';
import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from "axios";
import AxiosResponse from "axios";
import { Pagination } from '@mantine/core';

const Profile: NextPage = () => {
    const {data:session, status} = useSession();
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState<any[]>([]);
    const [ogUsers, setOGUsers] = useState<any[]>([]);
    const [category, setCategory] = useState<any[]>([]);
    const [alert, setAlert] = useState("");
    const [search, setSearch] = useState("");
    const [resetUsers, setResetUsers] = useState(false);
    const router = useRouter();
    const handleSignOut = () => signOut({redirect: false, callbackUrl: '/'});
    const [activePage, setPage] = useState(1);
    const [previousPage, setPreviousPage] = useState(1);

  const getUsers = async () => {
    const res = await axios
      .get(
        "/api/getAllUsers?page="+(activePage-1),
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      )
      .then(async (res) => {
        console.log('all users')
        setUsers(res.data);
        console.log(res.data)
        setOGUsers(res.data);
        setLoading(false);
      })
      .catch((error) => {
        console.log(error);
        setAlert(error.response.data.error);
      });
  };


     useEffect(() => {
        console.log('get users')
        getUsers();

        if(router.query.search){
            setSearch(router.query.search.toString());
        }

        if(users && search){
            filterUsersSearch();
        }
       
    }, []);

    useEffect(() => {
      
        // if(!users){
        //     getUsers();
        // }
        if(activePage){
            console.log(activePage);    
        }
        if(resetUsers){
            filterUsers();
        }
    }, [users, category]);

    const handlePageClick = (value:number) => {
        setLoading(true); 
        console.log(value);
        setPreviousPage(activePage); 
        setPage(value);
        getUsers();
    }

    const filterUsers = () => {
        if(category.length > 0){
            console.log(category);
            let newUsers: any[] = [];
            newUsers = ogUsers;
            category.forEach((item)=>{
                newUsers = ogUsers.filter(
                    user => user.category.toString().includes(item.toString()));
            })
        
            //console.log('new users'+newUsers);
            setUsers(shuffle(newUsers));
        }else{
            setUsers(shuffle(ogUsers));
        }
        setResetUsers(false);
    }

    function shuffle(array:any[]) {
        let currentIndex = array.length,  randomIndex;
      
        // While there remain elements to shuffle.
        while (currentIndex != 0) {
      
          // Pick a remaining element.
          randomIndex = Math.floor(Math.random() * currentIndex);
          currentIndex--;
      
          // And swap it with the current element.
          [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
        }
      
        return array;
      }

    const filterUsersSearch =()=>{
        if(search){
            console.log(search)
            let newUsers = users.filter(user => user.username.toString().toLowerCase().includes(search.toLowerCase()));
            console.log("filtered users.");
            setUsers(newUsers);
        }
    }

    const formSubmit = (actions: any) => {
        //actions.setSubmitting(false);
        //filterUsers();
      };

      const formSubmitSearch = (actions: any) => {
        actions.setSubmitting(false);
        filterUsersSearch();
      };

  return (
    <div className={stylesHome.Directorio}>
        {
        <div className={styles.container} style={{minHeight:"85vh"}}>
            <Grid>
                <Grid.Col sm={3}><h2 style={{marginLeft:"2%", color:"#39B6FF"}}>El Directorio</h2></Grid.Col>
            </Grid>
            <Card className={styles.cardStyle} >
                <Grid style={{marginBottom:"2%"}}> 
                    <Grid.Col sm={6}>
                        <Formik
                            initialValues={{category: category}} 
                            validateOnChange={false}
                            validateOnBlur={false}
                            onSubmit={(_, actions) => {
                            formSubmit(actions);
                            }}
                        >
                            {(props) => (
                            <Form style={{ width: "100%" }} className={styles.form}>
                                <>
                                <div id="checkbox-group"></div>
                                    <div role="group" aria-labelledby="checkbox-group"  
                                    onChange={async(e:any) => {
                                        if(e.target.checked){
                                            console.log(e.target.value);
                                            var arrayy = new Array();
                                            if(category.length > 0){
                                                arrayy = category;
                                            }
                                            if(!arrayy.includes(e.target.value)){
                                               arrayy.push(e.target.value);
                                            }
                                            setCategory(arrayy);
                                            setResetUsers(true);
                                        }else if(!e.target.checked){
                                            console.log('unchecked')
                                            let arrayy = new Array();
                                            if(category){
                                                console.log(category);
                                                category.map((item:any) => {
                                                if(item != e.target.value){
                                                  arrayy.push(item);
                                                 
                                                  console.log(e.target.value);
                                                  console.log(item);
                                                }
                                             })
                                            }
                                            console.log('new cateogires')
                                            console.log(arrayy);
                                            setCategory(arrayy);
                                            console.log(ogUsers);
                                            setUsers(ogUsers);
                                            setResetUsers(true);
                                          }
                                         
                                          
                                    }}>
                                        <h2>Filter</h2>
                                        <label>
                                        <Field type="checkbox" name="Category" value="Art" />
                                        Art
                                        </label>
                                        <label>
                                        <Field type="checkbox" name="Category" value="Food" />
                                        Food
                                        </label>
                                        <label>
                                        <Field type="checkbox" name="Category" value="Services" />
                                        Services
                                        </label>
                                        <label>
                                        <Field type="checkbox" name="Category" value="Apparel/Accessories" />
                                        Apparel/Accessories
                                        </label>
                                        <label>
                                        <Field type="checkbox" name="Category" value="Collectives/Platforms" />
                                        Collectives/Platforms
                                        </label>
                                    </div>
                                </>
                            </Form>
                            )}
                        </Formik>
                    </Grid.Col>
                    <Grid.Col sm={6}>
                        <h3>Search</h3>
                        <Formik
                            initialValues={{}}
                            validateOnChange={false}
                            validateOnBlur={false}
                            onSubmit={(_, actions) => {
                            formSubmitSearch(actions);
                            }}
                        >
                            {(props) => (
                            <Form >
                                <Box mb={4}>
                                    <Field name="search">
                                        {() => (
                                        <>
                                            <Input
                                            value={search}  style={{width:"70%",marginRight:"20px", display:'inline-block'}}
                                            onChange={(e:any) => setSearch(e.target.value)}
                                            placeholder={"enter keyword(s)"}
                                            />
                                        </>
                                        )}
                                    </Field>
                                     <Button type="submit" style={{margin:"0",backgroundColor:"#39B6FF", display:'inline-block'}}>Search</Button>
                                </Box>
                        </Form>
                            )}
                        </Formik>
                        </Grid.Col>
                        {alert && <Alert color={"red"} style={{marginTop:"5%"}}>{alert}</Alert>}
                    </Grid>
                </Card>
            <hr></hr>
            <div style={{marginTop:"20px"}}>
               
                {users &&
                    users.map((item, index)=>{
                    return(
                        <Grid key={index}>
                            <Grid.Col sm={12}>
                                <Card className={styles.cardStyle}>
                                    <Grid>
                                        <Grid.Col xs={6}>
                                            <Link  href={"/pana/"+item.username} key={item+"link"}>
                                                <div style={{cursor:"pointer"}}>
                                                    {item.avatar && <img className={stylesHome.avatar} src={item.avatar} ></img>}
                                                    <h3 className={stylesHome.username}>{item.username}</h3>
                                                    {item.location && <p> <FiMapPin></FiMapPin> {item.location.toString()}</p>}
                                                </div>
                                            </Link>
                                        </Grid.Col>
                                        <Grid.Col xs={6}>
                                            {item.bio && <p>{item.bio.substring(0, 400)}</p>}
                                            {item.category.length > 0 && <p> <FiArchive></FiArchive> {item.category.toString()}</p>}
                                            {item.instagramHandle && <span className={styles.socialLink}><Link href={"http://instagram.com/"+item.instagramHandle}><FiInstagram></FiInstagram></Link></span>}
                                            {item.twitterHandle && <span className={styles.socialLink}><Link href={"http://twitter.com/"+item.twitterHandle}><FiTwitter></FiTwitter></Link></span>}
                                            {item.link1 && <span className={styles.socialLink}><Link href={item.link1}><FiGlobe></FiGlobe></Link></span>}
                                            {item.link2 && <span className={styles.socialLink}><Link href={item.link2}><FiGlobe></FiGlobe></Link></span>}
                                        </Grid.Col>
                                    </Grid>
                                </Card>
                            </Grid.Col>
                        </Grid>
                    )
                    })
                }
                 {loading && 
                    <BeatLoader style={{margin:"0 45%"}} color={"#000000"}/>
                }
                {users && 
                     <Pagination page={activePage} onChange={(value:number) => {handlePageClick(value)}} total={2} style={{margin:"0 50%",marginTop:"5%", paddingBottom:"5%", width:"100%"}}/>
                }
                
            </div>
        </div>
        
    }
    </div>
  )
}

export default Profile;
