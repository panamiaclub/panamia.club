import React, { Component } from 'react';
import Head from 'next/head';

import GlobalHead from './GlobalHead';
import MainHeader from './MainHeader';
import MainFooter  from './MainFooter';

type LayoutProps = {
  children: React.ReactNode,
};

export default function Layout({ children }: LayoutProps) {
  return (
    <>
      <GlobalHead />
      <Head>
        <title key="title">All Things Local In SoFlo | Pana Mia Club</title>
      </Head>
      <div id="layout-body">
        <MainHeader />
        <div id="layout-main">
          {children}
        </div>
        <MainFooter />
      </div>
    </>
  );
}