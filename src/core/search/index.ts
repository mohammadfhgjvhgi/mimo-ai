export {
  getSearchProvider,
  registerSearchProvider,
  maybeUpgradeToZAI,
  type SearchProvider,
  type SearchResult,
} from './SearchProvider';
// Phase 116: GraphRAG engine now exported (used by ContextBuilder).
export { graphRagRetrieve, type GraphRagResult } from './GraphRagEngine';
