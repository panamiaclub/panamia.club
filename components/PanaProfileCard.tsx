import Link from 'next/link';
import styles from './PanaProfileCard.module.css';
import classNames from 'classnames';

interface ProfileCardProps {
    name: string,
    url: string,
    image: string,
}

export default function PanaProfileCard({ name, url, image}: ProfileCardProps) {

    return (
        <div className={styles.profileCardBlock}>
            <Link href={url}>
                <a className={styles.imageLink}>
                    <img className={styles.image} src={image} alt={name} />  
                </a>
            </Link>
            <Link href={url}>
                <a className={styles.name}>{name}</a>
            </Link>
        </div>
    );
    
}