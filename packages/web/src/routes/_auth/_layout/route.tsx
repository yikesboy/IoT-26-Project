import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  TooltipProvider,
  useSidebar,
} from "@/components/ui";
import { authClient } from "@/lib/auth/client";
import { createFileRoute, Link, Outlet, useRouter } from "@tanstack/react-router";
import {
  ChartColumnIcon,
  ChevronsUpDownIcon,
  LogOutIcon,
  PanelLeftCloseIcon,
  PanelRightCloseIcon,
  PiggyBankIcon,
  UserIcon,
} from "lucide-react";

export const Route = createFileRoute("/_auth/_layout")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <TooltipProvider>
      <SidebarProvider className="h-svh min-h-0 overflow-hidden">
        <AppSidebar />
        <main className="h-svh min-h-0 grow min-w-0 overflow-hidden">
          <Outlet />
        </main>
      </SidebarProvider>
    </TooltipProvider>
  );
}

function AppSidebar() {
  const { open, toggleSidebar } = useSidebar();
  const router = useRouter();
  const user = authClient.useSession()?.data?.user || null;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenuItem>
          <SidebarMenuButton asChild>
            <Link to={"/"}>
              <PiggyBankIcon className="size-5!" />
              <span className="font-bold">Budget Manager</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link to={"/"}>
                  <ChartColumnIcon />
                  <span>Dashboard</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenuItem>
          <SidebarMenuButton asChild onClick={toggleSidebar}>
            <div className="cursor-pointer select-none">
              {open ? <PanelLeftCloseIcon /> : <PanelRightCloseIcon />}
              <span>Collapse Sidebar</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {user ? (
          <SidebarMenuItem>
            <Popover>
              <PopoverTrigger asChild>
                <SidebarMenuButton asChild>
                  <div className="h-fit flex gap-2 cursor-pointer">
                    <UserIcon className="size-4" />
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="font-semibold truncate">{user.name}</span>
                      <span className="truncate text-xs">{user.email}</span>
                    </div>
                    <div className="ml-auto">
                      <ChevronsUpDownIcon className="size-4" />
                    </div>
                  </div>
                </SidebarMenuButton>
              </PopoverTrigger>
              <PopoverContent side="right" className="p-0 w-32">
                <Button
                  onClick={async () => {
                    await authClient.signOut({
                      fetchOptions: {
                        onSuccess: async () => {
                          await router.invalidate();
                          void router.navigate({ to: "/login" });
                        },
                      },
                    });
                  }}
                  className="cursor-pointer flex justify-start text-red-600 hover:text-red-400"
                  variant={"outline"}
                >
                  <LogOutIcon className="size-4" /> Logout
                </Button>
              </PopoverContent>
            </Popover>
          </SidebarMenuItem>
        ) : (
          <></>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
