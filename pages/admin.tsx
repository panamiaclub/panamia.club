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
import {FiEdit2, FiInstagram, FiTwitter, FiGlobe, FiMail, FiStar, FiFolder, FiStopCircle} from 'react-icons/fi'
import {useSession ,signIn, signOut} from 'next-auth/react';
import { userAgent } from 'next/server';
import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from "axios";
import AxiosResponse from "axios";
import { link } from 'fs';

import { BeatLoader } from 'react-spinners';

const Admin: NextPage = () => {
    const {data:session, status} = useSession();

    const [loading, setLoading] = useState(true);
    const [editProfile, setEditProfile] = useState(false);
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [avatar, setAvatar] = useState("");
    const [avatarFile, setAvatarFile] = useState("");
    const [alert, setAlert] = useState("");
    const [admin, setAdmin] = useState(false);
    const [users, setUsers] = useState<any[]>([]);

    const handleSignOut = () => signOut({redirect: false, callbackUrl: '/'});
    
    const handleEditPressed= () => {
        getUser();
        setEditProfile(true)
    };
    const handleCancelPressed = () => {setEditProfile(false)}; 

    if(editProfile){
        //console.log(editProfile)
    }

    const handleFeaturePressed = (email: any, featured: any) => {
        editFeatured(email, featured);
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
            console.log(email);
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
                console.log(response.data.data);
                setUsername(response.data.data.username);
                setAvatar(response.data.data.avatar);
                setAdmin(response.data.data.admin);
            })
            .catch((error) => {
                console.log(error);
                setAlert(error.response.data.error);
            });
            console.log(res);
        }
      }
    
      const getUsers = async () => {
        const res = await axios
          .get(
            "/api/getAllUsers",
            {
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
              },
            }
          )
          .then(async (res) => {
            console.log(res);
            setUsers(res.data);
            setLoading(false);
          })
          .catch((error) => {
            console.log(error);
            setAlert(error.response.data.error);
          });
      };

  const editFeatured = async (email: any, featured: any) => {
        if(email  && featured){
            const res = await axios
                .put(
                    "/api/editFeatured",
                    { email, featured},
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
        getUsers();
    }, []);

    useEffect(() => {
        if(!users){
            getUsers();
        }

        if(avatarFile){
            let base64file= getBase64(avatarFile, (result:string) => {
                //console.log('base64image'+result);
                setAvatar(result);
            });
        }
        if(users){
            console.log(users);
        }
    }, [email, username ,session, avatar, avatarFile, users])

    const handleProfilePressed = () => {
        const { pathname } = Router;
        if (pathname === "/admin") {
          // TODO: redirect to a success register page
          Router.push("/profile");
        }
      };

  return (
    <div className={styles.App}>
        {session && session.user && 
        <div className={styles.container} style={{minHeight:"85vh"}}>
            <Grid>
                <Grid.Col sm={3}><h1 style={{marginLeft:"2%"}}>Management</h1></Grid.Col>
            </Grid>
            <hr></hr>
            <Grid>
                {loading && <BeatLoader></BeatLoader>}
                {admin && 
                <>
                    <Grid.Col sm={3}> 
                        <div style={{margin:"2% 30%"}}>
                            {!avatar && <CgProfile size="2em"/>}
                            {avatar && <img src={avatar} className={styles.avatar}></img>}
                            <p style={{textAlign:"center"}}> {username}</p>
                            <Button onClick={handleProfilePressed} style={{margin:"0% 1%!important"}} size="xs">Profile</Button>
                        </div>
                    </Grid.Col>
                    <Grid.Col sm={9}>
                        <table>
                            <tr>
                                <th>username</th>
                                <th>email</th>
                                <th>category</th>
                                <th></th>
                            </tr>
                            <tbody>
                            {users && 
                                users.map((item, index) => {
                                    console.log(item);
                                    return(
                                        <tr key={index}>
                                        <td>{item.username}</td>
                                        <td>{item.email}</td>
                                        <td>{item.category.toString()}</td>
                                        <td>
                                            {item.featured && 
                                                <Button onClick={() => handleFeaturePressed(item.email, false)} style={{margin:"0 20%"}} size="xs">Remove Feature<FiStopCircle style={{marginLeft:"5px", display:"inline"}}/></Button>
                                            }
                                            {!item.featured && 
                                            <Button onClick={() => handleFeaturePressed(item.email, true)} style={{margin:"0 20%"}} size="xs">Feature<FiStar style={{marginLeft:"5px", display:"inline"}}/></Button>
                                            }
                                        </td>
                                        </tr>
                                    );
                                })
                            }
                            </tbody>
                        </table>
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

export default Admin;
