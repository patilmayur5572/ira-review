import { describe, it, expect } from 'vitest';
import './setup';

// Reproduce detectRepo logic for testing
function detectRepoFromUrl(url: string): { owner: string; repo: string; baseUrl?: string } {
  // github.com (SSH or HTTPS)
  const ghMatch = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  if (ghMatch) {
    return { owner: ghMatch[1], repo: ghMatch[2] };
  }

  // Bitbucket Server: https://bitbucket.srv.company.com/scm/PROJECT/repo.git
  const bbServerMatch = url.match(/https?:\/\/[^/]+\/scm\/([^/]+)\/([^/.]+)/);
  if (bbServerMatch) {
    return { owner: bbServerMatch[1], repo: bbServerMatch[2] };
  }

  // Bitbucket Server SSH: ssh://git@bitbucket.srv.company.com/PROJECT/repo.git
  const bbSshMatch = url.match(/@[^/]+[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/);
  if (bbSshMatch) {
    return { owner: bbSshMatch[1], repo: bbSshMatch[2] };
  }

  // GitHub Enterprise: https://ghe.company.com/owner/repo.git
  const gheMatch = url.match(/https?:\/\/([^/]+)\/([^/]+)\/([^/.]+)/);
  if (gheMatch) {
    return { owner: gheMatch[2], repo: gheMatch[3], baseUrl: `https://${gheMatch[1]}/api/v3` };
  }

  return { owner: '', repo: '' };
}

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
