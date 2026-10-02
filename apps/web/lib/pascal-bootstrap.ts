import { type AnyNodeDefinition, nodeRegistry, registerNode } from '@pascal-app/core'
import { builtinPlugin } from '@pascal-app/nodes'

// Register Pascal's built-in node kinds before any <Editor> renders; registerNode throws on duplicates (HMR).
for (const def of builtinPlugin.nodes ?? []) {
  if (!nodeRegistry.has((def as AnyNodeDefinition).kind)) registerNode(def as AnyNodeDefinition)
}
