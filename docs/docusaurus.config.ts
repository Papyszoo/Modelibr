import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
    title: "Modelibr",
    tagline: "Self-hosted 3D asset manager and game asset library",
    favicon: "img/favicon.ico",

    future: {
        v4: true,
    },

    // Served from the apex domain at the site root.
    url: "https://modelibr.com",
    baseUrl: "/",
    // Not deployment settings - these drive the "Edit this page" GitHub links.
    organizationName: "Papyszoo",
    projectName: "Modelibr",
    trailingSlash: false,

    onBrokenLinks: "throw",

    markdown: {
        hooks: {
            onBrokenMarkdownLinks: "warn",
        },
    },

    // Custom fields for static paths that will exist after build
    staticDirectories: ["static"],

    i18n: {
        defaultLocale: "en",
        locales: ["en"],
    },

    presets: [
        [
            "classic",
            {
                docs: {
                    sidebarPath: "./sidebars.ts",
                    routeBasePath: "/docs", // Docs at /docs, landing page at root
                },
                blog: false, // Disable blog
                theme: {
                    customCss: "./src/css/custom.css",
                },
            } satisfies Preset.Options,
        ],
    ],

    themeConfig: {
        image: "img/og-modelibr.png",
        metadata: [
            { property: "og:site_name", content: "Modelibr" },
            { property: "og:type", content: "website" },
            {
                property: "og:image:alt",
                content:
                    "The Modelibr 3D model viewer showing a model with its version history",
            },
            { name: "theme-color", content: "#0f172a" },
        ],
        colorMode: {
            defaultMode: "dark",
            disableSwitch: false,
            respectPrefersColorScheme: false,
        },
        navbar: {
            title: "Modelibr",
            items: [
                {
                    type: "docSidebar",
                    sidebarId: "tutorialSidebar",
                    position: "left",
                    label: "Documentation",
                },
                {
                    // Absolute: these are copied into the build by CI after
                    // Docusaurus runs, so a root-relative href fails its
                    // broken-link check.
                    href: "https://modelibr.com/storybook/index.html",
                    label: "Storybook",
                    position: "left",
                },
                {
                    href: "https://modelibr.com/demo/",
                    label: "Live Demo",
                    position: "left",
                },

                {
                    href: "https://github.com/Papyszoo/Modelibr",
                    label: "GitHub",
                    position: "right",
                },
                {
                    href: "https://discord.gg/KgwgTDVP3F",
                    label: "Discord",
                    position: "right",
                },
            ],
        },
        footer: {
            style: "dark",
            links: [
                {
                    title: "Documentation",
                    items: [
                        {
                            label: "Getting Started",
                            to: "/docs",
                        },
                        {
                            label: "Features",
                            to: "/docs/category/features",
                        },
                        {
                            label: "MCP Server for AI Agents",
                            to: "/docs/features/mcp-server",
                        },
                        {
                            label: "Blender and WebDAV",
                            to: "/docs/features/webdav",
                        },
                    ],
                },
                {
                    title: "Community",
                    items: [
                        {
                            label: "GitHub",
                            href: "https://github.com/Papyszoo/Modelibr",
                        },
                        {
                            label: "Releases and Installers",
                            href: "https://github.com/Papyszoo/Modelibr/releases",
                        },
                        {
                            label: "Discord",
                            href: "https://discord.gg/KgwgTDVP3F",
                        },
                    ],
                },
            ],
            copyright: `Copyright © ${new Date().getFullYear()} Modelibr. Built with Docusaurus.`,
        },
        prism: {
            theme: prismThemes.github,
            darkTheme: prismThemes.dracula,
        },
    } satisfies Preset.ThemeConfig,
};

export default config;
