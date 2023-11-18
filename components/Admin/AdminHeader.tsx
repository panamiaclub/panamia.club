import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { IconFileDescription, IconDashboard, IconEdit } from '@tabler/icons';

import styles from './AdminHeader.module.css';
import AdminButton from './AdminButton';



export default function AdminMenu() {
    const router = useRouter();

    function checkActive(href: String) {
        if (router.pathname === href) {
            return true;
        }
        return false;
    }


    return (
        <header className={styles.adminMenu}>
            <div className={styles.menuBlock}>
                <ul className={styles.menuLinkList}>
                    <li className={styles.menuDesc}>ADMIN MENU</li>
                    <li>
                        <AdminButton href="/account/admin">
                            <IconDashboard height="16" />Dashboard
                        </AdminButton>
                    </li>
                    <li>
                        <AdminButton href="/account/admin/podcasts">
                            <IconFileDescription height="16" />Podcasts
                        </AdminButton>
                    </li>
                    <li>
                        <AdminButton disabled={true}>
                            <IconFileDescription height="16" />Links
                        </AdminButton>
                    </li>
                    <li>
                        <AdminButton disabled={true}>
                            <IconFileDescription height="16" />Events
                        </AdminButton>
                    </li>
                    <li>
                        <AdminButton disabled={true}>
                            <IconFileDescription height="16" />Menu Link
                        </AdminButton>
                    </li>
                    <li>
                        <AdminButton href="/account/admin/signups">
                            <IconEdit height="16" />Newsletter
                        </AdminButton>
                    </li>
                    <li>
                        <AdminButton href="/account/admin/contactus">
                            <IconEdit height="16" />Contact Us
                        </AdminButton>
                    </li>
                    <li>
                        <AdminButton  href="/account/admin/users">
                            <IconEdit height="16" />Users
                        </AdminButton>
                    </li>
                    <li>
                        <AdminButton disabled={true}>
                            <IconEdit height="16" />Pana Profiles
                        </AdminButton>
                    </li>
                </ul>
            </div>
        </header>
    );

}