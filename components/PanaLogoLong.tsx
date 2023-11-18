import Link from 'next/link';
import styles from './PanaLogoLong.module.css';
import classNames from 'classnames';

interface LogoProps {
    color: string | "white",
    size: string | null,
    nolink?: boolean
}

const defaultProps: LogoProps = {
    color: "white",
    size: null,
}

export default function PanaLogoLong(props: LogoProps) {

    const logo_alt = "Pana Mia Club logo"
    let logo_src = "/logos/pana_logo_long_white.png"
    let container_classes = styles.logoContainer;

    if (props.color === "pink") {
        logo_src = "/logos/pana_logo_long_pink.png"
    }
    if (props.color === "blue") {
        logo_src = "/logos/pana_logo_long_blue.png"
    }
    if (props.color === "yellow") {
        logo_src = "/logos/pana_logo_long_yellow.png"
    }
    
    let size_class = null
    if (props.size === "medium") {
        size_class = styles.medium
    }
    if (props.size === "large") {
        size_class = styles.large
    }
    container_classes = classNames(container_classes, size_class)
    
    if (props.nolink === true) {
        container_classes = classNames(container_classes, size_class)
        return (
            <div>
                <span className={container_classes}>
                    <img className={styles.logo} src={logo_src} alt={logo_alt} />   
                </span>
            </div>
        );
    } else {
        container_classes = classNames(container_classes, size_class, styles.logoLink)
        
        return (
            <div>
                <Link href="/">
                    <span className={container_classes}>
                        <img className={styles.logo} src={logo_src} alt={logo_alt} />   
                    </span>
                </Link>
            </div>
        );
    }
    
}

PanaLogoLong.defaultProps = defaultProps;