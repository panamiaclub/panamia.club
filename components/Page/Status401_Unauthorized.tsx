import Link from 'next/link';

import PageMeta from '../PageMeta';
import styles from './Status401_Unauthorized.module.css';


export default function Status401_Unauthorized() {
    return (
        <main className={styles.app}>
            <PageMeta title="Unauthorized" desc="401 Unauthorized" />
            <div className={styles.main}>
                <h2 className={styles.accountTitle}>UNAUTHORIZED</h2>
                <h3 className={styles.accountTitle}>You must be logged in to view this page.</h3>
            </div>
        </main>
    );
}