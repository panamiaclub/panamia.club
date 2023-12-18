import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import classNames from 'classnames';
import { IconHome, IconUser, IconLogout, IconAlien, IconSettings } from '@tabler/icons';
import axios from 'axios';

import styles from './MainHeader.module.css';
import CallToActionBar from './CallToActionBar';
import { getUserSession } from '../lib/user';
import PanaLogo from './PanaLogo';
import PanaButton from './PanaButton';

// https://www.a11ymatters.com/pattern/mobile-nav/

const menu_items = [
    {id:"home", link: "/", label: "Home", icon: "" },
    {id:"about", link: "/about-us", label: "About"},
    {id:"links", link: "/links", label: "Links"},
    {id:"search", link: "/directory/search", label: "Search"},
    {id:"donations", link: "/donate", label: "Donate", special: false},
];

// {id:"event", link: "https://shotgun.live/events/serotonin-dipity-mini-fest", label: "EVENT!", special: true},

interface MenuItemProps {
    id: string,
    label: string,
    url: string,
    icon?: string
    special?: boolean
}

interface IconProps {
    reference?: string
}

export default function MainHeader() {
    console.log("MainHeader");
    const { data: session, status } = useSession();
    const handleSignOut = () => signOut({ redirect: true, callbackUrl: '/' });
    const [menu_active, setMenuActive] = useState(false);
    const activeClasses = classNames(styles.navList, styles.navListActive);
    const [isAdmin, setIsAdmin] = useState(false);

    interface NavStyle {
        padding?: string;
      }
      
    interface LogoStyle {
        size?: string;
    }
    const [scrollPosition, setScrollPosition] = useState(0);
    const [navStyle, setNavStyle] = useState<NavStyle>({});
    const [logoStyle, setLogoStyle] = useState<LogoStyle>({});

    /*
    We're setting this value but not using it. This script is causing the header
    element to re-render on every scroll. If we need this we could maybe look
    a non use-effect solution.
    useEffect(() => {
        const handleScroll = () => {
            const newScrollPosition = window.scrollY;
            setScrollPosition(newScrollPosition);
        };
    
        window.addEventListener('scroll', handleScroll);
    
        return () => {
          window.removeEventListener('scroll', handleScroll);
        };
      }, [scrollPosition]);
      */

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

    async function onUserClick(e: React.MouseEvent) {
        e.stopPropagation();
        const userSessionData = await getUserSession("http://localhost:3000");
        // console.log("userSession", userSession);
        if (userSessionData?.status?.role == "admin") {
            setIsAdmin(true);
        }
        const dialogUser = document.getElementById('dialog-user-mainheader') as HTMLDialogElement;
        if (dialogUser.open) {
            dialogUser.close()
        } else {
            dialogUser.show();
        }
    }

    async function onUserDialogClick(e: React.MouseEvent) {
        e.stopPropagation();
    }

    function Icon(props: IconProps): JSX.Element {
        if (props.reference == "home") {
            return (
                <IconHome height="20" width="20" />
            )
        }
        return (
            <></>
        )
    }

    function MenuItem(props: MenuItemProps): JSX.Element {
        return (
            <li className={styles.listItem}>
                <Link href={props.url}>
                    <a onClick={onMenuClick} className={(props?.special == true) ? styles.linkSpecial : ""}><Icon reference={props.icon} />{props.label}</a>
                </Link>
            </li>
        );
    }

    const menu_elements = menu_items.map((item) => {
        return (
            <MenuItem key={item.id} id={item.id} label={item.label} url={item.link} special={item.special} icon={item.icon} />
        );
    })

    return (
        <header className={styles.header}>
            <div id="call-to-action-bar">
                <CallToActionBar />
            </div>
            <div className={styles.navWrap}>
                <nav role="navigation" className={styles.nav} style={navStyle}>
                    <div className={styles.navLogo}>
                        <Link href="/"><img src="/logos/pana_logo_long_pink.png" /></Link>
                    </div>
                    <button onClick={onBurgerClick} className={styles.burger} id="mainheader-toggle" aria-expanded="false" aria-controls="menu">
                        <span className="burger-icon"></span>
                        <span className="sr-only">Open Menu</span>
                    </button>
                    <ul id="mainheader-menu" className={menu_active ? activeClasses : styles.navList}>
                        {menu_elements}
                    </ul>
                    {session && session.user &&
                        <div className={styles.sessionButton}>
                            <button onClick={onUserClick}><IconUser /></button>
                        </div>
                    }
                    {!session &&
                        <div className={styles.sessionButton}>
                            <PanaButton
                        text="Sign In"
                        color="blue"
                        hoverColor='blue'
                        href="/api/auth/signin" />
                        </div>
                    }
                </nav>
                <div className={styles.navBorder}></div>
                <dialog id="dialog-user-mainheader" className={styles.userModal} onClick={onUserDialogClick}>
                    {session && session.user &&
                        <div>
                            <span className={styles.userModalUser}>{session.user.email}</span>
                            <hr />
                            <ul>
                                { isAdmin &&
                                <li className={styles.adminLink}><Link href="/account/admin"><a><IconAlien height="16" width="16" />&nbsp;ADMIN</a></Link></li>
                                }
                                <li><Link href="/account/user"><a><IconSettings height="16" width="16" />&nbsp;Account</a></Link></li>
                                <li><Link href="/api/auth/signout"><a><IconLogout height="16" width="16" />&nbsp;Sign Out</a></Link></li>
                            </ul>
                        </div>
                    }
                </dialog>
            </div>

        </header>
    );
}