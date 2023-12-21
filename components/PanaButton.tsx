import Link from 'next/link';
import styles from './PanaButton.module.css';

interface PanaButtonProps {
    children?: React.ReactNode,
    
    text?: string;
    color?: 'blue' | 'pink' | 'yellow' | 'navy' | 'gray' | 'light';
    hoverColor?: 'blue' | 'pink' | 'yellow' | 'navy' | 'gray';
    onClick?: Function;
    href?: string;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
}
interface CustomCSSProperties extends React.CSSProperties {
    '--main-color'?: string;
    '--hover-color'?: string;
}

export default function PanaButton(props: PanaButtonProps) {

    function handleClick() {
        if (props.onClick) {
            props.onClick()
        }
    }

    const buttonColors: CustomCSSProperties = {
        '--main-color': props.color ? `var(--color-pana-${props.color})` : "var(--color-pana-pink)",
        '--hover-color': props.hoverColor ? `var(--color-pana-${props.hoverColor})` : "var(--color-pana-navy)",
    };

    let button_class = styles.panaButton;
    if (props.href) {
        return (
            <Link href={props.href}>
                <button 
                    className={button_class}
                    style={buttonColors} 
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
            style={buttonColors} 
            type={props.type ? props.type : "button"}
            disabled={props.disabled ? true : false}
            onClick={handleClick}>
            {props.text}{props.children}
        </button>
    )
}