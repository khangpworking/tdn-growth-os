import path from 'node:path';

export interface PiLaunchConfiguration {
  readonly executable: string;
  readonly provider: string;
  readonly model: string;
  readonly skillPath?: string;
}

export const PI_DENY_FLAGS = Object.freeze([
  '--no-session',
  '--no-tools',
  '--no-extensions',
  '--no-skills',
  '--no-prompt-templates',
  '--no-themes',
  '--no-context-files',
  '--no-approve',
] as const);

export function buildPiRpcLaunch(config: PiLaunchConfiguration): {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: Readonly<{ shell: false; stdio: ['pipe', 'pipe', 'pipe']; env: Readonly<Record<string, string>> }>;
} {
  assertToken(config.executable, 'executable');
  assertToken(config.provider, 'provider');
  assertToken(config.model, 'model');
  if (config.skillPath !== undefined && (config.skillPath.length < 1 || config.skillPath.includes('\0'))) {
    throw new TypeError('Invalid exact skill path');
  }
  const args = [
    '--mode', 'rpc',
    ...PI_DENY_FLAGS,
    '--provider', config.provider,
    '--model', config.model,
    ...(config.skillPath === undefined ? [] : ['--skill', config.skillPath]),
  ];
  return {
    command: config.executable,
    args,
    options: {
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      // Deliberately do not copy or log the parent environment. A separately authorized
      // live launcher must inject only the provider-specific authentication it needs.
      env: Object.freeze({
        NO_COLOR: '1',
        CI: '1',
        // Needed only for executable shebang resolution. It contains no parent environment
        // values and cannot carry provider credentials or user configuration.
        PATH: path.dirname(process.execPath),
      }),
    },
  };
}

function assertToken(value: string, label: string): void {
  if (value.length < 1 || value.includes('\0')) throw new TypeError(`Invalid Pi ${label}`);
  if (/key|token|secret|credential/i.test(value)) throw new TypeError(`Pi ${label} resembles credential material`);
}
