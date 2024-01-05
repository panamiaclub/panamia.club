import Link from 'next/link';
import styles from './PanaButton.module.css';
import classnames from 'classnames';

interface PanaButtonProps extends React.HTMLProps<HTMLButtonElement> {
    children?: React.ReactNode,
    text?: string,
    color?: 'blue' | 'pink' | 'yellow' | 'navy' | 'gray' | 'dark' | 'light',
    hoverColor?: 'blue' | 'pink' | 'yellow' | 'navy' | 'gray',
    href?: string,
    type?: 'button' | 'submit' | 'reset',
    disabled?: boolean,
    compact?: boolean,
    group?: "left" | "middle" | "right",
}
interface CustomCSSProperties extends React.CSSProperties {
    '--main-color'?: string,
    '--hover-color'?: string,
    '--button-padding'?: string,
}

export default function PanaButton(props: PanaButtonProps)  {

    function handleClick(e: any) {
        if (props.onClick) {
            props.onClick(e);
        }
    }

    const buttonColors: CustomCSSProperties = {
        '--main-color': props.color ? `var(--button-color-${props.color})` : "var(--button-color-dark)",
        '--hover-color': props.hoverColor ? `var(--button-color-${props.hoverColor})` : "var(--button-color-dark)",
        '--button-padding': props.compact ? "var(--padding-compact)" : "var(--padding-standard)",
    };

    let button_class = styles.panaButton;
    if (props?.group) {
        if (props.group == "left") {
            button_class = classnames(styles.panaButton, styles.groupLeft);
        }
        if (props.group == "middle") {
            button_class = classnames(styles.panaButton, styles.groupMiddle);
        }
        if (props.group == "right") {
            button_class = classnames(styles.panaButton, styles.groupRight);
        }
    }
    if (props.href) {
        return (
            <Link href={props.href}>
                <button 
                    className={button_class}
                    style={buttonColors} 
                    disabled={props.disabled ? true : false}
                    onClick={(e:any) => handleClick(e)}>
                    {props.text}{props.children}
                </button>
            </Link>
        );
    }
    return (
        <button 
            className={button_class} 
            style={buttonColors} 
            type={props.type ? props.type : "button"}
            disabled={props.disabled ? true : false}
            onClick={handleClick}>
            {props.text}{props.children}
        </button>
    )
}