// Tier 1 - a fragment: (params) => string.
export const crudGoal = (entity: string): string => `
  Create a ${entity}Service class providing CRUD operations for ${entity} objects.
  Use an in-memory Map<string, ${entity}> for storage. Generate UUIDs randomly.
`
