import SvgIcon from '@/components/svg-icon';
import { useAuth } from '@/hooks/auth-hooks';
import {
  useLogin,
  useLoginChannels,
  useLoginWithChannel,
  useRegister,
} from '@/hooks/use-login-request';
import { useSystemConfig } from '@/hooks/use-system-request';
import { rsaPsw } from '@/utils';
import { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import Spotlight from '@/components/spotlight';
import { Button, ButtonLoading } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { NICKNAME_PATTERN } from '../user-setting/profile/constants';
import { BgSvg } from './bg';
import FlipCard3D, { FlipFaceContext } from './card';
import './index.less';

const authInputClassName = 'h-10';

type LoginFormContentProps = {
  isLoginPage: boolean;
  title: string;
  form: UseFormReturn<any>;
  loading: boolean;
  onCheck: (params: any) => Promise<void>;
  changeTitle: () => void;
  registerEnabled: boolean;
  channels: { channel: string; icon?: string; display_name: string }[];
  handleLoginWithChannel: (channel: string) => void;
  t: ReturnType<typeof useTranslation>['t'];
  disablePasswordLogin?: boolean;
};

function LoginFormContent({
  isLoginPage,
  title,
  form,
  loading,
  onCheck,
  changeTitle,
  registerEnabled,
  channels,
  handleLoginWithChannel,
  t,
  disablePasswordLogin,
}: LoginFormContentProps) {
  const face = useContext(FlipFaceContext);
  const isActiveFace = isLoginPage ? face === 'front' : face === 'back';

  return (
    <div className="w-full">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-text-primary">
          {title === 'login' ? t('loginTitle') : t('signUpTitle')}
        </h2>
      </div>
      <div className="w-full bg-bg-base rounded-3xl shadow-xl pt-10 px-10 pb-4">
        {!disablePasswordLogin && (
          <Form {...form}>
            <form
              className="flex flex-col gap-8 text-text-primary "
              data-testid="auth-form"
              data-active={isActiveFace ? 'true' : undefined}
              onSubmit={form.handleSubmit(onCheck)}
            >
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t('emailLabel')}</FormLabel>
                    <FormControl>
                      <Input
                        className={authInputClassName}
                        data-testid="auth-email"
                        placeholder={t('emailPlaceholder')}
                        autoComplete="email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {title === 'register' && (
                <FormField
                  control={form.control}
                  name="nickname"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t('nicknameLabel')}</FormLabel>
                      <FormControl>
                        <Input
                          className={authInputClassName}
                          data-testid="auth-nickname"
                          placeholder={t('nicknamePlaceholder')}
                          autoComplete="username"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t('passwordLabel')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          className={authInputClassName}
                          data-testid="auth-password"
                          type={'password'}
                          placeholder={t('passwordPlaceholder')}
                          autoComplete={
                            title === 'login'
                              ? 'current-password'
                              : 'new-password'
                          }
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {title === 'login' && (
                <FormField
                  control={form.control}
                  name="remember"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex gap-2 group">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(checked) => {
                              field.onChange(checked);
                            }}
                            className="group-hover:border-border-default group-hover:bg-border-button"
                          />
                        </FormControl>
                        <FormLabel
                          className={cn('cursor-pointer', {
                            'text-text-disabled': !field.value,
                            'text-text-primary': field.value,
                          })}
                        >
                          {t('rememberMe')}
                        </FormLabel>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <ButtonLoading
                data-testid="auth-submit"
                type="submit"
                loading={loading}
                className="bg-metallic-gradient border-b-[#00BEB4] border-b-2 hover:bg-metallic-gradient hover:border-b-[#02bcdd] w-full my-8"
              >
                {title === 'login' ? t('login') : t('continue')}
              </ButtonLoading>
            </form>
          </Form>
        )}

        {title === 'login' && channels && channels.length > 0 && (
          <div className={disablePasswordLogin ? 'py-8' : 'mt-3 border'}>
            {channels.map((item) => (
              <Button
                variant={'transparent'}
                key={item.channel}
                onClick={() => handleLoginWithChannel(item.channel)}
                style={{ marginTop: 10 }}
                className={disablePasswordLogin ? 'w-full' : ''}
              >
                <div className="flex items-center">
                  <SvgIcon
                    name={item.icon || 'sso'}
                    width={20}
                    height={20}
                    style={{ marginRight: 5 }}
                  />
                  Sign in with {item.display_name}
                </div>
              </Button>
            ))}
          </div>
        )}

        {!disablePasswordLogin && title === 'login' && registerEnabled && (
          <div className="mt-10 text-right">
            <p className="text-text-disabled text-sm">
              {t('signInTip')}
              <Button
                data-testid="auth-toggle-register"
                variant={'transparent'}
                onClick={changeTitle}
                className="text-accent-primary/90 hover:text-accent-primary hover:bg-transparent font-medium border-none transition-colors duration-200"
              >
                {t('signUp')}
              </Button>
            </p>
          </div>
        )}
        {!disablePasswordLogin && title === 'register' && (
          <div className="mt-10 text-right">
            <p className="text-text-disabled text-sm">
              {t('signUpTip')}
              <Button
                data-testid="auth-toggle-login"
                variant={'transparent'}
                onClick={changeTitle}
                className="text-accent-primary/90 hover:text-accent-primary hover:bg-transparent font-medium border-none transition-colors duration-200"
              >
                {t('login')}
              </Button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const Login = () => {
  const [title, setTitle] = useState('login');
  const navigate = useNavigate();
  const { login, loading: signLoading } = useLogin();
  const { register, loading: registerLoading } = useRegister();
  const { channels, loading: channelsLoading } = useLoginChannels();
  const { login: loginWithChannel, loading: loginWithChannelLoading } =
    useLoginWithChannel();
  const { t } = useTranslation('translation', { keyPrefix: 'login' });
  const { t: tSetting } = useTranslation('translation', {
    keyPrefix: 'setting',
  });
  const [isLoginPage, setIsLoginPage] = useState(true);

  const loading =
    signLoading ||
    registerLoading ||
    channelsLoading ||
    loginWithChannelLoading;
  const { config } = useSystemConfig();
  const registerEnabled = config?.registerEnabled !== 0;

  const { isLogin } = useAuth();
  useEffect(() => {
    if (isLogin) {
      navigate('/');
    }
  }, [isLogin, navigate]);

  const handleLoginWithChannel = async (channel: string) => {
    await loginWithChannel(channel);
  };

  const changeTitle = () => {
    setIsLoginPage(title !== 'login');
    if (title === 'login' && !registerEnabled) {
      return;
    }

    setTimeout(() => {
      setTitle(title === 'login' ? 'register' : 'login');
    }, 200);
  };

  const FormSchema = z
    .object({
      nickname: z.string().optional(),
      email: z
        .string()
        .email()
        .min(1, { message: t('emailPlaceholder') }),
      password: z.string().min(1, { message: t('passwordPlaceholder') }),
      remember: z.boolean().optional(),
    })
    .superRefine((data, ctx) => {
      if (title !== 'register') return;
      if (!data.nickname) {
        ctx.addIssue({
          path: ['nickname'],
          message: 'nicknamePlaceholder',
          code: z.ZodIssueCode.custom,
        });
        return;
      }
      if (!NICKNAME_PATTERN.test(data.nickname)) {
        ctx.addIssue({
          path: ['nickname'],
          message: tSetting('usernameInvalidCharacters'),
          code: z.ZodIssueCode.custom,
        });
      }
    });
  type FormValues = z.infer<typeof FormSchema>;
  const form = useForm<FormValues>({
    defaultValues: {
      nickname: '',
      email: '',
      password: '',
      remember: false,
    },
    resolver: zodResolver(FormSchema),
  });

  const onCheck = async (params: FormValues) => {
    try {
      const rsaPassWord = rsaPsw(params.password) as string;

      if (title === 'login') {
        const code = await login({
          email: `${params.email}`.trim(),
          password: rsaPassWord,
        });
        if (code === 0) {
          navigate('/');
        }
      } else {
        const code = await register({
          nickname: params.nickname ?? '',
          email: params.email,
          password: rsaPassWord,
        });
        if (code === 0) {
          setTitle('login');
        }
      }
    } catch (errorInfo) {
      console.log('Failed:', errorInfo);
    }
  };

  return (
    <div className="size-full relative overflow-auto bg-app-page flex flex-col items-center justify-center">
      <Spotlight opcity={0.3} coverage={60} color={'rgb(128, 255, 248)'} />
      <BgSvg isPaused />

      <div className="relative z-10 flex flex-col items-center w-full max-w-[480px] px-4 py-12">
        {/* Form Card */}
        <FlipCard3D isLoginPage={isLoginPage}>
          <LoginFormContent
            isLoginPage={isLoginPage}
            title={title}
            form={form}
            loading={loading}
            onCheck={onCheck}
            changeTitle={changeTitle}
            registerEnabled={registerEnabled}
            channels={channels || []}
            handleLoginWithChannel={handleLoginWithChannel}
            t={t}
            disablePasswordLogin={!!config?.disablePasswordLogin}
          />
        </FlipCard3D>
      </div>
    </div>
  );
};

export default Login;
