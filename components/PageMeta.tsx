import Head from "next/head";

interface PageMetaProps {
    title: string,
    desc: string | null,
    url?: string | null,
    image?: string | null,
}

export default function PageMeta(props: PageMetaProps) {

    let meta_desc = (<></>)
    if (props.desc) {
        meta_desc = (<meta name="description" content={props.desc} />)
    }

    let meta_url = (<></>)
    if (props.url) {
        meta_url = (<meta property="og:url" content={props.url} />)
    }

    let meta_image = (<meta property="og:image" content="https://www.panamia.club/_next/image/?url=%2Flogo.png&w=96&q=75" />)
    if (props.image) {
        meta_image = (<meta property="og:image" content={props.image} />)
    }

    return (
        <>
        <Head>
            <title key="title">{props.title} | Pana Mia Club</title>
            {meta_desc}
            {meta_url}
            {meta_image}
        </Head>
        <h1 className="sr-only">{props.title}</h1>
        </>
    );
}