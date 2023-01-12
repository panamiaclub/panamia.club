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
    const [category, setCategory] = useState("");

    const [alert, setAlert] = useState("");
    const [invoices, setInvoices] = useState<any[]>([]);

    const handleSignOut = () => signOut({redirect: false, callbackUrl: '/'});
    const handleEditPressed= () => {setEditProfile(true)};
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
            })
            .catch((error) => {
                console.log(error);
                setAlert(error);
            });
            console.log(res);
        }
      }
    

  const editUser = async () => {
    const res = await axios
      .put(
        "/api/editProfile",
        { username, email, bio ,instagram, twitter, link1, link2, category},
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      )
      .then(async (res) => {
        console.log(res);
        redirectToHome();
      })
      .catch((error) => {
        console.log(error);
        setAlert(error);
      });
  };


     useEffect(() => {
        getUser();
        if(session){
            if(session.user){
                if(session.user.email){
                    setEmail(session.user.email);
                }
            }
        }
    }, []);

    useEffect(() => {
      
        if(username){
            console.log(username);
        }
    }, [invoices, email, username, instagram, bio, link1, link2, twitter, session])

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
                            {!session.user.image && <CgProfile size="2em"/>}
                            {session.user.image && <img src={session.user.image}></img>}
                        </div>
                        <table style={{marginBottom:"20px",textAlign:"left"}}>
                            <thead>
                                <tr>
                                    <td>{username}</td>
                                </tr>
                                <tr>
                                    <td>{bio}</td>
                                </tr>
                                {category && 
                                    <tr>
                                        <td><FiArchive></FiArchive>{category}</td>
                                    </tr>
                                }
                                <tr>
                                    {instagram && 
                                        <td><Link href={"https://instagram.com/@"+instagram} target="_blank"><FiInstagram></FiInstagram></Link></td>
                                    }
                                     {twitter && 
                                        <td><Link href={"https://twitter.com/"+ twitter} target="_blank"><FiTwitter></FiTwitter></Link></td>
                                    }
                                    {link1 && 
                                        <td><Link href={link1} target="_blank"><FiGlobe></FiGlobe></Link></td>
                                    }
                                    {link2 && 
                                        <td><Link href={link2} target="_blank"><FiGlobe></FiGlobe></Link></td>
                                    }
                                </tr>
                               
                            </thead>
                        </table>
                        <Button onClick={handleEditPressed} style={{margin:"0%"}}>Edit Profile <FiEdit2 style={{marginLeft:"5px"}}/></Button>
                    </Grid.Col>
                </>
                }
                {editProfile &&
                <>
                    <Grid.Col sm={2}></Grid.Col>
                    <Grid.Col sm={8}>
                        <div style={{margin:"2% 43%"}}>
                            {!session.user.image && <CgProfile size="3em"/>}
                            {session.user.image && <img src={session.user.image}></img>}
                        </div>
                        <Formik
                            initialValues={{}} // { email: "", password: "" }
                            validateOnChange={false}
                            validateOnBlur={false}
                            onSubmit={(_, actions) => {
                            formSubmit(actions);
                            }}
                        >
                            {(props) => (
                            <Form style={{ width: "100%" }}>
                                <Box mb={4}>
                                <Field name="username">
                                    {() => (
                                    <>
                                        <Text>Username:</Text>
                                        <Input
                                        value={username}
                                        onChange={(e:any) => setUsername(e.target.value)}
                                        placeholder={session?.user?.name || "username"}
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
                                        <Input
                                        value={bio}
                                        onChange={(e:any) => setBio(e.target.value)}
                                        placeholder={bio}
                                        />
                                    </>
                                    )}
                                </Field>
                                <Field name="category">
                                    {() => (
                                    <>
                                        <Text><FiArchive></FiArchive>Category:</Text>
                                        <Input
                                        value={category}
                                        onChange={(e:any) => setCategory(e.target.value)}
                                        placeholder={"Category"}
                                        />
                                    </>
                                    )}
                                </Field>

                                <Field name="instagram">
                                    {() => (
                                    <>
                                        <Text><FiInstagram></FiInstagram></Text>
                                        <Input
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
                                        <Input
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
                                        <Input
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
                                        <Input
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
