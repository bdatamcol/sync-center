"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Home, Package, LogOut, History, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiService } from "@/lib/api";

const menuItems = [
  {
    title: "Escritorio",
    url: "/admin",
    icon: Home,
  },
  {
    title: "Productos en Novasoft",
    url: "/admin/productos",
    icon: Package,
  },
  {
    title: "Productos sin relacionar",
    url: "/admin/productos-sin-relacionar",
    icon: AlertCircle,
  },
  {
    title: "Historial de Cron",
    url: "/admin/cron",
    icon: History,
  },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const router = useRouter();

  // Primer useEffect: Marcar que estamos en el cliente
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Segundo useEffect: Verificar autenticación solo cuando estamos en el cliente
  useEffect(() => {
    if (!isClient) return;

    // Verificar autenticación con el apiService
    const checkAuth = () => {
      const authStatus = localStorage.getItem("isAuthenticated");
      const hasApiToken = apiService.isAuthenticated();
      
      if (authStatus === "true" && hasApiToken) {
        setIsAuthenticated(true);
      } else {
        // Limpiar datos de autenticación si están inconsistentes
        if (typeof window !== 'undefined') {
          localStorage.removeItem("isAuthenticated");
          localStorage.removeItem("user");
          localStorage.removeItem("token");
        }
        router.push("/");
      }
      setIsLoading(false);
    };

    checkAuth();
  }, [router, isClient]);

  const handleLogout = () => {
    // Limpiar todos los datos de autenticación
    if (typeof window !== 'undefined') {
      localStorage.removeItem("isAuthenticated");
      localStorage.removeItem("user");
      localStorage.removeItem("token");
    }
    
    // Limpiar también el token del apiService
    apiService.logout();
    
    // Redirigir al login
    router.push("/");
  };

  if (!isClient || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Cargando...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="text-lg font-semibold mb-4">
                Panel de Administración
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {menuItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <a href={item.url} className="flex items-center gap-2 cursor-pointer hover:bg-gray-100">
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <div className="mt-auto p-4">
              <Button
                onClick={handleLogout}
                variant="outline"
                className="w-full flex items-center gap-2 cursor-pointer hover:bg-gray-100"
              >
                <LogOut className="h-4 w-4" />
                Cerrar Sesión
              </Button>
            </div>
          </SidebarContent>
        </Sidebar>
        <main className="flex-1 p-6">
          <div className="mb-4">
            <SidebarTrigger />
          </div>
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}