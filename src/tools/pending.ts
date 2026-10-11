import type { ToolId } from '../core/SimState';
import type { ToolBehavior } from './types';

/**
 * Tools whose full behavior lands in later milestones (temporary clip: M4;
 * clip, ICG, Doppler, endoscope: M5). For now they show their instrument,
 * highlight vessels/aneurysm, and explain that they are not active yet.
 */
function pendingTool(id: ToolId, passThrough: ToolBehavior['passThrough']): ToolBehavior {
  return {
    id,
    hand: 'right',
    passThrough,
    jaw: id === 'clip' || id === 'tempClip' ? { pressed: 1, released: 0.25 } : undefined,
    classify(hit) {
      return hit.kind === 'vessel' || hit.kind === 'aneurysm' ? 'valid' : 'none';
    },
    press(_hit, ctx) {
      ctx.say('msg.pending', 'info', { tool: `tool.${id}` });
    },
  };
}

export const clip = pendingTool('clip', []);
export const tempClip = pendingTool('tempClip', []);
export const icg = pendingTool('icg', ['arachnoid', 'adhesion']);
export const doppler = pendingTool('doppler', ['arachnoid']);
export const endoscope = pendingTool('endoscope', ['arachnoid']);
