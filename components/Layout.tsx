import React, { Component } from 'react';

import Image from 'next/image'
import styles from '../styles/Home.module.css'
import Head from 'next/head';
import Link from 'next/link';
type LayoutProps = {
    children: React.ReactNode,
  };

  import { IconBrandTwitter, IconBrandYoutube, IconBrandInstagram } from '@tabler/icons';
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
  
  const HEADER_HEIGHT = 60;
  
  const useStyles = createStyles((theme) => ({
    footer: {
      marginTop: 0,
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
      backgroundColor: "#ffffff"
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
        backgroundColor: theme.colorScheme === 'light' ? theme.colors.dark[6] : theme.colors.gray[0],
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

  const links = [{ link: "#About", label: "About", links:null}, {link:"#footer", label:"Contact Us", links:null}];

export default function Layout({ children }: LayoutProps) {

    const { classes } = useStyles();
  const [opened, { toggle }] = useDisclosure(false);
  const items = links.map((link) => {
    
    // const menuItems = link.links?.map((item) => (
    //   <Menu.Item key={item.link}>{item.label}</Menu.Item>
    // )
    
    // );

    // if (menuItems) {
    //   return (
    //     <Menu key={link.label} trigger="hover" exitTransitionDuration={0}>
    //       <Menu.Target>
    //         <Link
    //           href={link.link}
    //           className={classes.link}
    //           onClick={(event) => {}}
    //         >
    //           <Center>
    //             <span className={classes.linkLabel}>{link.label}</span>
    //             <IconChevronDown size={12} stroke={1.5} />
    //           </Center>
    //         </Link>
    //       </Menu.Target>
    //       <Menu.Dropdown>{menuItems}</Menu.Dropdown>
    //     </Menu>
    //   );
    // }

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


    return (
        <div>
            <Head>
                <title>Panamia</title>
                <meta name="description" content="Your favorite directory for local creatives." />
                <link rel="icon" href="/favicon.ico" />
            </Head>

             <Header height={HEADER_HEIGHT} sx={{ borderBottom: 0 }} mb={120} style={{marginBottom:"0"}}>
                <Container className={classes.inner} fluid>
                    <Group>
                    <Burger opened={opened} onClick={toggle} className={classes.burger} size="sm" />
                   
                      <Link href="/">
                      <span className={styles.logo}>
                        <Image src="/logo.png" alt="panamia logo" width={40} height={35}/>   
                          </span>
                      </Link>
                
                    </Group>
                    <Group spacing={5} className={classes.links}>
                    {items}
                    </Group>
                    <Button radius="xl" sx={{ height: 30 }} style={{backgroundColor:"#4ab3ea"}}>
                        Sign Up
                    </Button>
                </Container>
            </Header>
            <div>{children}</div>
           
            <div className={classes.footer} id="footer">
              <Container className={classes.footerinner}>
              <Link href="/">
                      <span className={styles.logo}>
                        <Image src="/logo.png" alt="panamia logo" width={80} height={70}/>   
                          </span>
                      </Link>
                  <Group spacing={0} className={classes.links} position="right" noWrap>
                    <Link target="_blank" href="https://instagram.com/panamiaclub">
                      <ActionIcon size="lg">
                        <IconBrandInstagram size={18} stroke={1.5} />
                      </ActionIcon>
                    </Link>
                </Group>
              </Container>
            </div>

        </div>  
    );
  }