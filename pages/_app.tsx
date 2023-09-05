import '../styles/globals.css'
import type { AppProps } from 'next/app'
import Layout from '../components/Layout';
import { SessionProvider } from "next-auth/react";
import {Session} from "next-auth";
import { MantineProvider } from '@mantine/core';

function MyApp({ Component, pageProps }: AppProps<{
  session: Session;
}> ) {
  return(
    <SessionProvider session={pageProps.session}>
        <Layout>
          <Component {...pageProps} />
        </Layout>
    </SessionProvider>
  );
}

export default MyApp
