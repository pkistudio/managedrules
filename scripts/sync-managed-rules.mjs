#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.manifest || !args["target-dir"]) {
  printUsage();
  process.exit(args.help ? 0 : 1);
}

const manifestPath = resolve(args.manifest);
const managedRulesRoot = resolve(dirname(manifestPath), "..");
const manifest = parseManifest(readFileSync(manifestPath, "utf8"), manifestPath);
const dryRun = Boolean(args["dry-run"]);
const targetDir = resolve(args["target-dir"]);

if (!dryRun) {
  assertCleanWorkingTree(targetDir);
  prepareBranch(targetDir, manifest);
}

const changes = syncFiles({ managedRulesRoot, targetDir, manifest, dryRun });

if (changes.length === 0) {
  console.log(`No managed rule changes for ${manifest.repository}.`);
  process.exit(0);
}

console.log(`Managed rule changes for ${manifest.repository}:`);
for (const change of changes) {
  console.log(`- ${change.status}: ${change.target}`);
}

if (dryRun) {
  console.log("Dry run only. No files were changed and no PR was opened.");
  process.exit(1);
}

commitAndOpenPullRequest(targetDir, manifest, changes);

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const name = arg.slice(2);
    if (["dry-run", "help"].includes(name)) {
      parsed[name] = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${name}`);
    }

    parsed[name] = value;
    index += 1;
  }

  return parsed;
}

function parseManifest(content, filePath) {
  const manifest = { files: [], pullRequest: {} };
  let section = null;
  let currentFile = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const withoutComment = rawLine.replace(/\s+#.*$/, "");
    if (!withoutComment.trim()) {
      continue;
    }

    const indent = withoutComment.match(/^ */)[0].length;
    const line = withoutComment.trim();

    if (indent === 0) {
      currentFile = null;

      if (line.endsWith(":")) {
        section = line.slice(0, -1);
        continue;
      }

      const [key, value] = splitKeyValue(line, filePath);
      manifest[key] = parseScalar(value);
      section = null;
      continue;
    }

    if (section === "pullRequest") {
      const [key, value] = splitKeyValue(line, filePath);
      manifest.pullRequest[key] = parseScalar(value);
      continue;
    }

    if (section === "files") {
      if (line.startsWith("- ")) {
        currentFile = {};
        manifest.files.push(currentFile);
        const inline = line.slice(2).trim();
        if (inline) {
          const [key, value] = splitKeyValue(inline, filePath);
          currentFile[key] = parseScalar(value);
        }
        continue;
      }

      if (!currentFile) {
        throw new Error(`Invalid files section in ${filePath}: ${rawLine}`);
      }

      const [key, value] = splitKeyValue(line, filePath);
      currentFile[key] = parseScalar(value);
      continue;
    }

    throw new Error(`Unsupported manifest line in ${filePath}: ${rawLine}`);
  }

  validateManifest(manifest, filePath);
  return manifest;
}

function splitKeyValue(line, filePath) {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex === -1) {
    throw new Error(`Expected key/value line in ${filePath}: ${line}`);
  }

  return [line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim()];
}

function parseScalar(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return value;
}

function validateManifest(manifest, filePath) {
  const required = ["repository", "defaultBranch", "branchPrefix", "commitMessage"];
  for (const key of required) {
    if (!manifest[key]) {
      throw new Error(`Manifest ${filePath} is missing ${key}.`);
    }
  }

  if (!manifest.pullRequest.title || !manifest.pullRequest.body) {
    throw new Error(`Manifest ${filePath} must define pullRequest.title and pullRequest.body.`);
  }

  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error(`Manifest ${filePath} must define at least one file.`);
  }

  for (const file of manifest.files) {
    if (!file.source || !file.target) {
      throw new Error(`Every manifest file entry in ${filePath} must define source and target.`);
    }
  }
}

function assertCleanWorkingTree(targetDir) {
  const status = run("git", ["status", "--porcelain"], targetDir, { capture: true });
  if (status.trim()) {
    throw new Error(`Target repository has uncommitted changes:\n${status}`);
  }
}

function prepareBranch(targetDir, manifest) {
  const branchName = `${manifest.branchPrefix}-${timestamp()}`;
  manifest.syncBranch = branchName;
  run("git", ["fetch", "origin", manifest.defaultBranch], targetDir);
  run("git", ["checkout", "-B", branchName, `origin/${manifest.defaultBranch}`], targetDir);
}

function syncFiles({ managedRulesRoot, targetDir, manifest, dryRun }) {
  const changes = [];

  for (const file of manifest.files) {
    const sourcePath = resolveManagedPath(managedRulesRoot, file.source);
    const targetPath = resolveTargetPath(targetDir, file.target);
    const sourceContent = readFileSync(sourcePath, "utf8");
    const targetExists = existsSync(targetPath);
    const targetContent = targetExists ? readFileSync(targetPath, "utf8") : null;

    if (sourceContent === targetContent) {
      continue;
    }

    changes.push({
      source: file.source,
      target: file.target,
      status: targetExists ? "updated" : "created",
    });

    if (!dryRun) {
      mkdirSync(dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, sourceContent, "utf8");
    }
  }

  return changes;
}

function resolveManagedPath(root, requestedPath) {
  const resolved = resolve(root, requestedPath);
  assertWithinRoot(root, resolved, requestedPath);
  if (!existsSync(resolved)) {
    throw new Error(`Managed source file does not exist: ${requestedPath}`);
  }
  return resolved;
}

function resolveTargetPath(root, requestedPath) {
  const resolved = resolve(root, requestedPath);
  assertWithinRoot(root, resolved, requestedPath);
  return resolved;
}

function assertWithinRoot(root, resolvedPath, requestedPath) {
  const relativePath = relative(root, resolvedPath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`Path escapes repository root: ${requestedPath}`);
  }
}

function commitAndOpenPullRequest(targetDir, manifest, changes) {
  ensureGitIdentity(targetDir);

  run("git", ["add", ...changes.map((change) => change.target)], targetDir);
  const stagedDiff = run("git", ["diff", "--cached", "--quiet"], targetDir, { allowFailure: true });
  if (stagedDiff.status === 0) {
    console.log("No staged changes after sync.");
    return;
  }

  run("git", ["commit", "-m", manifest.commitMessage], targetDir);
  run("git", ["push", "--set-upstream", "origin", manifest.syncBranch], targetDir);
  run("gh", [
    "pr",
    "create",
    "--repo",
    manifest.repository,
    "--base",
    manifest.defaultBranch,
    "--head",
    manifest.syncBranch,
    "--title",
    manifest.pullRequest.title,
    "--body",
    prBody(manifest, changes),
  ], targetDir);
}

function ensureGitIdentity(targetDir) {
  const name = run("git", ["config", "user.name"], targetDir, { allowFailure: true, capture: true }).trim();
  const email = run("git", ["config", "user.email"], targetDir, { allowFailure: true, capture: true }).trim();

  if (!name) {
    run("git", ["config", "user.name", "github-actions[bot]"], targetDir);
  }

  if (!email) {
    run("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"], targetDir);
  }
}

function prBody(manifest, changes) {
  const changedFiles = changes.map((change) => `- ${change.status}: \`${change.target}\``).join("\n");
  return `${manifest.pullRequest.body}\n\nChanged files:\n${changedFiles}`;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").toLowerCase();
}

function run(command, commandArgs, cwd, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (options.allowFailure) {
    return options.capture ? result.stdout : result;
  }

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = result.stderr ? `\n${result.stderr}` : "";
    throw new Error(`${command} ${commandArgs.join(" ")} failed with exit code ${result.status}.${stderr}`);
  }

  return options.capture ? result.stdout : result;
}

function printUsage() {
  console.log(`Usage:
  node scripts/sync-managed-rules.mjs --manifest manifests/pvkgadgets.yml --target-dir ../pvkgadgets [--dry-run]

Options:
  --manifest    Path to a managed rules manifest.
  --target-dir  Existing checkout of the target repository.
  --dry-run     Report differences without changing files, pushing branches, or opening PRs.
  --help        Show this help.
`);
}