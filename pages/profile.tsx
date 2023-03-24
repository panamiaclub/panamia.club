import type { NextPage } from 'next'
import Link from 'next/link';
import Head from 'next/head'
import Image from 'next/image'
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
    Button, Text, Box, Alert
  } from '@mantine/core';
  import Router from "next/router";
import { Field, Form, Formik } from "formik";
import { TextInput, NumberInput, StylesApiProvider } from '@mantine/core';
import { useForm } from '@mantine/form';
import { CgProfile } from 'react-icons/cg';
import {FiEdit2, FiInstagram, FiTwitter, FiGlobe, FiMail, FiCamera, FiMap} from 'react-icons/fi'
import {FiArchive, FiUpload, FiMapPin} from 'react-icons/fi';
import {useSession ,signIn, signOut} from 'next-auth/react';
import { userAgent } from 'next/server';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import axios from "axios";
import AxiosResponse from "axios";
import { link } from 'fs';

const Profile: NextPage = () => {
    const {data:session, status} = useSession();
    const [editProfile, setEditProfile] = useState(false);
    const [resetPW, setResetPW] = useState(false);
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [bio, setBio] = useState("");
    const [instagram, setInstagram] = useState("");
    const [twitter, setTwitter] = useState("");
    const [dateJoined, setDateJoined] = useState<any>();
    const [link1, setLink1] = useState("");
    const [link2, setLink2] = useState("");
    const [location, setLocation] = useState("");
    const [category, setCategory] = useState<any[]>([]);
    const [avatar, setAvatar] = useState("");
    const [bannerImage, setBannerImage] = useState("");
    const [avatarFile, setAvatarFile] = useState("");
    const [bannerImageFile, setBannerImageFile] = useState("");
    const [images, setImages] = useState<any[]>([]);
    const [uploadImages, setUploadImages] = useState<any[]>([]);
    const [alert, setAlert] = useState("");
    const [onboardingFormComplete, setOnboardingFormComplete] = useState<Boolean>();
    const [imageAlert, setImageAlert] = useState("");
    const [imageMessage, setImageMessage] = useState("");
    const [imageUploadAlert, setImageUploadAlert] = useState("");
    const [imageUploadMessage, setImageUploadMessage] = useState("");
    const [admin, setAdmin] = useState(false);
    const [userId, setUserId] = useState("");
    const [resetPWalert, setResetPWalert] = useState("");
    const [message,setMessage] = useState("");
    const [password,setPassword] = useState("");
    const [passwordRetyped,setPasswordRetyped] = useState("");

    const handleSignOut = () => signOut({redirect: false, callbackUrl: '/'});
    const handleEditPressed= () => {
        getUser();
        setEditProfile(true)
    };

    const handleResetPressed= () => {
        setResetPW(true);
    };

    const handleManagementPressed = () => {
        const { pathname } = Router;
        if (pathname === "/profile") {
          // TODO: redirect to a success register page
          Router.push("/admin");
        }
      };

    const handleCancelPressed = () => {setEditProfile(false)}; 
   const cancelResetPW = () => {setResetPW(false)}; 

    if(editProfile){
        //console.log(editProfile)
    }

    const addPhotos = (actions: any) => {
        actions.setSubmitting(false);
        addUserImages();
      };

    const formSubmit = (actions: any) => {
        actions.setSubmitting(false);
        editUser();
      };

      const redirectToHome = () => {
        const { pathname } = Router;
        if (pathname === "/profile") {
          // TODO: redirect to a success register page
          Router.push("/profile");
          setEditProfile(false);
        }
      };

      //get
      const getUser = async() => {
        if(session?.user?.email){
            //console.log(email);
            const res = await axios
            .get(
                "/api/getUser?userEmail="+session?.user?.email,
                {
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                }
                }
            )
            .then(async (response) => {
                //console.log(response.data.data);
                setUsername(response.data.data.username);
                setEmail(response.data.data.email);
                setBio(response.data.data.bio);
                setCategory(response.data.data.category);
                setInstagram(response.data.data.instagramHandle);
                setTwitter(response.data.data.twitterHandle);
                setLink1(response.data.data.link1);
                setLink2(response.data.data.link2);
                setAvatar(response.data.data.avatar);
                setBannerImage(response.data.data.bannerImage);
                setAdmin(response.data.data.admin);
                setUserId(response.data.data._id);
                setLocation(response.data.data.location);
                setDateJoined(response.data.data.dateJoined);
                setOnboardingFormComplete(response.data.data.onboardingFormComplete);
            })
            .catch((error) => {
                console.log(error);
                setAlert(error.response.data.error);
            });
            //console.log(res);
        }
      }

      const getUserImages = async() => {
        console.log('get user images')
        if(userId){
            //console.log(userId);
            const res = await axios
            .get(
                "/api/getUserImages?userId="+userId,
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
                response.data.data.forEach((item:any)=>{
                    //console.log(item);
                    arr.push(item.image);
                    //console.log(item.image);
                })
                setImages(arr);
                //console.log(images);
            })
            .catch((error) => {
                //console.log(error);
                setAlert(error.response.data.error);
            });
        }
      }
    
  //edit

  const editUser = async () => {
        if(email){
            //console.log('category')
            //console.log(category)
            const res = await axios
                .put(
                    "/api/editProfile",
                    { username, email, bio ,instagram, twitter, link1, link2, category, location},
                    {
                    headers: {
                        Accept: "application/json",
                        "Content-Type": "application/json",
                    },
                    }
                )
                .then(async (res) => {
                    //console.log(res);
                    redirectToHome();
                })
                .catch((error) => {
                    //console.log(error);
                    setAlert(error.response.data.error);
                });
        }
       
    handleCancelPressed();
  };

  const resetPassword = async () => {
    if(email && password && passwordRetyped ){
        //console.log('password')
        //console.log(password)
        if(password != passwordRetyped){
            setResetPWalert("Passwords don't match.");
        }else{
            const res = await axios
                .put(
                    "/api/resetPassword",
                    { email, password},
                    {
                    headers: {
                        Accept: "application/json",
                        "Content-Type": "application/json",
                    },
                    }
                )
                .then(async (res) => {
                    setMessage(res.data.msg);
                    setResetPW(false);
                })
                .catch((error) => {
                    //console.log(error);
                    setResetPWalert(error.response.data.error);
            });
        }
    }
   
};

  const editBannerImage = async() => {
        if(session?.user?.email && bannerImage){
            console.log('edit banner inmage ewith sessoine smail')
            const res = await axios
            .put(
                "/api/editBanner",
                {  email: session.user.email, bannerImage: bannerImage },
                {
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                }
            )
            .then(async (res) => {
                console.log(res);
                //redirectToHome();
                setImageMessage("Succesfully updated image!");
            })
            .catch((error) => {
                //console.log(error);
                setImageAlert(error.response.data.error);
            });
        }   
  }

  const editAvatar = async() => {
    if(session?.user?.email && avatar){
        const res = await axios
        .put(
            "/api/editAvatar",
            {  email: session?.user?.email, avatar: avatar },
            {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            }
        )
        .then(async (res) => {
            console.log(res);
            //redirectToHome();
            setImageMessage("Succesfully updated image!");
        })
        .catch((error) => {
            //console.log(error);
            setImageAlert(error.response.data.error);
        });
    }   
}

  const convertAndSetUploadImages = (files:any) => {
    let arr:any[] = [];
    //console.log('files');
    //console.log(files)
    files.forEach((item:any)=>{
        getBase64(item, (result:string) => {
            console.log('base64image'+result);
            arr.push(result);
        });
    });
    
    if(arr){
        setUploadImages(arr);
    }
  }

  const getBase64= (file:any, cb:any) => {
    let reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = function () {
        cb(reader.result)
    };
    reader.onerror = function (error) {
        console.log('Error: ', error);
    };
}
    const addUserImages = async () => {
        if(userId && uploadImages){
            console.log(uploadImages);
            uploadImages.forEach(async(item)=> {
                const res = await axios
                .put(
                    "/api/uploadImage",
                    { userId, item},
                    {
                    headers: {
                        Accept: "application/json",
                        "Content-Type": "application/json",
                    },
                    }
                )
                .then(async (res) => {
                    setImageUploadMessage("Uploaded Images!");
                })
                .catch((error) => {
                    //console.log(error);
                    setAlert(error.response.data.error);
                });
            })
            
        }
    };


     useEffect(() => {
        getUser();
        getUserImages();
        if(session?.user?.email){
            setEmail(session.user.email);
        }
    }, []);
 
    useEffect(() => {
        if(email){
            //console.log(email);
        }
        if(images){
            console.log('images');
            console.log(images);
        }

        if(avatarFile){
            let base64file= getBase64(avatarFile, (result:string) => {
                //console.log('base64image'+result);
                setAvatar(result);
            });

            editAvatar();
        }

        if(bannerImageFile){
            console.log('set banner image')
            //console.log(bannerImageFile)
            let base64file= getBase64(bannerImageFile, (result:string) => {
                //console.log('base64image'+result);
                setBannerImage(result);
            });

            editBannerImage();
        }

        if(!username){
            getUser();
        }
        if(!images){
            getUserImages();
        }
    }, [email, username, instagram, bio, link1, link2, twitter, session, avatar, avatarFile, category, userId, images, bannerImage, bannerImageFile])

    // Create a reference to the hidden file input element
    const hiddenBannerFileInput = useRef();
    
    // Programatically click the hidden file input element
    // when the Button component is clicked
    const handleClickBannerChange = () => {
        console.log('banner change triggered')
        document.getElementById('bannerFileInput')?.click();
    };

    const handleClickAvatarChange = () => {
        console.log('banner change triggered')
        document.getElementById('avatarInput')?.click();
    };

  return (
    <div className={styles.App}>
        {session && session.user && 
        <div className={styles.container} style={{minHeight:"85vh"}}>
            <Grid>
                <Grid.Col sm={3}><h1 style={{marginLeft:"2%"}}>Profile</h1></Grid.Col>
                <Grid.Col sm={8}></Grid.Col>
                <Grid.Col sm={1}> { admin && <Button onClick={handleManagementPressed} style={{marginTop:"20%"}} size="xs">Management</Button>}</Grid.Col>
            </Grid>
            <hr></hr> 
            <Grid>
                {!editProfile &&
                <>
                    <Grid.Col sm={4}>
                        <Card className={styles.cardStyle}>
                            <div className={styles.banner}>
                                {!bannerImage && <img src="/banner.png" className={styles.bannerImage}></img>}
                                {bannerImage && <img src={bannerImage} className={styles.bannerImage}></img>}
                                <div onClick={handleClickBannerChange}  style={{marginTop:'-8%', marginLeft:"2%", cursor:"pointer"}}>
                                    <FiCamera color="white"></FiCamera>

                                    <Input id="bannerFileInput"
                                            value={undefined} 
                                            type="file" 
                                            accept="image/*" style={{display:"none"}}
                                            onChange={async(e:any) => {
                                                let file = (e.target.files[0])
                                                setBannerImageFile(file);
                                            }}
                                        />    
                                </div>
                            </div>
                            <div className={styles.avatarStyle}>
                                {!avatar && <CgProfile size="3em"/>}
                                {avatar && <img src={avatar}  className={styles.avatar}></img>}
                                <div onClick={handleClickAvatarChange}  style={{ marginTop:"-10%", cursor:"pointer"}}>
                                    
                                    <FiCamera color="white"></FiCamera>

                                    <Input size="xs" id="avatarInput"
                                            value={undefined} 
                                            type="file" 
                                            accept="image/*" style={{display:"none"}}
                                            onChange={async(e:any) => {
                                                let file = (e.target.files[0])
                                                setAvatarFile(file);
                                            }}
                                        />
                                </div>
                            </div>
                            <h4>{username}</h4>
                            <p>{bio}</p>
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
                            { dateJoined && 
                             <p>Pana Since {new Date(dateJoined).toLocaleDateString()}</p>
                            }
                            <br></br>
                            {imageAlert && <Alert color={"red"} style={{marginTop:"5%"}}>{imageAlert}</Alert>}
                            {imageMessage && <Alert color={"green"} style={{marginTop:"5%"}}>{imageMessage}</Alert>}
                            {message && <Alert color={"green"} style={{marginTop:"5%"}}>{message}</Alert>}
                        </Card>
                        <div style={{marginTop:"20px"}}>
                            {!onboardingFormComplete && <Link href="/intake"><a><Button style={{margin:"0% 2%!important", marginRight:"20px", marginBottom:"20px", backgroundColor: "green"}} size="xs">Complete Onboarding</Button><br></br></a></Link>}
                            { <Button onClick={handleResetPressed} style={{margin:"0% 2%!important", marginRight:"20px"}} size="xs">Reset Password<FiEdit2 style={{marginLeft:"5px"}}/></Button>}
                            { <><Button onClick={handleEditPressed} style={{margin:"0% 2%!important", marginRight:"20px", marginBottom:"20px"}} size="xs">Edit Profile</Button><br></br></>}
                        </div>
                    </Grid.Col>
                    <Grid.Col sm={8} className={styles.gallery}>
                        <div>
                            {resetPW &&
                                <Card className={styles.cardStyle}>
                                    <Formik
                                        initialValues={{email:email, password:password}}
                                        validateOnChange={false}
                                        validateOnBlur={false}
                                        onSubmit={(_, actions) => {
                                            resetPassword();
                                        }}
                                    >
                                        {(props) => (
                                        <Form style={{ width: "100%" }}>
                                            <Box mb={4}>
                                            <Field name="password">
                                                {() => (
                                                <>
                                                    <Text>Password</Text>
                                                    <Input
                                                    value={password}
                                                    onChange={(e:any) => setPassword(e.target.value)}
                                                    type="password"
                                                    placeholder="Password"
                                                    />
                                                </>
                                                )}
                                            </Field>
                                            <Field name="passwordConfirm">
                                                {() => (
                                                <>
                                                    <Text>Retype Password</Text>
                                                    <Input
                                                    value={passwordRetyped}
                                                    onChange={(e:any) => setPasswordRetyped(e.target.value)}
                                                    type="password"
                                                    placeholder="Retype Password"
                                                    />
                                                </>
                                                )}
                                            </Field>
                                            <Button
                                                mt={6}
                                                type="submit" style={{backgroundColor:"black", marginRight:"20px"}}
                                                onClick={cancelResetPW}
                                            >
                                            Cancel
                                            </Button>
                                            <Button
                                                mt={6}
                                                type="submit" style={{backgroundColor:"#238BE6"}}
                                            >
                                            Submit
                                            </Button>
                                            </Box>
                                        </Form>
                                        )}
                                    </Formik>

                                {resetPWalert && <Alert color={"red"} style={{marginTop:"5%"}}>{resetPWalert}</Alert>}
                                    </Card>
                                }
                            <Card className={styles.cardStyle}>
                                <h3>Images</h3>
                                <Grid>
                                {images && 
                                    images.map((item:any) => {
                                        return(
                                            <Grid.Col sm={3}  key={item._id}><img className={styles.galleryImages} src={item}></img></Grid.Col>
                                        );
                                    })
                                }
                                </Grid>
                            </Card>
                            <Card className={styles.cardStyle}>
                                <Formik
                                    initialValues={{images: images}} 
                                    validateOnChange={false}
                                    validateOnBlur={false}
                                    onSubmit={(_, actions) => {
                                        addPhotos(actions);
                                    }}
                                    >
                                        {(props) => (
                                        <Form style={{ width: "100%" }} className={styles.form}>
                                            <Box mb={4}>
                                                {
                                                    <Field name="avatar">
                                                    {() => (
                                                    <div  style={{margin:"0% 1%", display:"inline-block"}}>
                                                        <h3>Upload More Images:</h3>
                                                        <Input size="xs" 
                                                        value={undefined} 
                                                        type="file" 
                                                        multiple
                                                        accept="image/*"
                                                        onChange={async(e:any) => {
                                                            //console.log(e.target.files);
                                                            let files = Array.from(e.target.files);
                                                            convertAndSetUploadImages(files);
                                                        }}
                                                        />
                                                    </div>
                                                    )}
                                                </Field>
                                                }  
                                                <Button type="submit" size="xs" style={{margin:"0%", display:"inline-block"}}>Upload<FiUpload style={{marginLeft:"5px", display:"inline"}}/></Button>
                                            </Box>
                                        </Form>
                                        )}
                                    </Formik>  
                                    {imageUploadAlert && <Alert color={"red"} style={{marginTop:"5%"}}>{imageUploadAlert}</Alert>}
                                    {imageUploadMessage && <Alert color={"green"} style={{marginTop:"5%"}}>{imageUploadMessage}</Alert>}
                                </Card>
                        </div>
                    </Grid.Col>
                </>
                }
                {editProfile && session && session.user && 
                <>
                    <Grid.Col sm={2}></Grid.Col>
                    <Grid.Col sm={8}>
                         <div style={{margin:"2% 43%"}}>
                           {!avatar && <CgProfile size="2em"/>}
                            {avatar && <img src={avatar} className={styles.avatar}></img>}
                        </div>
                        <Formik
                            initialValues={{avatar: avatar, username: username, bio: bio, category: category, instagram: instagram, twitter: twitter, link1: link1, link2: link2, location: location}} 
                            validateOnChange={false}
                            validateOnBlur={false}
                            onSubmit={(_, actions) => {
                            formSubmit(actions);
                            }}
                        >
                            {(props) => (
                            <Form style={{ width: "100%" }} className={styles.form}>
                                <Box mb={4}>
                                <Field name="username">
                                    {() => (
                                    <>
                                        <Text>Username:</Text>
                                        <Input size="xs"
                                        value={username}
                                        onChange={(e:any) => setUsername(e.target.value)}
                                        placeholder={username || "username"}
                                        />
                                    </>
                                    )}
                                </Field>
                                <Field name="bio">
                                    {() => (
                                    <>
                                        <Text><FiEdit2></FiEdit2>Bio:</Text>
                                        <Input size="xs"
                                        value={bio}
                                        onChange={(e:any) => setBio(e.target.value)}
                                        placeholder={bio}
                                        />
                                    </>
                                    )}
                                </Field>

                                {/* 
                                    Multiple checkboxes with the same name attribute, but different
                                    value attributes will be considered a "checkbox group". Formik will automagically
                                    bind the checked values to a single array for your benefit. All the add and remove
                                    logic will be taken care of for you.
                                */}
                                <div id="checkbox-group-cat">Category</div>
                                    <div role="group" aria-labelledby="Category"  
                                    onChange={async(e:any) => {
                                        if(e.target.checked){
                                            //console.log(e.target.value);
                                            var arrayy = new Array();
                                            if(category){
                                                arrayy = category;
                                            }
                                            if(!arrayy.includes(e.target.value)){
                                               arrayy.push(e.target.value);
                                            }
                                            setCategory(arrayy);
                                        }else{
                                            let arrayy = new Array();
                                            if(category){
                                                category.map((item:any) => {
                                                if(item != e.target.value){
                                                  arrayy.push(item);
                                                }
                                             })
                                            }
                                            console.log(arrayy);
                                            setCategory(arrayy);
                                          }
                                    }}>
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
                                        <Field type="checkbox" name="Category" value="Goods" />
                                        Goods
                                        </label>
                                        <label>
                                        <Field type="checkbox" name="Category" value="Apparel/Accessories" />
                                        Apparel/Accessories
                                        </label>
                                        <label>
                                        <Field type="checkbox" name="Category" value="Collectives/Platforms" />
                                        Collectives/Platforms
                                        </label>
                                        <label>
                                        <Field type="checkbox" name="Category" value="Customer" />
                                        Customer
                                        </label>
                                    </div>
                                <Field name="instagram">
                                    {() => (
                                    <>
                                        <Text><FiInstagram></FiInstagram></Text>
                                        <Input size="xs"
                                        value={instagram}
                                        onChange={(e:any) => setInstagram(e.target.value)}
                                        placeholder={instagram}
                                        />
                                    </>
                                    )}
                                </Field>
                                <Field name="twitter">
                                    {() => (
                                    <>
                                        <Text><FiTwitter></FiTwitter></Text>
                                        <Input size="xs"
                                        value={twitter}
                                        onChange={(e:any) => setTwitter(e.target.value)}
                                        placeholder={twitter}
                                        />
                                    </>
                                    )}
                                </Field>
                                <Field name="link1">
                                    {() => (
                                    <>
                                        <Text><FiGlobe></FiGlobe></Text>
                                        <Input size="xs"
                                        value={link1}
                                        onChange={(e:any) => setLink1(e.target.value)}
                                        placeholder={link1}
                                        />
                                    </>
                                    )}
                                </Field>
                                <Field name="link2">
                                    {() => (
                                    <>
                                        <Text><FiGlobe></FiGlobe></Text>
                                        <Input size="xs"
                                        value={link2}
                                        onChange={(e:any) => setLink2(e.target.value)}
                                        placeholder={link2}
                                        />
                                    </>
                                    )}
                                </Field>
                                <Field name="location">
                                    {() => (
                                    <>
                                        <Text><FiMapPin></FiMapPin></Text>
                                        <Input size="xs"
                                        value={location}
                                        onChange={(e:any) => setLocation(e.target.value)}
                                        placeholder={location}
                                        />
                                    </>
                                    )}
                                </Field>
                                <div  style={{display:"inline", margin:"5% 0!important"}}>
                                    <Button type="submit" style={{margin:"0 20%"}}>Save<FiEdit2 style={{marginLeft:"5px", display:"inline"}}/></Button>
                                    <Button type="button" onClick={handleCancelPressed} style={{margin:"0 2%", display:"inline"}}>Cancel</Button>
                                </div>
                                </Box>
                            </Form>
                            )}
                        </Formik>

                    {alert && <Alert color={"red"} style={{marginTop:"5%"}}>{alert}</Alert>}
                    </Grid.Col>
                    <Grid.Col sm={2}></Grid.Col>
                    </>
                }
            </Grid>
        </div>
    }
    </div>
  )
}

export default Profile;
