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
    const [users, setUsers] = useState<any[]>([]);
    const [alert, setAlert] = useState("");

    const handleSignOut = () => signOut({redirect: false, callbackUrl: '/'});

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
        setUsers(res.data.data);
      })
      .catch((error) => {
        console.log(error);
        setAlert(error);
      });
  };


     useEffect(() => {
        getUsers();
    }, []);

    useEffect(() => {
      
        if(users){
            console.log(users);
        }
    }, [users])

  return (
    <div className={styles.App}>
        {
        <div className={styles.container} style={{minHeight:"85vh"}}>
            <Grid>
                <Grid.Col sm={3}><h1 style={{marginLeft:"2%"}}>El Directorio</h1></Grid.Col>
            </Grid>
            <hr></hr>
            <Grid>
                {
                <>
                    <Grid.Col sm={12}>
                      
                        <table style={{marginBottom:"20px",textAlign:"left"}}>
                            <thead>
                                <tr>
                                    <td>Name</td><td>Description</td><td>Category</td><td><FiGlobe></FiGlobe> Website</td>
                                </tr>
                            </thead>
                            <tbody>
                                {users &&
                                 users.map((item)=>{
                                    return(
                                    <tr key={item.id}>
                                        <td>{item.username}</td>
                                        <td>{item.bio}</td>
                                        <td>{item.category}</td>
                                        <td><Link href={item.link1}>{item.link1}</Link></td>
                                    </tr>
                                    )
                                 })
                                }
                            </tbody>
                        </table>
                    </Grid.Col>
                </>
                }
            </Grid>
        </div>
    }
    </div>
  )
}

export default Profile;
