import type { AgentProposal } from '../contracts';
import type { CatalogProduct } from '../adapters/database-catalog';

export class DesignerProposalCatalog {
  private entries = new Map<string, { revision: number; products: CatalogProduct[] }>();
  private key(proposal: AgentProposal): string { return JSON.stringify([proposal.id, proposal.command]); }

  /** Search results may disappear while the person reviews this proposal. */
  remember(proposal: AgentProposal, products: readonly CatalogProduct[]): void {
    const added = new Set(proposal.command.operations.flatMap(op => op.type === 'add' ? [op.object.assetId] : []));
    this.entries.set(this.key(proposal), { revision: proposal.command.baseRevision,
      products: structuredClone(products.filter(product => added.has(product.asset.id))) });
  }

  products(proposal: AgentProposal, revision: number): CatalogProduct[] {
    const entry = this.entries.get(this.key(proposal));
    return entry?.revision === revision ? structuredClone(entry.products) : [];
  }

  forget(proposal: AgentProposal): void { this.entries.delete(this.key(proposal)); }

  prune(revision: number): void {
    for (const [key, entry] of this.entries) if (entry.revision !== revision) this.entries.delete(key);
  }
}
