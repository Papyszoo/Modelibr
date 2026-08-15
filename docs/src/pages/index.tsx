import type { ReactNode } from "react";
import clsx from "clsx";
import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import Heading from "@theme/Heading";

import styles from "./index.module.css";

function HomepageHeader() {
    return (
        <header className={styles.heroBanner}>
            <div className={styles.heroBackground}>
                <div className={styles.heroGlow}></div>
                <div className={styles.heroGrid}></div>
            </div>
            <div className="container">
                <div className={styles.heroContent}>
                    <div className={styles.badge}>
                        <span className={styles.badgeIcon}>✨</span>
                        Self-Hosted &amp; Local-First
                    </div>
                    <Heading as="h1" className={styles.heroTitle}>
                        Your Personal
                        <br />
                        <span className={styles.heroGradient}>
                            Game Asset Library
                        </span>
                    </Heading>
                    <p className={styles.heroSubtitle}>
                        Organize and preview your 3D models, textures, sprites,
                        sounds, and scripts in one place - with animated
                        thumbnails, version history, and a Blender-ready WebDAV
                        drive. All on your own hardware.
                    </p>
                    <div className={styles.buttons}>
                        <Link
                            className={clsx(
                                "button button--lg",
                                styles.primaryButton,
                            )}
                            href="https://modelibr.com/demo/"
                        >
                            <span className={styles.buttonIcon}>🎮</span>
                            Try the Live Demo
                        </Link>
                        <Link
                            className={clsx(
                                "button button--lg",
                                styles.secondaryButton,
                            )}
                            to="/docs"
                        >
                            <span className={styles.buttonIcon}>🚀</span>
                            Get Started
                        </Link>
                    </div>
                    <div className={styles.heroStats}>
                        <div className={styles.stat}>
                            <span className={styles.statValue}>100%</span>
                            <span className={styles.statLabel}>Offline</span>
                        </div>
                        <div className={styles.statDivider}></div>
                        <div className={styles.stat}>
                            <span className={styles.statValue}>Free</span>
                            <span className={styles.statLabel}>Forever</span>
                        </div>
                        <div className={styles.statDivider}></div>
                        <div className={styles.stat}>
                            <span className={styles.statValue}>Source</span>
                            <span className={styles.statLabel}>Available</span>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}

type AudienceItem = {
    title: string;
    emoji: string;
    painPoint: string;
    solution: string;
    gradient: string;
};

const AudienceList: AudienceItem[] = [
    {
        title: "3D Artists",
        emoji: "🎨",
        painPoint:
            "Fear of ruining a model with destructive changes or losing previous iterations",
        solution:
            "Save versions before applying breaking changes. Experiment freely with full rollback capability and preview each version",
        gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    },
    {
        title: "Game Dev Teams",
        emoji: "🎮",
        painPoint:
            "No central place for shared assets, everyone has different versions",
        solution: "Self-hosted server with version control everyone can access",
        gradient: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
    },
    {
        title: "Hobbyists",
        emoji: "📦",
        painPoint: "Downloaded assets from the web get lost and forgotten",
        solution: "Organize, preview, and rediscover your entire collection",
        gradient: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
    },
];

function AudienceCard({
    title,
    emoji,
    painPoint,
    solution,
    gradient,
}: AudienceItem) {
    return (
        <div className={clsx("col col--4", styles.audienceCol)}>
            <div className={styles.audienceCard}>
                <div
                    className={styles.audienceIcon}
                    style={{ background: gradient }}
                >
                    {emoji}
                </div>
                <Heading as="h3">{title}</Heading>
                <div className={styles.painPoint}>
                    <span className={styles.label}>😤 The Problem</span>
                    <p>{painPoint}</p>
                </div>
                <div className={styles.solution}>
                    <span className={styles.label}>✅ The Solution</span>
                    <p>{solution}</p>
                </div>
            </div>
        </div>
    );
}

function AudienceSection() {
    return (
        <section className={styles.audienceSection}>
            <div className="container">
                <div className={styles.sectionHeader}>
                    <span className={styles.sectionTag}>WHO IS THIS FOR?</span>
                    <Heading as="h2" className={styles.sectionTitle}>
                        Built for creators who value their time
                    </Heading>
                </div>
                <div className="row">
                    {AudienceList.map((props, idx) => (
                        <AudienceCard key={idx} {...props} />
                    ))}
                </div>
            </div>
        </section>
    );
}

type FeatureItem = {
    title: string;
    icon: string;
    description: string;
    highlight?: boolean;
};

const FeatureList: FeatureItem[] = [
    {
        title: "Every Asset Type",
        icon: "🗂️",
        description:
            "Models, texture sets, environment maps, sprites, sounds, and scripts - one searchable library instead of scattered folders.",
    },
    {
        title: "Animated Thumbnails",
        icon: "🎬",
        description:
            "Every model gets a rotating 360° preview, sounds get waveforms. No more guessing what's inside a file.",
    },
    {
        title: "Version Control",
        icon: "📚",
        description:
            "Keep multiple versions of each model and roll back anytime. Identical files are deduplicated automatically.",
    },
    {
        title: "PBR Texture Sets",
        icon: "🎨",
        description:
            "Organize your materials with full PBR and channel-packed map support. Preview on any shape in real-time.",
    },
    {
        title: "WebDAV + Blender",
        icon: "🔌",
        description:
            "Mount your library like a network drive. Save a .blend into it and Modelibr creates a new model version automatically.",
    },
    {
        title: "Self-Hosted & Private",
        icon: "🔒",
        description:
            "Your data stays on your hardware. Works 100% offline. No subscriptions.",
    },
];

function FeatureCard({ title, icon, description, highlight }: FeatureItem) {
    return (
        <div className={clsx("col col--4", styles.featureCol)}>
            <div
                className={clsx(
                    styles.featureCard,
                    highlight && styles.featureCardHighlight,
                )}
            >
                <div className={styles.featureIcon}>{icon}</div>
                <Heading as="h3">{title}</Heading>
                <p>{description}</p>
            </div>
        </div>
    );
}

function FeaturesSection() {
    return (
        <section className={styles.featuresSection}>
            <div className="container">
                <div className={styles.sectionHeader}>
                    <span className={styles.sectionTag}>FEATURES</span>
                    <Heading as="h2" className={styles.sectionTitle}>
                        Everything you need to manage 3D assets
                    </Heading>
                </div>
                <div className="row">
                    {FeatureList.map((props, idx) => (
                        <FeatureCard key={idx} {...props} />
                    ))}
                </div>
            </div>
        </section>
    );
}

type StepItem = {
    number: string;
    title: string;
    description: string;
    code?: string;
};

const StepList: StepItem[] = [
    {
        number: "01",
        title: "Install Modelibr",
        description:
            "Download the desktop app for Windows, macOS, or Linux from GitHub Releases - it bundles everything. Prefer Docker? Clone the repo and run:",
        code: "cp .env.example .env && docker compose up -d",
    },
    {
        number: "02",
        title: "Open the App",
        description:
            "Desktop app: open it from the tray icon. Docker: point your browser at:",
        code: "https://localhost:3010",
    },
    {
        number: "03",
        title: "Drag & Drop",
        description:
            "Upload models, textures, sprites, and sounds by dragging them into the browser. Everything gets a generated preview.",
    },
];

function StepCard({ number, title, description, code }: StepItem) {
    return (
        <div className={clsx("col col--4", styles.stepCol)}>
            <div className={styles.stepCard}>
                <div className={styles.stepNumber}>{number}</div>
                <Heading as="h3">{title}</Heading>
                <p>{description}</p>
                {code && (
                    <div className={styles.stepCodeBlock}>
                        <code>{code}</code>
                        <button
                            className={styles.copyButton}
                            title="Copy"
                            onClick={() => navigator.clipboard.writeText(code)}
                        >
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <rect
                                    x="9"
                                    y="9"
                                    width="13"
                                    height="13"
                                    rx="2"
                                    ry="2"
                                ></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function HowItWorksSection() {
    return (
        <section className={styles.howItWorksSection}>
            <div className="container">
                <div className={styles.sectionHeader}>
                    <span className={styles.sectionTag}>GET STARTED</span>
                    <Heading as="h2" className={styles.sectionTitle}>
                        Up and running in 5 minutes
                    </Heading>
                </div>
                <div className="row">
                    {StepList.map((props, idx) => (
                        <StepCard key={idx} {...props} />
                    ))}
                </div>
            </div>
        </section>
    );
}

function CTASection() {
    return (
        <section className={styles.ctaSection}>
            <div className={styles.ctaGlow}></div>
            <div className="container">
                <div className={styles.ctaContent}>
                    <Heading as="h2">
                        Ready to organize your game assets?
                    </Heading>
                    <p>
                        Free and source-available. No account needed. No data
                        leaves your machine.
                    </p>
                    <div className={styles.buttons}>
                        <Link
                            className={clsx(
                                "button button--lg",
                                styles.primaryButton,
                            )}
                            to="/docs"
                        >
                            Read the Documentation
                        </Link>
                        <Link
                            className={clsx(
                                "button button--lg",
                                styles.ghostButton,
                            )}
                            href="https://discord.gg/KgwgTDVP3F"
                        >
                            Join our Discord
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
}

export default function Home(): ReactNode {
    return (
        <Layout
            title="Your Personal Game Asset Library"
            description="Self-hosted game asset library. Organize and preview 3D models, textures, sprites, sounds, and scripts with automatic thumbnails, version history, and Blender integration."
        >
            <HomepageHeader />
            <main>
                <AudienceSection />
                <FeaturesSection />
                <HowItWorksSection />
                <CTASection />
            </main>
        </Layout>
    );
}
