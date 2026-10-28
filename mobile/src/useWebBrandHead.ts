import { useEffect } from "react";
import { Platform } from "react-native";
import brand from "./brand.generated.json";

export function useWebBrandHead() {
  useEffect(() => {
    if (Platform.OS !== "web") return;
    document.title = brand.title;
    const links = [
      { rel: "icon", href: "/brand/favicon-64.png", sizes: "64x64" },
      {
        rel: "apple-touch-icon",
        href: "/brand/apple-touch-icon.png",
        sizes: "180x180",
      },
    ].map(({ rel, href, sizes }) => {
      const link = document.createElement("link");
      link.rel = rel;
      link.href = href;
      link.sizes.value = sizes;
      link.type = "image/png";
      document.head.appendChild(link);
      return link;
    });
    return () => {
      links.forEach((link) => link.remove());
    };
  }, []);
}
