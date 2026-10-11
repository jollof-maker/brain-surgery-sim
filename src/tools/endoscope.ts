import type { ToolBehavior } from './types';

/**
 * Endoscope (30° lens). Click next to the aneurysm to park the scope there;
 * its view appears inside the eyepiece. Q/E turn the angled lens to look
 * around the neck. Click the scope again to withdraw it. It stays in place
 * while you switch to other tools (endoscope-assisted clipping).
 */
export const endoscope: ToolBehavior = {
  id: 'endoscope',
  hand: 'left',
  passThrough: ['arachnoid'],

  classify(hit) {
    if (hit.kind === 'endoscope') return 'valid';
    if (hit.kind === 'aneurysm' || hit.kind === 'vessel' || hit.kind === 'nerve') return 'warn';
    return 'none';
  },

  press(hit, ctx) {
    if (!hit) return;
    if (hit.kind === 'endoscope') {
      ctx.endoscope.withdraw();
      ctx.state.toast('msg.endoOut', 'info');
      return;
    }
    // Park the lens just off the surface (never resting on a vessel or the dome).
    const tip = hit.point.clone().addScaledVector(hit.normal, 1.6);
    ctx.endoscope.insert(tip, ctx.pose.y, ctx.anatomy.aneurysm.base);
    ctx.state.toast('msg.endoIn', 'info');
  },

  key(key, ctx) {
    if (key === 'q') ctx.endoscope.rotate(-30);
    else if (key === 'e') ctx.endoscope.rotate(30);
    else return false;
    return true;
  },
};
