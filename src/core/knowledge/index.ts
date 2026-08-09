export { upsertEntity, searchEntities, getEntitiesByType, countEntities, createRelationship, getRelationships, ensureTables } from './KnowledgeRepository';
export type { EntityType, KnowledgeEntity } from './KnowledgeRepository';
export { findPath, getSubgraph, getFullGraph } from './KnowledgeGraph';
export type { GraphNode, GraphEdge, GraphPath, Subgraph } from './KnowledgeGraph';
