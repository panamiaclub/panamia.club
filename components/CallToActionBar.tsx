import styles from './CallToActionBar.module.css';
import NewsletterModal from './NewsletterModal';

export default function CallToActionBar() {
    return (
        <div className={styles.callToAction}>
            <span>Stay updated on PanaMia!</span>
            <NewsletterModal />
        </div>
    );
}