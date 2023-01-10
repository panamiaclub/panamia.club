import type { NextPage } from 'next'
import Link from 'next/link';
import Head from 'next/head'
import Image from 'next/image'
import styles from '../styles/Home.module.css'
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
import {FiEdit2} from 'react-icons/fi'
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
        if(session?.user?.email){
            console.log(session.user.email);
            const res = await axios
            .get(
                "/api/getUser?userEmail="+session.user.email,
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
      .then(async () => {
        redirectToHome();
      })
      .catch((error) => {
        console.log(error);
        setAlert(error);
      });
    console.log(res);
  };


     useEffect(() => {
        getUser();
    }, []);

    useEffect(() => {
        if(username){
            console.log(username);
        }
    }, [invoices, email, username])

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
                <Grid.Col sm={3}>
                    <div style={{margin:"10% 43%"}}>
                        <p style={{textAlign:"center"}}>Avatar</p>
                        {!session.user.image && <CgProfile size="4em"/>}
                        {session.user.image && <img src={session.user.image}></img>}
                    </div>
                    <table style={{width:"80%", marginBottom:"20px", margin:"0 auto", textAlign:"left"}}>
                        <thead>
                            <tr>
                                <th>Username: </th>
                                <td>{username}</td>
                            </tr>
                            <tr>
                                <th>Email: </th>
                                <td>{session.user.email}</td>
                            </tr>
                            <tr>
                                <th>Bio: </th>
                                <td>{bio}</td>
                            </tr>
                            <tr>
                                <th>Category: </th>
                                <td>{category}</td>
                            </tr>
                            {instagram && 
                                <tr>
                                    <th>Instagram: </th>
                                    <td><Link href={"https://instagram.com/@"+instagram}>{instagram}</Link></td>
                                </tr>
                            }
                             {twitter && 
                                <tr>
                                    <th>Twitter: </th>
                                    <td><Link href={"https://twitter.com/@"+ twitter}>{twitter}</Link></td>
                                </tr>
                            }
                             {link1 && 
                                <tr>
                                    <th>Link 1: </th>
                                    <td><Link href={link1}>{link1}</Link></td>
                                </tr>
                            
                            }
                             {link2 && 
                                <tr>
                                    <th>Link 2: </th>
                                    <td><Link href={link1}>{link2}</Link></td>
                                </tr>
                                }
                        </thead>
                    </table>
                    <Button onClick={handleEditPressed} style={{margin:"0 35%"}}>Edit Profile <FiEdit2 style={{marginLeft:"5px"}}/></Button>
                    <br></br>
                    <Button color="red" style={{margin:"15% 37%", marginTop:"300px"}} onClick={handleSignOut}>Log Out</Button>
                </Grid.Col>
            }
            {editProfile &&
                <Grid.Col sm={12} style={{borderRight:"2px solid white"}}>
                    <div style={{margin:"10% 43%"}}>
                        <p style={{textAlign:"center"}}>Avatar</p>
                        {!session.user.image && <CgProfile size="4em"/>}
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
                            <Field name="email">
                                {() => (
                                <>
                                    <Text>Email:</Text>
                                    <Input
                                    value={email}
                                    onChange={(e:any) => setEmail(e.target.value)}
                                    placeholder={session?.user?.email || "email"}
                                    />
                                </>
                                )}
                            </Field>
                            <Field name="bio">
                                {() => (
                                <>
                                    <Text>Bio:</Text>
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
                                    <Text>Category:</Text>
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
                                    <Text>Instagram:</Text>
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
                                    <Text>Twitter:</Text>
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
                                    <Text>Link 1:</Text>
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
                                    <Text>Link 2:</Text>
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
                    
                    <Button color="red" style={{margin:"1% 37%", marginTop:"300px"}} onClick={handleSignOut}>Log Out</Button>
                </Grid.Col>
            }
        </Grid>
        </div>
    }
    </div>
  )
}

export default Profile;
