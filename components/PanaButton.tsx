import Link from 'next/link';
import styles from './PanaButton.module.css';

interface PanaButtonProps {
    children?: React.ReactNode,
    text?: string,
    color?: string,
    onClick?: Function,
    href?: string,
    disabled?: Boolean,
    submit?: Boolean,
}

export default function PanaButton(props: PanaButtonProps) {
    function handleClick() {
        if (props.onClick) {
            props.onClick()
        }
    }
    let button_class = styles.panaButton;
    if (props.color === "blue") {
        button_class = styles.panaButtonBlue;
    }
    if (props.color === "pink") {
        button_class = styles.panaButtonPink;
    }
    if (props.color === "yellow") {
        button_class = styles.panaButtonYellow;
    }
    if (props.color === "admin") {
        button_class = styles.panaButtonAdmin;
    }
    if (props.href) {
        return (
            <Link href={props.href}>
                <button 
                    className={button_class} 
                    disabled={props.disabled ? true : false}
                    onClick={handleClick}>
                    {props.text}{props.children}
                </button>
            </Link>
        );
    }
    return (
        <button 
            className={button_class} 
            type={props.submit ? "submit" : "button"}
            disabled={props.disabled ? true : false}
            onClick={handleClick}>
            {props.text}{props.children}
        </button>
    );

}