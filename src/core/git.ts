import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

/**
 * A git ref naming the current *working-tree* state (tracked files incl.
 * uncommitted edits), suitable for `git archive`. `git stash create` builds a
 * commit object without touching the working tree; with no changes it returns
 * empty, so we fall back to HEAD.
 */
export async function workingTreeRef(root: string): Promise<string> {
  try {
    const { stdout } = await exec("git", ["-C", root, "stash", "create"], { maxBuffer: 1 << 20 });
    return stdout.trim() || "HEAD";
  } catch {
    return "HEAD";
  }
}

const snapRef = (runId: string) => `refs/mysteron/snap/${runId}`;

/**
 * Snapshot the host's working tree as a commit and pin it under a ref. The guest
 * diffs against this exact state (so the host serves it for the snapshot tar),
 * and `git apply --3way` later needs its blobs present to merge — the ref keeps
 * them reachable until the result lands. Returns the commit SHA, or "HEAD" when
 * the tree is clean (nothing extra to pin).
 */
export async function captureSnapshotRef(root: string, runId: string): Promise<string> {
  try {
    const { stdout } = await exec("git", ["-C", root, "stash", "create"], { maxBuffer: 1 << 20 });
    const sha = stdout.trim();
    if (!sha) return "HEAD";
    await exec("git", ["-C", root, "update-ref", snapRef(runId), sha]).catch(() => undefined);
    return sha;
  } catch {
    return "HEAD";
  }
}

/** Drop the pinned snapshot ref from captureSnapshotRef (best-effort). */
export async function releaseSnapshotRef(root: string, runId: string): Promise<void> {
  await exec("git", ["-C", root, "update-ref", "-d", snapRef(runId)]).catch(() => undefined);
}

export interface LandResult {
  ok: boolean;
  /** How the work landed: on the checked-out branch, on a dedicated branch, or not at all. */
  mode: "current-branch" | "branch" | "failed";
  branch?: string;
  commit?: string;
  /** Where the raw patch was saved — always written, so work is never lost even on a failed apply. */
  patchPath: string;
  error?: string;
}

async function refExists(root: string, ref: string): Promise<boolean> {
  return exec("git", ["-C", root, "rev-parse", "--verify", "--quiet", ref])
    .then(() => true)
    .catch(() => false);
}

/**
 * Land a guest's returned diff on the host, mirroring how a local run commits
 * under the project's git strategy:
 *  - "current-branch": fast-forward the checked-out branch onto the guest's
 *    commit, so the work lands in the host's working tree — but only when that
 *    tree is clean, so in-progress edits are never disturbed.
 *  - "new-branch" (or a current-branch fallback when the tree is dirty / can't
 *    fast-forward): leave the commit on a dedicated <prefix><ticket> branch for
 *    review.
 *
 * The commit is always built in a throwaway worktree off HEAD (the checkout is
 * never touched while building it), and `git apply --3way` merges the guest's
 * delta even when the host has moved on since dispatch. The raw patch is saved
 * first, so a failed apply still leaves the work recoverable.
 */
export async function landGuestPatch(
  root: string,
  opts: {
    runId: string;
    ticketId: string;
    patch: string;
    message: string;
    trailer?: string;
    strategy: "current-branch" | "new-branch";
    branchPrefix?: string;
  },
): Promise<LandResult> {
  const git = (args: string[]) => exec("git", args, { maxBuffer: 64 << 20 });
  const ident = ["-c", "user.name=Mysteron", "-c", "user.email=mysteron@local"];
  const msg = opts.trailer ? `${opts.message}\n\n${opts.trailer}` : opts.message;

  // Always persist the raw patch first — nothing is ever silently dropped.
  const patchDir = path.join(root, ".git", "mysteron-patches");
  const patchPath = path.join(patchDir, `${opts.runId}.diff`);
  await fs.mkdir(patchDir, { recursive: true });
  await fs.writeFile(patchPath, opts.patch, "utf8");

  // Build the commit in an isolated worktree off HEAD — never touches the checkout.
  const wt = path.join(os.tmpdir(), `mysteron-apply-${opts.runId}`);
  const tmpBranch = `mysteron/_apply-${opts.runId}`;
  let commit: string;
  try {
    await git(["-C", root, "worktree", "add", "-q", "-b", tmpBranch, wt, "HEAD"]);
    await git(["-C", wt, "apply", "--3way", "--binary", "--whitespace=nowarn", patchPath]);
    await git(["-C", wt, "add", "-A"]);
    await git(["-C", wt, ...ident, "commit", "-q", "-m", msg]);
    commit = (await git(["-C", wt, "rev-parse", "HEAD"])).stdout.trim();
  } catch (e) {
    await exec("git", ["-C", root, "worktree", "remove", "--force", wt]).catch(() => undefined);
    await git(["-C", root, "branch", "-D", tmpBranch]).catch(() => undefined);
    return { ok: false, mode: "failed", patchPath, error: (e as Error).message };
  }
  // The commit now lives in the object db on tmpBranch; the worktree is done.
  await exec("git", ["-C", root, "worktree", "remove", "--force", wt]).catch(() => undefined);

  // current-branch: fast-forward the checked-out branch onto the commit, but only
  // when its tracked files are clean (a dirty tree / collision means we fall back
  // to a named branch rather than risk the user's work).
  if (opts.strategy === "current-branch") {
    const dirty = (await git(["-C", root, "status", "--porcelain", "--untracked-files=no"])).stdout.trim().length > 0;
    if (!dirty) {
      try {
        await git(["-C", root, "merge", "--ff-only", commit]);
        await git(["-C", root, "branch", "-D", tmpBranch]).catch(() => undefined);
        return { ok: true, mode: "current-branch", commit, patchPath };
      } catch {
        /* fall through to leaving it on a dedicated branch */
      }
    }
  }

  // new-branch, or current-branch fallback: keep the commit on a dedicated branch.
  const prefix = (opts.branchPrefix ?? "mysteron/").replace(/\/?$/, "/");
  let branch = `${prefix}${opts.ticketId}`;
  if (await refExists(root, branch)) branch = `${prefix}${opts.ticketId}-${opts.runId}`;
  const named = await git(["-C", root, "branch", "-f", branch, commit])
    .then(() => true)
    .catch(() => false);
  if (named) {
    await git(["-C", root, "branch", "-D", tmpBranch]).catch(() => undefined);
  } else {
    branch = tmpBranch; // couldn't create the nice name — keep the work on tmpBranch
  }
  return { ok: true, mode: "branch", branch, commit, patchPath };
}

export interface Commit {
  hash: string;
  shortHash: string;
  author: string;
  date: string; // ISO
  subject: string;
  /** Companion name parsed from a `Mysteron-Companion:` trailer, if present. */
  companion?: string;
}

const UNIT = "\x1f"; // field separator
const REC = "\x1e"; // record separator

/**
 * Recent git commits in a project, with the `Mysteron-Companion:` trailer parsed
 * out so the app can attribute commits to companions. Returns [] for a non-git
 * directory (or if git isn't available) rather than throwing.
 */
export async function recentCommits(projectRoot: string, limit = 50): Promise<Commit[]> {
  try {
    const { stdout } = await exec(
      "git",
      ["log", `-n${limit}`, `--pretty=format:%H${UNIT}%h${UNIT}%an${UNIT}%aI${UNIT}%s${UNIT}%b${REC}`],
      { cwd: projectRoot, maxBuffer: 16 * 1024 * 1024 },
    );
    return stdout
      .split(REC)
      .map((s) => s.replace(/^\n/, ""))
      .filter((s) => s.trim())
      .map((chunk) => {
        const [hash, shortHash, author, date, subject, body = ""] = chunk.split(UNIT);
        // Accept the legacy `Henson-Companion:` trailer too, so commits made
        // before the rename keep their attribution.
        const trailer = body.match(/^(?:Mysteron|Henson)-Companion:\s*(.+?)\s*$/im);
        return { hash, shortHash, author, date, subject, companion: trailer?.[1] };
      });
  } catch {
    return [];
  }
}
