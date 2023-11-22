import Link from 'next/link';
import styles from './Required.module.css';

interface RequiredProps {
    notice?: Boolean
}


export default function Required(props: RequiredProps) {
    let desc = (<>&lowast;&nbsp;<small>required</small></>)
    if (props.notice) {
        desc = (<>&lowast; indicates a required field</>)
    }

    return (
        <span className={styles.required}>{desc}</span>
    );
}