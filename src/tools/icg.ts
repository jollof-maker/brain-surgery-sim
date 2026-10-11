import type { ToolBehavior } from './types';

/**
 * ICG videoangiography: click anywhere to inject. The microscope switches to
 * near-infrared for about ten seconds while the dye passes. Run it before and
 * after clipping: after a good clip the parent artery and branches light up,
 * the sac stays dark.
 */
export const icg: ToolBehavior = {
  id: 'icg',
  hand: 'right',
  passThrough: ['arachnoid', 'adhesion'],

  classify() {
    return 'none';
  },

  press(_hit, ctx) {
    if (ctx.icg.active) return;
    ctx.icg.start();
    ctx.state.toast('msg.icgInjected', 'info');
  },
};
