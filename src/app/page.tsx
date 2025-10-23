"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import Image from "next/image"

const loginSchema = z.object({
  username: z.string().min(1, "El usuario es requerido"),
  password: z.string().min(1, "La contraseña es requerida"),
})

type LoginFormData = z.infer<typeof loginSchema>

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  })

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true)
    setError("")

    try {
      // Intentar autenticación con API externa
      const { apiService } = await import("@/lib/api")
      const response = await apiService.login({
        username: data.username,
        password: data.password,
      })

      if (response.success) {
        // Autenticación exitosa con API
        localStorage.setItem("isAuthenticated", "true")
        localStorage.setItem("user", JSON.stringify(response.user || { username: data.username }))

        // Redireccionar según el rol del usuario
        if (response.user?.role === "user") {
          // Usar replace para evitar problemas de navegación
          router.push("/dashboard")
        } else {
          router.push("/admin")
        }
      } else {
        // Fallback a credenciales locales si la API falla
        if (data.username === "admin" && data.password === "1q2w3e4r") {
          // Establecer token local para el modo fallback
          apiService.setLocalToken(data.username)
          localStorage.setItem("isAuthenticated", "true")
          localStorage.setItem("user", JSON.stringify({ username: "admin" }))
          router.push("/admin")
        } else {
          setError(response.error || "Credenciales incorrectas")
        }
      }
    } catch (error) {
      // Fallback a credenciales locales en caso de error
      if (data.username === "admin" && data.password === "1q2w3e4r") {
        const { apiService } = await import("@/lib/api")
        // Establecer token local para el modo fallback
        apiService.setLocalToken(data.username)
        localStorage.setItem("isAuthenticated", "true")
        localStorage.setItem("user", JSON.stringify({ username: "admin" }))
        router.push("/admin")
      } else {
        setError("Error de conexión. Intenta nuevamente.")
      }
    }

    setIsLoading(false)
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side - Decorative panel with gradient */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary via-secondary to-primary/80 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(255,255,255,0.08),transparent_40%)]" />

        <div className="relative z-10 flex flex-col justify-center px-12 lg:px-16 xl:px-24 text-primary-foreground">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 w-fit">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="text-sm font-medium">Sistema en línea</span>
            </div>

            <h1 className="text-5xl xl:text-6xl font-bold leading-tight text-balance">
              Gestiona tu inventario con{" "}
              <span className="relative inline-block">
                <span className="relative z-10">precisión</span>
                <span className="absolute bottom-2 left-0 w-full h-3 bg-accent/30 -rotate-1" />
              </span>
            </h1>

            <p className="text-lg text-primary-foreground/80 leading-relaxed max-w-md text-pretty">
              Sincroniza, controla y optimiza tu inventario en tiempo real con Syncenter.
            </p>
          </div>
        </div>
      </div>

      {/* Right side - Login form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-background">
        <div className="w-full max-w-md">
          <Card className="border-2 shadow-xl">
            <CardHeader className="space-y-2">
              <div className="flex justify-center">
                <Image src="/syn-2.png" alt="Sync Center" width={180} height={54} priority className="h-auto w-auto" />
              </div>
              <div className="">
                <CardDescription className="text-center text-base text-pretty">
                  Ingresa tus credenciales para acceder
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pb-2">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-semibold">Usuario</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Ingresa tu usuario"
                            {...field}
                            className="h-11 cursor-text border-2 focus-visible:ring-primary/20 focus-visible:border-primary transition-colors"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-semibold">Contraseña</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Ingresa tu contraseña"
                            {...field}
                            className="h-11 cursor-text border-2 focus-visible:ring-primary/20 focus-visible:border-primary transition-colors"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {error && (
                    <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
                      <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {error}
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-11 text-base font-semibold bg-primary hover:bg-primary/90 cursor-pointer transition-all shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Iniciando sesión...
                      </span>
                    ) : (
                      "Iniciar Sesión"
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <div className="mt-8 text-center text-sm text-muted-foreground">
            <p>Protegido con encriptación de nivel empresarial</p>
          </div>
        </div>
      </div>
    </div>
  )
}
