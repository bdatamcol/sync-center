"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const loginSchema = z.object({
  username: z.string().min(1, "El usuario es requerido"),
  password: z.string().min(1, "La contraseña es requerida"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setError("");

    try {
      // Intentar autenticación con API externa
      const { apiService } = await import("@/lib/api");
      const response = await apiService.login({
        username: data.username,
        password: data.password,
      });

      if (response.success) {
        // Autenticación exitosa con API
        localStorage.setItem("isAuthenticated", "true");
        localStorage.setItem("user", JSON.stringify(response.user || { username: data.username }));
        
        // Redireccionar según el rol del usuario
        if (response.user?.role === "user") {
          // Usar replace para evitar problemas de navegación
          router.push("/dashboard");
        } else {
          router.push("/admin");
        }
      } else {
        // Fallback a credenciales locales si la API falla
        if (data.username === "admin" && data.password === "1q2w3e4r") {
          // Establecer token local para el modo fallback
          apiService.setLocalToken(data.username);
          localStorage.setItem("isAuthenticated", "true");
          localStorage.setItem("user", JSON.stringify({ username: "admin" }));
          router.push("/admin");
        } else {
          setError(response.error || "Credenciales incorrectas");
        }
      }
    } catch (error) {
      // Fallback a credenciales locales en caso de error
      if (data.username === "admin" && data.password === "1q2w3e4r") {
        const { apiService } = await import("@/lib/api");
        // Establecer token local para el modo fallback
        apiService.setLocalToken(data.username);
        localStorage.setItem("isAuthenticated", "true");
        localStorage.setItem("user", JSON.stringify({ username: "admin" }));
        router.push("/admin");
      } else {
        setError("Error de conexión. Intenta nuevamente.");
      }
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">Iniciar Sesión</CardTitle>
          <CardDescription className="text-center">
            Ingresa tus credenciales para acceder al panel de administración
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Usuario</FormLabel>
                    <FormControl>
                      <Input placeholder="Ingresa tu usuario" {...field} className="cursor-text" />
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
                    <FormLabel>Contraseña</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Ingresa tu contraseña" {...field} className="cursor-text" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {error && (
                <div className="text-red-500 text-sm text-center">{error}</div>
              )}
              <Button type="submit" className="w-full cursor-pointer hover:bg-gray-100" disabled={isLoading}>
                {isLoading ? "Iniciando sesión..." : "Iniciar Sesión"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
