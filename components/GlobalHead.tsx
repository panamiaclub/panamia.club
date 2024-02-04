import Head from "next/head";

export default function GlobalHead() {
    return (
        <Head>
            <link rel="icon" href="/favicon.png" type="image/svg+xml" />
            <link rel="preconnect" href="https://fonts.googleapis.com"/>
            <link rel="preconnect" href="https://fonts.gstatic.com"/>
            <link href="https://fonts.googleapis.com/css2?family=Nunito&family=Rubik:wght@500&display=swap" rel="stylesheet"></link>
        </Head>
    );
}