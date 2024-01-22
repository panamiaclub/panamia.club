import styles from './FullPage.module.css';

interface FullPageProps {
    children: React.ReactNode,
}

export default function FullPage({children}: FullPageProps) {
    return (
        <section className={styles.fullPage}>
            {children}
        </section>
    );

}