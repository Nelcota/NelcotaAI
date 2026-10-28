import { Link, type LinkProps, useLocation } from "@tanstack/react-router";
import {
  BellIcon,
  ChevronDownIcon,
  KeyRoundIcon,
  LogOutIcon,
  type LucideIcon,
  MoonIcon,
  SunIcon,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatLongDate } from "@/shared/format";

import { initialsOf } from "./initials";
import { useTheme } from "./theme";

type RoutePath = NonNullable<LinkProps["to"]>;

/** A destination of the main navigation. */
export interface NavigationItem {
  readonly label: string;
  readonly to: RoutePath;
  readonly icon: LucideIcon;
  /** Shows a small orange dot, for example while requests are pending. */
  readonly hasNews?: boolean;
}

/** One line of the bell menu, such as a request waiting for a decision. */
export interface NotificationItem {
  readonly id: string;
  readonly title: string;
  readonly description: string;
}

interface NotificationsProps {
  /** Page that handles the items; every line and the footer link open it. */
  readonly to: RoutePath;
  /** Name of that page in the footer link, such as "Ver pedidos pendentes". */
  readonly label: string;
  readonly emptyMessage: string;
  /** Pending items, newest first. The bell lights its dot while there is at least one. */
  readonly items: readonly NotificationItem[];
}

interface AppShellProps {
  readonly items: readonly NavigationItem[];
  readonly notifications: NotificationsProps;
  /** Display name and e-mail of the signed-in user; null while they load. */
  readonly userName: string | null;
  readonly userEmail: string | null;
  readonly onSignOut: () => void;
  readonly onChangePassword: () => void;
  readonly children: ReactNode;
}

/**
 * Authenticated layout: the colourful header band carries the logo, the
 * navigation as labelled pills and the account controls. On phones the same destinations move
 * to a tab bar fixed at the bottom, within thumb reach.
 */
export function AppShell({
  items,
  notifications,
  userName,
  userEmail,
  onSignOut,
  onChangePassword,
  children,
}: AppShellProps) {
  const pathname = useLocation({ select: (location) => location.pathname });

  return (
    <div className="relative isolate flex min-h-svh flex-col overflow-x-hidden bg-background">
      <div aria-hidden="true" className="hero-gradient absolute inset-x-0 top-0 -z-10 h-80" />
      {/* Three columns with equal sides keep the navigation exactly centred on the page. */}
      <header className="mx-auto grid w-full max-w-[1320px] grid-cols-[1fr_auto] items-center gap-4 px-4 pt-5 sm:px-8 sm:pt-6 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div className="flex min-w-0 items-center gap-5 justify-self-start">
          <Link
            to="/painel"
            aria-label="Nelcota, página inicial"
            className="shrink-0 rounded-lg text-white focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
          >
            <BrandLogo />
          </Link>
          <TodayLabel />
        </div>
        <TopNavigation items={items} pathname={pathname} />
        <div className="flex items-center justify-self-end gap-1 sm:gap-2">
          <ThemeButton />
          <NotificationsMenu {...notifications} />
          <AccountMenu
            userName={userName}
            userEmail={userEmail}
            onSignOut={onSignOut}
            onChangePassword={onChangePassword}
          />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col gap-6 px-4 pt-8 pb-28 sm:px-8 sm:pt-10 md:pb-10">
        {children}
      </main>
      <BottomNavigation items={items} pathname={pathname} />
    </div>
  );
}

interface NavigationProps {
  readonly items: readonly NavigationItem[];
  readonly pathname: string;
}

/** Desktop navigation: labelled pills on a frosted bar, the current page in white. */
function TopNavigation({ items, pathname }: NavigationProps) {
  return (
    <nav aria-label="Principal" className="hidden md:block">
      <ul className="flex items-center gap-1 rounded-full border border-white/15 bg-black/25 p-1 backdrop-blur-md">
        {items.map((item) => {
          const isActive = item.to === pathname;
          return (
            <li key={item.label}>
              <Link
                to={item.to}
                aria-current={isActive ? "page" : undefined}
                data-active={isActive}
                className="relative flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium text-white/85 transition-colors hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none data-[active=true]:bg-white data-[active=true]:text-neutral-950 [&>svg]:size-4"
              >
                <item.icon aria-hidden="true" />
                {item.label}
                {item.hasNews === true && <NewsDot />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Phone navigation: a tab bar fixed at the bottom, icon over label. */
function BottomNavigation({ items, pathname }: NavigationProps) {
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <ul className="flex">
        {items.map((item) => {
          const isActive = item.to === pathname;
          return (
            <li key={item.label} className="flex-1">
              <Link
                to={item.to}
                aria-current={isActive ? "page" : undefined}
                data-active={isActive}
                className="relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset data-[active=true]:text-brand [&>svg]:size-5"
              >
                <item.icon aria-hidden="true" />
                {item.label}
                {item.hasNews === true && <NewsDot />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function TodayLabel() {
  // Authenticated routes render only in the browser, so this is the visitor's current day.
  const [today] = useState(() => formatLongDate(new Date()));
  return (
    <p className="hidden truncate text-sm font-medium text-white/85 first-letter:uppercase xl:block">
      {today}
    </p>
  );
}

const HEADER_BUTTON_CLASS =
  "relative flex size-10 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none [&>svg]:size-5";

function ThemeButton() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      className={HEADER_BUTTON_CLASS}
      aria-label={isDark ? "Usar tema claro" : "Usar tema escuro"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <MoonIcon aria-hidden="true" /> : <SunIcon aria-hidden="true" />}
    </button>
  );
}

/** Lines shown in the bell menu; the footer link leads to the rest. */
const MAX_NOTIFICATIONS_SHOWN = 5;

function NotificationsMenu({ to, label, emptyMessage, items }: NotificationsProps) {
  const shown = items.slice(0, MAX_NOTIFICATIONS_SHOWN);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Notificações" className={HEADER_BUTTON_CLASS}>
          <BellIcon aria-hidden="true" />
          {items.length > 0 && <NewsDot />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Notificações</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {shown.length === 0 && (
            <p className="px-2 py-3 text-sm text-muted-foreground">{emptyMessage}</p>
          )}
          {shown.map((item) => (
            <DropdownMenuItem key={item.id} asChild>
              <Link to={to} className="flex flex-col items-start gap-0.5">
                <span className="w-full truncate font-medium">{item.title}</span>
                <span className="w-full truncate text-xs text-muted-foreground">
                  {item.description}
                </span>
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to={to} className="font-medium">
              {label}
              {items.length > shown.length && ` ()`}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Small orange dot in the top-right corner of its (relatively positioned) parent. */
function NewsDot() {
  return (
    <>
      <span className="sr-only">(há novidades)</span>
      <span
        aria-hidden="true"
        className="absolute top-1.5 right-1.5 size-2 rounded-full bg-brand ring-2 ring-black/40"
      />
    </>
  );
}

// The logo is used as a mask so a single SVG takes the text colour (white on the header band).
const LOGO_MASK = {
  maskImage: "url(/brand/nelcota-logo.svg)",
  maskSize: "contain",
  maskRepeat: "no-repeat",
  maskPosition: "left center",
} satisfies CSSProperties;

/** The horizontal Nelcota logo (emblem and wordmark), decorative: label its container. */
function BrandLogo() {
  return <span aria-hidden="true" style={LOGO_MASK} className="block h-7 w-[104px] bg-current" />;
}

interface AccountMenuProps {
  readonly userName: string | null;
  readonly userEmail: string | null;
  readonly onSignOut: () => void;
  readonly onChangePassword: () => void;
}

function AccountMenu({ userName, userEmail, onSignOut, onChangePassword }: AccountMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-11 gap-3 rounded-full px-1.5 text-white hover:bg-white/15 hover:text-white lg:pr-3"
          aria-label="Menu da conta"
        >
          <Avatar className="size-9">
            <AvatarFallback className="bg-white/20 text-xs font-semibold text-white">
              {initialsOf(userName)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden flex-col items-start leading-tight lg:flex">
            <span className="max-w-44 truncate text-sm font-semibold">
              {userName ?? "Minha conta"}
            </span>
            {userEmail != null && (
              <span className="max-w-44 truncate text-xs font-normal text-white/80">
                {userEmail}
              </span>
            )}
          </span>
          <ChevronDownIcon aria-hidden="true" className="hidden lg:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">{userName ?? "Minha conta"}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={onChangePassword}>
            <KeyRoundIcon />
            Alterar senha
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onSignOut}>
            <LogOutIcon />
            Sair
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
