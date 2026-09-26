import { createHash } from 'node:crypto';
import { z } from 'zod';
import { applyOps, parseOps, parseScene } from './adapter.js';
import { checkLayout, scoreLayout, type LayoutIssue } from './layout.js';
import { checkRequest, intentSchema, type Intent, type RequestError } from './request.js';
import type { Op, Scene } from './scene.js';

const rationaleSchema=z.string().trim().min(1).max(4000).refine(text=>! /\n\s*\n/.test(text),'Use one paragraph for the rationale');
type SessionIssue={check:string;message:string};
export interface Proposal {
  id:string;
  base_scene_fingerprint:string;
  ops:Op[];
  rationale:string;
  intent:Intent;
  checks:ReturnType<typeof checkLayout>;
  request_check:ReturnType<typeof checkRequest>;
  score:ReturnType<typeof scoreLayout>;
  requires_user_acceptance:true;
  application_status:'not_applied';
  validation_scope:'temporary_designer_scene';
}
export type ProposalResult=
  | {ok:true;proposal_id:string;score:Proposal['score'];proposal:Proposal}
  | {ok:false;errors:(LayoutIssue|RequestError|SessionIssue)[]};

/** One conversation over an immutable scene snapshot. Acceptance is deliberately outside this API. */
export class DesignerSession {
  private readonly scene:Scene;
  private readonly fingerprint:string;
  private intent:Intent|undefined;
  private readonly proposals=new Map<string,Proposal>();
  private nextId=1;

  constructor(scene:Scene) {
    this.scene=parseScene(scene);
    this.fingerprint=createHash('sha256').update(JSON.stringify(this.scene)).digest('hex');
  }

  setIntent(input:unknown):Intent {
    const intent=intentSchema.parse(input);
    if(intent.room_id!==undefined&&!this.scene.rooms.some(room=>room.id===intent.room_id)) throw new Error(`Unknown intent room: ${intent.room_id}`);
    for(const id of intent.keeps??[]) if(![...this.scene.items,...this.scene.fixed].some(item=>item.id===id)) throw new Error(`Unknown kept item: ${id}`);
    this.intent=structuredClone(intent);
    return structuredClone(intent);
  }

  getIntent():Intent|undefined { return this.intent?structuredClone(this.intent):undefined; }

  getScene():Scene { return structuredClone(this.scene); }
  getProposal(id:string):Proposal|undefined {
    const proposal=this.proposals.get(id);
    return proposal===undefined?undefined:structuredClone(proposal);
  }
  listProposals():Proposal[] { return [...this.proposals.values()].map(proposal=>structuredClone(proposal)); }

  propose(input:unknown,rationale:string):ProposalResult {
    if(!this.intent) return {ok:false,errors:[{check:'intent',message:'Call set_intent before proposing a layout'}]};
    try {
      const ops=parseOps(input),paragraph=rationaleSchema.parse(rationale);
      const checks=checkLayout(this.scene,ops,{compareBaseline:true});
      if (ops.some(op => op.type === 'color')) checks.notes = [...checks.notes ?? [], {
        check: 'appearance_cost', severity: 'soft', item_ids: [], at: [0,0], location_unknown: true,
        message: 'Colour is a visual finish proposal. Paint, refinishing and labour are unquoted; the purchase total counts furniture only.',
      }];
      if(!checks.ok) return {ok:false,errors:checks.errors};
      const after=applyOps(this.scene,ops);
      const request=checkRequest(this.scene,after,ops,this.intent,checks.price.cost_dram);
      if(!request.ok) return {ok:false,errors:request.errors};
      const score=scoreLayout(this.scene,ops);
      const id=`proposal-${this.nextId++}`;
      const proposal:Proposal={id,base_scene_fingerprint:this.fingerprint,ops,rationale:paragraph,intent:structuredClone(this.intent),checks,request_check:request,score,requires_user_acceptance:true,application_status:'not_applied',validation_scope:'temporary_designer_scene'};
      this.proposals.set(id,structuredClone(proposal));
      return structuredClone({ok:true,proposal_id:id,score,proposal});
    } catch(error) {
      return {ok:false,errors:[{check:'input',message:error instanceof Error?error.message:String(error)}]};
    }
  }
}
