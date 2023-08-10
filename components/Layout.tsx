import React, { Component } from 'react';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image'
import styles from '../styles/Home.module.css'
import Head from 'next/head';
import Link from 'next/link';
type LayoutProps = {
    children: React.ReactNode,
  };

  import { IconBrandTwitter, IconBrandYoutube, IconBrandInstagram, IconBrandDiscord } from '@tabler/icons';
  import {
    ActionIcon,
    createStyles,
    Menu,
    Center,
    Header,
    Container,
    Group,
    Button,
    Burger,Grid
  } from '@mantine/core';
  import { useDisclosure } from '@mantine/hooks';
  import { IconChevronDown } from '@tabler/icons';
  import { MantineLogo } from '@mantine/ds';
  import {useSession ,signIn, signOut} from 'next-auth/react';

  const HEADER_HEIGHT = 60;
  
  const useStyles = createStyles((theme) => ({
    footer: {
      marginTop: 0,
      backgroundColor: "white",
      borderTop: `1px solid ${
        theme.colorScheme === 'light' ? theme.colors.gray[5] : theme.colors.gray[2]
      }`,
    },
  
    footerinner: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: theme.spacing.lg,
      paddingBottom: theme.spacing.xl,
  
      [theme.fn.smallerThan('xs')]: {
        flexDirection: 'column',
      },
    },

    inner: {
      height: HEADER_HEIGHT,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: "white"
    },
  
    links: {
      [theme.fn.smallerThan('sm')]: {
        display: 'none',
      },
    },
  
    burger: {
      [theme.fn.largerThan('sm')]: {
        display: 'none',
      },
    },
  
    link: {
      display: 'block',
      lineHeight: 1,
      padding: '8px 12px',
      borderRadius: theme.radius.sm,
      textDecoration: 'none',
      color: theme.colorScheme === 'light' ? theme.colors.dark[0] : theme.colors.gray[7],
      fontSize: theme.fontSizes.sm,
      fontWeight: 500,
  
      '&:hover': {
        backgroundColor: theme.colorScheme === 'light' ? theme.colors.gray[0] : theme.colors.gray[0],
      },
    },
  
    linkLabel: {
      marginRight: 5,
    },
    footerlinks: {
      [theme.fn.smallerThan('xs')]: {
        marginTop: theme.spacing.md,
      },
    },
  }));
  
  interface HeaderActionProps {
    links: { link: string; label: string; links: { link: string; label: string }[] }[];
  }

export default function Layout({ children }: LayoutProps) {
  const {data:session, status} = useSession();
    const { classes } = useStyles();
  const [opened, { toggle }] = useDisclosure(false);

  const [links, setLinks] = useState([{ link: "/about-us", label: "About", links:null}, {link:"/links", label:"Links", links:null}, {link:"http://panamia.club/#footer", label:"Contact Us", links:null} , {link:"/directorio", label:"El Directorio", links: null}]);//{link:"/giftguide", label:"Gift Guide", links:null}

  const items = links.map((link) => {
    return (
      <a
        key={link.label}
        href={link.link}
        className={classes.link}
        onClick={(event) => {}}
      >
        {link.label}
      </a>
    );
  });

  useEffect(() => {
    (function loop() {
      setTimeout(() => {
        if(session){
          setLinks([{ link: "/about-us", label: "About", links:null} , {link:"/links", label:"Links", links:null},  {link:"http://panamia.club/#footer", label:"Contact Us", links:null}, {link:"/directorio", label:"El Directorio", links: null}, {link:"/profile", label:"Profile", links: null}]);
        }else if(!session){
          setLinks([{ link: "/about-us", label: "About", links:null} , {link:"/links", label:"Links", links:null},  {link:"http://panamia.club/#footer", label:"Contact Us", links:null}, {link:"/directorio", label:"El Directorio", links: null}]);
        }
        loop();
      }, 20000);
    })();
  
}, [links, session]);

  const handleSignOut = () => signOut({redirect: true, callbackUrl: '/'});

    return (
        <div>
            <Head>
                <title>Panamia</title>
                <meta name="description" content="Your favorite directory for local creatives." />
                <meta property="og:url" content="https://www.panamia.club/" />
                <meta property="og:image" content="https://www.panamia.club/_next/image/?url=%2Flogo.png&w=96&q=75" />
                <link rel="icon" href="/favicon.ico" />
                <link rel="preconnect" href="https://fonts.googleapis.com"/>
                <link rel="preconnect" href="https://fonts.gstatic.com"/>
                <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@100;400;700&display=swap" rel="stylesheet"/>
         
            <script type="text/javascript" id="hs-script-loader" async defer src="//js-na1.hs-scripts.com/23472319.js"></script>
            </Head>

             <Header height={HEADER_HEIGHT} sx={{ borderBottom: 0 }} mb={120} style={{marginBottom:"0"}}>
                <Container className={classes.inner} fluid>
                    <Group>
                      <Burger opened={opened} onClick={toggle} className={classes.burger} size="sm" />
                      <div hidden={!opened} style={{backgroundColor:"white", boxShadow: " rgba(0, 0, 0, 0.35) 0px 5px 15px", marginTop:"50%"}}>
                       {items}
                      </div>

                      <Link href="/">
                        <span className={styles.logo}>
                          <Image src="/logo_new_3.png" alt="panamia logo" width={40} height={45}/>   
                        </span>
                      </Link>
                
                    </Group>
                    <Group spacing={5} className={classes.links}>
                    {items}
                    </Group>
                    {session && session.user &&
                    <Group>
                      <p style={{color:"#495057", fontFamily:"Helvetica Neue", marginRight: "0px"}}>Hi, {session.user.email}</p>
                      <Button radius="xl" style={{backgroundColor: "#F52B92"}} sx={{ height: 30 }} onClick={handleSignOut}>
                        Log Out
                     </Button>
                    </Group>
                    }
                     {!session && 
                      <Button radius="xl" sx={{ height: 30 }} style={{backgroundColor:"#4ab3ea"}}>
                        <Link href="/signin">Sign In</Link>
                      </Button>
                    }
                </Container>
            </Header>
            <div>{children}</div>
           
            <div className={classes.footer} id="footer">
              <Container className={classes.footerinner}>
              <Link href="/">
                      <span className={styles.logo}>
                        <Image src="/logo_new_3.png" alt="panamia logo" width={80} height={80}/>   
                          </span>
                      </Link>
                  <Group spacing={0} className={classes.links} position="right" noWrap>
                    <Link target="_blank" href="https://instagram.com/panamiaclub">
                      <ActionIcon size="lg">
                        <IconBrandInstagram size={20} stroke={1.5} />
                      </ActionIcon>
                    </Link>
                    <Link target="_blank" href="https://discord.gg/SnNV48XGu3">
                    <ActionIcon size="lg">
                        <IconBrandDiscord size={20} stroke={1.5} />
                      </ActionIcon>
                    </Link>
                </Group>
              </Container>
            </div>

        </div>  
    );
  }