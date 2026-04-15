import { describe, it, expect } from 'vitest';
import './setup';
import { detectRepoFromUrl } from '../utils/git';

describe('detectRepo', () => {
  it('detects GitHub HTTPS', () => {
    const result = detectRepoFromUrl('https://github.com/octocat/hello-world.git');
    expect(result).toEqual({ owner: 'octocat', repo: 'hello-world' });
  });

  it('detects GitHub SSH', () => {
    const result = detectRepoFromUrl('git@github.com:octocat/hello-world.git');
    expect(result).toEqual({ owner: 'octocat', repo: 'hello-world' });
  });

  it('detects Bitbucket Server HTTPS (scm path)', () => {
    const result = detectRepoFromUrl('https://bitbucket.example.com/scm/PROJ/my-repo.git');
    expect(result).toEqual({ owner: 'PROJ', repo: 'my-repo' });
  });

  it('detects Bitbucket Server SSH', () => {
    const result = detectRepoFromUrl('ssh://git@bitbucket.example.com/PROJ/my-repo.git');
    expect(result).toEqual({ owner: 'PROJ', repo: 'my-repo' });
  });

  it('detects GitHub Enterprise HTTPS', () => {
    const result = detectRepoFromUrl('https://ghe.company.com/team/project.git');
    expect(result).toEqual({ owner: 'team', repo: 'project', baseUrl: 'https://ghe.company.com/api/v3' });
  });

  it('detects Bitbucket Cloud SSH', () => {
    const result = detectRepoFromUrl('git@bitbucket.org:team/repo.git');
    expect(result).toEqual({ owner: 'team', repo: 'repo' });
  });

  it('returns empty for unrecognized URL', () => {
    const result = detectRepoFromUrl('');
    expect(result).toEqual({ owner: '', repo: '' });
  });
});
