export { buildContext, DEFAULT_USER } from './ContextBuilder';
export type { BuildContextOptions } from './ContextBuilder';
// Phase 116: Context Engine (assembleContext + checkClaim) now exported.
// assembleContext is used by the hallucination-control path in the Validator.
export { assembleContext, checkClaim, type ClaimType, type AssembledContext } from './ContextEngine';
