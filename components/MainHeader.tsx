import { useState } from 'react';
import {useSession ,signOut} from 'next-auth/react';
import Link from 'next/link';
import classNames from 'classnames';

import styles from './MainHeader.module.css';
import CallToActionBar from './CallToActionBar';
import PanaLogo from './PanaLogo';

// https://www.a11ymatters.com/pattern/mobile-nav/

const menu_items = [
    {id:"about", link: "/about-us", label: "About"},
    {id:"links", link: "/links", label: "Links"},
    {id:"directorio", link: "/directorio", label: "El Directorio"},
    {id:"contact", link: "/#footer", label: "Contact Us"},
    {id:"donations", link: "/donations", label: "Donate"},
];

interface MenuItemProps {
    id: string,
    label: string,
    url: string,
}

export default function MainHeader() {
    const {data:session, status} = useSession();
    const handleSignOut = () => signOut({redirect: true, callbackUrl: '/'});
    const [menu_active, setMenuActive] = useState(false);
    const activeClasses = classNames(styles.navList,styles.navListActive)

    function onBurgerClick() {
        const burger = (document.getElementById('mainheader-toggle') as Element);
        const burger_icon = (burger.querySelector('span.burger-icon') as Element);
        const menu = (document.getElementById('mainheader-menu') as Element);

        if (menu_active === true) {
            setMenuActive(false);
            burger_icon.classList.remove('close');
            menu.setAttribute('aria-expanded', 'false');
        } else {
            setMenuActive(true);
            burger_icon.classList.add('close');
            menu.setAttribute('aria-expanded', 'true');
        }
        return true
    }

    function onMenuClick() {
        const burger = (document.getElementById('mainheader-toggle') as Element);
        const burger_icon = (burger.querySelector('span.burger-icon') as Element);
        const menu = (document.getElementById('mainheader-menu') as Element);

        setMenuActive(false);
        burger_icon.classList.remove('close');
        menu.setAttribute('aria-expanded', 'false');
        return true
    }

    function MenuItem(props: MenuItemProps): JSX.Element {
        return (
            <li className={styles.listItem}><Link href={props.url}><a onClick={onMenuClick}>{props.label}</a></Link></li>
        );
    }
    
    const menu_elements = menu_items.map((item) => {
        return (
            <MenuItem key={item.id} id={item.id} label={item.label} url={item.link} />
        );
    })

    return (
        <header className={styles.header}>
            <nav role="navigation" className={styles.nav}>
                <PanaLogo color="pink" />
                <button onClick={onBurgerClick} className={styles.burger} id="mainheader-toggle" aria-expanded="false" aria-controls="menu">
                    <span className="burger-icon"></span>
                    <span className="sr-only">Open Menu</span>
                </button>
                <ul id="mainheader-menu" className={menu_active ? activeClasses : styles.navList}>
                    {menu_elements}
                </ul>
                {session && session.user &&
                <div>
                    <p style={{color:"#495057", fontFamily:"Helvetica Neue", marginRight: "0px"}}>Hi, {session.user.email}</p>
                    <button className={styles.sessionButton} onClick={handleSignOut}>Log Out</button>
                </div>
                }
                {!session && 
                    <div className={styles.sessionButton}>
                        <Link  href="/signin">Sign In</Link>
                    </div>
                }
            </nav>
            <div id="call-to-action-bar">
                <CallToActionBar />
            </div>
            
        </header>
    );
}