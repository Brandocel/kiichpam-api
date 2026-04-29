import { Injectable } from '@nestjs/common';
import { AgentIntent } from '../types/agent.types';
import {
  INTENT_DICTIONARY,
  PACKAGE_DICTIONARY,
  PackageCode,
} from './intent-dictionaries';

export type IntentClassification = {
  intent: AgentIntent;
  score: number;
  packageCode?: PackageCode;
  matchedWords: string[];
  shouldUseAi: boolean;
  shouldAskClarification: boolean;
};

@Injectable()
export class IntentClassifierService {
  classify(message: string): IntentClassification {
    const text = this.normalizeText(message);

    const packageResult = this.detectPackage(text);
    const intentResult = this.detectIntent(text);

    let intent = intentResult.intent;
    let score = intentResult.score;
    const matchedWords = [...intentResult.matchedWords];

    if (packageResult.packageCode && intent === 'UNKNOWN') {
      intent = 'PACKAGE_INFO';
      score = Math.max(score, 0.75);
      matchedWords.push(...packageResult.matchedWords);
    }

    if (packageResult.packageCode && intent === 'PACKAGE_INFO') {
      score = Math.max(score, 0.9);
      matchedWords.push(...packageResult.matchedWords);
    }

    if (packageResult.packageCode && intent === 'QUOTE_REQUEST') {
      score = Math.max(score, 0.9);
      matchedWords.push(...packageResult.matchedWords);
    }

    return {
      intent,
      score,
      packageCode: packageResult.packageCode,
      matchedWords: [...new Set(matchedWords)],
      shouldUseAi: score >= 0.45 && score < 0.8,
      shouldAskClarification: score < 0.45,
    };
  }

  private detectIntent(text: string): {
    intent: AgentIntent;
    score: number;
    matchedWords: string[];
  } {
    let bestIntent: AgentIntent = 'UNKNOWN';
    let bestScore = 0;
    let bestMatches: string[] = [];

    for (const [intent, words] of Object.entries(INTENT_DICTIONARY)) {
      const matchedWords = words.filter((word) =>
        text.includes(this.normalizeText(word)),
      );

      if (!matchedWords.length) continue;

      const score = Math.min(0.95, 0.45 + matchedWords.length * 0.18);

      if (score > bestScore) {
        bestIntent = intent as AgentIntent;
        bestScore = score;
        bestMatches = matchedWords;
      }
    }

    return {
      intent: bestIntent,
      score: bestScore,
      matchedWords: bestMatches,
    };
  }

  private detectPackage(text: string): {
    packageCode?: PackageCode;
    matchedWords: string[];
  } {
    let bestPackage: PackageCode | undefined;
    let bestMatches: string[] = [];

    for (const [packageCode, words] of Object.entries(PACKAGE_DICTIONARY)) {
      const matchedWords = words.filter((word) =>
        text.includes(this.normalizeText(word)),
      );

      if (matchedWords.length > bestMatches.length) {
        bestPackage = packageCode as PackageCode;
        bestMatches = matchedWords;
      }
    }

    return {
      packageCode: bestPackage,
      matchedWords: bestMatches,
    };
  }

  normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[¿?¡!.,;:()"]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}