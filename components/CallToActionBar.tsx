import styles from './CallToActionBar.module.css';
import SignupModal from './SignupModal';

export default function CallToActionBar() {
    return (
        <div className={styles.callToAction}>
            <span className="hidden-sm">Stay updated on PanaMia! &nbsp;</span>
            <SignupModal />
        </div>
    );
}