import type { ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

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
            Open Source &amp; Self-Hosted
          </div>
          <Heading as="h1" className={styles.heroTitle}>
            Your Personal<br />
            <span className={styles.heroGradient}>3D Asset Library</span>
          </Heading>
          <p className={styles.heroSubtitle}>
            Organize, preview, and manage your 3D models with automatic animated thumbnails,
            version control, and seamless Blender integration. All on your own hardware.
          </p>
          <div className={styles.buttons}>
            <Link className={clsx('button button--lg', styles.primaryButton)} to="/docs">
              <span className={styles.buttonIcon}>🚀</span>
              Get Started
            </Link>
            <Link className={clsx('button button--lg', styles.secondaryButton)} href="https://github.com/Papyszoo/Modelibr">
              <span className={styles.buttonIcon}>⭐</span>
              Star on GitHub
            </Link>
          </div>
          <div className={styles.heroStats}>
            <div className={styles.stat}>
              <span className={styles.statValue}>100%</span>
              <span className={styles.statLabel}>Offline</span>
            </div>
            <div className={styles.statDivider}></div>
            <div className={styles.stat}>
              <span className={styles.statValue}>MIT</span>
              <span className={styles.statLabel}>Licensed</span>
            </div>
            <div className={styles.statDivider}></div>
            <div className={styles.stat}>
              <span className={styles.statValue}>∞</span>
              <span className={styles.statLabel}>Models</span>
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
    title: '3D Artists',
    emoji: '🎨',
    painPoint: 'Assets scattered across folders, impossible to find that perfect model',
    solution: 'Visual library with search, tags, and automatic 360° thumbnails',
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  {
    title: 'Game Dev Teams',
    emoji: '🎮',
    painPoint: 'No central place for shared assets, everyone has different versions',
    solution: 'Self-hosted server with version control everyone can access',
    gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  },
  {
    title: 'Hobbyists',
    emoji: '📦',
    painPoint: 'Downloaded assets from the web get lost and forgotten',
    solution: 'Organize, preview, and rediscover your entire collection',
    gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  },
];

function AudienceCard({ title, emoji, painPoint, solution, gradient }: AudienceItem) {
  return (
    <div className={clsx('col col--4', styles.audienceCol)}>
      <div className={styles.audienceCard}>
        <div className={styles.audienceIcon} style={{ background: gradient }}>
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
    title: 'Animated Thumbnails',
    icon: '🎬',
    description: 'Every model gets a rotating 360° preview. No more guessing what\'s inside a file.',
  },
  {
    title: 'Version Control',
    icon: '📚',
    description: 'Keep multiple versions of each model. Rollback anytime, never lose work.',
  },
  {
    title: 'PBR Texture Sets',
    icon: '🎨',
    description: 'Organize your materials with full PBR support. Preview on any shape in real-time.',
  },
  {
    title: 'Blender Addon',
    icon: '🔌',
    description: 'Import and export directly from Blender. Your library, one click away.',
  },
  {
    title: 'Smart Deduplication',
    icon: '💾',
    description: 'Upload the same file twice? Storage is shared automatically. Save disk space.',
  },
  {
    title: 'Self-Hosted & Private',
    icon: '🔒',
    description: 'Your data stays on your hardware. Works 100% offline. No subscriptions.',
  },
];

function FeatureCard({ title, icon, description, highlight }: FeatureItem) {
  return (
    <div className={clsx('col col--4', styles.featureCol)}>
      <div className={clsx(styles.featureCard, highlight && styles.featureCardHighlight)}>
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
    number: '01',
    title: 'Run with Docker',
    description: 'One command. No dependencies to install. Works on any platform.',
    code: 'docker compose up -d',
  },
  {
    number: '02',
    title: 'Access the App',
    description: 'Open your browser and go to:',
    code: 'http://localhost:3000',
  },
  {
    number: '03',
    title: 'Drag & Drop',
    description: 'Upload your 3D models by dragging them into the browser. Browse with animated thumbnails.',
  },
];

function StepCard({ number, title, description, code }: StepItem) {
  return (
    <div className={clsx('col col--4', styles.stepCol)}>
      <div className={styles.stepCard}>
        <div className={styles.stepNumber}>{number}</div>
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
        {code && (
          <div className={styles.stepCodeBlock}>
            <code>{code}</code>
            <button className={styles.copyButton} title="Copy" onClick={() => navigator.clipboard.writeText(code)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
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
          <Heading as="h2">Ready to organize your 3D assets?</Heading>
          <p>Free and open source. No account needed. No data leaves your machine.</p>
          <div className={styles.buttons}>
            <Link className={clsx('button button--lg', styles.primaryButton)} to="/docs">
              Read the Documentation
            </Link>
            <Link className={clsx('button button--lg', styles.ghostButton)} href="https://discord.gg/KgwgTDVP3F">
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
      title="Your Personal 3D Asset Library"
      description="Self-hosted 3D model library. Organize, preview, and manage your 3D assets with automatic thumbnails, version control, and Blender integration.">
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
