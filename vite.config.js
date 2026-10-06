import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// L'appli est publiée sur GitHub Pages à l'adresse https://<compte>.github.io/dysorga/
export default defineConfig({
  base: "/dysorga/",
  plugins: [
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      injectRegister: false,
      injectManifest: { injectionPoint: "self.__WB_MANIFEST" },
      devOptions: { enabled: true, type: "module" },
      manifest: {
        name: "DysOrga",
        short_name: "DysOrga",
        description: "Devoirs, cartes mentales et mini-tests, pensés pour les élèves dys.",
        lang: "fr",
        start_url: "/dysorga/",
        scope: "/dysorga/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#EEF3F7",
        theme_color: "#1F5FBF",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
