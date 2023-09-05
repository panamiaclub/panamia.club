import PanaLogo from "./PanaLogo";
import styles from './MainFooter.module.css';

import { IconBrandInstagram, IconBrandDiscord } from "@tabler/icons";

export default function GlobalFooter() {
    return (
        <footer className={styles.footer} id="footer">
            <div className={styles.footerInner}>
                <a href="/">
                    <PanaLogo color="pink" size="medium" />
                </a>
                <ul className={styles.footerLinks}>
                    <li><strong>PanaMia</strong></li>
                    <li><a href="/podcasts">Podcasts</a></li>
                    <li><a href="/about-us">About</a></li>
                    <li><a href="/links">Links</a></li>
                    <li><a href="/directorio">Directorio</a></li>
                </ul>
                <ul className={styles.footerLinksAlt}>
                    <li><strong>Users</strong></li>
                    <li><a href="/signin">Sign In</a></li>
                    <li><a href="/signin">Register</a></li>
                </ul>
                <div className={styles.socials}>
                    <ul>
                        <li>
                            <a target="_blank" href="https://instagram.com/panamiaclub">
                                <IconBrandInstagram size={32} stroke={1.5} />
                                <span className="sr-only">Instagram</span>
                            </a>
                        </li>
                        <li>
                            <a target="_blank" href="https://discord.gg/SnNV48XGu3">
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