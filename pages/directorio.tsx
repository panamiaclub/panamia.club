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
    const [category, setCategory] = useState<any[]>([]);
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
      
        if(!users){
            getUsers();
        }
        if(users && category){
            //console.log(category);    
        }

    }, [users, category]);

    const filterUsers = () => {
        let newUsers = users.filter(
            user => user.category.toString().includes(category.toString()));

        //console.log('new users'+newUsers);
        setUsers(newUsers);
    }

    const formSubmit = (actions: any) => {
        actions.setSubmitting(false);
        filterUsers();
      };

  return (
    <div className={styles.App}>
        {
        <div className={styles.container} style={{minHeight:"85vh"}}>
            <Grid>
                <Grid.Col sm={3}><h2 style={{marginLeft:"2%"}}>El Directorio</h2></Grid.Col>
            </Grid>
            <hr></hr>
            <Grid style={{marginBottom:"2%"}}>
                <Grid.Col sm={2}></Grid.Col>
                <Grid.Col sm={8}>
                    
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
                            {/* 
                                Multiple checkboxes with the same name attribute, but different
                                value attributes will be considered a "checkbox group". Formik will automagically
                                bind the checked values to a single array for your benefit. All the add and remove
                                logic will be taken care of for you.
                            */}
                            <div id="checkbox-group"></div>
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
                                    <span style={{fontSize:"1.5em"}}>Filter:</span>
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
                {alert && <Alert color={"red"} style={{marginTop:"5%"}}>{alert}</Alert>}
                </Grid.Col>
                <Grid.Col sm={2}></Grid.Col>
            </Grid>
            <div >
                {users &&
                    users.map((item)=>{
                    return(
                        <Card className={styles.cardStyle} key={item.id}>
                        <Grid>
                            <Grid.Col sm={6}>
                                <Link  href={"/panas/"+item.username}>
                                    <div style={{cursor:"pointer"}}>
                                        <img className={styles.avatar} src={item.avatar} ></img>
                                        <p >{item.username}</p>
                                        <p >{item.bio}</p>
                                    </div>
                                </Link>
                            </Grid.Col>
                            <Grid.Col sm={6}>
                                <p> <FiArchive></FiArchive> {item.category.toString()}</p>
                                <span className={styles.socialLink}><Link href={"http://instagram.com/"+item.instagramHandle}><FiInstagram></FiInstagram></Link></span>
                                <span className={styles.socialLink}><Link href={"http://twitter.com/"+item.twitterHandle}><FiTwitter></FiTwitter></Link></span>
                                <span className={styles.socialLink}><Link href={item.link1}><FiGlobe></FiGlobe></Link></span>
                            </Grid.Col>
                        </Grid>
                    </Card>
                    )
                    })
                }
            </div>
        </div>
    }
    </div>
  )
}

export default Profile;
