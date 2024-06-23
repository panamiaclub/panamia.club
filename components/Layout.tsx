import React, { Component } from 'react';
import Head from 'next/head';

import GlobalHead from './GlobalHead';
import MainHeader from './MainHeader';
import MainFooter  from './MainFooter';
import PageTracking from './PageTracking';
import PageTrackingEnd from './PageTrackingEnd';

type LayoutProps = {
  children: React.ReactNode,
};

export default function Layout({ children }: LayoutProps) {

  function onBodyClick() {
    const dialogUser = document.getElementById('dialog-user-mainheader') as HTMLDialogElement;
    if (dialogUser) {
      if (dialogUser.open) {
          dialogUser.close()
      }
    }
  }

  return (
    <>
      <GlobalHead />
      <Head>
        <title key="title">All Things Local In SoFlo | Pana Mia Club</title>
      </Head>
      <PageTracking />
      <div id="layout-body" onClick={onBodyClick}>
        <MainHeader />
        <div id="layout-main">
          {children}
        </div>
        <MainFooter />
      </div>
      <PageTrackingEnd />
    </>
  );
}