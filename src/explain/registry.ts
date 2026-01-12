import { countriesCapitalsAdapter } from '@/src/explain/adapters/countries-capitals.adapter';
import type { ExplainAdapter } from '@/src/explain/types';

const ADAPTERS: ExplainAdapter[] = [countriesCapitalsAdapter];

export function getExplainAdapter(themeId: string): ExplainAdapter | null {
  for (const a of ADAPTERS) {
    if (a.canHandle(themeId)) return a;
  }
  return null;
}


