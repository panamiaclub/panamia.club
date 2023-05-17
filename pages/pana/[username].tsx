import type { NextPage } from 'next';
import Head from 'next/head'
import Image from 'next/image'
import Link from 'next/link';
import styles from '../../styles/Profile.module.css';
import { TextInput, NumberInput, Button, Input, Alert } from '@mantine/core';
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
import {FiEdit2, FiInstagram, FiTwitter, FiGlobe, FiMail, FiPlus, FiMinusCircle} from 'react-icons/fi'
import {FiArchive, FiUpload, FiPlusCircle, FiMapPin} from 'react-icons/fi';
import "react-responsive-carousel/lib/styles/carousel.min.css"; // requires a loader
import { Carousel } from 'react-responsive-carousel';

import { BeatLoader } from 'react-spinners';

const Pana: NextPage = () => {
    const {data:session, status} = useSession();
    const [checkedFollowing, setCheckedFollowing] = useState(false);
    const [checkedImages, setCheckedImages] = useState(false);
    const [checkedFollowers, setCheckedFollowers] = useState(false);
    const [loadingImages, setLoadingImages] = useState(true);
    const [following, setFollowing] = useState(false);
    const [username, setUsername] = useState("");
    const [pronouns, setPronouns] = useState("");
    const [fullname, setFullname] = useState("");
    const [email, setEmail] = useState("");
    const [bio, setBio] = useState("");
    const [instagram, setInstagram] = useState("");
    const [twitter, setTwitter] = useState("");
    const [link1, setLink1] = useState("");
    const [link2, setLink2] = useState("");
    const [category, setCategory] = useState<any[]>([]);
    const [usersInCategory, setUsersInCategory] = useState<any[]>([]);
    const [followers, setFollowers] = useState<any[]>([]);
    const [location, setLocation] = useState("");
    const [dateJoined, setDateJoined] = useState<any>();
    const [avatar, setAvatar] = useState("");
    const [bannerImage, setBannerImage] = useState("");
    const [images, setImages] = useState<any[]>([]);
    const [alert, setAlert] = useState("");
    const [message, setMessage] = useState("");
    const [admin, setAdmin] = useState(false);
    const [userId, setUserId] = useState("");
    const [followerId, setFollowerId] = useState("");
    const [user, setUser] = useState<any>();

    const router = useRouter();
    useEffect(()=>{
        getUser();

           
    }, []);

  useEffect(() => {

    if(!user){
        //console.log('get user')
        getUser();
    }else{
        //console.log('get imagesss');
        if(!images || !checkedImages){
            //console.log('get images');
            getUserImages(); 
            setCheckedImages(true);
        }
    }

    if(session){
        //console.log('session user')
        //console.log(session);
    }

    if(userId && checkedFollowing == false){
        //console.log(userId);
        checkIfFollowing();
    }


    if(category && (usersInCategory.length == 0 || usersInCategory.length == 1)){
        //console.log('get users by category')
        getUsersByCategory();
    }

    if(userId && !checkedFollowers){
        getFollowers();
    }

    if(!followerId){
       getFollowerId();
    }
  }, [username, user, fullname, userId, email, images, avatar, bio, link1, link2, twitter, instagram, location, dateJoined, session, bannerImage, usersInCategory, userId, followerId])


    useEffect(()=>{
        if(!router.isReady) return;
        //console.log(router.query);
        if(router.query.username){
            setUsername(router.query.username.toString());
        }
    }, [router.isReady]);

    const getFollowerId = async() => {
        console.log('get followerId')
        if(session?.user?.email){
            const res = await axios
            .get(
                "/api/getUserId?userEmail="+session?.user?.email,
                {
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                }
                }
            )
            .then(async (response) => {
                setFollowerId(response.data.data);
            })
            .catch((error) => {
                console.log(error);
                //setAlert(error.response.error);
            });
            //console.log(res);
        }
    }
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
            //console.log(response.data);
           setUserId(response.data.id); 
            setUser(response.data);
            setEmail(response.data.email);
            setFullname(response.data.fullname);
            setPronouns(response.data.pronouns);
            setBio(response.data.bio);
            setCategory(response.data.category);
            setInstagram(response.data.instagramHandle);
            setTwitter(response.data.twitterHandle);
            setLink1(response.data.link1);
            setLink2(response.data.link2);
            setAvatar(response.data.avatar);
            setBannerImage(response.data.bannerImage);
            setAdmin(response.data.admin);
            setUserId(response.data._id);
            setLocation(response.data.location);
            setDateJoined(response.data.dateJoined);
            //console.log(response.data.dateJoined);
        })
        .catch((error) => {
            console.log(error);
            setAlert(error.response.error);
        });
        //console.log(res);
    }
  }

  const getFollowers = async() => {
    console.log('get followers')
    if(userId){
        const res = await axios
        .get(
            "/api/getFollowers?userId="+userId,
            {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            }
            }
        )
        .then(async (response) => {
            //console.log(response.data);
            setFollowers(response.data);
            setCheckedFollowers(true);
            //console.log(response.data.dateJoined);
        })
        .catch((error) => {
            console.log(error);
            setAlert(error.response.error);
        });
        //console.log(res);
    }
  }

  const getUserImages = async() => {
    //console.log('get images')
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
            //console.log(response);
            response.data.forEach((item:any)=>{
                arr.push(item.image);
                //console.log(item.image);
            })
            setImages(arr);
            setLoadingImages(false);
            //console.log(images);
        })
        .catch((error) => {
            console.log(error);
            setAlert('error fetching images');
        });
  }

  const getUsersByCategory = async() => {
       // console.log('get users by category')
        if(category && username){
            let arr:any[] = [];
            if(usersInCategory){
                //arr = usersInCategory;
            }
            
            arr = await getUsersAndFormatArray(category[0]);
            //console.log(arr);
            if(category.length > 1){
                var newarr = await getUsersAndFormatArray(category[1]);
                newarr.map((item:any) => {
                    arr.push(item);
                })
            }
            
            setUsersInCategory(arr);
            //console.log('array ');
            //console.log(arr);
        }    
  }

  const getUsersAndFormatArray = async(cat:any) => {
    let arr2:any[] = [];
    //category.map(async(item)=> {
       // console.log(cat)
        
        const res = await axios
        .get(
            "/api/getUsersByCategory?category="+cat,
            {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            }
            }
        )
        .then(async (response) => {
            // response.data.forEach((item:any)=>{
            //     if(!arr2.includes(item.username) && item.username != username){
            //         arr2.push(item);
            //         console.log(item);
            //     }
            // })
            var newArr = response.data.filter((item:any)=> {
                return item.username != username;
            })

            arr2 = (newArr);
           // console.log(newArr)
        })
        .catch((error) => {
            setAlert("error fetching users");
        });
        //})
    return arr2;
  }

  const checkIfFollowing = async() => {
    if(userId && followerId){
        const res = await axios
        .get(
            "/api/checkIfFollowing?followerId="+followerId+"&userId="+userId,
            {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            }
            }
        )
        .then(async (response) => {
            console.log(response.data)
            setFollowing(response.data);
            setCheckedFollowing(true);
        })
        .catch((error) => {
            setAlert("error fetching following status");
        });
    }
  }

  const handleFollow = async() => {
    console.log('handle follow');
    if(followerId && userId && !following){
       
        const res = await axios
        .post(
            "/api/addFollower",
            { followerId: followerId, userId: userId},
            {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            }
            }
        )
        .then(async (response) => {
            setFollowing(true);
            console.log('followed');
            setMessage("Followed.")
        })
        .catch((error) => {
            setAlert("error fetching following status");
        });
    }
  }

  const handleUnFollow = async() => {
    if(session?.user?.id && userId){
        console.log('handle unfollow');
        var followerId = session.user.id;
        const res = await axios
        .post(
            "/api/removeFollower",
            { followerId: followerId, userId: userId},
            {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            }
            }
        )
        .then(async (response) => {
            setFollowing(true);
            setMessage('Unfollowed.');
        })
        .catch((error) => {
            setAlert("error fetching following status");
        });
    }
  }


  return (
    <div className={styles.App}>
      
        <div className={styles.container} style={{minHeight:"85vh"}}>
       
        
            <Grid>
                <Grid.Col sm={12}><h1 style={{marginLeft:"2%"}}>{username}</h1></Grid.Col>
            </Grid>
            <hr></hr>
            {!email && 
                <BeatLoader></BeatLoader>
            }
            {session && email &&
            <>
            <Grid>
                    <Grid.Col sm={4}>
                        <Card className={styles.cardStyle}>
                            <div className={styles.banner}>
                                {!bannerImage && <img src="/banner.png" className={styles.bannerImage}></img>}
                                {bannerImage && <img src={bannerImage} className={styles.bannerImage}></img>}
                            </div>
                            <div className={styles.avatarStyle}>
                                {!avatar && <CgProfile size="3em"/>}
                                {avatar && <img src={avatar}  className={styles.avatar}></img>}
                            </div>
                            <h4>{username} <span>{pronouns}</span>
                            <span className={styles.socialLink}>
                                {!following && <FiPlusCircle size={'1.5em'} onClick={handleFollow}></FiPlusCircle>}
                                {following && <FiMinusCircle color='red' size={'1.5em'} onClick={handleUnFollow}></FiMinusCircle>}
                            </span> 
                            </h4>
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
                            {message && <Alert color={'green'}>{message}</Alert>}
                        </Card>
                        {usersInCategory && 
                            <Card className={styles.cardStyle}>
                                    <div>
                                        <h4>Others In The Same Category</h4>
                                        {usersInCategory.slice(0, 10).map((item, index) => {       
                                            return(
                                                <div key={index}>
                                                    <Link href={"/pana/"+item.username}>
                                                        <a>
                                                            {!item.avatar && <CgProfile size="3.4em"/>}
                                                            {item.avatar && <img key={item.username + "avatar"} src={item.avatar} style={{width:"50px", height:"50px", borderRadius:"25px"}}></img>}
                                                            <span key={item.username} style={{marginBottom:"20px"}}> {item.username} </span>
                                                        </a>
                                                    </Link>
                                                </div>
                                            );
                                        })}
                                    </div>
                            </Card>
                         }
                          {!usersInCategory && 
                            <BeatLoader></BeatLoader>
                        }

                        {followers && 
                            <Card className={styles.cardStyle}>
                                    <div>
                                        <h4>Followers</h4>
                                        {followers.slice(0, 10).map((item, index) => {       
                                            return(
                                                <div key={index}>
                                                    <Link href={"/pana/"+item.username}>
                                                        <a>
                                                            {!item.avatar && <CgProfile size="3.4em"/>}
                                                            {item.avatar && <img key={item.username + "avatar"} src={item.avatar} style={{width:"50px", height:"50px", borderRadius:"25px"}}></img>}
                                                            <span key={item.username} style={{marginBottom:"20px"}}> {item.username} </span>
                                                        </a>
                                                    </Link>
                                                </div>
                                            );
                                        })}
                                    </div>
                            </Card>
                         }
                         {!followers && 
                            <BeatLoader></BeatLoader>
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
                                <Carousel centerMode={true} centerSlidePercentage={33} infiniteLoop={true} showThumbs={false}>
                                    {images && 
                                    images.map((item:any) => {
                                        return(
                                            <div key={item._id} style={{margin:"0 2%"}}><img className={styles.galleryImages} src={item}></img></div>
                                        );
                                    })
                                }
                                </Carousel>
                                {loadingImages &&
                                    <BeatLoader></BeatLoader>
                                }
                            </Card>
                        </>
                    </Grid.Col>
            </Grid>
        </>
        }
        </div>
    </div>
  );
}

export default Pana