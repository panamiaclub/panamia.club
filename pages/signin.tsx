import type { NextPage } from 'next'
import { useState, useEffect } from 'react';
import { useSession, signIn, getProviders } from "next-auth/react";
import Head from 'next/head'
import Image from 'next/image'
import { TextInput, NumberInput, StylesApiProvider } from '@mantine/core';
import { useForm } from '@mantine/form';
import styles from '../styles/Home.module.css'
import { IconAlertTriangle } from '@tabler/icons';
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
import { Field, Form, Formik } from "formik";
import axios from "axios";
import Router from "next/router";
import Link from "next/link";

import MainHeader from '../components/MainHeader';

const SignIn: NextPage = ({ providers }: any) => {
  const { data: session } = useSession();
  const [authType, setAuthType] = useState("Login");
  const oppAuthType: { [key: string]: string } = {
    Login: "Register",
    Register: "Login",
  };
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [alert, setAlert] = useState("");

  const redirectToProfile = () => {
    const { pathname } = Router;
    if (pathname === "/signin") {
      // TODO: redirect to a success register page
      Router.push("/profile");
    }
  };

  useEffect(() => {
   if(alert){
    console.log(alert);
   }
   if(username){
    console.log(username)
   }
   if(password){
    console.log(password)
   }
}, [email, username, password])

  const registerUser = async () => {
    if(username && email && password){
      const res = await axios
        .post(
          "/api/register",
          { username, email, password },
          {
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
          }
        )
        .then(async () => {
          await loginUser();
          redirectToProfile();
        })
        .catch((error) => {
          console.log(error);
          setAlert(error.response.data.error);
        });
      console.log(res);
    }
  };

  const loginUser = async () => {
    console.log(password);
    const res: any = await signIn("credentials", {
      redirect: false,
      email: email,
      password: password,
      headers: {  Accept: "application/json",
      "Content-Type": "application/json"},
    });
    if (res){
      res.error ? setAlert(res.error) : redirectToProfile();
      console.log(res);
    }
    
  };

  const formSubmit = (actions: any) => {
    actions.setSubmitting(false);

    authType === "Login" ? loginUser() : registerUser();
  };

  return (
    <div style={{padding:"12% 0"}} className={styles.App}>
      <MainHeader />
      <Grid>
        <Grid.Col md={4}></Grid.Col>
        <Grid.Col md={4}>
          <h2 className={styles.headings}>{authType}</h2>
          <Formik
            initialValues={{username:username, email:email, password:password}}
            validateOnChange={false}
            validateOnBlur={false}
            onSubmit={(_, actions) => {
              formSubmit(actions);
            }}
          >
            {(props) => (
              <Form style={{ width: "100%" }}>
                <Box mb={4}>
                  {authType === "Register" && (
                    <Field name="username">
                      {() => (
                        <>
                          <Text>Username:</Text>
                          <Input
                            value={username}
                            onChange={(e:any) => setUsername(e.target.value)}
                            placeholder="Username"
                          />
                          </>
                      )}
                    </Field>
                  )}
                  <Field name="email">
                    {() => (
                     <>
                        <Text>Email:</Text>
                        <Input
                          value={email}
                          onChange={(e:any) => setEmail(e.target.value)}
                          placeholder="Email Address"
                        />
                       </>
                    )}
                  </Field>
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
                  <Button
                    mt={6}
                    type="submit" style={{backgroundColor:"#4AB3EA"}}
                  >
                    {authType}
                  </Button>
                </Box>
              </Form>
            )}
          </Formik>
          <Text mb={6} className={styles.loginLinks} onClick={() => setAuthType(oppAuthType[authType])}>
            {authType === "Login"
              ? "Not registered yet? "
              : "Already have an account? "}
          </Text>

         {alert && <Alert color={"red"} style={{marginTop:"5%"}}>{alert}</Alert>}
          </Grid.Col>
          <Grid.Col md={4}></Grid.Col>
          
        </Grid>
      </div>
  );
};

export default SignIn;
