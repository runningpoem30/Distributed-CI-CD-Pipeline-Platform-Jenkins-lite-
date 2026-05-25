"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([
    "> Initializing ForgeCI Engine v1.0.0...",
    "> Parsing pipeline definition — 3 stages detected.",
    "> Dispatching build job to worker pool via Kafka...",
    "> Build container running. Streaming results to dashboard...",
  ]);
  const termRef = useRef<HTMLDivElement>(null);

  // If already signed in, redirect to dashboard
  useEffect(() => {
    if (status === "authenticated") {
      router.push("/dashboard");
    }
  }, [status, router]);

  useEffect(() => {
    termRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Demo pipeline simulation for the landing page terminal
  const runDemo = () => {
    if (isRunning) return;
    setIsRunning(true);
    setLogs([]);

    const lines = [
      "⚡ [Gateway] POST /api/v1/pipelines/run → JWT validated",
      "📋 [Orchestrator] Creating execution entry in PostgreSQL...",
      "📋 [Orchestrator] Execution ID: exec_7b4c9e1f assigned",
      `📦 [Orchestrator] Publishing Kafka event → topic: pipeline-trigger`,
      "",
      "🔄 [Kafka] Event dispatched to partition 0, offset 42",
      "🔄 [Worker-Manager] Worker node-3 picked up job from queue",
      "",
      `📥 [Worker] Cloning repository: ${repoUrl || "github.com/user/my-app"}`,
      "📥 [Worker] Checkout complete → HEAD at commit a3f8d21",
      "",
      "🐳 [Docker] Spinning up isolated build container...",
      "🐳 [Docker] Container online → openjdk:21-slim",
      "",
      "── Stage 1/3: Install ──────────────────────",
      "$ npm install",
      "added 847 packages in 4.2s",
      "✔ Stage Install completed in 4.2s",
      "",
      "── Stage 2/3: Test ─────────────────────────",
      "$ npm test",
      "[PASS] UserServiceTest (0.42s)",
      "[PASS] AuthServiceTest (0.31s)",
      "[PASS] PipelineServiceTest (0.18s)",
      "Tests: 3 passed, 3 total",
      "✔ Stage Test completed in 1.1s",
      "",
      "── Stage 3/3: Build ────────────────────────",
      "$ npm run build",
      "Creating optimized production build...",
      "✔ Stage Build completed in 3.8s",
      "",
      "💾 [MinIO] Artifact uploaded → forgeci-artifacts",
      "📭 [Kafka] Status: SUCCESS, duration: 9.1s",
      "✅ Pipeline completed successfully in 9.1s",
    ];

    let i = 0;
    const iv = setInterval(() => {
      if (i < lines.length) {
        setLogs((p) => [...p, lines[i]]);
        i++;
      } else {
        clearInterval(iv);
        setIsRunning(false);
      }
    }, 180);
  };

  return (
    <div className="min-h-screen bg-black text-neutral-200 flex">
      {/* Left stripe gutter */}
      <div
        className="hidden lg:block w-[14%] shrink-0 opacity-[0.07]"
        style={{
          background:
            "repeating-linear-gradient(-45deg, #fff 0px, #fff 1px, transparent 1px, transparent 18px)",
        }}
      />

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* ── NAV ── */}
        <nav className="h-[72px] flex items-center justify-between px-6 md:px-10 border-b border-white/[0.06] sticky top-0 bg-black/80 backdrop-blur-lg z-50">
          <span className="text-[18px] font-extrabold tracking-tight text-white">
            ForgeCI
          </span>

          <div className="hidden md:flex items-center gap-7 text-[13px] text-neutral-500">
            <a href="#how" className="hover:text-white transition-colors">How it Works</a>
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="https://github.com/runningpoem30/forgeCI" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">GitHub</a>
          </div>

          <div className="flex items-center gap-4">
            {/* Sign in button */}
            <button
              onClick={() => signIn("github")}
              className="flex items-center gap-2 px-4 py-2 bg-white text-black text-[13px] font-semibold rounded-lg hover:bg-neutral-200 transition-all active:scale-[0.97]"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
              </svg>
              Sign in with GitHub
            </button>
          </div>
        </nav>

        {/* ── HERO ── */}
        <section className="flex-1 flex flex-col justify-center px-6 md:px-10 py-16 md:py-24">
          <div className="max-w-[640px]">
            <h1 className="text-[40px] md:text-[56px] font-extrabold leading-[1.08] tracking-tight text-white mb-6">
              Build Your Code.
              <br />
              Before It Breaks.
            </h1>
            <p className="text-neutral-500 text-[16px] md:text-[17px] leading-relaxed max-w-[520px] mb-10">
              Most CI/CD bottlenecks are found after deployment, not before.
              ForgeCI changes that — build, test, and deploy inside isolated
              Docker containers orchestrated through Kafka.
            </p>
          </div>

          {/* Input row */}
          <div className="flex flex-col sm:flex-row gap-3 max-w-[620px] mb-16">
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/user/repository"
              className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-3 text-[13px] text-white placeholder-neutral-700 focus:border-white/20 focus:outline-none transition-colors font-mono"
            />
            <button
              onClick={() => signIn("github")}
              className="px-5 py-3 bg-white text-black text-[13px] font-semibold rounded-lg hover:bg-neutral-200 transition-all active:scale-[0.97] whitespace-nowrap"
            >
              Get Started →
            </button>
            <button
              onClick={runDemo}
              disabled={isRunning}
              className="px-5 py-3 border border-white/[0.1] text-white text-[13px] font-medium rounded-lg hover:border-white/20 disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              {isRunning ? "Running..." : "View Live Demo"}
            </button>
          </div>

          {/* Terminal */}
          <div className="max-w-[640px] w-full">
            <div className="relative rounded-xl overflow-hidden shadow-2xl shadow-black/60">
              <div
                className="absolute inset-0 bg-cover bg-center opacity-30"
                style={{ backgroundImage: "url('/images/terminal_sky_bg.png')" }}
              />
              <div className="relative bg-black/70 backdrop-blur-sm rounded-xl border border-white/[0.06] overflow-hidden">
                <div className="flex items-center justify-between px-4 h-10 border-b border-white/[0.06] bg-white/[0.02]">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                    <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
                    <span className="w-3 h-3 rounded-full bg-[#28c840]" />
                  </div>
                  <span className="text-[11px] text-neutral-600 font-mono">forgeci — interactive-session</span>
                  <div className="w-14" />
                </div>
                <div className="p-5 md:p-6 font-mono text-[12px] leading-[1.7] max-h-[280px] overflow-y-auto space-y-0.5">
                  {logs.map((line, i) => {
                    let c = "text-neutral-400";
                    if (line.startsWith(">")) c = "text-neutral-500";
                    else if (line.startsWith("⚡") || line.startsWith("──")) c = "text-white";
                    else if (line.startsWith("✔") || line.startsWith("✅")) c = "text-emerald-400";
                    else if (line.startsWith("🐳")) c = "text-blue-400";
                    else if (line.startsWith("📋") || line.startsWith("📭")) c = "text-cyan-400";
                    else if (line.startsWith("🔄")) c = "text-indigo-400";
                    else if (line.startsWith("💾")) c = "text-purple-400";
                    else if (line.includes("[PASS]")) c = "text-emerald-400";
                    else if (line.startsWith("$")) c = "text-yellow-300";
                    else if (line.startsWith("📥")) c = "text-sky-400";
                    else if (line === "") return <div key={i} className="h-2" />;
                    return <div key={i} className={c}>{line}</div>;
                  })}
                  {isRunning && <span className="inline-block w-2 h-4 bg-emerald-400 animate-blink" />}
                  <div ref={termRef} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section id="how" className="px-6 md:px-10 py-20 border-t border-white/[0.04]">
          <h2 className="text-2xl font-bold text-white mb-3">How ForgeCI Works</h2>
          <p className="text-neutral-500 text-[15px] mb-12 max-w-xl">
            A real distributed CI/CD engine. Here is what happens when you connect a repo and run a pipeline.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { step: "01", title: "Sign In & Connect", desc: "Authenticate with GitHub OAuth. ForgeCI gets read access to your repos — lists them on your dashboard.", accent: "border-cyan-500/40" },
              { step: "02", title: "Define Pipeline", desc: "Create a forgeci.yml with stages: install, test, build, deploy. Each stage runs commands inside an isolated Docker container.", accent: "border-indigo-500/40" },
              { step: "03", title: "Orchestrate & Queue", desc: "Orchestrator creates a build entry in Postgres, publishes a Kafka event. Worker nodes consume jobs from the queue.", accent: "border-blue-500/40" },
              { step: "04", title: "Build & Stream", desc: "Worker clones your repo, runs stages inside Docker. Logs stream live via Kafka → WebSocket. Artifacts upload to MinIO.", accent: "border-emerald-500/40" },
            ].map((s) => (
              <div key={s.step} className={`bg-white/[0.02] border-l-2 ${s.accent} border-y border-r border-white/[0.04] rounded-lg p-5`}>
                <span className="text-[11px] font-mono text-neutral-600 mb-2 block">STEP {s.step}</span>
                <h3 className="text-[15px] font-semibold text-white mb-2">{s.title}</h3>
                <p className="text-[13px] text-neutral-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── FEATURES ── */}
        <section id="features" className="px-6 md:px-10 py-20 border-t border-white/[0.04]">
          <h2 className="text-2xl font-bold text-white mb-3">Architecture</h2>
          <p className="text-neutral-500 text-[15px] mb-12 max-w-xl">
            Production-grade distributed systems — the same patterns used by Jenkins, GitHub Actions, and GitLab CI internally.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { name: "Java 21", sub: "Spring Boot 3" },
              { name: "Apache Kafka", sub: "Event streaming" },
              { name: "Redis", sub: "Worker registry" },
              { name: "PostgreSQL", sub: "Metadata store" },
              { name: "Docker", sub: "Build isolation" },
              { name: "MinIO / S3", sub: "Artifact storage" },
            ].map((t) => (
              <div key={t.name} className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4 text-center">
                <span className="text-[14px] font-semibold text-white block">{t.name}</span>
                <span className="text-[11px] text-neutral-600 mt-1 block">{t.sub}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="h-16 flex items-center justify-between px-6 md:px-10 border-t border-white/[0.04] text-[11px] text-neutral-700 font-mono">
          <span>forgeci v1.0.0-alpha</span>
          <span>distributed ci/cd pipeline engine</span>
        </footer>
      </div>

      {/* Right stripe gutter */}
      <div
        className="hidden lg:block w-[14%] shrink-0 opacity-[0.07]"
        style={{
          background: "repeating-linear-gradient(-45deg, #fff 0px, #fff 1px, transparent 1px, transparent 18px)",
        }}
      />
    </div>
  );
}
