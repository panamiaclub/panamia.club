import styles from './CallToActionBar.module.css';
import SignupModal from './SignupModal';

export default function CallToActionBar() {
    return (
        <div className={styles.callToAction}>
            <span>Stay updated on PanaMia!</span>
            <SignupModal />
        </div>
    );
}