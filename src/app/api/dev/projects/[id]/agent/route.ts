/**
 * MiMo OS — Dev Project Agent API
 * ---------------------------------
 * POST /api/dev/projects/:id/agent
 *   action: 'analyze' | 'propose' | 'apply' | 'workflow'
 *   body: { instruction?, proposal?, requireApproval?, runBuild?, runTests?, approvedHighRisk? }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  analyzeProject,
  proposeChange,
  applyChange,
  runAgentWorkflow,
  type SandboxProfile,
  type ChangeProposal,
} from '@/core/dev';
import { handleSandboxError, requireValidProjectId } from '../../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROFILES: SandboxProfile[] = ['safe', 'standard', 'development', 'networked', 'restricted'];

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteParams) {
  const { id } = await ctx.params;
  const invalid = requireValidProjectId(id);
  if (invalid) return invalid;
  try {
    const body = await req.json().catch(() => ({}));
    const profile = resolveProfile(body.profile);
    const action = typeof body.action === 'string' ? body.action : 'analyze';

    switch (action) {
      case 'analyze': {
        const analysis = await analyzeProject(id, profile);
        return NextResponse.json({ analysis });
      }
      case 'propose': {
        const instruction = typeof body.instruction === 'string' ? body.instruction : '';
        if (!instruction.trim()) {
          return NextResponse.json({ error: 'instruction is required' }, { status: 400 });
        }
        const proposal = await proposeChange(id, instruction, profile);
        return NextResponse.json({ proposal });
      }
      case 'apply': {
        if (!body.proposal || typeof body.proposal !== 'object') {
          return NextResponse.json({ error: 'proposal is required' }, { status: 400 });
        }
        const proposal = body.proposal as ChangeProposal;
        const result = await applyChange(id, proposal, profile, {
          requireApproval: body.requireApproval === true,
          approvedHighRisk: body.approvedHighRisk === true,
        });
        return NextResponse.json({ result });
      }
      case 'workflow': {
        const instruction = typeof body.instruction === 'string' ? body.instruction : '';
        if (!instruction.trim()) {
          return NextResponse.json({ error: 'instruction is required' }, { status: 400 });
        }
        const result = await runAgentWorkflow(id, instruction, profile, {
          runBuildAfter: body.runBuild === true,
          runTestsAfter: body.runTests === true,
          approvedHighRisk: body.approvedHighRisk === true,
        });
        return NextResponse.json({ result });
      }
      default:
        return NextResponse.json({ error: `unknown agent action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return handleSandboxError(err);
  }
}

function resolveProfile(input: unknown): SandboxProfile {
  return typeof input === 'string' && PROFILES.includes(input as SandboxProfile)
    ? (input as SandboxProfile)
    : 'standard';
}
