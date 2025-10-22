'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { 
  BarChart3, 
  Package, 
  Filter, 
  LogOut, 
  User,
  Building2,
  TrendingUp,
  Search
} from 'lucide-react';

interface User {
  username: string;
  role: string;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isClient, setIsClient] = useState(false);
  const router = useRouter();

  // Primer useEffect: Marcar que estamos en el cliente
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Segundo useEffect: Verificar autenticación solo cuando estamos en el cliente
  useEffect(() => {
    if (!isClient) return;

    const checkAuth = () => {
      const token = localStorage.getItem('token');
      const userData = localStorage.getItem('user');
      const authStatus = localStorage.getItem('isAuthenticated');

      console.log('Dashboard: Token:', !!token);
      console.log('Dashboard: UserData:', userData);
      console.log('Dashboard: AuthStatus:', authStatus);

      if (!token || !userData || authStatus !== 'true') {
        console.log('Dashboard: Falta información de autenticación, redirigiendo al login');
        router.push('/');
        return;
      }

      try {
        const parsedUser = JSON.parse(userData);
        console.log('Dashboard: Usuario parseado:', parsedUser);
        
        if (parsedUser.role !== 'user') {
          console.log('Dashboard: Usuario no es "user", redirigiendo a admin');
          router.push('/admin');
          return;
        }
        
        console.log('Dashboard: Autenticación exitosa, cargando dashboard');
        setUser(parsedUser);
        setIsAuthenticated(true);
      } catch (error) {
        console.error('Dashboard: Error parsing user data:', error);
        router.push('/');
      }
    };

    // Pequeño delay para asegurar que localStorage se haya actualizado
    const timeoutId = setTimeout(checkAuth, 100);
    
    return () => clearTimeout(timeoutId);
  }, [router, isClient]);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('isAuthenticated');
    }
    router.push('/');
  };

  // Mostrar loading mientras no estemos en el cliente o mientras verificamos autenticación
  if (!isClient || (!isAuthenticated && !user)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <Sidebar className="border-r border-gray-200 bg-white">
          <SidebarHeader className="border-b border-gray-200 p-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Dashboard</h2>
                <p className="text-sm text-gray-500">Sistema de Inventario</p>
              </div>
            </div>
          </SidebarHeader>
          
          <SidebarContent className="p-4">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild 
                  className="w-full justify-start hover:bg-blue-50 hover:text-blue-700"
                >
                  <a href="/dashboard" className="flex items-center space-x-3 px-3 py-2">
                    <BarChart3 className="w-5 h-5" />
                    <span>Resumen General</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              
              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild 
                  className="w-full justify-start hover:bg-blue-50 hover:text-blue-700"
                >
                  <a href="/dashboard/inventory" className="flex items-center space-x-3 px-3 py-2">
                    <Package className="w-5 h-5" />
                    <span>Inventario</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
          
          <div className="mt-auto p-4 border-t border-gray-200">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user!.username}
                </p>
                <p className="text-xs text-gray-500 capitalize">{user!.role}</p>
              </div>
            </div>
            
            <Button 
              onClick={handleLogout}
              variant="outline" 
              size="sm" 
              className="w-full justify-start text-red-600 border-red-200 hover:bg-red-50"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Cerrar Sesión
            </Button>
          </div>
        </Sidebar>

        <div className="flex-1 flex flex-col">
          <header className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <SidebarTrigger className="lg:hidden" />
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    Sistema de Inventario
                  </h1>
                  <p className="text-sm text-gray-500">
                    Gestión y control de inventario empresarial
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">
                    Bienvenido, {user!.username}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date().toLocaleDateString('es-ES', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}