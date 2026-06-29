import { Link, useRouterState } from "@tanstack/react-router";
import { Calendar, LogIn, Sparkles, CalendarRange, Megaphone, Settings, LogOut, Smartphone } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions, type MenuKey } from "@/hooks/use-permissions";

type NavItem = { title: string; url: string; icon: typeof Calendar; menu: MenuKey | null };

const NAV_ITEMS: NavItem[] = [
  { title: "Reservas", url: "/reservas", icon: Calendar, menu: "reservas" },
  { title: "Check-ins de hoy", url: "/checkins", icon: LogIn, menu: "checkins" },
  { title: "Limpiezas asignadas", url: "/limpiezas", icon: Sparkles, menu: "limpiezas_asignadas" },
  { title: "Programación limpiezas", url: "/programacion-limpiezas", icon: CalendarRange, menu: "programacion_limpiezas" },
  { title: "Comunicar tareas", url: "/comunicar-tareas", icon: Megaphone, menu: "comunicar_tareas" },
  { title: "Mi día", url: "/mi-dia", icon: Smartphone, menu: "mi_dia" },
  { title: "Configuración", url: "/configuracion", icon: Settings, menu: null },
];

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user, signOut } = useAuth();
  const { canView, isAdmin } = usePermissions();
  const items = NAV_ITEMS.filter((it) => {
    if (isAdmin) return true;
    if (it.url === "/configuracion") {
      return canView("config_general") || canView("config_personal") || canView("config_apartamentos");
    }
    return it.menu ? canView(it.menu) : true;
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="px-2 py-3">
          <div className="text-lg font-semibold tracking-tight">SleepingBCN</div>
          <div className="text-xs text-muted-foreground">Gestión interna</div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operaciones</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={path === item.url || path.startsWith(item.url + "/")}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t">
        <div className="px-2 py-2 text-xs text-muted-foreground truncate">{user?.email}</div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => signOut()}>
              <LogOut className="h-4 w-4" />
              <span>Cerrar sesión</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}