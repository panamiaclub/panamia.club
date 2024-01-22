import Link from 'next/link';
import styles from './Spinner.module.css';

export default function Spinner() {
    return (
        <div className={styles.spinnerBox} title="Loading...">
            <div className={styles.spinner}></div>
        </div>
    );
}