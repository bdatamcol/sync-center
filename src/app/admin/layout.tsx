"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Home, Package, LogOut, History, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { apiService } from "@/lib/api"
import Image from "next/image"

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
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isClient, setIsClient] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    if (!isClient) return

    const checkAuth = () => {
      const authStatus = localStorage.getItem("isAuthenticated")
      const hasApiToken = apiService.isAuthenticated()

      if (authStatus === "true" && hasApiToken) {
        setIsAuthenticated(true)
      } else {
        if (typeof window !== "undefined") {
          localStorage.removeItem("isAuthenticated")
          localStorage.removeItem("user")
          localStorage.removeItem("token")
        }
        router.push("/")
      }
      setIsLoading(false)
    }

    checkAuth()
  }, [router, isClient])

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("isAuthenticated")
      localStorage.removeItem("user")
      localStorage.removeItem("token")
    }

    apiService.logout()
    router.push("/")
  }

  if (!isClient || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin"></div>
          <div className="text-lg font-medium text-foreground">Cargando...</div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <Sidebar className="border-r border-border/50 bg-card/80 backdrop-blur-sm">
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="my-4 flex justify-center py-8 px-4 bg-gradient-to-br from-primary/10 to-secondary/10 rounded-lg mx-2">
                <Image src="/syn-2.png" alt="Sync Center" width={140} height={40} className="h-auto w-auto" />
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="space-y-2 px-2">
                  {menuItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <a
                          href={item.url}
                          className="flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all duration-200 hover:bg-primary/10 hover:text-primary hover:translate-x-1 group"
                        >
                          <item.icon className="h-5 w-5 transition-transform group-hover:scale-110" />
                          <span className="font-medium">{item.title}</span>
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
                className="w-full flex items-center gap-3 cursor-pointer hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50 transition-all duration-200 py-6 group bg-transparent"
              >
                <LogOut className="h-5 w-5 transition-transform group-hover:scale-110" />
                <span className="font-medium">Cerrar Sesión</span>
              </Button>
            </div>
          </SidebarContent>
        </Sidebar>
        <main className="flex-1 p-8">
          <div className="mb-6">
            <SidebarTrigger className="hover:bg-primary/10 hover:text-primary transition-colors" />
          </div>
          {children}
        </main>
      </div>
    </SidebarProvider>
  )
}
