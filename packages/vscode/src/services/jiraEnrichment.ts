/**
 * IRA - Intelligent Review Assistant
 * Shared JIRA enrichment for PR and local diff review flows
 */

import * as vscode from 'vscode';
import { JiraClient, validateAcceptanceCriteria, hasStructuredAC, generateAcceptanceCriteria, formatACsForJiraComment, trackRequirementCompletion } from 'ira-review';
import type { ReviewComment, AcceptanceValidationResult, GeneratedAC, Framework } from 'ira-review';
import { AuthProvider } from './authProvider';
import { execGit } from '../utils/git';

export interface JiraEnrichmentResult {
  jiraTicket: string | null;
  acceptanceValidation: AcceptanceValidationResult | null;
  acGeneration: {
    criteria: GeneratedAC[];
    reviewHints: string[];
    totalCriteria: number;
    commentBody: string;
  } | null;
  requirementCompletion: {
    completionPercentage: number;
    parseWarning?: string;
  } | null;
}

const MIN_ADDED_LINES = 3;

export async function enrichWithJira(
  config: vscode.WorkspaceConfiguration,
  workspaceRoot: string,
  comments: ReviewComment[],
  framework: Framework | null,
  fullDiff: string,
  aiProvider: any,
  onProgress?: (message: string) => void,
): Promise<JiraEnrichmentResult> {
  const emptyResult: JiraEnrichmentResult = {
    jiraTicket: null,
    acceptanceValidation: null,
    acGeneration: null,
    requirementCompletion: null,
  };

  const jiraUrl = config.get<string>('jiraUrl', '');
  if (!jiraUrl) return emptyResult;

  // Detect JIRA ticket from branch name
  const branch = await execGit('git branch --show-current', workspaceRoot).catch(() => '');
  const jiraMatch = branch.match(/([A-Z][A-Z0-9]+-\d+)/i);
  if (!jiraMatch) return emptyResult;

  const jiraTicket = jiraMatch[1].toUpperCase();

  // Resolve JIRA credentials
  const authInstance = AuthProvider.getInstance();
  const jiraToken = await authInstance.getJiraToken();
  const jiraEmail = config.get<string>('jiraEmail', '');
  if (!jiraToken) return { ...emptyResult, jiraTicket };

  const acField = config.get<string>('jiraAcField', '') || undefined;
  const jira = new JiraClient({ baseUrl: jiraUrl, email: jiraEmail, token: jiraToken, acceptanceCriteriaField: acField });

  let issue;
  try {
    issue = await jira.fetchIssue(jiraTicket);
  } catch {
    return { ...emptyResult, jiraTicket };
  }

  const acSource = config.get<string>('jiraAcSource', 'both');
  const customFieldAC = issue.fields.acceptanceCriteria?.trim() || '';
  const descriptionAC = issue.fields.description?.trim() || '';
  let ac = '';
  if (acSource === 'customField') ac = customFieldAC;
  else if (acSource === 'description') ac = descriptionAC;
  else ac = customFieldAC || descriptionAC;

  const result: JiraEnrichmentResult = {
    jiraTicket,
    acceptanceValidation: null,
    acGeneration: null,
    requirementCompletion: null,
  };

  const isBug = /bug|defect/i.test(issue.fields.issuetype?.name || '');

  const structured = ac ? hasStructuredAC(ac) : false;

  if (ac && structured) {
    // Structured ACs exist - validate them
    onProgress?.(`Validating acceptance criteria for ${jiraTicket}...`);
    try {
      const sonarIssues = comments.map((c, i) => ({
        key: `AI-${i}`,
        rule: c.rule,
        severity: c.severity as 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO',
        component: c.filePath,
        message: c.message,
        line: c.line,
        type: (c.rule.includes('security') ? 'VULNERABILITY' : 'CODE_SMELL') as 'VULNERABILITY' | 'CODE_SMELL',
        flows: [] as { locations: { component: string; msg: string }[] }[],
        tags: [c.rule.replace('IRA/', '')],
      }));
      const validation = await validateAcceptanceCriteria(
        issue,
        sonarIssues,
        framework,
        aiProvider,
      );
      result.acceptanceValidation = validation;
    } catch {
      // Soft fail
    }

    // Track requirement completion
    onProgress?.(`Tracking requirement completion for ${jiraTicket}...`);
    try {
      const completion = await trackRequirementCompletion(
        issue,
        aiProvider,
        framework,
        fullDiff || null,
        null,
      );
      result.requirementCompletion = {
        completionPercentage: completion.completionPercentage,
        ...(completion.parseWarning && { parseWarning: completion.parseWarning }),
      };
    } catch {
      // Soft fail
    }
  } else {
    // No structured ACs - generate them if the diff is large enough
    onProgress?.(ac ? `No structured ACs on ${jiraTicket} - generating from code...` : `No ACs found on ${jiraTicket} - generating suggestions...`);
    const addedLines = (fullDiff.match(/^\+[^+]/gm) || []).length;
    const deletedLines = (fullDiff.match(/^-[^-]/gm) || []).length;
    const changedLines = addedLines + deletedLines;
    if (changedLines >= MIN_ADDED_LINES) {
      try {
        const acResult = await generateAcceptanceCriteria(
          issue,
          aiProvider,
          framework,
          { diff: fullDiff.slice(0, 100_000) },
        );

        if (acResult.criteria.length > 0) {
          const commentBody = formatACsForJiraComment(acResult, 'local', branch || null);
          result.acGeneration = {
            criteria: acResult.criteria,
            reviewHints: acResult.reviewHints,
            totalCriteria: acResult.totalCriteria,
            commentBody,
          };
        }
      } catch {
        // Soft fail
      }
    }
  }

  return result;
}

/**
 * Post generated ACs to JIRA as a comment.
 */
export async function postACsToJira(
  config: vscode.WorkspaceConfiguration,
  jiraTicket: string,
  commentBody: string,
): Promise<boolean> {
  try {
    const jiraUrl = config.get<string>('jiraUrl', '');
    const authInstance = AuthProvider.getInstance();
    const jiraToken = await authInstance.getJiraToken();
    const jiraEmail = config.get<string>('jiraEmail', '');
    const acField = config.get<string>('jiraAcField', '') || undefined;

    if (!jiraUrl || !jiraToken) return false;

    const jira = new JiraClient({ baseUrl: jiraUrl, email: jiraEmail, token: jiraToken, acceptanceCriteriaField: acField });
    await jira.addComment(jiraTicket, commentBody);
    return true;
  } catch {
    return false;
  }
}
