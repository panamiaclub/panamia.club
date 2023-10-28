import Link from 'next/link';
import styles from './PanaButton.module.css';

interface PanaButtonProps {
    text: string,
    color?: string,
    onClick?: Function,
    href?: string
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
    if (props.href) {
        return (
            <Link href={props.href}><button className={button_class} onClick={handleClick}>{props.text}</button></Link>
        );
    }
    return (
        <button className={button_class} onClick={handleClick}>{props.text}</button>
    );

}