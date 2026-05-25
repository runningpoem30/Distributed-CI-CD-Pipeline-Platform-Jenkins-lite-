"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

interface Repo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  html_url: string;
  updated_at: string;
  private: boolean;
}

interface PipelineRun {
  id: string;
  repo: string;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";
  startedAt: string;
  duration: string;
}

const ORCHESTRATOR_URL = "http://localhost:8082";
const WS_URL = "ws://localhost:8082";

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [view, setView] = useState<"repos" | "pipeline" | "history">("repos");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [pipelineYaml, setPipelineYaml] = useState(`stages:
  - name: Install
    commands:
      - npm install

  - name: Test
    commands:
      - npm test

  - name: Build
    commands:
      - npm run build`);

  const [isRunning, setIsRunning] = useState(false);
  const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [pipelineStatus, setPipelineStatus] = useState<string>("");
  const termRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  useEffect(() => {
    if (session && (session as any).accessToken) fetchRepos();
  }, [session]);

  useEffect(() => {
    termRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const fetchRepos = async () => {
    setLoadingRepos(true);
    try {
      const res = await fetch("https://api.github.com/user/repos?sort=updated&per_page=30", {
        headers: {
          Authorization: `Bearer ${(session as any).accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });
      if (res.ok) setRepos(await res.json());
    } catch (err) {
      console.error("Failed to fetch repos:", err);
    }
    setLoadingRepos(false);
  };

  const selectRepo = (repo: Repo) => {
    setSelectedRepo(repo);
    setView("pipeline");
    setLogs([]);
    setPipelineStatus("");

    // Auto-detect language and set appropriate pipeline
    if (repo.language === "Java") {
      setPipelineYaml(`stages:
  - name: Resolve Dependencies
    commands:
      - mvn dependency:resolve

  - name: Compile
    commands:
      - mvn clean compile

  - name: Package
    commands:
      - mvn package -DskipTests`);
    } else if (repo.language === "Python") {
      setPipelineYaml(`stages:
  - name: Install
    commands:
      - pip install -r requirements.txt

  - name: Test
    commands:
      - python -m pytest

  - name: Build
    commands:
      - python setup.py build`);
    } else {
      setPipelineYaml(`stages:
  - name: Install
    commands:
      - npm install

  - name: Test
    commands:
      - npm test

  - name: Build
    commands:
      - npm run build`);
    }
  };

  /**
   * Trigger REAL pipeline execution:
   * 1. POST to orchestrator
   * 2. Get executionId back
   * 3. Connect WebSocket for live logs
   */
  const runPipeline = useCallback(async () => {
    if (isRunning || !selectedRepo) return;
    setIsRunning(true);
    setLogs([]);
    setPipelineStatus("PENDING");

    try {
      // 1. POST to orchestrator
      const res = await fetch(`${ORCHESTRATOR_URL}/api/v1/pipelines/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl: `https://github.com/${selectedRepo.full_name}.git`,
          branch: "main",
          pipelineYaml: pipelineYaml,
          triggeredBy: session?.user?.name || "unknown",
          accessToken: (session as any)?.accessToken || "",
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        setLogs(["❌ Failed to trigger pipeline: " + errText]);
        setIsRunning(false);
        setPipelineStatus("FAILED");
        return;
      }

      const data = await res.json();
      const executionId = data.executionId;
      setCurrentExecutionId(executionId);

      // Add to runs list
      setRuns((prev) => [
        {
          id: executionId,
          repo: selectedRepo.full_name,
          status: "PENDING",
          startedAt: new Date().toLocaleTimeString(),
          duration: "—",
        },
        ...prev,
      ]);

      setLogs([`⚡ [ForgeCI] Pipeline queued — execution ID: ${executionId}`, "⚡ [ForgeCI] Connecting to log stream..."]);

      // 2. Connect WebSocket for live logs
      const ws = new WebSocket(`${WS_URL}/ws/logs/${executionId}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        const msg = event.data;

        // Check for status updates
        if (msg.startsWith("__STATUS__:")) {
          const newStatus = msg.replace("__STATUS__:", "");
          setPipelineStatus(newStatus);

          // Update run in history
          setRuns((prev) =>
            prev.map((r) => (r.id === executionId ? { ...r, status: newStatus as any } : r))
          );

          if (newStatus === "SUCCESS" || newStatus === "FAILED") {
            setIsRunning(false);
            ws.close();
          }
          return;
        }

        // Regular log line
        setLogs((prev) => [...prev, msg]);
      };

      ws.onerror = () => {
        setLogs((prev) => [...prev, "❌ WebSocket connection error"]);
        setIsRunning(false);
      };

      ws.onclose = () => {
        if (isRunning) {
          setLogs((prev) => [...prev, "── Connection closed ──"]);
        }
      };
    } catch (err: any) {
      setLogs(["❌ Error: " + (err.message || "Failed to connect to orchestrator"), "", "💡 Make sure the orchestrator service is running:", "   mvn -pl apps/orchestrator-service spring-boot:run"]);
      setIsRunning(false);
      setPipelineStatus("FAILED");
    }
  }, [isRunning, selectedRepo, pipelineYaml, session]);

  // Poll for execution status updates
  useEffect(() => {
    if (!currentExecutionId || !isRunning) return;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`${ORCHESTRATOR_URL}/api/v1/pipelines/${currentExecutionId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === "SUCCESS" || data.status === "FAILED") {
            setRuns((prev) =>
              prev.map((r) =>
                r.id === currentExecutionId
                  ? { ...r, status: data.status, duration: data.durationMs ? `${(data.durationMs / 1000).toFixed(1)}s` : "—" }
                  : r
              )
            );
          }
        }
      } catch {}
    }, 3000);
    return () => clearInterval(iv);
  }, [currentExecutionId, isRunning]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-neutral-600 text-sm font-mono">Loading session...</div>
      </div>
    );
  }

  if (!session) return null;

  const filteredRepos = repos.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.description || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-black text-neutral-200 flex">
      {/* ── Sidebar ── */}
      <aside className="w-56 shrink-0 border-r border-white/[0.06] flex flex-col bg-black">
        <div className="h-[72px] flex items-center px-5 border-b border-white/[0.06]">
          <a href="/" className="text-[16px] font-extrabold tracking-tight text-white">ForgeCI</a>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {[
            { id: "repos" as const, label: "Repositories", icon: "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" },
            { id: "pipeline" as const, label: "Pipeline", icon: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
            { id: "history" as const, label: "History", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all ${
                view === item.id ? "bg-white/[0.06] text-white" : "text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.02]"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-2.5 px-2 py-2">
            {session.user?.image ? (
              <img src={session.user.image} alt="" className="w-7 h-7 rounded-full" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-[10px] font-bold">
                {session.user?.name?.charAt(0) || "U"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium text-white truncate">{session.user?.name}</div>
              <div className="text-[10px] text-neutral-600 truncate">{session.user?.email}</div>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="w-full mt-1 text-[11px] text-neutral-600 hover:text-neutral-400 py-1.5 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="h-[72px] flex items-center justify-between px-6 border-b border-white/[0.06] bg-black sticky top-0 z-10">
          <span className="text-[11px] font-mono text-neutral-600 uppercase tracking-wider">
            {view === "repos" ? "Select Repository" : view === "pipeline" ? "Pipeline Console" : "Execution History"}
          </span>
          <div className="flex items-center gap-3">
            {selectedRepo && (
              <div className="flex items-center gap-2 text-[12px]">
                <span className="text-white font-medium">{selectedRepo.full_name}</span>
                {selectedRepo.private && (
                  <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded font-mono">PRIVATE</span>
                )}
              </div>
            )}
            {pipelineStatus && (
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                  pipelineStatus === "SUCCESS" ? "bg-emerald-500/10 text-emerald-400" :
                  pipelineStatus === "FAILED" ? "bg-red-500/10 text-red-400" :
                  pipelineStatus === "RUNNING" ? "bg-cyan-500/10 text-cyan-400" :
                  "bg-neutral-500/10 text-neutral-400"
                }`}
              >
                {pipelineStatus}
              </span>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* ── REPOS ── */}
          {view === "repos" && (
            <div className="p-6 animate-fadeIn">
              <div className="mb-6">
                <input
                  type="text"
                  placeholder="Search your repositories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full max-w-md bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-[13px] text-white placeholder-neutral-700 focus:border-white/20 focus:outline-none transition-colors"
                />
              </div>
              {loadingRepos ? (
                <div className="text-neutral-600 text-sm font-mono py-12 text-center">Fetching repositories from GitHub...</div>
              ) : (
                <div className="border border-white/[0.06] rounded-xl overflow-hidden divide-y divide-white/[0.04]">
                  {filteredRepos.map((repo) => (
                    <div key={repo.id} className="flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2.5">
                          <span className="text-[14px] font-semibold text-white">{repo.name}</span>
                          {repo.private && <span className="text-[9px] bg-white/[0.06] text-neutral-400 px-1.5 py-0.5 rounded font-mono">PRIVATE</span>}
                          {repo.language && <span className="text-[10px] text-neutral-600 font-mono">{repo.language}</span>}
                        </div>
                        {repo.description && <p className="text-[12px] text-neutral-600 mt-1 truncate max-w-lg">{repo.description}</p>}
                      </div>
                      <button
                        onClick={() => selectRepo(repo)}
                        className="px-4 py-2 bg-white text-black text-[12px] font-semibold rounded-lg hover:bg-neutral-200 transition-all active:scale-[0.97] shrink-0 ml-4"
                      >
                        Select
                      </button>
                    </div>
                  ))}
                  {filteredRepos.length === 0 && <div className="py-12 text-center text-neutral-600 text-sm">No repositories found</div>}
                </div>
              )}
            </div>
          )}

          {/* ── PIPELINE ── */}
          {view === "pipeline" && (
            <div className="flex flex-col lg:flex-row h-[calc(100vh-72px)]">
              {/* YAML editor */}
              <div className="lg:w-[400px] shrink-0 border-r border-white/[0.06] flex flex-col">
                <div className="p-4 border-b border-white/[0.06]">
                  <h3 className="text-[13px] font-semibold text-white mb-1">Pipeline Definition</h3>
                  <p className="text-[11px] text-neutral-600 leading-relaxed">
                    {selectedRepo ? `Building ${selectedRepo.name}` : "Select a repository first"} — define the shell commands to run on your code
                  </p>
                </div>

                {/* Template presets */}
                <div className="px-4 pt-3 pb-2 border-b border-white/[0.06]">
                  <p className="text-[10px] text-neutral-600 uppercase tracking-wider font-medium mb-2">Quick templates</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: "Node.js", icon: "⬢", yaml: `stages:
  - name: Install Dependencies
    commands:
      - npm install

  - name: Run Tests
    commands:
      - npm test

  - name: Build
    commands:
      - npm run build` },
                      { label: "Java", icon: "☕", yaml: `stages:
  - name: Resolve Dependencies
    commands:
      - mvn dependency:resolve

  - name: Compile & Test
    commands:
      - mvn clean compile
      - mvn test

  - name: Package
    commands:
      - mvn package -DskipTests` },
                      { label: "Python", icon: "🐍", yaml: `stages:
  - name: Install Dependencies
    commands:
      - pip install -r requirements.txt

  - name: Run Tests
    commands:
      - python -m pytest

  - name: Lint
    commands:
      - python -m flake8 . || true` },
                      { label: "Go", icon: "🔷", yaml: `stages:
  - name: Download Modules
    commands:
      - go mod download

  - name: Build
    commands:
      - go build ./...

  - name: Test
    commands:
      - go test ./...` },
                      { label: "General", icon: "📂", yaml: `stages:
  - name: Explore Repository
    commands:
      - ls -la
      - git log --oneline -10

  - name: Count Source Files
    commands:
      - echo "--- File counts ---"
      - find . -name "*.js" -o -name "*.ts" -o -name "*.java" -o -name "*.py" -o -name "*.go" | wc -l` },
                    ].map((t) => (
                      <button
                        key={t.label}
                        onClick={() => setPipelineYaml(t.yaml)}
                        className="px-2.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-md text-[11px] text-neutral-400 hover:text-white transition-all flex items-center gap-1.5"
                      >
                        <span>{t.icon}</span>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Help hint */}
                <div className="px-4 pt-2 pb-1">
                  <details className="group">
                    <summary className="text-[10px] text-neutral-600 cursor-pointer hover:text-neutral-400 transition-colors select-none">
                      💡 What goes here?
                    </summary>
                    <div className="mt-2 p-3 bg-white/[0.02] rounded-lg text-[11px] text-neutral-500 leading-relaxed space-y-1.5">
                      <p>Write the <span className="text-neutral-300">terminal commands</span> you want ForgeCI to run on your code — the same commands you&apos;d type in your terminal.</p>
                      <p>ForgeCI will <span className="text-neutral-300">clone your repo</span>, then execute each command in order. If any command fails, the pipeline stops.</p>
                      <p className="text-neutral-600 text-[10px]">Format: stages → name + list of commands (YAML)</p>
                    </div>
                  </details>
                </div>

                {/* YAML textarea */}
                <div className="flex-1 p-4 pt-2">
                  <textarea
                    value={pipelineYaml}
                    onChange={(e) => setPipelineYaml(e.target.value)}
                    spellCheck={false}
                    className="w-full h-full bg-white/[0.02] border border-white/[0.06] rounded-lg p-4 font-mono text-[12px] text-neutral-300 leading-relaxed resize-none focus:border-white/[0.12] focus:outline-none"
                  />
                </div>
                <div className="p-4 border-t border-white/[0.06]">
                  <button
                    onClick={runPipeline}
                    disabled={isRunning || !selectedRepo}
                    className="w-full py-2.5 bg-white text-black text-[13px] font-semibold rounded-lg hover:bg-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-[0.97]"
                  >
                    {isRunning ? "Pipeline Running..." : !selectedRepo ? "Select a Repository First" : "Run Pipeline →"}
                  </button>
                </div>
              </div>

              {/* Terminal */}
              <div className="flex-1 flex flex-col bg-[#050507]">
                <div className="flex items-center justify-between px-4 h-10 border-b border-white/[0.06] bg-white/[0.01] shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                    <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
                    <span className="w-3 h-3 rounded-full bg-[#28c840]" />
                    <span className="text-[11px] text-neutral-600 font-mono ml-2">forgeci — build output</span>
                  </div>
                  <span className={`text-[10px] font-mono font-semibold ${isRunning ? "text-cyan-400" : pipelineStatus === "SUCCESS" ? "text-emerald-400" : pipelineStatus === "FAILED" ? "text-red-400" : "text-neutral-700"}`}>
                    {isRunning ? "● STREAMING" : pipelineStatus ? `○ ${pipelineStatus}` : "○ IDLE"}
                  </span>
                </div>
                <div className="flex-1 p-5 overflow-y-auto font-mono text-[12px] leading-[1.7] space-y-0.5">
                  {logs.length === 0 && !isRunning ? (
                    <div className="h-full flex items-center justify-center text-neutral-700 text-center">
                      <div>
                        <p className="mb-1">Waiting for pipeline execution</p>
                        <p className="text-[11px]">Select a repo and click &ldquo;Run Pipeline&rdquo;</p>
                      </div>
                    </div>
                  ) : (
                    logs.map((line, i) => {
                      if (line == null) return null;
                      if (line === "") return <div key={i} className="h-1.5" />;
                      let c = "text-neutral-500";
                      if (line.startsWith("⚡") || line.startsWith("──")) c = "text-white";
                      else if (line.startsWith("✔") || line.startsWith("✅")) c = "text-emerald-400";
                      else if (line.startsWith("🐳")) c = "text-blue-400";
                      else if (line.startsWith("📋") || line.startsWith("📁")) c = "text-cyan-400";
                      else if (line.startsWith("📥")) c = "text-sky-400";
                      else if (line.startsWith("❌")) c = "text-red-400";
                      else if (line.startsWith("💡")) c = "text-amber-400";
                      else if (line.startsWith("$")) c = "text-yellow-300";
                      else if (line.startsWith("⏱")) c = "text-purple-400";
                      else if (line.includes("[PASS]") || line.includes("SUCCESS")) c = "text-emerald-400";
                      else if (line.includes("[FAIL]") || line.includes("ERROR") || line.includes("FAILED")) c = "text-red-400";
                      else if (line.includes("[WARN]")) c = "text-amber-400";
                      return <div key={i} className={c}>{line}</div>;
                    })
                  )}
                  {isRunning && <span className="inline-block w-2 h-4 bg-emerald-400 animate-blink" />}
                  <div ref={termRef} />
                </div>
              </div>
            </div>
          )}

          {/* ── HISTORY ── */}
          {view === "history" && (
            <div className="p-6 animate-fadeIn">
              <h3 className="text-[15px] font-semibold text-white mb-4">Execution History</h3>
              {runs.length === 0 ? (
                <div className="py-16 text-center text-neutral-600 text-sm">No pipeline runs yet. Select a repository and trigger a build.</div>
              ) : (
                <div className="border border-white/[0.06] rounded-xl overflow-hidden divide-y divide-white/[0.04]">
                  {runs.map((run) => (
                    <div key={run.id} className="px-5 py-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className={`w-2.5 h-2.5 rounded-full ${
                          run.status === "SUCCESS" ? "bg-emerald-400" :
                          run.status === "RUNNING" || run.status === "PENDING" ? "bg-cyan-400 animate-pulse" :
                          "bg-red-400"
                        }`} />
                        <div>
                          <div className="text-[13px] font-medium text-white">{run.repo}</div>
                          <div className="text-[11px] text-neutral-600 font-mono">{run.id} · {run.startedAt}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-[12px] font-mono text-neutral-500">{run.duration}</span>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                          run.status === "SUCCESS" ? "bg-emerald-500/10 text-emerald-400" :
                          run.status === "RUNNING" || run.status === "PENDING" ? "bg-cyan-500/10 text-cyan-400" :
                          "bg-red-500/10 text-red-400"
                        }`}>
                          {run.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
