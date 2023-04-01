import type { NextPage } from 'next'
import Link from 'next/link'
import Head from 'next/head'
import Image from 'next/image'
import styles from '../styles/giftguide.module.css'
import {FiEdit2} from 'react-icons/fi'
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faTwitter } from "@fortawesome/free-brands-svg-icons"
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
import { IconBrandInstagram } from '@tabler/icons'
import {motion, useAnimation} from "framer-motion";
import {useInView} from "react-intersection-observer";
import {useEffect, useLayoutEffect} from 'react';

import Router from "next/router";
import { Field, Form, Formik, getIn } from "formik";
import { TextInput, NumberInput, StylesApiProvider } from '@mantine/core';
import { useForm } from '@mantine/form';
import {useSession ,signIn, signOut} from 'next-auth/react';
import { userAgent } from 'next/server';
import { useCallback, useMemo, useState } from 'react';
import axios from "axios";
import React from 'react';
import { IconMathIntegral } from '@tabler/icons';

import { ReactSVG } from 'react-svg'
import svg1 from '../public/CosaHecha/1.svg';

const Intake: NextPage = () => {
  const {data:session, status} = useSession();
  const {ref, inView} = useInView();
  const animation = useAnimation();
  const [alert, setAlert] = useState("");
  const [success, setSuccess] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUserName] = useState("");
  const [onboardingFormComplete, setOnboardingFormComplete] = useState(Boolean);
  const [category, setCategory] = useState<any>([]);
  const [artIntake, setArtIntake] = useState(Boolean);
  const [servicesIntake, setServicesIntake] = useState(Boolean);
  const [foodIntake, setFoodIntake] = useState(Boolean);
  const [goodsIntake, setGoodsIntake] = useState(Boolean);
  const [orgIntake, setOrgIntake] = useState(Boolean);
  const [apparelIntake, setApparelIntake] = useState(Boolean);
  const [checkedIntake, setCheckedIntake] = useState(false);

  const getUser = async() => {
    if(session?.user?.email){
      console.log('get user')  
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
            setUserName(response.data.data.username);
            setEmail(response.data.data.email);
            setCategory(response.data.data.category);
            setOnboardingFormComplete(response.data.data.onboardingFormComplete);
        })
        .catch((error) => {
            console.log(error);
            setAlert(error.response.data.error);
        });
        //console.log(res);
    }
  }

  const editUserCompleteOnboarding = async () => {
    if(email){
        const res = await axios
            .put(
                "/api/editCompleteOnboarding",
                {email},
                {
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                }
            )
            .then(async (res) => {
                //console.log(res);
                setOnboardingFormComplete(true);
                setSuccess("Onboarding Complete, your profile is public now.")
            })
            .catch((error) => {
                //console.log(error);
                setAlert(error.response.data.error);
            });
    }
};

  const getIntakeStatus = async(category:string) => {
    console.log('get intake status')
    if(session?.user?.email){
        console.log(session.user.email);
        const res = await axios
        .get(
            "/api/getIntakeFormStatus?userEmail="+session?.user?.email+"?category="+category,
            {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            }
            }
        )
        .then(async (response) => {
            console.log(response)
            if(category == "Services"){
              setServicesIntake(response.data.data);
            }else if(category == "Art"){
              setArtIntake(response.data.data);
              console.log(response.data.data)
            }else if(category == "Food"){
              setFoodIntake(response.data.data);
            }else if(category == "Apparel/Accessories"){
              setApparelIntake(response.data.data);
            }else if(category == "Collectives/Platforms"){
              setOrgIntake(response.data.data);
            }else if(category == "Goods"){
              setGoodsIntake(response.data.data);
            }
            setCheckedIntake(true);
        })
        .catch((error) => {
            console.log(error);
            setAlert(error.response.data.error);
        });
        //console.log(res);
    }else{
      setAlert("Must be logged in.");
    }
  }


  const checkIfAnyFormsComplete = async() => {
    let anyTrue = false;
    
    category.forEach((str:any, index:number) => {
      console.log('checkl intake')
      console.log(str)
      if(category == "Services"){
        if(servicesIntake == true){
          anyTrue = true;
        }
      }else if(category == "Art"){
       if(artIntake == true){
        anyTrue = true;
      }
      }else if(category == "Food"){
        if(foodIntake == true){
          anyTrue = true;
        }
      }else if(category == "Apparel/Accessories"){
        if(apparelIntake == true){
          anyTrue = true;
        }
      }else if(category == "Collectives/Platforms"){
        if(orgIntake == true){
          anyTrue = true;
        }
      }else if(category == "Goods"){
        if(goodsIntake == true){
          anyTrue = true;
        }
      }
    })

    if(anyTrue){
      setOnboardingFormComplete(true);
      setSuccess("All Forms Completed");
      editUserCompleteOnboarding();
    }
    setCheckedIntake(true);
  }

  useEffect(()=>{
    getUser();


  }, [])

  useEffect(() => {
    if(username){
      console.log(username);
    }
    if(email){
      console.log(email);
    }

    if(!username){
      getUser()
    }
    
      if(category && !checkedIntake){
        console.log(category)
        category.map((str:any) => {
          console.log('get intake status')
          console.log(str);
          if(category != "Supporter"){
            //getIntakeStatus(str);
          }
        });
      }
  
      if(artIntake){
        console.log('art intake ' + artIntake)
      }
      if(servicesIntake){
        console.log(servicesIntake)
      }
    }, [username, email, category, onboardingFormComplete, artIntake, servicesIntake, orgIntake, apparelIntake, goodsIntake, foodIntake, checkedIntake])

  return (
    <div className={styles.App}>
        <div className={styles.mainContainer} ref={ref}>
            <Grid  className={styles.formContainer}>
                <Grid.Col span={3} md={3} xs={0}></Grid.Col>
                <Grid.Col span={6} md={6} xs={12}>
                <h2 style={{color:"#EE5967"}}>Intake Forms</h2>
                <p style={{fontSize:"0.8em"}}>must complete one per category*</p>

                {category &&
                    <div>
                        <>
                            
                            {category.map((str:any, index:number) => {
                                let link = "";
                                let formComplete = false;
                                 if(str == "Services"){
                                        link = "servicesintake"
                                        formComplete = servicesIntake;
                                 }else if(str == "Art"){
                                    link = "artintake"
                                    formComplete = artIntake;
                                 }else if(str == "Food"){
                                    link = "foodintake"
                                    formComplete = foodIntake;
                                 }else if(str == "Apparel/Accessories"){
                                    link = "apparelintake"
                                    formComplete = apparelIntake;
                                 }else if(str == "Collectives/Platforms"){
                                    link = "orgintake"
                                    formComplete = orgIntake;
                                 }else if(str == "Goods"){
                                    link = "goodsintake"
                                    formComplete = goodsIntake;
                                 }else if(str == "Customer"){
                                    return (<></>);
                                 }

                                return(
                                   
                                    <Link href={link} key={index}><Button style={{margin:"0 20px"}}> {str} </Button></Link>
                                );
                            })}
                            <Button style={{margin:"20px 20px", backgroundColor:"green"}} onClick={editUserCompleteOnboarding}> Complete Intake Status</Button>
                        </>
                    </div>
                }
                 {alert && <Alert color={"red"} style={{marginTop:"5%"}}>{alert}</Alert>}
                 {success && <><Alert color={"green"} style={{marginTop:"5%"}}>{success}</Alert></>}
                 <br></br>
                 {onboardingFormComplete == true && <Link href="/profile"><Button style={{margin:"0 20px", backgroundColor:"black"}}> Go To Your Profile </Button></Link>}
                </Grid.Col>
                <Grid.Col span={3} md={3} xs={0}></Grid.Col>
            </Grid>
        </div>
        
  </div>
  )
}

export default Intake
