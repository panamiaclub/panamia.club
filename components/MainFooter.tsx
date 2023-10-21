import { IconBrandInstagram, IconBrandDiscord, IconBrandYoutube } from "@tabler/icons";
import Link from "next/link";

import PanaLogo from "./PanaLogo";
import styles from './MainFooter.module.css';


export default function GlobalFooter() {
    return (
        <footer className={styles.footer} id="footer">
            <div className={styles.footerInner}>
                <PanaLogo color="pink" size="medium" />
                <ul className={styles.footerLinks}>
                    <li><strong>PanaMia</strong></li>
                    <li><Link href="/podcasts">PanaVizión</Link></li>
                    <li><Link href="/about-us">About</Link></li>
                    <li><Link href="/links">Links</Link></li>
                    <li><Link href="/directorio">Directorio</Link></li>
                </ul>
                <ul className={styles.footerLinksAlt}>
                    <li><strong>Users</strong></li>
                    <li><Link href="/signin">Sign In</Link></li>
                    <li><Link href="/signin">Register</Link></li>
                    <li><Link href="/become-a-pana">Become A Pana</Link></li>
                </ul>
                <div className={styles.socials}>
                    <ul>
                        <li>
                            <a href="https://instagram.com/panamiaclub">
                                <IconBrandInstagram size={32} stroke={1.5} />
                                <span className="sr-only">Instagram</span>
                            </a>
                        </li>
                        <li>
                            <a href="https://www.youtube.com/@panavizion305">
                                <IconBrandYoutube size={32} stroke={1.5} />
                                <span className="sr-only">Youtube</span>
                            </a>
                        </li>
                        <li>
                            <a href="https://discord.gg/SnNV48XGu3">
                                <IconBrandDiscord size={32} stroke={1.5} />
                                <span className="sr-only">Discord</span>
                            </a>
                        </li>
                    </ul>
                </div>
            </div>
        </footer>
    );
}