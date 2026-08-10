import { IconFontFill } from '@/components/icon-font';
import { RAGFlowAvatar } from '@/components/ragflow-avatar';
import ThemeSwitch from '@/components/theme-switch';
import { Button } from '@/components/ui/button';
import { Domain } from '@/constants/common';
import { useLogout } from '@/hooks/use-login-request';
import {
  useFetchSystemVersion,
  useFetchUserInfo,
} from '@/hooks/use-user-setting-request';
import { cn } from '@/lib/utils';
import { Routes } from '@/routes';
import { TFunction } from 'i18next';
import {
  LucideBox,
  LucideLogOut,
  LucideMessagesSquare,
  LucideServer,
  LucideUnplug,
  LucideUser,
  LucideUsers,
} from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useHandleMenuClick } from './hooks';

const menuItems = (t: TFunction) => [
  {
    icon: <LucideServer className="size-[1em]" />,
    label: t('setting.dataSources'),
    key: Routes.DataSource,
  },
  {
    icon: <LucideMessagesSquare className="size-[1em]" />,
    label: t('setting.chatChannels'),
    key: Routes.ChatChannel,
  },
  {
    icon: <LucideBox className="size-[1em]" />,
    label: t('setting.model'),
    key: Routes.Model,
    'data-testid': 'settings-nav-model-providers',
  },
  {
    icon: <IconFontFill name="mcp" className="size-[1em]" />,
    label: 'MCP',
    key: Routes.Mcp,
  },
  {
    icon: <LucideUsers className="size-[1em]" />,
    label: t('setting.team'),
    key: Routes.Team,
  },
  {
    icon: <LucideUser className="size-[1em]" />,
    label: t('setting.profile'),
    key: Routes.Profile,
  },
  {
    icon: <LucideUnplug className="size-[1em]" />,
    label: t('setting.api'),
    key: Routes.Api,
  },
];

export function SideBar() {
  const { data: userInfo } = useFetchUserInfo();
  const { handleMenuClick, active: activeItemKey } = useHandleMenuClick();
  const { version, fetchSystemVersion } = useFetchSystemVersion();
  const { t } = useTranslation();
  useEffect(() => {
    if (location.host !== Domain) {
      fetchSystemVersion();
    }
  }, [fetchSystemVersion]);
  const { logout } = useLogout();

  return (
    <aside className="shrink-0 w-16 md:w-[303px] bg-bg-base rounded-3xl shadow-none flex flex-col overflow-hidden">
      <header className="px-2 pt-5 pb-4 md:px-6">
        <div className="flex items-center justify-center gap-3 md:justify-start">
          <RAGFlowAvatar
            avatar={userInfo?.avatar}
            name={userInfo?.nickname}
            isPerson
            className="size-9"
          />
          <div className="hidden flex-col min-w-0 md:flex">
            <p className="text-sm font-medium text-text-primary truncate">
              {userInfo?.nickname}
            </p>
            <p className="text-xs text-text-secondary truncate">
              {userInfo?.email}
            </p>
          </div>
        </div>
      </header>

      <nav className="flex-1 overflow-auto p-2 md:p-3">
        <ul className="flex flex-col items-center gap-1 md:items-stretch">
          {menuItems(t).map((item) => {
            const { key, icon, label, ...rest } = item;

            return (
              <li key={key} className="w-full md:w-auto">
                <Button
                  {...rest}
                  block
                  variant="ghost"
                  aria-label={label}
                  className={cn(
                    'relative h-9 text-sm font-medium rounded-lg max-md:size-10 max-md:p-0 max-md:justify-center md:justify-start md:gap-3 md:px-3',
                    activeItemKey === key
                      ? 'bg-accent-primary text-bg-base hover:bg-accent-primary'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-card',
                  )}
                  onClick={handleMenuClick(key)}
                >
                  <span className="flex items-center gap-3 max-md:gap-0">
                    {icon}
                    <span className="hidden md:inline">{label}</span>
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>
      </nav>

      <footer className="p-2 pt-2 md:px-3 md:pb-3">
        <div className="hidden items-center gap-2 mb-2 px-3 justify-between md:flex">
          <span className="text-xs text-text-secondary">{version}</span>
          <ThemeSwitch />
        </div>

        <Button
          block
          size="sm"
          variant="ghost"
          aria-label={t('setting.logout')}
          className="text-text-secondary hover:text-text-primary max-md:size-10 max-md:p-0 max-md:mx-auto max-md:justify-center"
          onClick={() => logout()}
        >
          <LucideLogOut className="size-[1em] md:hidden" />
          <span className="hidden md:inline">{t('setting.logout')}</span>
        </Button>
      </footer>
    </aside>
  );
}
