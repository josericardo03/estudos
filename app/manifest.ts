import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Foco · estudo por blocos",
    short_name: "Foco",
    description: "Leitor de PDF com grifos, cadernão, banco de questões e revisão espaçada.",
    start_url: "/hoje",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f3f0e8",
    theme_color: "#1b4334",
    lang: "pt-BR",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
