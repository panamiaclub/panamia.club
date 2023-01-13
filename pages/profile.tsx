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
import {FiEdit2, FiInstagram, FiTwitter, FiGlobe, FiMail} from 'react-icons/fi'
import {FiArchive} from 'react-icons/fi';
import {useSession ,signIn, signOut} from 'next-auth/react';
import { userAgent } from 'next/server';
import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from "axios";
import AxiosResponse from "axios";
import { link } from 'fs';

const Profile: NextPage = () => {
    const {data:session, status} = useSession();
    const [editProfile, setEditProfile] = useState(false);
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [bio, setBio] = useState("");
    const [instagram, setInstagram] = useState("");
    const [twitter, setTwitter] = useState("");
    const [link1, setLink1] = useState("");
    const [link2, setLink2] = useState("");
    const [category, setCategory] = useState<any[]>([]);
    const [avatar, setAvatar] = useState("");
    const [avatarFile, setAvatarFile] = useState("");
    const [alert, setAlert] = useState("");

    const handleSignOut = () => signOut({redirect: false, callbackUrl: '/'});
    const handleEditPressed= () => {
        getUser();
        setEditProfile(true)
    };
    const handleCancelPressed = () => {setEditProfile(false)}; 

    if(editProfile){
        //console.log(editProfile)
    }

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

      const getUser = async() => {
        if(email){
            console.log(email);
            const res = await axios
            .get(
                "/api/getUser?userEmail="+email,
                {
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                }
                }
            )
            .then(async (response) => {
                console.log(response.data.data);
                setUsername(response.data.data.username);
                setBio(response.data.data.bio);
                setCategory(response.data.data.category);
                setInstagram(response.data.data.instagram);
                setTwitter(response.data.data.twitter);
                setLink1(response.data.data.link1);
                setLink2(response.data.data.link2);
                setAvatar(response.data.data.avatar);
            })
            .catch((error) => {
                console.log(error);
                setAlert(error);
            });
            console.log(res);
        }
      }
    

  const editUser = async () => {
        if(email && category && avatar && bio && instagram && twitter && link1 && link2 ){
            console.log('category')
            console.log(category)
            const res = await axios
                .put(
                    "/api/editProfile",
                    { username, email, bio ,instagram, twitter, link1, link2, category, avatar},
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
                    setAlert(error);
                });
        }
    handleCancelPressed();
  };

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


     useEffect(() => {
        getUser();
        if(session?.user?.email){
            setEmail(session.user.email);
        }
    }, []);

    useEffect(() => {
        if(email){
            //console.log(email);
        }
        if(username){
            //console.log(username);
        }

        if(avatarFile){
            let base64file= getBase64(avatarFile, (result:string) => {
                //console.log('base64image'+result);
                setAvatar(result);
            });
        }

        if(avatar){
            //console.log(avatar);
        }

        if(category){
            //console.log('category');
            //console.log(category);
        }
        if(!username){
            getUser();
        }
    }, [email, username, instagram, bio, link1, link2, twitter, session, avatar, avatarFile, category])

  return (
    <div className={styles.App}>
        {session && session.user && 
        <div className={styles.container} style={{minHeight:"85vh"}}>
            <Grid>
                <Grid.Col sm={3}><h1 style={{marginLeft:"2%"}}>Profile</h1></Grid.Col>
            </Grid>
            <hr></hr>
            <Grid>
                {!editProfile &&
                <>
                    <Grid.Col sm={12}>
                        <div style={{margin:"2% 0%"}}>
                            {!avatar && <CgProfile size="2em"/>}
                            {avatar && <img src={avatar}  className={styles.avatar}></img>}
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
                        <br></br>
                        <Button onClick={handleEditPressed} style={{margin:"0%"}}>Edit Profile <FiEdit2 style={{marginLeft:"5px"}}/></Button>
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
                            initialValues={{avatar: avatar, username: username, bio: bio, category: category, instagram: instagram, twitter: twitter, link1: link1, link2: link2}} 
                            validateOnChange={false}
                            validateOnBlur={false}
                            onSubmit={(_, actions) => {
                            formSubmit(actions);
                            }}
                        >
                            {(props) => (
                            <Form style={{ width: "100%" }} className={styles.form}>
                                <Box mb={4}>
                                    {
                                        <Field name="avatar">
                                        {() => (
                                        <>
                                            <Text>Avatar:</Text>
                                            <Input size="xs"
                                            value={undefined} 
                                            type="file" 
                                            accept="image/*"
                                            onChange={async(e:any) => {
                                                let file = (e.target.files[0])
                                                setAvatarFile(file);
                                            }}
                                            />
                                        </>
                                        )}
                                    </Field>
                                    }
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
                                {/* <Field name="email">
                                    {() => (
                                    <>
                                        <Text><FiMail></FiMail>Email:</Text>
                                        <Input
                                        value={email}
                                        onChange={(e:any) => setEmail(e.target.value)}
                                        placeholder={session?.user?.email || "email"}
                                        />
                                    </>
                                    )}
                                </Field> */}
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
                                <div id="checkbox-group">Category</div>
                                    <div role="group" aria-labelledby="checkbox-group"  
                                    onChange={async(e:any) => {
                                        if(e.target.checked){
                                            var arrayy = new Array();
                                            if(category){
                                                category.map((item)=>{
                                                    arrayy.push(item);
                                                })
                                            }
                                            arrayy.push(e.target.value.toString());
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
                                        <Field type="checkbox" name="Category" value="Apparel/Accessories" />
                                        Apparel/Accessories
                                        </label>
                                        <label>
                                        <Field type="checkbox" name="Category" value="Collectives/Platforms" />
                                        Collectives/Platforms
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
