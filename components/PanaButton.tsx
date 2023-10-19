import styles from './PanaButton.module.css';

interface PanaButtonProps {
    text: string,
    color?: string,
}

export default function PanaButton(props: PanaButtonProps) {
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
    return (
        <button className={button_class}>{props.text}</button>
    );
}