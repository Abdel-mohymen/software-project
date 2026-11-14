export function escapeRegex(input: string): string {
  return (input || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildSafeRegex(input: string, flags = 'i'): RegExp {
  return new RegExp(escapeRegex(input.trim()), flags);
}
