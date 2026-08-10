import { RAGFlowAvatar } from '@/components/ragflow-avatar';
import ThemeSwitch from '@/components/theme-switch';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useChangeLanguage } from '@/hooks/logic-hooks';
import { useLogout } from '@/hooks/use-login-request';
import {
  useFetchSystemVersion,
  useFetchUserInfo,
} from '@/hooks/use-user-setting-request';
import { cn } from '@/lib/utils';
import { supportedLanguages } from '@/locales/config';
import { useHandleMenuClick } from '@/pages/user-setting/sidebar/hooks';
import { Routes } from '@/routes';
import {
  LucideBox,
  LucideChevronDown,
  LucideDatabase,
  LucideFiles,
  LucideMemoryStick,
  LucideMessageSquareText,
  LucideMessagesSquare,
  LucidePlug,
  LucideSearch,
  LucideServer,
  LucideUnplug,
  LucideUser,
  LucideUsers,
  LucideWorkflow,
} from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

const moduleItems = [
  {
    path: Routes.Datasets,
    icon: LucideDatabase,
    labelKey: 'header.dataset',
    color: 'text-blue-500',
  },
  {
    path: Routes.Chats,
    icon: LucideMessageSquareText,
    labelKey: 'header.chat',
    color: 'text-green-500',
  },
  {
    path: Routes.Searches,
    icon: LucideSearch,
    labelKey: 'header.search',
    color: 'text-purple-500',
  },
  {
    path: Routes.Agents,
    icon: LucideWorkflow,
    labelKey: 'header.flow',
    color: 'text-orange-500',
  },
  {
    path: Routes.Memories,
    icon: LucideMemoryStick,
    labelKey: 'header.memories',
    color: 'text-pink-500',
  },
  {
    path: Routes.Files,
    icon: LucideFiles,
    labelKey: 'header.fileManager',
    color: 'text-teal-500',
  },
] as const;

const settingItems: {
  icon: React.ReactNode;
  labelKey: string;
  key: Routes;
  raw?: boolean;
}[] = [
  {
    icon: <LucideServer className="size-[1em]" />,
    labelKey: 'setting.dataSources',
    key: Routes.DataSource,
  },
  {
    icon: <LucideMessagesSquare className="size-[1em]" />,
    labelKey: 'setting.chatChannels',
    key: Routes.ChatChannel,
  },
  {
    icon: <LucideBox className="size-[1em]" />,
    labelKey: 'setting.model',
    key: Routes.Model,
  },
  {
    icon: <LucidePlug className="size-[1em]" />,
    labelKey: 'MCP',
    key: Routes.Mcp,
    raw: true,
  },
  {
    icon: <LucideUsers className="size-[1em]" />,
    labelKey: 'setting.team',
    key: Routes.Team,
  },
  {
    icon: <LucideUser className="size-[1em]" />,
    labelKey: 'setting.profile',
    key: Routes.Profile,
  },
  {
    icon: <LucideUnplug className="size-[1em]" />,
    labelKey: 'setting.api',
    key: Routes.Api,
  },
];

export default function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: userInfo } = useFetchUserInfo();
  const { handleMenuClick, active: activeItemKey } = useHandleMenuClick();
  const { version } = useFetchSystemVersion();
  const { logout } = useLogout();
  const changeLanguage = useChangeLanguage();
  const currentLanguage = supportedLanguages.find(
    (x) => x.code === (userInfo?.language ?? 'en'),
  );

  return (
    <div className="size-full flex items-center justify-center bg-app-page p-8">
      <div className="flex gap-4 items-stretch w-full max-w-4xl">
        {/* 左侧：用户 + 设置导航 */}
        <aside className="w-[220px] shrink-0 bg-bg-base rounded-3xl flex flex-col overflow-hidden">
          <div className="px-5 pt-5 pb-4 flex flex-col items-center gap-3">
            <RAGFlowAvatar
              avatar={userInfo?.avatar}
              name={userInfo?.nickname}
              isPerson
              className="size-14 rounded-2xl"
            />
            <div className="text-center min-w-0 w-full">
              <p className="text-sm font-semibold text-text-primary truncate">
                {userInfo?.nickname}
              </p>
              <p className="text-xs text-text-secondary truncate">
                {userInfo?.email}
              </p>
            </div>
          </div>

          <nav className="flex-1 px-3 pb-2">
            <ul className="flex flex-col gap-1">
              {settingItems.map(({ icon, labelKey, key, raw }) => (
                <li key={key}>
                  <Button
                    block
                    variant="ghost"
                    className={cn(
                      'justify-start gap-2.5 px-3 h-9 text-sm font-medium rounded-2xl',
                      activeItemKey === key
                        ? 'bg-accent-primary text-bg-base hover:bg-accent-primary'
                        : 'text-text-secondary hover:text-text-primary hover:bg-bg-card',
                    )}
                    onClick={handleMenuClick(key)}
                  >
                    {icon}
                    <span>{raw ? labelKey : t(labelKey)}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </nav>

          <footer className="px-3 pb-4 pt-2 flex flex-col gap-1">
            <div className="flex items-center justify-between px-3 py-1">
              <span className="text-xs text-text-disabled">{version}</span>
              <div className="flex items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-text-secondary h-8 px-2"
                    >
                      {currentLanguage?.displayName}
                      <LucideChevronDown className="size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {supportedLanguages.map((x) => (
                      <DropdownMenuItem
                        key={x.code}
                        onClick={() => changeLanguage(x.code)}
                      >
                        {x.displayName}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <ThemeSwitch />
              </div>
            </div>
            <Button
              block
              size="sm"
              variant="ghost"
              className="text-text-secondary hover:text-text-primary rounded-2xl"
              onClick={() => logout()}
            >
              {t('setting.logout')}
            </Button>
          </footer>
        </aside>

        {/* 右侧：模块卡片 */}
        <div className="flex-1 flex flex-col">
          {/* 模块卡片网格 */}
          <div className="flex-1 bg-bg-base rounded-3xl p-4 flex flex-col">
            <p className="text-xs font-medium text-text-disabled uppercase tracking-wider px-1 mb-3">
              {t('header.logoText', '工作区')}
            </p>
            <div className="flex-1 grid grid-cols-3 grid-rows-2 gap-3">
              {moduleItems.map(({ path, icon: Icon, labelKey, color }) => (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  className={cn(
                    'flex flex-col items-center justify-center gap-3 rounded-2xl',
                    'bg-surface-raised hover:bg-surface-floating cursor-pointer motion-breath hover:shadow-raised hover:-translate-y-0.5 active:bg-surface-raised active:translate-y-0 active:scale-[0.985] active:shadow-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary focus-visible:shadow-focus',
                  )}
                >
                  <Icon className={cn('size-10', color)} strokeWidth={1.5} />
                  <span className="text-sm font-medium text-text-secondary">
                    {t(labelKey)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
