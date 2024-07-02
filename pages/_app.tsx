import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import Layout from '@/components/Layout';
import { SessionProvider } from "next-auth/react";
import {Session} from "next-auth";
import { useState } from 'react';
import ReactGA from "react-ga4";

ReactGA.initialize("G-H9HZTY30DN"); // G-H9HZTY30DN

import {
  QueryClient,
  QueryClientProvider,
  HydrationBoundary,
  DehydratedState
} from '@tanstack/react-query'

function MyApp({ Component, pageProps }: AppProps<{
  session: Session,
  dehydratedState: DehydratedState
}> ) {
  const [queryClient] = useState(() => new QueryClient());

  return(
    
    <SessionProvider session={pageProps.session}>
      <QueryClientProvider client={queryClient}>
        <HydrationBoundary  state={pageProps.dehydratedState}>
          <Layout>
            <Component {...pageProps} />
          </Layout>
        </HydrationBoundary>
      </QueryClientProvider>
    </SessionProvider>
  );
}

export default MyApp
