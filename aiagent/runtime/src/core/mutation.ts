/**
 * Phase 2G — conservative shell-command mutation classification.
 *
 * Purpose (per Phase 2G): make the permission boundary more useful while
 * remaining SAFE. This is NOT a shell parser and does not claim semantic
 * certainty: anything it cannot verify is `unknown`, and `unknown` is
 * NEVER upgraded to read-only.
 *
 * Verdicts: read_only | mutating | unknown.
 * Composition rule: any segment mutating → mutating; else any segment
 * unknown → unknown; else read_only. (Conservative: ambiguity never
 * becomes read-only.)
 *
 * Documented limitations:
 *  - no quote-aware parsing: an operator-like character inside quotes can
 *    only make the verdict MORE conservative (e.g. `echo "a|b"` → unknown),
 *    never less;
 *  - path-qualified binaries (`/usr/bin/ls`, `./script`) are `unknown` —
 *    a file named `ls` in a writable dir could be anything;
 *  - command substitution `$()` / backticks and subshells → `unknown`
 *    (embedded commands are not analyzed);
 *  - the read-only / mutating tables are a conservative starting set;
 *    unknown commands (including most CLIs) stay `unknown`;
 *  - `2>&1`-style fd duplication to /dev/null/&N is not a mutation;
 *    `>` / `>>` to anything else IS (it creates/truncates a file);
 *  - aliases, shell functions, and interactive state are out of scope
 *    (each exec is a fresh `sh -c`).
 */

export type MutationVerdict = 'read_only' | 'mutating' | 'unknown';

export interface MutationClassification {
  verdict: MutationVerdict;
  /** machine-readable reason (what triggered the verdict). */
  reason: string;
}

// strict allowlist: commands that cannot create/modify/delete files or
// otherwise change system state (and do not execute other code).
const READ_ONLY = new Set([
  'ls', 'cat', 'head', 'tail', 'wc', 'grep', 'egrep', 'fgrep', 'rg', 'ag',
  'find', 'pwd', 'which', 'whoami', 'id', 'uname', 'date', 'env', 'printenv',
  'echo', 'printf', 'true', 'test', '[', 'ps', 'du', 'df', 'stat', 'file',
  'type', 'sort', 'uniq', 'cut', 'tr', 'nl', 'column', 'diff', 'comm',
  'md5sum', 'sha1sum', 'sha256sum', 'xxd', 'od', 'jq', 'basename', 'dirname',
  'realpath', 'readlink', 'tree', 'sleep', 'wait',
]);

// explicit mutating commands (subset; unknown defaults cover the rest —
// node/python/ruby/perl/sed are handled by their dedicated rules above)
const MUTATING = new Set([
  'rm', 'rmdir', 'mv', 'cp', 'mkdir', 'touch', 'chmod', 'chown', 'chgrp',
  'ln', 'tee', 'dd', 'shred', 'truncate', 'install', 'mkfifo', 'mknod',
  'kill', 'pkill', 'killall', 'make', 'cmake',
  'bash', 'sh', 'zsh', 'dash', 'yarn', 'pnpm', 'pip',
  'pip3', 'apt', 'apt-get', 'yum', 'dnf', 'brew', 'docker', 'kubectl',
  'wget', 'zip', 'unzip', 'xargs', 'eval',
]);

const GIT_READ_ONLY = new Set([
  'status', 'log', 'diff', 'show', 'branch', 'rev-parse', 'remote',
  'ls-files', 'blame', 'describe', 'shortlog', 'cat-file',
]);
const GIT_MUTATING = new Set([
  'add', 'commit', 'checkout', 'switch', 'merge', 'rebase', 'reset',
  'clean', 'init', 'clone', 'pull', 'push', 'apply', 'stash', 'rm', 'mv',
  'tag', 'fetch', 'restore',
]);
const NPM_READ_ONLY = new Set(['ls', 'list', 'view', 'outdated']);

/** strip leading harmless wrappers: `sudo ls`, `env X=y ls`, `time ls`, `nohup ls` */
function stripWrappers(tokens: string[]): string[] {
  let t = tokens;
  for (;;) {
    const h = t[0];
    if (h === 'sudo' || h === 'time' || h === 'nohup' || h === 'setsid' || h === 'exec' || h === 'command') {
      t = t.slice(1);
      continue;
    }
    if (h === 'env') {
      let i = 1;
      let ok = true;
      while (i < t.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(t[i])) i++;
      if (i >= t.length) { t = []; break; }
      t = t.slice(i);
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(h)) { t = t.slice(1); continue; }
    break;
  }
  return t;
}

function classifySegment(segment: string): MutationClassification {
  let seg = segment.trim();
  if (!seg) return { verdict: 'unknown', reason: 'empty segment (dangling operator or malformed input)' };
  // shell constructs we refuse to analyze → conservative
  if (seg.includes('`') || seg.includes('$(') || seg.includes('${'))
    return { verdict: 'unknown', reason: 'command substitution — embedded commands not analyzed' };
  if (/[(){}]/.test(seg))
    return { verdict: 'unknown', reason: 'subshell/brace grouping — not analyzed' };
  // heredocs feed arbitrary stdin → unknown
  if (/\s<</.test(seg) || seg.startsWith('<<'))
    return { verdict: 'unknown', reason: 'heredoc — arbitrary stdin' };
  // backgrounding
  if (/&&/.test(seg)) seg = seg.replace(/&&/g, ' ');
  if (/\s&\s|\s&$|^&/.test(seg))
    return { verdict: 'unknown', reason: 'backgrounded job' };

  // redirection: `>` / `>>` to anything but /dev/null or an fd alias is a
  // mutation (creates/truncates a file). `2>&1` / `>&2` are excluded by the
  // lookahead; a `>` with no target (e.g. `echo =>`) is not a redirection.
  // Conservative false-positives (e.g. `> /dev/stdout`) only ever err toward
  // `mutating` — the safe direction.
  const redir = seg.match(/>(?![&>])\s*([^\s|;&<]+)/);
  if (redir && !['/dev/null', '&1', '&2', '1', '2'].includes(redir[1]))
    return { verdict: 'mutating', reason: `redirection to file ${redir[1]}` };

  const tokens = seg.split(/\s+/);
  const t = stripWrappers(tokens);
  if (t.length === 0) return { verdict: 'unknown', reason: 'only wrappers/env assignments' };
  const cmd = t[0];

  // path-qualified binary → unknown (conservative; a file can be anything)
  if (cmd.includes('/')) return { verdict: 'unknown', reason: `path-qualified binary "${cmd}" not trusted by name` };

  // flag-sensitive read-only-ish commands
  if (cmd === 'sed' || cmd === 'perl') {
    if (t.slice(1).some((a) => /^-.*i/.test(a))) return { verdict: 'mutating', reason: `${cmd} with in-place (-i)` };
    return READ_ONLY.has(cmd) ? { verdict: 'read_only', reason: `${cmd} without -i prints to stdout` } : { verdict: 'unknown', reason: `unknown ${cmd} usage` };
  }
  if (cmd === 'node' || cmd === 'python' || cmd === 'python3' || cmd === 'ruby') {
    if (t.slice(1).some((a) => a === '-e' || a === '-c')) return { verdict: 'unknown', reason: `${cmd} -e/-c executes inline code` };
    return { verdict: 'unknown', reason: `${cmd} executes a program` };
  }
  if (cmd === 'git') {
    const sub = t[1];
    if (sub === 'branch' || sub === 'remote') {
      // `git branch <name>` / `git remote add ...` CREATE state — the bare
      // listing form is the only read-only one
      if (t.length === 2) return { verdict: 'read_only', reason: `git ${sub} (list form) is read-only` };
      if (sub === 'remote' && (t[2] === '-v' || t[2] === '--verbose' || t[2] === 'show'))
        return { verdict: 'read_only', reason: `git remote ${t[2]} is read-only` };
      return { verdict: 'mutating', reason: `git ${sub} with arguments can mutate state` };
    }
    if (sub && GIT_READ_ONLY.has(sub)) return { verdict: 'read_only', reason: `git ${sub} is read-only` };
    if (sub && GIT_MUTATING.has(sub)) return { verdict: 'mutating', reason: `git ${sub} mutates state` };
    return { verdict: 'unknown', reason: `git ${sub ?? '(no subcommand)'} not in the conservative table` };
  }
  if (cmd === 'npm' || cmd === 'yarn' || cmd === 'pnpm') {
    const sub = t[1];
    if (sub && NPM_READ_ONLY.has(sub)) return { verdict: 'read_only', reason: `${cmd} ${sub} is read-only` };
    return { verdict: 'mutating', reason: `${cmd} ${sub ?? ''} can install/execute` };
  }
  if (cmd === 'tar') {
    if (t.slice(1).some((a) => /^-.*[xX]/.test(a) || a === '--extract')) return { verdict: 'mutating', reason: 'tar extracts files' };
    if (t.slice(1).some((a) => /^-.*[cC]/.test(a) || a === '--create')) return { verdict: 'mutating', reason: 'tar creates an archive file' };
    if (t.slice(1).some((a) => /^-.*t/.test(a) || a === '--list')) return { verdict: 'read_only', reason: 'tar lists archive contents' };
    return { verdict: 'unknown', reason: 'tar usage not recognized' };
  }
  if (cmd === 'curl' || cmd === 'wget') {
    if (t.slice(1).some((a) => a.startsWith('-o') || a.startsWith('--output') || a.startsWith('-O')))
      return { verdict: 'mutating', reason: `${cmd} writes output to a file` };
    return { verdict: 'unknown', reason: `${cmd} performs network egress (not read-only in the safe sense)` };
  }

  if (MUTATING.has(cmd)) return { verdict: 'mutating', reason: `command "${cmd}" is mutating` };
  if (READ_ONLY.has(cmd)) return { verdict: 'read_only', reason: `command "${cmd}" is read-only` };
  return { verdict: 'unknown', reason: `unknown command "${cmd}" — conservative default` };
}

/**
 * Classify a full shell command line. Conservative by construction:
 * composition is split on top-level `;` `|` `&&` `||` (the latter two are
 * normalized to `;` first) and any unrecognized structure degrades to
 * `unknown` — never to `read_only`.
 */
export function classifyShellCommand(command: string): MutationClassification {
  let cmd = command.trim();
  if (!cmd) return { verdict: 'unknown', reason: 'empty command' };
  if (/&&/.test(cmd)) cmd = cmd.replace(/&&/g, ' ; ');
  if (/\|\|/.test(cmd)) cmd = cmd.replace(/\|\|/g, ' ; ');
  // newlines are separators
  const lines = cmd.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const reasons: string[] = [];
  const rank = { read_only: 0, unknown: 1, mutating: 2 } as const;
  let verdict: MutationVerdict = 'read_only';
  for (const line of lines) {
    for (const segment of line.split(/[;|]/)) {
      const r = classifySegment(segment);
      if (rank[r.verdict] > rank[verdict]) verdict = r.verdict;
      if (r.verdict !== 'read_only') reasons.push(r.reason);
      if (verdict === 'mutating') break;
    }
    if (verdict === 'mutating') break;
  }
  return { verdict, reason: reasons.length ? reasons.join(' + ') : 'all segments read-only' };
}
