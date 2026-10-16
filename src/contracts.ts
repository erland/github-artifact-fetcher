/** DEV-002 stable contracts; concrete GitHub providers arrive in DEV-006–008. */
export type ArtifactSource = 'release' | 'actions' | 'repository' | 'package';
export interface ArtifactRequest { source: ArtifactSource; repository: string; selector: string; }
export interface FileDescriptor { filename: string; mimeType: string; sizeBytes: number; sha256: string; downloadUrl: string; expiresAt: string; }
export interface ArtifactProvider { fetch(request: ArtifactRequest, userId: string): Promise<FileDescriptor>; }
export interface HealthStatus { status: 'ok' | 'not_ready'; version: string; }
export const sourceTypes: readonly ArtifactSource[] = ['release','actions','repository','package'];
export function parseArtifactRequest(value: unknown): ArtifactRequest {
  if (!value || typeof value !== 'object') throw new Error('INVALID_REQUEST');
  const v = value as Record<string, unknown>;
  if (!sourceTypes.includes(v.source as ArtifactSource) || typeof v.repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(v.repository) || typeof v.selector !== 'string' || !v.selector.trim() || v.selector.length > 500) throw new Error('INVALID_REQUEST');
  return {source: v.source as ArtifactSource,repository:v.repository,selector:v.selector};
}
