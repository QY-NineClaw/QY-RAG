import { LanguageAbbreviation } from '@/constants/common';
import storage from '@/utils/authorization-util';
import dayjs from 'dayjs';
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { upperFirst } from 'lodash';
import { initReactI18next } from 'react-i18next';
import translation_en from './en';
import translation_zh from './zh';

//The language is based on the .ng file stored in the client's local storage.
// The language stored in the database is for agent template resources, as these resources reside on the server.
// When a user logs in from a different machine, the login page language is the language configured by VITE_DEFAULT_LANGUAGE_CODE.

const languageImports: Record<string, () => Promise<{ default: any }>> = {
  [LanguageAbbreviation.En]: () => import('./en'),
  [LanguageAbbreviation.Zh]: () => import('./zh'),
  [LanguageAbbreviation.ZhTraditional]: () => import('./zh-traditional'),
  [LanguageAbbreviation.Id]: () => import('./id'),
  [LanguageAbbreviation.Ja]: () => import('./ja'),
  [LanguageAbbreviation.Es]: () => import('./es'),
  [LanguageAbbreviation.Vi]: () => import('./vi'),
  [LanguageAbbreviation.Ru]: () => import('./ru'),
  [LanguageAbbreviation.PtBr]: () => import('./pt-br'),
  [LanguageAbbreviation.De]: () => import('./de'),
  [LanguageAbbreviation.Fr]: () => import('./fr'),
  [LanguageAbbreviation.It]: () => import('./it'),
  [LanguageAbbreviation.Bg]: () => import('./bg'),
  [LanguageAbbreviation.Ar]: () => import('./ar'),
  [LanguageAbbreviation.Tr]: () => import('./tr'),
  [LanguageAbbreviation.Ko]: () => import('./ko'),
};

const supportedLanguageCodes: Intl.UnicodeBCP47LocaleIdentifier[] =
  Object.keys(languageImports);

export const supportedLanguages = supportedLanguageCodes.map((code) => {
  const locale = new Intl.Locale(code);

  return {
    code,
    locale,
    displayName: upperFirst(
      new Intl.DisplayNames(code, { type: 'language' }).of(code) ?? code,
    ),
  };
});

const resolveLanguageCode = (
  lng?: string | null,
  fallback = LanguageAbbreviation.Zh,
): string => {
  if (!lng) {
    return fallback;
  }

  const normalizedLng = lng.replace('_', '-');
  const lowerLng = normalizedLng.toLowerCase();

  if (lowerLng === 'zh' || lowerLng === 'zh-cn' || lowerLng === 'zh-hans') {
    return LanguageAbbreviation.Zh;
  }

  if (lowerLng === 'zh-tw' || lowerLng === 'zh-hk' || lowerLng === 'zh-hant') {
    return LanguageAbbreviation.ZhTraditional;
  }

  if (lowerLng === 'pt-br') {
    return LanguageAbbreviation.PtBr;
  }

  return supportedLanguageCodes.includes(normalizedLng)
    ? normalizedLng
    : fallback;
};

export const DEFAULT_LANGUAGE_CODE = resolveLanguageCode(
  import.meta.env?.VITE_DEFAULT_LANGUAGE_CODE,
);

const resources = {
  [LanguageAbbreviation.En]: translation_en,
  [LanguageAbbreviation.Zh]: translation_zh,
};

const normalizeLanguageCode = (lng?: string | null): string => {
  return resolveLanguageCode(lng, DEFAULT_LANGUAGE_CODE);
};

const updateDocumentLocale = (lng: string) => {
  document.documentElement.lang = lng;
  document.documentElement.dir = 'ltr';
  dayjs.locale(lng === LanguageAbbreviation.Zh ? 'zh-cn' : lng);
};

const i18nReady = i18n
  .use(initReactI18next)
  .use(LanguageDetector)
  .init({
    detection: {
      lookupLocalStorage: 'lng',
      order: ['localStorage'],
      caches: [],
    },
    supportedLngs: supportedLanguageCodes,
    resources,
    fallbackLng: DEFAULT_LANGUAGE_CODE,
    interpolation: {
      escapeValue: false,
    },
  });

export const loadLanguageAsync = async (lng: string): Promise<void> => {
  const normalizedLng = normalizeLanguageCode(lng);

  if (i18n.hasResourceBundle(normalizedLng, 'translation')) {
    return;
  }

  const importFn = languageImports[normalizedLng];
  if (!importFn) {
    console.warn(`Language ${lng} is not supported for lazy loading`);
    return;
  }

  try {
    const module = await importFn();
    const translationData = module.default?.translation || module.default;
    i18n.addResourceBundle(normalizedLng, 'translation', translationData);
  } catch (error) {
    console.error(`Failed to load language ${lng}:`, error);
  }
};

export const changeLanguageAsync = async (lng: string): Promise<void> => {
  await i18nReady;

  const normalizedLng = normalizeLanguageCode(lng);

  if (
    normalizedLng !== LanguageAbbreviation.En &&
    !i18n.hasResourceBundle(normalizedLng, 'translation')
  ) {
    await loadLanguageAsync(normalizedLng);
  }

  storage.setLanguage(normalizedLng);

  updateDocumentLocale(normalizedLng);

  await i18n.changeLanguage(normalizedLng);
};

export const initLanguage = async (): Promise<void> => {
  const currentLng = storage.getLanguage() || DEFAULT_LANGUAGE_CODE;

  await changeLanguageAsync(normalizeLanguageCode(currentLng));
};

export default i18n;
