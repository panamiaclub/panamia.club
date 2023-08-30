import styles from './PanaLogo.module.css';
import classNames from 'classnames';

interface LogoProps {
    color: string | "white",
    bordered: string | null,
    size: string | null,
}

const defaultProps: LogoProps = {
    color: "white",
    bordered: null,
    size: null,
}

export default function PanaLogo(props: LogoProps) {

    const logo_alt = "Pana Mia Club logo"
    let logo_src = "/2023_logo_white.svg"
    let container_classes = styles.logoContainer;

    if (props.color === "pink") {
        logo_src = "/2023_logo_pink.svg"
    }

    let color_class = null
    if (props.bordered === "pink") {
        color_class = styles.borderedPink
    }
    if (props.bordered === "blue") {
        color_class = styles.borderedBlue
    }
    
    let size_class = null
    if (props.size === "medium") {
        size_class = styles.medium
    }
    if (props.size === "large") {
        size_class = styles.large
    }
    container_classes = classNames(container_classes, color_class, size_class)
    
    return (
        <span className={container_classes}>
            <img className={styles.logo} src={logo_src} alt={logo_alt} />   
        </span>
    );
}

PanaLogo.defaultProps = defaultProps;