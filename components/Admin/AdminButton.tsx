import Link from 'next/link';
import styles from './AdminButton.module.css';

interface AdminButtonProps {
    children: React.ReactNode,
    onClick?: Function,
    submit?: Boolean,
    href?: string,
    disabled?: Boolean,
}

export default function AdminButton({children, onClick, submit, href, disabled}: AdminButtonProps) {
    function handleClick() {
        if (onClick) {
            onClick()
        }
    }
    if (href) {
        return (
            <Link href={href}>
                <button 
                    className={styles.adminButton} 
                    disabled={disabled ? true : false}
                    onClick={handleClick}>
                    {children}
                </button>
            </Link>
        );
    }
    return (
        <button 
            className={styles.adminButton} 
            type={submit ? "submit" : "button"}
            disabled={disabled ? true : false}
            onClick={handleClick}>
            {children}
        </button>
    );

}