import * as React from "react"
import { Command, FlaskConical, Grid2X2Check, GitBranch, Sparkles, Video } from "lucide-react"

import { NavMain } from "@/components/sidebar/nav-main"
import { NavUser } from "@/components/sidebar/nav-user"
import { UsageTracker } from "@/components/sidebar/usage-tracker"
import { ActivityStatusPill } from "@/components/sidebar/activity-status-pill"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useAuth } from "@/context/AuthContext"

const baseNavMain = [
  {
    title: "Today",
    url: "/today",
    icon: Grid2X2Check,
  },
  {
    title: "Pipeline",
    url: "/pipeline",
    icon: GitBranch,
  },
  {
    title: "AI",
    url: "/ai",
    icon: Sparkles,
  },
  {
    title: "Meetings",
    url: "/meetings",
    icon: Video,
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth()
  const navMain = React.useMemo(() => {
    if (user?.user?.RadiantAdmin) {
      return [
        ...baseNavMain,
        {
          title: "AI Evals",
          url: "/admin/evals",
          icon: FlaskConical,
        },
      ];
    }
    return baseNavMain;
  }, [user]);

  // Build display user with fallbacks for loading states
  const userForNav = {
    name: `${user?.user.firstName} ${user?.user.lastName}` || "Loading...",
    email: user?.user.email || "Loading...",
    avatar: user?.user.profilePicture || "/avatars/default.jpg",
  }

  // Derive organization domain for favicon lookup (falls back to user email domain)
  const orgDomain = React.useMemo(() => {
    const raw =
      user?.user?.organization?.domain ||
      user?.user?.organization?.website ||
      user?.user?.email?.split("@")[1] ||
      ""

    if (!raw) return ""

    return raw
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .trim()
  }, [user])

  const [faviconFailed, setFaviconFailed] = React.useState(false)
  const [isFaviconAnimating, setIsFaviconAnimating] = React.useState(false)
  const animationTimeoutRef = React.useRef<number | null>(null)
  const showFavicon = orgDomain && !faviconFailed
  const faviconUrl = showFavicon
    ? `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=https://${orgDomain}&size=32`
    : ""

  // Delightful micro animation on load and periodically
  React.useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (media.matches) return

    const triggerAnimation = () => {
      setIsFaviconAnimating(true)
      if (animationTimeoutRef.current) {
        window.clearTimeout(animationTimeoutRef.current)
      }
      animationTimeoutRef.current = window.setTimeout(() => {
        setIsFaviconAnimating(false)
      }, 900)
    }

    triggerAnimation() // initial
    const intervalId = window.setInterval(triggerAnimation, 24000)

    return () => {
      if (animationTimeoutRef.current) {
        window.clearTimeout(animationTimeoutRef.current)
      }
      window.clearInterval(intervalId)
    }
  }, [])

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="#">
                <div
                  className={`flex aspect-square size-8 items-center justify-center rounded-lg overflow-hidden ${
                    showFavicon
                      ? "bg-white border border-sidebar-border/60 text-sidebar-foreground"
                      : "bg-sidebar-primary text-sidebar-primary-foreground"
                  }`}
                  style={
                    isFaviconAnimating
                      ? { animation: "favicon-wiggle 0.9s ease-in-out" }
                      : undefined
                  }
                >
                  {showFavicon ? (
                    <img
                      src={faviconUrl}
                      alt={`${user?.user?.organization?.name || "Organization"} favicon`}
                      className="h-5 w-5 object-contain"
                      onError={() => setFaviconFailed(true)}
                    />
                  ) : (
                    <Command className="size-4" />
                  )}
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">
                    {user?.user?.organization?.name || "Loading..."}
                  </span>
                  <span className="truncate text-xs text-gray-400">v{__APP_VERSION__}</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter>
        <div className="space-y-2">
          <ActivityStatusPill className="w-full" />
          <UsageTracker className="w-full" />
          <NavUser user={userForNav} />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}


