import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

interface DraftDescriptor {
  id: string;
  label: string;
  cycle: number;
  variant: "general" | "qb";
}

function isLoopback(address: string | undefined): boolean {
  return address === undefined
    || address === "127.0.0.1"
    || address === "::1"
    || address === "::ffff:127.0.0.1";
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

async function fileExists(path: string): Promise<boolean> {
  try { return (await stat(path)).isFile(); }
  catch { return false; }
}

/** Local-only bridge. querieddata is never imported into the browser bundle. */
export function setupTestVitePlugin(projectRoot = process.cwd()): Plugin {
  const queriedRoot = resolve(projectRoot, "setups", "querieddata");
  const allowedDirectories = [queriedRoot, join(queriedRoot, "QB")];

  async function listDrafts(): Promise<DraftDescriptor[]> {
    const descriptors: DraftDescriptor[] = [];
    for (const directory of allowedDirectories) {
      if (!existsSync(directory)) continue;
      const variant = directory === queriedRoot ? "general" : "qb";
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const match = /^cycle-([1-7])(?:-[a-z0-9-]+)?-setups\.json$/i.exec(entry.name);
        if (!match) continue;
        const prefix = directory === queriedRoot ? "" : `QB${sep}`;
        descriptors.push({
          id: `${prefix}${entry.name}`.split(sep).join("/"),
          label: entry.name,
          cycle: Number(match[1]),
          variant,
        });
      }
    }
    return descriptors.sort((left, right) =>
      left.cycle - right.cycle || left.label.localeCompare(right.label));
  }

  async function loadDraft(id: string): Promise<{ catalog: unknown; policy: unknown }> {
    const descriptor = (await listDrafts()).find((candidate) => candidate.id === id);
    if (!descriptor) throw new Error("Unknown draft catalog.");
    const directory = descriptor.variant === "qb" ? allowedDirectories[1] : allowedDirectories[0];
    const catalogPath = join(directory, basename(descriptor.id));
    const policyPath = catalogPath.replace(/-setups\.json$/i, "-policy.json");
    const [catalogText, policyText] = await Promise.all([
      readFile(catalogPath, "utf8"),
      fileExists(policyPath) ? readFile(policyPath, "utf8") : null,
    ]);
    return {
      catalog: JSON.parse(catalogText),
      policy: policyText ? JSON.parse(policyText) : null,
    };
  }

  const middleware = async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/setup_test" || url.pathname === "/setup_test/") {
      request.url = `/setup_test.html${url.search}`;
      next();
      return;
    }
    if (!url.pathname.startsWith("/__setup_test/")) {
      next();
      return;
    }
    if (!isLoopback(request.socket.remoteAddress)) {
      sendJson(response, 403, { error: "Local setup-test data is available only from this computer." });
      return;
    }
    try {
      if (request.method === "GET" && url.pathname === "/__setup_test/drafts") {
        sendJson(response, 200, { catalogs: await listDrafts() });
        return;
      }
      if (request.method === "GET" && url.pathname === "/__setup_test/draft") {
        sendJson(response, 200, await loadDraft(url.searchParams.get("id") ?? ""));
        return;
      }
      sendJson(response, 404, { error: "Unknown setup-test endpoint." });
    } catch (reason) {
      sendJson(response, 400, { error: reason instanceof Error ? reason.message : String(reason) });
    }
  };

  return {
    name: "setup-test-local-data",
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}

