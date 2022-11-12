import type { NextPage } from 'next'
import Link from 'next/link'
import Head from 'next/head'
import Image from 'next/image'
import styles from '../styles/Home.module.css'
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faTwitter } from "@fortawesome/free-brands-svg-icons"
import {
  createStyles,
  Menu,
  Center,
  Header,
  Container,
  Group,
  Button,
  Burger,
  Navbar,
  NavLink,
  Grid
} from '@mantine/core';
const Home: NextPage = () => {
  return (
    <div className={styles.App} >
  
        <div className={styles.titleDiv}>
            <Image src="/logo.png" height={200} width={300}></Image>
            <h2 className={styles.headings}>Your favorite directory for local creatives.</h2>
        </div>
        <div className={styles.aboutContainer} id="About">
            <Grid>
                <Grid.Col span={1}></Grid.Col>
                <Grid.Col span={10}>
                <div className={styles.textSection}>
                    <h4 className={styles.paragraphs}>Being a small business owner may be really overwhelming and isolating at times, but you aren’t alone. Miami is filled with small vendors, all with different strengths and skillsets. We started Pana Mia as a way to bring everyone together, to pool our resources, insights and strategies. As consumers start recognizing the benefits of shopping local, we want to create a centralized space where they can explore and fall in love with local brands.</h4>
                </div>
                </Grid.Col>
                <Grid.Col span={1}></Grid.Col>
            </Grid>
            <Link href='https://instagram.com/panamiaclub' target="_blank" ><Button style={{backgroundColor:"#ff9a27", marginLeft:"45%", marginTop:"5%"}}>Follow Us</Button></Link>
        </div>
  </div>
  )
}

export default Home
