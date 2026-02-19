"use client"

import {
  ChevronsUpDown,
  LogOut,
  Settings,
  Bell,
  BookOpen,
} from "lucide-react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useAuthOperations } from "@/hooks/useAuthOperations"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
import { useChangelog } from "@/hooks/useChangelog"
import { NotificationDot } from "@/components/sidebar/NotificationDot"
export function NavUser({
  user,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
}) {
  const { isMobile } = useSidebar()
  const navigate = useNavigate()
  const { logout } = useAuthOperations()
  const { user: authUser } = useAuth()
  const { unreadCount } = useChangelog()
  async function handleLogout() {
    try {
      await logout()
    } finally {
      navigate("/login", { replace: true })
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="relative">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg">{authUser.user.firstName.charAt(0).toUpperCase() + authUser.user.lastName.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <NotificationDot show={unreadCount > 0} />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{authUser.user.firstName.charAt(0).toUpperCase() + authUser.user.firstName.slice(1)} {authUser.user.lastName.charAt(0).toUpperCase() + authUser.user.lastName.slice(1)}</span>
                <span className="truncate text-xs">{authUser.user.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg">{authUser.user.firstName.charAt(0).toUpperCase() + authUser.user.lastName.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="group"
              onSelect={(e) => { e.preventDefault(); navigate("/changelog") }}
            >
              <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                <Bell
                  className={`h-4 w-4 transition-opacity ${
                    unreadCount > 0
                      ? "group-hover:opacity-0 group-data-[highlighted]:opacity-0 group-data-[state=open]:opacity-0"
                      : ""
                  }`}
                />
                {unreadCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="absolute inset-0 flex h-5 min-w-5 items-center justify-center rounded-full border border-green-200 bg-green-50 px-1.5 py-0 text-[11px] font-medium text-green-700 opacity-0 transition-opacity group-hover:opacity-100 group-data-[highlighted]:opacity-100 group-data-[state=open]:opacity-100"
                  >
                    {unreadCount}
                  </Badge>
                )}
              </span>
              <span className="flex items-center gap-2">
                Changelog
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); navigate("/directory") }}>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                <BookOpen />
              </span>
              Directory
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); navigate("/settings") }}>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                <Settings />
              </span>
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void handleLogout() }}>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                <LogOut />
              </span>
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}


