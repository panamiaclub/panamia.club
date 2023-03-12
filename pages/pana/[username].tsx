import type { NextPage } from 'next';
import Head from 'next/head'
import Image from 'next/image'
import Link from 'next/link';
import styles from '../../styles/Profile.module.css';
import { TextInput, NumberInput, Button, Input } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertTriangle } from '@tabler/icons';
import axios from "axios";
import {
  createStyles,
  Menu,
  Center,
  Header,
  Container,
  Group,
  Burger,
  Grid,
  Card
} from '@mantine/core';
import users from '../api/auth/lib/model/users';
import { lazy, useCallback, useEffect, useMemo, useState } from 'react';
import {useSession ,signIn, signOut} from 'next-auth/react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic'
import { setNestedObjectValues } from 'formik';
import { CgProfile } from 'react-icons/cg';
import {FiEdit2, FiInstagram, FiTwitter, FiGlobe, FiMail, FiPlus} from 'react-icons/fi'
import {FiArchive, FiUpload, FiPlusCircle, FiMapPin} from 'react-icons/fi';
import "react-responsive-carousel/lib/styles/carousel.min.css"; // requires a loader
import { Carousel } from 'react-responsive-carousel';

const Pana: NextPage = () => {
    const {data:session, status} = useSession();
    const [editProfile, setEditProfile] = useState(false);
    const [username, setUsername] = useState("");
    const [fullname, setFullname] = useState("");
    const [email, setEmail] = useState("");
    const [bio, setBio] = useState("");
    const [instagram, setInstagram] = useState("");
    const [twitter, setTwitter] = useState("");
    const [link1, setLink1] = useState("");
    const [link2, setLink2] = useState("");
    const [category, setCategory] = useState<any[]>([]);
    const [usersInCategory, setUsersInCategory] = useState<any[]>([]);
    const [location, setLocation] = useState("");
    const [dateJoined, setDateJoined] = useState<any>();
    const [avatar, setAvatar] = useState("");
    const [bannerImage, setBannerImage] = useState("");
    const [images, setImages] = useState<any[]>([]);
    const [alert, setAlert] = useState("");
    const [message, setMessage] = useState("");
    const [admin, setAdmin] = useState(false);
    const [userId, setUserId] = useState("");
    const [user, setUser] = useState<any>();

    const router = useRouter();
    useEffect(()=>{

          if(!email){
            console.log('get user')
            getUser();
          }
      
    }, []);

  useEffect(() => {

    if(!user){
        console.log('get user')
        getUser();
    }else{
        console.log('get imagesss');
        if(!images || images.length == 0){
            console.log('get images');
            getUserImages(); 
        }
    }

    if(username){
        console.log(username);
    }

    if(userId){
        console.log(userId);
    }

    if(session){
        console.log(session)
    }

    if(images){
        console.log(images);
    }

    if(category && (!usersInCategory|| usersInCategory.length == 0)){
        //getUsersByCategory();
    }

    if(usersInCategory){
        console.log('users in categorye')
        console.log(usersInCategory);
    }
    
  }, [username, user, fullname, userId, email, images, avatar, bio, link1, link2, twitter, instagram, location, dateJoined, session, bannerImage, usersInCategory])


    useEffect(()=>{
        if(!router.isReady) return;
        console.log(router.query);
        if(router.query.username){
            setUsername(router.query.username.toString());
        }
    }, [router.isReady]);

  const getUser = async() => {
    console.log('get user')
    if(username){
        const res = await axios
        .get(
            "/api/getUser?username="+username,
            {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            }
            }
        )
        .then(async (response) => {
            console.log(response.data.data);
            //console.log(response.data.data._id)
            setUser(response.data.data);
            setEmail(response.data.data.email);
            setFullname(response.data.data.fullname);
            setBio(response.data.data.bio);
            setCategory(response.data.data.category);
            setInstagram(response.data.data.instagramHandle);
            setTwitter(response.data.data.twitterHandle);
            setLink1(response.data.data.link1);
            setLink2(response.data.data.link2);
            setAvatar(response.data.data.avatar);
            console.log(response.data.data.bannerImage);
            setBannerImage(response.data.data.bannerImage);
            setAdmin(response.data.data.admin);
            setUserId(response.data.data._id);
            setLocation(response.data.data.location);
            setDateJoined(response.data.data.dateJoined);
            console.log(response.data.data.dateJoined);
        })
        .catch((error) => {
            console.log(error);
            setAlert(error.response.data.error);
        });
        //console.log(res);
    }
  }

  const getUserImages = async() => {
    console.log('get images')
        const res = await axios
        .get(
            "/api/getUserImages?userId="+user._id,
            {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            }
            }
        )
        .then(async (response) => {
            let arr:any[] = [];
            console.log(response);
            response.data.data.forEach((item:any)=>{
                arr.push(item.image);
                //console.log(item.image);
            })
            setImages(arr);
            console.log(images);
        })
        .catch((error) => {
            console.log(error);
            setAlert(error.response.data.error);
        });
  }

  const getUsersByCategory = async() => {
        console.log('get users by category')
        if(category){
            let arr:any[] = [];
            if(usersInCategory){
                //arr = usersInCategory;
            }
            arr = getUsersAndFormatArray();
            if(arr){
                setUsersInCategory(arr);
                console.log('array ');
                console.log(arr);
            }
        }    
  }

  const getUsersAndFormatArray = () => {
    let arr2:any[] = [];
    category.map(async(item)=> {
        console.log(item)
        
        const res = await axios
        .get(
            "/api/getUsersByCategory?category="+item,
            {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            }
            }
        )
        .then(async (response) => {
            response.data.data.forEach((item:any)=>{
                console.log(item.username)
                if(!arr2.includes(item.username) && item.username != username){
                    arr2.push(item);
                    console.log(item);
                }
            })
        })
        .catch((error) => {
            console.log(error);
            setAlert("error fetching users");
        });
        })
    return arr2;
  }


  return (
    <div className={styles.App}>
      
        <div className={styles.container} style={{minHeight:"85vh"}}>
        {session && 
        <>
            <Grid>
                <Grid.Col sm={3}><h1 style={{marginLeft:"2%"}}>{username}</h1></Grid.Col>
            </Grid>
            <hr></hr>
            <Grid>
                    <Grid.Col sm={4}>
                        <Card className={styles.cardStyle}>
                            <div className={styles.banner}>
                                {!bannerImage && <img src="/banner.jpg" className={styles.bannerImage}></img>}
                                {bannerImage && <img src={bannerImage} className={styles.bannerImage}></img>}
                            </div>
                            <div className={styles.avatarStyle}>
                                {!avatar && <CgProfile size="3em"/>}
                                {avatar && <img src={avatar}  className={styles.avatar}></img>}
                            </div>
                            <h4>{username} <span className={styles.socialLink}><FiPlusCircle></FiPlusCircle></span> </h4>
                            <h4>{fullname}</h4>
                            <p>Pana Since {new Date(dateJoined).toLocaleDateString()}</p>
                            {category && 
                                <div>
                                    <>
                                        <FiArchive></FiArchive>
                                        {category.map((str) => {
                                            return(
                                                <span key={str.id}> {str} </span>
                                            );
                                        })}
                                    </>
                                </div>
                            }
                            { location && 
                             <span><p><><FiMapPin></FiMapPin>{location}</></p></span>
                            }
                            <br></br>
                        </Card>
                        {usersInCategory && 
                            <Card className={styles.cardStyle}>
                                    <div>
                                        <h4>Others In The Same Category</h4>
                                        {usersInCategory.map((item, index) => {
                                            console.log('iTEIM')
                                            console.log(item);

                                            return(
                                                <div key={index}>
                                                    <Link href={"/pana/"+item.username}>
                                                        <a>
                                                            {!item.avatar && <CgProfile size="3.4em"/>}
                                                            {item.avatar && <img key={item.username + "avatar"} src={item.avatar} style={{width:"50px", borderRadius:"25px"}}></img>}
                                                            <span key={item.username} style={{marginBottom:"20px"}}> {item.username} </span>
                                                        </a>
                                                    </Link>
                                                </div>
                                            );
                                        })}
                                    </div>
                            </Card>
                         }
                    </Grid.Col>
                    <Grid.Col sm={8} className={styles.gallery}>
                        <>
                            <Card className={styles.cardStyle}>
                                <h3>Information</h3>
                                <p>{bio}</p>
                            </Card>
                            <Card className={styles.cardStyle}>
                                <h3>Social Media & Links</h3>
                                {instagram && 
                                <span className={styles.socialLink}><Link href={"https://instagram.com/"+instagram} target="_blank"><FiInstagram></FiInstagram></Link></span>
                                }
                                    {twitter && 
                                    <span className={styles.socialLink}><Link href={"https://twitter.com/"+ twitter} target="_blank"><FiTwitter></FiTwitter></Link></span>
                                }
                                {link1 && 
                                    <span className={styles.socialLink}><Link href={link1} target="_blank"><FiGlobe></FiGlobe></Link></span>
                                }
                                {link2 && 
                                    <span className={styles.socialLink}><Link href={link2} target="_blank"><FiGlobe></FiGlobe></Link></span>
                                }
                            </Card>
                            <Card className={styles.cardStyle}>
                                <h3>Gallery</h3>
                                <Carousel centerMode={true} centerSlidePercentage={20} infiniteLoop={true} showThumbs={false}>
                                    {images && 
                                    images.map((item:any) => {
                                        return(
                                            <div key={item._id}><img className={styles.galleryImages} src={item}></img></div>
                                        );
                                    })
                                }
                                </Carousel>
                                {/* <Grid>
                                {images && 
                                    images.map((item:any) => {
                                        return(
                                            <Grid.Col sm={4} key={item._id}><img className={styles.galleryImages} src={item}></img></Grid.Col>
                                        );
                                    })
                                }
                                </Grid> */}
                            </Card>
                        </>
                    </Grid.Col>
            </Grid>
        </>
        }

        {!username &&
            <p>Loading...</p>
        }
        </div>
    </div>
  );
}

export default Pana