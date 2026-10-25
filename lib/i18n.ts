import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from '@/locales/en/common.json';
import es from '@/locales/es/common.json';
import enToast from '@/locales/en/toast.json';
import esToast from '@/locales/es/toast.json';
import enHome from '@/locales/en/home.json';
import esHome from '@/locales/es/home.json';
import enOfferings from '@/locales/en/offerings.json';
import esOfferings from '@/locales/es/offerings.json';
import enAbout from '@/locales/en/about.json';
import esAbout from '@/locales/es/about.json';
import enLinks from '@/locales/en/links.json';
import esLinks from '@/locales/es/links.json';
import enInfo from '@/locales/en/info.json';
import esInfo from '@/locales/es/info.json';
import enPodcasts from '@/locales/en/podcasts.json';
import esPodcasts from '@/locales/es/podcasts.json';
import enContact from '@/locales/en/contact.json';
import esContact from '@/locales/es/contact.json';
import enJointeam from '@/locales/en/jointeam.json';
import esJointeam from '@/locales/es/jointeam.json';
import enSignin from '@/locales/en/signin.json';
import esSignin from '@/locales/es/signin.json';
import enSubmitVenue from '@/locales/en/submitVenue.json';
import esSubmitVenue from '@/locales/es/submitVenue.json';
import enGetListed from '@/locales/en/getListed.json';
import esGetListed from '@/locales/es/getListed.json';
import enImpact from '@/locales/en/impact.json';
import enProfile from '@/locales/en/profile.json';
import esProfile from '@/locales/es/profile.json';
// NOTE: the Spanish impact report is an untranslated mirror of the English
// copy — it keeps the namespace whole so nothing renders blank, and is meant to
// be replaced by a real translation.
import esImpact from '@/locales/es/impact.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: en,
        toast: enToast,
        home: enHome,
        offerings: enOfferings,
        about: enAbout,
        links: enLinks,
        info: enInfo,
        podcasts: enPodcasts,
        contact: enContact,
        jointeam: enJointeam,
        signin: enSignin,
        submitVenue: enSubmitVenue,
        getListed: enGetListed,
        impact: enImpact,
        profile: enProfile,
      },
      es: {
        common: es,
        toast: esToast,
        home: esHome,
        offerings: esOfferings,
        about: esAbout,
        links: esLinks,
        info: esInfo,
        podcasts: esPodcasts,
        contact: esContact,
        jointeam: esJointeam,
        signin: esSignin,
        submitVenue: esSubmitVenue,
        getListed: esGetListed,
        impact: esImpact,
        profile: esProfile,
      },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'es'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
  });

export default i18n;
