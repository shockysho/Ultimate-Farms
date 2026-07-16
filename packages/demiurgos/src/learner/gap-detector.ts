// ============================================================
// DEMIURGOS — Gap Detector
// ============================================================
//
// Analyzes task logs to identify knowledge gaps:
// - Tasks that failed evaluation
// - Tasks that required tier escalation
// - Low-quality scores in specific domains
// - Repeated similar questions (pattern detection)

import { getDb } from '../logger.js';

export interface KnowledgeGap {
  domain: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  frequency: number;       // How many times this gap appeared
  averageScore: number;    // Average quality score for tasks in this gap
  examplePrompts: string[];
}

/**
 * Detect knowledge gaps from recent task logs.
 */
export function detectGaps(lookbackDays = 7): KnowledgeGap[] {
  const db = getDb();
  const gaps: KnowledgeGap[] = [];

  // Find tasks with low quality scores, grouped by domain-like keywords
  const lowScoreTasks = db.prepare(`
    SELECT prompt, quality_score, model_used, tier
    FROM task_logs
    WHERE quality_score < 0.6
    AND timestamp > datetime('now', ?)
    ORDER BY quality_score ASC
    LIMIT 50
  `).all(`-${lookbackDays} days`) as { prompt: string; quality_score: number; model_used: string; tier: number }[];

  // Find tasks that escalated to high tiers
  const escalatedTasks = db.prepare(`
    SELECT prompt, quality_score, tier
    FROM task_logs
    WHERE tier >= 3
    AND timestamp > datetime('now', ?)
    LIMIT 50
  `).all(`-${lookbackDays} days`) as { prompt: string; quality_score: number; tier: number }[];

  // Group low-score tasks by domain keywords
  const domainGroups = groupByDomain(lowScoreTasks.map(t => t.prompt));

  for (const [domain, prompts] of Object.entries(domainGroups)) {
    if (prompts.length >= 2) { // At least 2 failures in same domain
      const avgScore = lowScoreTasks
        .filter(t => prompts.includes(t.prompt))
        .reduce((sum, t) => sum + t.quality_score, 0) / prompts.length;

      gaps.push({
        domain,
        description: `${prompts.length} tasks in '${domain}' scored below 0.6`,
        severity: prompts.length >= 5 ? 'high' : prompts.length >= 3 ? 'medium' : 'low',
        frequency: prompts.length,
        averageScore: avgScore,
        examplePrompts: prompts.slice(0, 3),
      });
    }
  }

  // Check for frequent escalations
  if (escalatedTasks.length >= 5) {
    const escalationDomains = groupByDomain(escalatedTasks.map(t => t.prompt));
    for (const [domain, prompts] of Object.entries(escalationDomains)) {
      if (prompts.length >= 3) {
        gaps.push({
          domain,
          description: `${prompts.length} tasks in '${domain}' required expensive model escalation`,
          severity: 'medium',
          frequency: prompts.length,
          averageScore: 0.5,
          examplePrompts: prompts.slice(0, 3),
        });
      }
    }
  }

  return gaps.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

// --- Helpers ---

function groupByDomain(prompts: string[]): Record<string, string[]> {
  const domainKeywords: Record<string, string[]> = {
    farming: ['farm', 'poultry', 'chicken', 'egg', 'feed', 'flock', 'bird', 'layer', 'mortality'],
    finance: ['cost', 'price', 'budget', 'revenue', 'profit', 'investment', 'roi', 'payment'],
    engineering: ['pump', 'motor', 'pipe', 'electrical', 'cooling', 'ventilation', 'infrastructure'],
    code: ['code', 'function', 'api', 'database', 'typescript', 'react', 'node', 'sql'],
    management: ['staff', 'team', 'schedule', 'compliance', 'audit', 'process', 'workflow'],
  };

  const groups: Record<string, string[]> = {};

  for (const prompt of prompts) {
    const lower = prompt.toLowerCase();
    let matched = false;

    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      if (keywords.some(kw => lower.includes(kw))) {
        if (!groups[domain]) groups[domain] = [];
        groups[domain].push(prompt);
        matched = true;
        break;
      }
    }

    if (!matched) {
      if (!groups['general']) groups['general'] = [];
      groups['general'].push(prompt);
    }
  }

  return groups;
}
