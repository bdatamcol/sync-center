import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  turbopack: {
    // Fijar la raíz del workspace a esta carpeta del proyecto
    // Recomendación oficial: usar ruta absoluta
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
