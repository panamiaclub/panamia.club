import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import Layout from '@/components/Layout';
import { SessionProvider } from "next-auth/react";
import {Session} from "next-auth";
import { useState } from 'react';

import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'

function MyApp({ Component, pageProps }: AppProps<{
  session: Session;
}> ) {
  const [queryClient] = useState(() => new QueryClient());

  return(
    
    <SessionProvider session={pageProps.session}>
      <QueryClientProvider client={queryClient}>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </QueryClientProvider>
    </SessionProvider>
  );
}

export default MyApp
