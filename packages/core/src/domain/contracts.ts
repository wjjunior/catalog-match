import type { ParsedSpec } from './spec';

export interface DescriptionParser {
  parse(description: string): ParsedSpec;
}

export interface QueryParser {
  parse(query: string): ParsedSpec;
}
