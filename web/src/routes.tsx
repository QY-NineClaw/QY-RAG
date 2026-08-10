import { memo, useEffect, useLayoutEffect, useState } from 'react';
import {
  createBrowserRouter,
  Navigate,
  redirect,
  type RouteObject,
} from 'react-router';
import FallbackComponent from './components/fallback-component';
import { IS_ENTERPRISE } from './pages/admin/utils';
import authorizationUtil from './utils/authorization-util';

export enum Routes {
  Root = '/',
  Login = '/login-next',
  Logout = '/logout',
  Home = '/home',
  Datasets = '/datasets',
  DatasetBase = '/dataset',
  Files = '/files',
  Dataset = `${Routes.DatasetBase}/${Routes.Files}`,
  Agent = '/agent',
  AgentTemplates = '/agent-templates',
  Agents = '/agents',
  Explore = '/explore',
  AgentExplore = `${Routes.Agent}/:id/explore`,
  Memories = '/memories',
  Memory = '/memory',
  MemoryMessage = '/memory-message',
  MemorySetting = '/memory-setting',
  AgentList = '/agent-list',
  Searches = '/searches',
  Search = '/search',
  SearchShare = '/search/share',
  Chats = '/chats',
  Chat = '/chat',

  Skills = '/files/skills',
  ProfileSetting = '/profile-setting',
  Profile = '/profile',
  Api = '/api',
  Mcp = '/mcp',
  Team = '/team',
  Plan = '/plan',
  Model = '/model',
  Prompt = '/prompt',
  DataSource = '/data-source',
  DataSourceDetailPage = '/data-source-detail-page',
  ChatChannel = '/chat-channel',
  ProfileMcp = `${ProfileSetting}${Mcp}`,
  ProfileTeam = `${ProfileSetting}${Team}`,
  ProfilePlan = `${ProfileSetting}${Plan}`,
  ProfileModel = `${ProfileSetting}${Model}`,
  ProfilePrompt = `${ProfileSetting}${Prompt}`,
  ProfileProfile = `${ProfileSetting}${Profile}`,
  DatasetTesting = '/retrieval',
  Chunk = '/chunk',
  ChunkResult = `${Chunk}${Chunk}`,
  Parsed = '/parsed',
  ParsedResult = `${Chunk}${Parsed}`,
  Result = '/result',
  ResultView = `${Chunk}${Result}`,
  KnowledgeGraph = '/knowledge-graph',
  AgentLogPage = '/agent-log-page',
  AgentShare = '/agent/share',
  ChatShare = `${Chats}/share`,
  ChatWidget = `${Chats}/widget`,
  UserSetting = '/user-setting',
  DataSetOverview = '/logs',
  DataSetSetting = '/configuration',
  DataflowResult = '/dataflow-result',
  Admin = '/admin',
  AdminServices = `${Admin}/services`,
  AdminUserManagement = `${Admin}/users`,
  AdminSandboxSettings = `${Admin}/sandbox-settings`,
  AdminWhitelist = `${Admin}/whitelist`,
  AdminRoles = `${Admin}/roles`,
  AdminMonitoring = `${Admin}/monitoring`,
}

const RouteLoadingOverlay = ({ leaving = false }: { leaving?: boolean }) => (
  <div
    className={`route-loading-shell${leaving ? ' is-leaving' : ''}`}
    aria-label="Loading page"
  >
    <div className="route-loading-spinner" aria-hidden="true" />
  </div>
);

const ROUTE_OVERLAY_MIN_DURATION = 360;
const ROUTE_OVERLAY_REVEAL_DELAY = 80;
const ROUTE_OVERLAY_DISMISS_DURATION = 240;
const ROUTE_OVERLAY_MAX_DURATION = 3000;

type RouteOverlayPhase = 'visible' | 'leaving' | 'hidden';

const activeRouteLoadTokens = new Set<symbol>();
const routeOverlayListeners = new Set<() => void>();
let routeOverlayPhase: RouteOverlayPhase = 'hidden';
let routeOverlayStartedAt = 0;
let routeOverlayMaxTimer: number | undefined;
let routeOverlayLeaveTimer: number | undefined;
let routeOverlayHideTimer: number | undefined;

const notifyRouteOverlayListeners = () => {
  routeOverlayListeners.forEach((listener) => listener());
};

const setRouteOverlayPhase = (phase: RouteOverlayPhase) => {
  if (routeOverlayPhase === phase) return;
  routeOverlayPhase = phase;
  notifyRouteOverlayListeners();
};

const clearRouteOverlayTimers = () => {
  window.clearTimeout(routeOverlayMaxTimer);
  window.clearTimeout(routeOverlayLeaveTimer);
  window.clearTimeout(routeOverlayHideTimer);
  routeOverlayMaxTimer = undefined;
  routeOverlayLeaveTimer = undefined;
  routeOverlayHideTimer = undefined;
};

const clearRouteOverlayDismissTimers = () => {
  window.clearTimeout(routeOverlayLeaveTimer);
  window.clearTimeout(routeOverlayHideTimer);
  routeOverlayLeaveTimer = undefined;
  routeOverlayHideTimer = undefined;
};

const dismissRouteOverlay = () => {
  if (routeOverlayPhase === 'hidden' || routeOverlayPhase === 'leaving') return;

  setRouteOverlayPhase('leaving');
  window.clearTimeout(routeOverlayHideTimer);
  routeOverlayHideTimer = window.setTimeout(() => {
    setRouteOverlayPhase('hidden');
  }, ROUTE_OVERLAY_DISMISS_DURATION);
};

const scheduleRouteOverlayDismiss = () => {
  window.clearTimeout(routeOverlayLeaveTimer);

  const elapsed = performance.now() - routeOverlayStartedAt;
  const remaining = Math.max(0, ROUTE_OVERLAY_MIN_DURATION - elapsed);

  routeOverlayLeaveTimer = window.setTimeout(() => {
    if (activeRouteLoadTokens.size === 0) {
      dismissRouteOverlay();
    }
  }, remaining);
};

const beginRouteOverlay = () => {
  const token = Symbol('route-load');
  activeRouteLoadTokens.add(token);

  if (routeOverlayPhase !== 'visible') {
    clearRouteOverlayTimers();
    routeOverlayStartedAt = performance.now();
    setRouteOverlayPhase('visible');
    routeOverlayMaxTimer = window.setTimeout(() => {
      dismissRouteOverlay();
    }, ROUTE_OVERLAY_MAX_DURATION);
  } else {
    clearRouteOverlayDismissTimers();
  }

  return token;
};

const finishRouteOverlay = (token: symbol) => {
  if (!activeRouteLoadTokens.delete(token)) return;

  if (activeRouteLoadTokens.size === 0) {
    scheduleRouteOverlayDismiss();
  }
};

export const RouteTransitionOverlayHost = () => {
  const [phase, setPhase] = useState(routeOverlayPhase);

  useLayoutEffect(() => {
    const listener = () => setPhase(routeOverlayPhase);
    routeOverlayListeners.add(listener);
    return () => {
      routeOverlayListeners.delete(listener);
    };
  }, []);

  if (phase === 'hidden') return null;

  return <RouteLoadingOverlay leaving={phase === 'leaving'} />;
};

type LazyRouteImporter = () => Promise<{
  default: React.ComponentType<any>;
}>;

const loadedRouteCache = new WeakMap<
  LazyRouteImporter,
  React.ComponentType<any>
>();
const loadingRouteCache = new WeakMap<
  LazyRouteImporter,
  Promise<React.ComponentType<any>>
>();

type LazyRouteConfig = Omit<RouteObject, 'Component' | 'children'> & {
  Component?: LazyRouteImporter;
  children?: LazyRouteConfig[];
};

const loadRouteComponent = (importer: LazyRouteImporter) => {
  const loaded = loadedRouteCache.get(importer);
  if (loaded) return Promise.resolve(loaded);

  const existing = loadingRouteCache.get(importer);
  if (existing) return existing;

  const promise = importer().then((module) => {
    loadedRouteCache.set(importer, module.default);
    loadingRouteCache.delete(importer);
    return module.default;
  });
  loadingRouteCache.set(importer, promise);
  return promise;
};

const RouteLoadBoundary = ({
  animate,
  importer,
  routeProps,
}: {
  animate: boolean;
  importer: LazyRouteImporter;
  routeProps: Record<string, unknown>;
}) => {
  const [RouteComponent, setRouteComponent] =
    useState<React.ComponentType<any> | null>(() => {
      return loadedRouteCache.get(importer) ?? null;
    });
  const [routeError, setRouteError] = useState<unknown>(null);

  useEffect(() => {
    if (loadedRouteCache.get(importer)) return;

    let active = true;
    let overlayToken: symbol | null = beginRouteOverlay();
    const timers = new Set<number>();

    const scheduleTimer = (callback: () => void, delay: number) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        callback();
      }, delay);
      timers.add(timer);
      return timer;
    };

    loadRouteComponent(importer)
      .then((Component) => {
        if (!active) return;

        setRouteComponent(() => Component);
        window.requestAnimationFrame(() => {
          scheduleTimer(() => {
            if (!active || !overlayToken) return;
            finishRouteOverlay(overlayToken);
            overlayToken = null;
          }, ROUTE_OVERLAY_REVEAL_DELAY);
        });
      })
      .catch((error) => {
        if (!active) return;
        setRouteError(error);
        if (overlayToken) {
          finishRouteOverlay(overlayToken);
          overlayToken = null;
        }
      });

    return () => {
      active = false;
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
      if (overlayToken) {
        finishRouteOverlay(overlayToken);
        overlayToken = null;
      }
    };
  }, [importer]);

  if (routeError) throw routeError;

  return (
    <>
      {RouteComponent && (
        <div
          className={
            animate ? 'route-enter size-full min-h-0' : 'size-full min-h-0'
          }
        >
          <RouteComponent {...routeProps} />
        </div>
      )}
    </>
  );
};

const withLazyRoute = (importer: LazyRouteImporter, animate = true) => {
  const Wrapped: React.FC<any> = (props) => (
    <RouteLoadBoundary
      animate={animate}
      importer={importer}
      routeProps={props}
    />
  );
  Wrapped.displayName = 'LazyRoute';
  return process.env.NODE_ENV === 'development' ? Wrapped : memo(Wrapped);
};

const routeConfigOptions = [
  {
    path: '/login',
    Component: () => import('@/pages/login-next'),
    layout: false,
  },
  {
    path: '/login-next',
    Component: () => import('@/pages/login-next'),
    layout: false,
  },
  {
    path: Routes.ChatShare,
    Component: () => import('@/pages/next-chats/share'),
    layout: false,
  },
  {
    path: Routes.AgentShare,
    Component: () => import('@/pages/agent/share'),
    layout: false,
  },
  {
    path: Routes.ChatWidget,
    Component: () => import('@/pages/next-chats/widget'),
    layout: false,
  },
  {
    path: Routes.AgentList,
    Component: () => import('@/pages/agents'),
  },
  {
    path: '/document/:id',
    Component: () => import('@/pages/document-viewer'),
    layout: false,
  },
  {
    path: '/*',
    Component: () => import('@/pages/404'),
    layout: false,
  },
  {
    path: Routes.Root,
    layout: false,
    Component: () => import('@/pages/home'),
    loader: ({ request }: { request: Request }) => {
      const url = new URL(request.url);
      const auth = url.searchParams.get('auth');
      if (auth) {
        authorizationUtil.setAuthorization(auth);
        url.searchParams.delete('auth');
        return redirect(`${url.pathname}${url.search}`);
      }
      return null;
    },
  },
  {
    path: Routes.Chat + '/:id',
    Component: () => import('@/pages/next-chats/chat'),
  },
  {
    path: Routes.Root,
    Component: () => import('@/layouts/root-layout'),
    children: [
      {
        path: Routes.Datasets,
        Component: () => import('@/pages/datasets'),
      },
      {
        path: Routes.DatasetBase,
        Component: () => import('@/pages/dataset'),
        children: [
          {
            path: `${Routes.Dataset}/:id`,
            Component: () => import('@/pages/dataset/dataset'),
          },
          {
            path: `${Routes.DatasetBase}${Routes.DatasetTesting}/:id`,
            Component: () => import('@/pages/dataset/testing'),
          },
          {
            path: `${Routes.DatasetBase}${Routes.KnowledgeGraph}/:id`,
            Component: () => import('@/pages/dataset/knowledge-graph'),
          },
          {
            path: `${Routes.DatasetBase}${Routes.DataSetOverview}/:id`,
            Component: () => import('@/pages/dataset/dataset-overview'),
          },
          {
            path: `${Routes.DatasetBase}${Routes.DataSetSetting}/:id`,
            Component: () => import('@/pages/dataset/dataset-setting'),
          },
        ],
      },
      {
        path: Routes.Chats,
        Component: () => import('@/pages/next-chats'),
      },
      {
        path: Routes.Searches,
        Component: () => import('@/pages/next-searches'),
      },
      {
        path: `${Routes.Search}/:id`,
        layout: false,
        Component: () => import('@/pages/next-search'),
      },
      {
        path: Routes.Agents,
        Component: () => import('@/pages/agents'),
      },
      {
        path: Routes.AgentTemplates,
        layout: false,
        Component: () => import('@/pages/agents/agent-templates'),
      },
      {
        path: Routes.Memories,
        Component: () => import('@/pages/memories'),
      },
      {
        path: `${Routes.Memory}`,
        Component: () => import('@/pages/memory'),
        children: [
          {
            path: `${Routes.Memory}/${Routes.MemoryMessage}/:id`,
            Component: () => import('@/pages/memory/memory-message'),
          },
          {
            path: `${Routes.Memory}/${Routes.MemorySetting}/:id`,
            Component: () => import('@/pages/memory/memory-setting'),
          },
        ],
      },
      {
        path: Routes.Files,
        Component: () => import('@/pages/files'),
      },
      {
        path: Routes.Skills,
        Component: () => import('@/pages/skills'),
      },
      {
        path: Routes.UserSetting,
        element: <Navigate to={`/user-setting${Routes.DataSource}`} replace />,
      },
      {
        path: `${Routes.UserSetting}/profile`,
        Component: () => import('@/pages/user-setting/profile'),
      },
      {
        path: `${Routes.UserSetting}/model`,
        Component: () => import('@/pages/user-setting/setting-model'),
      },
      {
        path: `${Routes.UserSetting}/team`,
        Component: () => import('@/pages/user-setting/setting-team'),
      },
      {
        path: `${Routes.UserSetting}${Routes.Api}`,
        Component: () => import('@/pages/user-setting/setting-api'),
      },
      {
        path: `${Routes.UserSetting}${Routes.Mcp}`,
        Component: () => import('@/pages/user-setting/mcp'),
      },
      {
        path: `${Routes.UserSetting}${Routes.DataSource}`,
        Component: () => import('@/pages/user-setting/data-source'),
      },
      {
        path: `${Routes.UserSetting}${Routes.ChatChannel}`,
        Component: () => import('@/pages/user-setting/chat-channel'),
      },
      {
        path: `${Routes.UserSetting}${Routes.DataSource}${Routes.DataSourceDetailPage}`,
        layout: false,
        Component: () =>
          import('@/pages/user-setting/data-source/data-source-detail-page'),
      },
    ],
  },
  {
    path: `${Routes.SearchShare}`,
    Component: () => import('@/pages/next-search/share'),
  },
  {
    path: Routes.Agent,
    children: [
      {
        path: `${Routes.Agent}/:id`,
        Component: () => import('@/pages/agent'),
      },
      {
        path: Routes.AgentExplore,
        Component: () => import('@/pages/agent/explore'),
        errorElement: <FallbackComponent />,
      },
    ],
  },
  {
    path: `${Routes.AgentLogPage}/:id`,
    Component: () => import('@/pages/agents/agent-log-page'),
  },
  {
    path: `${Routes.DataflowResult}`,
    Component: () => import('@/pages/dataflow-result'),
  },
  {
    path: Routes.Chunk,
    children: [
      {
        path: `${Routes.Chunk}`,
        Component: () => import('@/pages/chunk'),
      },
      {
        path: `${Routes.ParsedResult}/chunks`,
        Component: () =>
          import('@/pages/chunk/parsed-result/add-knowledge/components/knowledge-chunk'),
      },
      {
        path: `${Routes.ChunkResult}/:id`,
        Component: () => import('@/pages/chunk/chunk-result'),
      },
      {
        path: `${Routes.ResultView}/:id`,
        Component: () => import('@/pages/chunk/result-view'),
      },
    ],
  },
  {
    path: Routes.Admin,
    Component: () => import('@/pages/admin/layouts/root-layout'),
    children: [
      {
        path: Routes.Admin,
        Component: () => import('@/pages/admin/login'),
      },
      {
        path: Routes.Admin,
        Component: () => import('@/pages/admin/layouts/authorized-layout'),
        children: [
          {
            path: `${Routes.AdminUserManagement}/:id`,
            Component: () => import('@/pages/admin/user-detail'),
          },
          {
            Component: () => import('@/pages/admin/layouts/navigation-layout'),
            children: [
              {
                path: Routes.AdminServices,
                Component: () => import('@/pages/admin/service-status'),
              },
              {
                path: Routes.AdminUserManagement,
                Component: () => import('@/pages/admin/users'),
              },
              {
                path: Routes.AdminSandboxSettings,
                Component: () => import('@/pages/admin/sandbox-settings'),
              },
              ...(IS_ENTERPRISE
                ? [
                    {
                      path: Routes.AdminWhitelist,
                      Component: () => import('@/pages/admin/whitelist'),
                    },
                    {
                      path: Routes.AdminRoles,
                      Component: () => import('@/pages/admin/roles'),
                    },
                    {
                      path: Routes.AdminMonitoring,
                      Component: () => import('@/pages/admin/monitoring'),
                    },
                  ]
                : []),
            ],
          },
        ],
      },
    ],
  } satisfies LazyRouteConfig,
];

const wrapRoutes = (routes: LazyRouteConfig[]): RouteObject[] =>
  routes.map((item) => {
    const { Component, children, ...rest } = item;
    const next: RouteObject = { ...rest, errorElement: <FallbackComponent /> };
    if (Component) {
      next.Component = withLazyRoute(Component, !children);
    }
    if (children) {
      next.children = wrapRoutes(children);
    }
    return next;
  });

const routeConfig = wrapRoutes(routeConfigOptions);

const routers = createBrowserRouter(routeConfig, {
  basename: import.meta.env?.VITE_BASE_URL || '/',
});

export { routers };
