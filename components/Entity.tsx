import styles from './Entity.module.css';

interface EntityProps {
    text: string,
}

export default function Entity(props: EntityProps) {
    return (
        <span className={styles.entity}>{props.text}</span>
    );

}