import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'child_process';
import { execGit, detectRepo, detectDefaultBranch } from '../utils/git';

const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;

describe('git utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('execGit should resolve with trimmed stdout', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
      cb(null, '  output with spaces  ');
    });
    const result = await execGit('git status', '/cwd');
    expect(result).toBe('output with spaces');
  });

  it('execGit should reject on error', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
      cb(new Error('git not found'));
    });
    await expect(execGit('git status', '/cwd')).rejects.toThrow('git not found');
  });

  it('execGit should split command into cmd and args', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
      cb(null, '');
    });
    await execGit('git diff HEAD --stat', '/cwd');
    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      ['diff', 'HEAD', '--stat'],
      expect.objectContaining({ cwd: '/cwd' }),
      expect.any(Function),
    );
  });

  it('detectRepo should return empty on git failure', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
      cb(new Error('not a git repo'));
    });
    const result = await detectRepo('/cwd');
    expect(result).toEqual({ owner: '', repo: '' });
  });

  it('detectRepo should parse remote URL', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
      cb(null, 'https://github.com/org/project.git');
    });
    const result = await detectRepo('/cwd');
    expect(result).toEqual({ owner: 'org', repo: 'project' });
  });

  it('detectDefaultBranch should try symbolic-ref first', async () => {
    mockExecFile.mockImplementation((_cmd: string, args: string[], _opts: any, cb: Function) => {
      if (args.includes('symbolic-ref')) {
        cb(null, 'refs/remotes/origin/develop');
      } else {
        cb(new Error('unexpected'));
      }
    });
    const result = await detectDefaultBranch('/cwd');
    expect(result).toBe('develop');
  });

  it('detectDefaultBranch should fall back to develop when symbolic-ref fails', async () => {
    mockExecFile.mockImplementation((_cmd: string, args: string[], _opts: any, cb: Function) => {
      if (args.includes('symbolic-ref')) {
        cb(new Error('not set'));
      } else if (args.includes('--verify') && args.includes('develop')) {
        cb(null, 'develop');
      } else {
        cb(new Error('not found'));
      }
    });
    const result = await detectDefaultBranch('/cwd');
    expect(result).toBe('develop');
  });

  it('detectDefaultBranch should fall back to main when develop and symbolic-ref fail', async () => {
    mockExecFile.mockImplementation((_cmd: string, args: string[], _opts: any, cb: Function) => {
      if (args.includes('symbolic-ref')) {
        cb(new Error('not set'));
      } else if (args.includes('--verify') && args.includes('develop')) {
        cb(new Error('not found'));
      } else if (args.includes('--verify') && args.includes('main')) {
        cb(null, 'main');
      } else {
        cb(new Error('not found'));
      }
    });
    const result = await detectDefaultBranch('/cwd');
    expect(result).toBe('main');
  });

  it('detectDefaultBranch should return main as last resort', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
      cb(new Error('everything fails'));
    });
    const result = await detectDefaultBranch('/cwd');
    expect(result).toBe('main');
  });
});
