import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenuButton } from "@/components/ui/sidebar"
import { UserProfile } from "@/lib/auth"
import { authClient } from "@/lib/auth-client"
import { PLANS } from "@/lib/stripe"
import { formatBytes } from "@/lib/utils"
import { Check, CreditCard, LogOut, MoreVertical, Settings, Sparkles, User, Users } from "lucide-react"
import Link from "next/link"
import { redirect, useRouter } from "next/navigation"
import { switchUserAction } from "@/app/(app)/settings/users/actions"

type SimpleUser = {
  id: string
  name: string
  email: string
  avatar: string | null
  isAdmin: boolean
}

export default function SidebarUser({
  profile,
  isSelfHosted,
  allUsers = [],
}: {
  profile: UserProfile
  isSelfHosted: boolean
  allUsers?: SimpleUser[]
}) {
  const router = useRouter()

  const signOut = async () => {
    await authClient.signOut({})
    redirect("/")
  }

  const handleSwitchUser = async (userId: string) => {
    const formData = new FormData()
    formData.set("userId", userId)
    await switchUserAction(null, formData)
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="default"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <Avatar className="h-6 w-6 rounded-full bg-sidebar-accent">
            <AvatarImage src={profile.avatar} alt={profile.name || ""} />
            <AvatarFallback className="rounded-full bg-sidebar-accent text-sidebar-accent-foreground">
              <User className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <span className="truncate font-medium">{profile.name || profile.email}</span>
          <MoreVertical className="ml-auto size-4" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
        side="top"
        align="center"
        sideOffset={4}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <Avatar className="h-8 w-8 rounded-lg">
              <AvatarImage src={profile.avatar} alt={profile.name || ""} />
              <AvatarFallback className="rounded-lg">
                <User className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{profile.name || profile.email}</span>
              <span className="truncate text-xs">{profile.email}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/settings/profile" className="flex items-center gap-2">
              <Sparkles />
              <span className="truncate">{PLANS[profile.membershipPlan as keyof typeof PLANS].name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{formatBytes(profile.storageUsed)} used</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </DropdownMenuItem>
          {!isSelfHosted && (
            <DropdownMenuItem asChild>
              <Link href="/api/stripe/portal" className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Billing
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        {isSelfHosted && allUsers.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Switch User
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {allUsers.map((user) => (
                  <DropdownMenuItem
                    key={user.id}
                    onClick={() => handleSwitchUser(user.id)}
                    className="flex items-center gap-2"
                  >
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={user.avatar || undefined} alt={user.name} />
                      <AvatarFallback className="text-xs">
                        <User className="h-3 w-3" />
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex-1">{user.name}</span>
                    {user.id === profile.id && <Check className="h-4 w-4 text-primary" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings/users" className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Manage Users
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
        {!isSelfHosted && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <span onClick={signOut} className="flex items-center gap-2 text-red-600 cursor-pointer">
                <LogOut className="h-4 w-4" />
                Log out
              </span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
