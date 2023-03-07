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
import {useEffect} from 'react';

import Router from "next/router";
import { Field, Form, Formik } from "formik";
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

const ApparelIntake: NextPage = () => {
  const {data:session, status} = useSession();
  const {ref, inView} = useInView();
  const animation = useAnimation();
  const [alert, setAlert] = useState("");
  const [success, setSuccess] = useState("");

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [backgroundEthnicity, setBackgroundEthnicity] = useState("");
  const [locationOptions, setLocationOptions] = useState<any>([]);
  const [address, setAddress] = useState("");
  const [about, setAbout] = useState("");
  const [category, setCategory] = useState<any>([]);
  const [source, setSource] = useState<any>([]);
  const [audience, setAudience] = useState<any>([]);
  const [businessNeed, setBusinessNeed] = useState("");
  const [marketInterest, setMarketInterest] = useState("");
  const [interest, setInterest] = useState("");
  const [workshop, setWorkshop] = useState("");
  const [workshopDetails, setWorkshopDetails] = useState("");
  const [website, setWebsite] = useState("");
  const [twitterHandle, setTwitterHandle] = useState("");
  const [igUsername, setIgUsername] = useState("");
  const [tags, setTags] = useState("");
  const [logo, setLogo] = useState("");
  const [logoFile, setLogoFile] = useState<any>();
  const [image1, setImage1] = useState("");
  const [image2, setImage2] = useState("");
  const [image3, setImage3] = useState("");
  const [image1File, setImage1File] = useState<any>();
  const [image2File, setImage2File] = useState<any>();
  const [image3File, setImage3File] = useState<any>();
  const [igConsent, setIgConsent] = useState(Boolean);
  const [marketConsent, setMarketConsent] = useState(Boolean);
  const [collabConsent, setCollabConsent] = useState(Boolean);
  const [referrals, setReferrals] = useState("");

  if(email && name  && igUsername && twitterHandle ){}

  const formSubmit = (actions: any) => {
    actions.setSubmitting(false);
    createNewsletterEntry();
  };

  const redirectToHome = () => {
    const { pathname } = Router;
    if (pathname === "/giftguide") {
      // TODO: redirect to a success register page
      Router.push("/giftguide");
    }
  };

  useEffect(() => {
    if(name){
      console.log(name);
    }
    if(email){
      console.log(email);
    }
    if(igUsername){
      console.log(igUsername);
    }
    if(twitterHandle){
      console.log(twitterHandle);
    }
  }, [twitterHandle, name, email, igUsername, about]);

  const createNewsletterEntry = async () => {
    console.log('create newsletter fired')
    if(name && email  && igUsername && twitterHandle ){
        const res = await axios
        .post(
            "/api/createNewsletterEntry",
            { name, email, igUsername, twitterHandle },
            {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            }
        )
        .then(async () => {
            //redirectToHome();
            setSuccess("Succesfully signed up!")
        })
        .catch((error) => {
            console.log(error);
            setAlert(error.response.data.error);
        });
        console.log(res);
    }
  };


  useEffect(() => {
    console.log("use effect , inView = " , inView);
    if(inView){
      animation.start({
        x: 0,
        transition: {
          type: "spring",
          duration: 1,
          bounce: 0.3
        }
      })
    }else{
      animation.start({
        x:"-100vw"
      })
    }
  }, [inView]);

  return (
    <div className={styles.App}>
        <div className={styles.mainContainer} ref={ref}>
          <motion.div animate={animation}>
            <Grid  className={styles.formContainer}>
                <Grid.Col span={3} md={3} xs={0}></Grid.Col>
                <Grid.Col span={6} md={6} xs={12}>
                <h2 style={{color:"#EE5967"}}>Apparel Vendor Intake Form</h2>
                <Formik
                    initialValues={{}}
                    validateOnChange={false}
                    validateOnBlur={false}
                    onSubmit={(_, actions) => {
                    formSubmit(actions);
                    }}
                >
                    {(props) => (
                    <Form style={{ width: "100%" }}>
                      <Box mb={4}>
                      <Field name="email" required>
                          {() => (
                          <>
                          <Text className={styles.formText} style={{marginTop:"20px"}}>Email:</Text>
                              <Input
                              value={email}
                              onChange={(e:any) => setEmail(e.target.value)}
                              placeholder={"Email"}
                              />
                          </>
                          )}
                      </Field>
                      <Field name="name" required>
                          {() => (
                          <>
                          <Text className={styles.formText} style={{marginTop:"20px"}}>Name of your Business/Service:</Text>
                              <Input
                              value={name}
                              onChange={(e:any) => setName(e.target.value)}
                              placeholder={"Name"}
                              />
                          </>
                          )}
                      </Field>
                      <Field name="about" required>
                          {() => (
                          <>
                          <Text className={styles.formText} style={{marginTop:"20px"}}>Tell us about you and your business/brand/craft as if we’ve just met. Where are you based?</Text>
                              <Input
                              value={about}
                              onChange={(e:any) => setAbout(e.target.value)}
                              placeholder={"About"}
                              />
                          </>
                          )}
                      </Field>
                      <Field name="backgroundEthnicity">
                          {() => (
                          <>
                          <Text className={styles.formText} style={{marginTop:"20px"}}>What is your background/ethnicity? (*optional* one of our goals is to promote minority-led small businesses, we may focus on some  demographics depending on the week where your business may be relevant on our social media)</Text>
                              <Input
                              value={backgroundEthnicity}
                              onChange={(e:any) => setBackgroundEthnicity(e.target.value)}
                              placeholder={""}
                              />
                          </>
                          )}
                      </Field>
                      <Field name="igUsername">
                          {() => (
                          <>
                           <Text className={styles.formText} style={{marginTop:"20px"}}>Instagram Handle:</Text>
                              <Input
                              value={igUsername}
                              onChange={(e:any) => setIgUsername(e.target.value)}
                              placeholder={"Other URL"}
                              />
                          </>
                          )}
                      </Field>
                      <Field name="twitterHandle" >
                          {() => (
                          <>
                           <Text className={styles.formText} style={{marginTop:"20px"}}>Twitter Handle:</Text>
                              <Input
                              value={twitterHandle}
                              onChange={(e:any) => setTwitterHandle(e.target.value)}
                              placeholder={"Twitter Handle"}
                              />
                          </>
                          )}
                      </Field>
                      <Field name="website">
                          {() => (
                          <>
                           <Text style={{marginTop:"20px"}} className={styles.formText}>Website:</Text>
                              <Input
                              value={website}
                              onChange={(e:any) => setWebsite(e.target.value)}
                              placeholder={"Website"}
                              />
                          </>
                          )}
                      </Field>

                      <Text  style={{margin:"20px 0"}}>Logo</Text>
                      <Input size="xs" id="logo" required
                                            value={logo} 
                                            type="file" 
                                            accept="image/*"
                                            onChange={async(e:any) => {
                                                let file = (e.target.files[0])
                                                setLogoFile(file);
                                            }}
                                        />

                  <div id="checkbox-group" style={{margin:"20px 0"}}>What sort of apparel do you sell?</div>
                      <div role="group" aria-labelledby="checkbox-group"  
                      onChange={async(e:any) => {
                          if(e.target.checked){
                              let arrayy = new Array();
                              if(category){
                                  category.map((item:any)=>{
                                      arrayy.push(item);
                                  })
                              }
                              arrayy.push(e.target.value.toString());
                              //console.log(arrayy);
                              setCategory(arrayy);
                          }
                      }}>
                          <label style={{display:"block"}}><Field type="checkbox" name="category" value="Shoes"/>Shoes</label>
                          <label style={{display:"block"}}><Field type="checkbox" name="category" value="Jewelry"/>Jewelry</label>
                          <label style={{display:"block"}}><Field type="checkbox" name="category" value="Hats"/>Hats</label>
                          <label style={{display:"block"}}><Field type="checkbox" name="category" value="Outerwear"/>Outerwear (Jackets/Coats/etc.)</label>
                          <label style={{display:"block"}}><Field type="checkbox" name="category" value="Sportswear"/>Sportswear</label>
                          <label style={{display:"block"}}><Field type="checkbox" name="category" value="Bags/Accessories"/>Bags/Accessories</label>
                          <label style={{display:"block"}}><Field type="checkbox" name="category" value="Intimates/Lingerie"/>Intimates/Lingerie</label>
                          <label style={{display:"block"}}><Field type="checkbox" name="category" value="Swimsuits"/>Swimsuits</label>
                          <label style={{display:"block"}}><Field type="checkbox" name="category" value="Tops"/>Tops</label>
                          <label style={{display:"block"}}><Field type="checkbox" name="category" value="Bottoms"/>Bottoms</label>
                          <label style={{display:"block"}}><Field type="checkbox" name="category" value="Other"/>Other</label>
                      </div>

                      <div id="checkbox-group-location-options"  style={{margin:"20px 0"}}>Where do you sell this product?</div>
                      <div role="group" aria-labelledby="checkbox-group-location-options"  
                      onChange={async(e:any) => {
                          if(e.target.checked){
                              let arrayy = new Array();
                              if(locationOptions){
                                locationOptions.map((item:any)=>{
                                      arrayy.push(item);
                                  })
                              }
                              arrayy.push(e.target.value.toString());
                              //console.log(arrayy);
                              setLocationOptions(arrayy);
                          }
                      }}>
                          <label style={{display:"block"}}><Field type="checkbox" name="locationOptions" value="My Location"/>My Location</label>
                          <label style={{display:"block"}}><Field type="checkbox" name="locationOptions" value="Pickup"/>Pickup</label>
                          <label style={{display:"block"}}><Field type="checkbox" name="locationOptions" value="Markets/Events"/>Markets/Events</label>
                          <label style={{display:"block"}}><Field type="checkbox" name="locationOptions" value="Local Shipping"/>Local Shipping</label>
                          <label style={{display:"block"}}><Field type="checkbox" name="locationOptions" value="Worldwide Shipping"/>Worldwide Shipping</label>
                          <label style={{display:"block"}}><Field type="checkbox" name="locationOptions" value="Other"/>Other</label>
                      </div>

                      <Field name="address">
                          {() => (
                          <>
                           <Text style={{marginTop:"20px"}} className={styles.formText}>Address:</Text>
                              <Input
                              value={address}
                              onChange={(e:any) => setAddress(e.target.value)}
                              placeholder={"Address"}
                              />
                          </>
                          )}
                      </Field>

                      <div id="checkbox-group-audience"  style={{margin:"20px 0"}}>What is the general audience of your products?</div>
                      <div role="group" aria-labelledby="checkbox-group-audience"  
                        onChange={async(e:any) => {
                          if(e.target.checked){
                              let arrayy = new Array();
                              if(audience){
                                audience.map((item:any)=>{
                                      arrayy.push(item);
                                  })
                              }
                              arrayy.push(e.target.value.toString());
                              //console.log(arrayy);
                              setAudience(arrayy);
                          }
                      }}>
                          <label style={{display:"block"}}><Field type="checkbox" name="audience" value="Women"/>Women</label>
                          <label style={{display:"block"}}><Field type="checkbox" name="audience" value="Men"/>Men</label>
                          <label style={{display:"block"}}><Field type="checkbox" name="audience" value="Unisex"/>Unisex</label>
                          <label style={{display:"block"}}><Field type="checkbox" name="audience" value="Children/Babies"/>Children/Babies</label>
                          <label style={{display:"block"}}><Field type="checkbox" name="audience" value="Mature"/>Mature</label>
                          <label style={{display:"block"}}><Field type="checkbox" name="audience" value="Pets/Animals"/>Pets/Animals</label>
                          <label style={{display:"block"}}><Field type="checkbox" name="audience" value="Other"/>Other</label>
                      </div>

                      <div id="checkbox-group-source"  style={{margin:"20px 0"}}>How do you source your product?</div>
                      <div role="group" aria-labelledby="checkbox-group-source"  
                      onChange={async(e:any) => {
                          if(e.target.checked){
                              let arrayy = new Array();
                              if(source){
                                source.map((item:any)=>{
                                      arrayy.push(item);
                                  })
                              }
                              arrayy.push(e.target.value.toString());
                              //console.log(arrayy);
                              setSource(arrayy);
                          }
                      }}>
                          <label style={{display:"block"}}><Field type="checkbox" name="source" value="Handmade"/>Handmade</label>
                          <label style={{display:"block"}}><Field type="checkbox" name="source" value="Imported Artisinal"/>Imported Artisinal</label>
                          <label style={{display:"block"}}><Field type="checkbox" name="source" value="Factory-made"/>Factory-made</label>
                          <label style={{display:"block"}}><Field type="checkbox" name="source" value="Reworked/Upcycled"/>Reworked/Upcycled</label>
                          <label style={{display:"block"}}><Field type="checkbox" name="source" value="Second-hand/Vintage"/>Second-hand/Vintage</label>
                          <label style={{display:"block"}}><Field type="checkbox" name="source" value="Other"/>Other</label>
                      </div>
                     
                      <Field name="tags" required>
                          {() => (
                          <>
                           <Text className={styles.formText} style={{marginTop:"20px"}}>Give us five words that describes your business/services:</Text>
                              <Input
                              value={tags}
                              onChange={(e:any) => setTags(e.target.value)}
                              placeholder={"separate each word by a space"}
                              />
                          </>
                          )}
                      </Field>

                      <Field name="interest">
                          {() => (
                          <>
                           <Text className={styles.formText} style={{marginTop:"20px"}}>What do you want to get out of this membership?</Text>
                              <Input
                              value={interest}
                              onChange={(e:any) => setInterest(e.target.value)}
                              placeholder={""}
                              />
                          </>
                          )}
                      </Field>
                      
                      <Text  style={{margin:"20px 0"}}>At least 3 pictures that best represent your brand/business (Ex: Final product, in-action shot,  satisfied customer, etc.)</Text>
                      <Input size="xs" id="image1Input"
                                            value={image1} 
                                            type="file" 
                                            accept="image/*"
                                            onChange={async(e:any) => {
                                                let file = (e.target.files[0])
                                                setImage1File(file);
                                            }}
                                        />
                      <Input size="xs" id="image2Input"
                        value={image2} 
                        type="file" 
                        accept="image/*"
                        onChange={async(e:any) => {
                            let file = (e.target.files[0])
                            setImage2File(file);
                        }}
                    />
                      <Input size="xs" id="image3Input"
                        value={image3} 
                        type="file" 
                        accept="image/*"
                        onChange={async(e:any) => {
                            let file = (e.target.files[0])
                            setImage3File(file);
                        }}
                    />

                    <Text className={styles.formText} style={{marginTop:"20px"}}>Are you interested in taking your product to market?</Text>
                      <Field  value={marketInterest} as="select" className={styles.selectField} name="marketInterest" onChange={(e:any) => setMarketInterest(e.target.value)}>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                        <option value="Maybe">Maybe</option>
                      </Field>      

                      <Field name="businessNeed">
                          {() => (
                          <>
                           <Text className={styles.formText} style={{marginTop:"20px"}}>What is your business' biggest need right now?</Text>
                              <Input
                              value={businessNeed}
                              onChange={(e:any) => setBusinessNeed(e.target.value)}
                              placeholder={""}
                              />
                          </>
                          )}
                      </Field>

                      <Text className={styles.formText} style={{marginTop:"20px"}}>Would you be interested in hosting a workshop for our members? (Ex. SEO, industry specific knowledge, helpful tech)</Text>
                      <Field  value={workshop} as="select" className={styles.selectField} name="workshop" onChange={(e:any) => setWorkshop(e.target.value)}>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                        <option value="Maybe">Maybe</option>
                      </Field>

                      <Field name="workshopDetails">
                          {() => (
                          <>
                           <Text style={{marginTop:"20px"}} className={styles.formText}>If you responded "Yes" to the question above, what content would you like to present on?</Text>
                              <Input
                              value={workshopDetails}
                              onChange={(e:any) => setWorkshopDetails(e.target.value)}
                              placeholder={""}
                              />
                          </>
                          )}
                      </Field>

                      <Card className={styles.cardStyle} style={{marginTop:'20px'}}>
                        <h3>Terms & Conditions</h3>
                        <p>This is a platform we created to build a community of vendors that support one another. We are pooling our collective experiences, knowledge and insight to grow together. Our goal is for Miami to be known for its vibrate small vendor community.</p>
                        <p>This is also a platform designed to bring the local vendor community to the people looking to support small businesses. Individually, it can be hard to grow an audience, but if we unite our influences we can reach more people, and make it easier for them to find us! If someone wants to support local, they can search our vendor directory and find you! </p>
                      </Card>

                      <Field name="igConsent">
                          {() => (
                          <>
                          <Text className={styles.formText} style={{marginTop:"20px"}}>I am willing to share/disseminate Pana Mia Club media/content and accept the collab invite on IG when my profile is published</Text>
                              <input
                              value={"true"}
                              onChange={(e:any) => setIgConsent(true)}
                             type="radio" name="igConsent"
                              /><label htmlFor="igConsent"></label>
                          </>
                          )}
                      </Field>

                      <Field name="marketConsent">
                          {() => (
                          <>
                          <Text className={styles.formText} style={{marginTop:"20px"}}>I am willing to contribute my experiences at local markets in order to grow collective info on markets (initial)</Text>
                              <input
                              value={"true"}
                              onChange={(e:any) => setMarketConsent(true)}
                             type="radio" name="marketConsent"
                              /><label htmlFor="marketConsent"></label>
                          </>
                          )}
                      </Field>

                      <Field name="collabConsent">
                          {() => (
                          <>
                          <Text className={styles.formText} style={{marginTop:"20px"}}>I am willing to collaborate with Pana Mia Club to create content to be shared by me and the club, (i.e. reels, work in progress, new releases) (initial)</Text>
                              <input
                              value={"true"}
                              onChange={(e:any) => setCollabConsent(true)}
                             type="radio" name="collabConsent"
                              /><label htmlFor="collabConsent"></label>
                          </>
                          )}
                      </Field>

                      <Field name="referrals">
                          {() => (
                          <>
                           <Text className={styles.formText} style={{marginTop:"20px"}}>*Optional* Do you know of anyone else who could benefit from becoming a Pana? Drop their socials/contact below and we’ll reach out!</Text>
                              <Input
                              value={referrals}
                              onChange={(e:any) => setReferrals(e.target.value)}
                              placeholder={""}
                              />
                          </>
                          )}
                      </Field>

                      <Button type="submit" style={{margin:"2% 40%",backgroundColor:"#EE5967"}}>Submit<FiEdit2 style={{marginLeft:"5px"}}/></Button>
                      </Box>
                  </Form>
                    )}
                </Formik>
                 {alert && <Alert color={"red"} style={{marginTop:"5%"}}>{alert}</Alert>}
                 {success && <Alert color={"green"} style={{marginTop:"5%"}}>{success}</Alert>}
                </Grid.Col>
                <Grid.Col span={3} md={3} xs={0}></Grid.Col>
            </Grid>
          </motion.div>
        </div>
        
  </div>
  )
}

export default ApparelIntake
