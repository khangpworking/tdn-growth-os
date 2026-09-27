/** Planned AI call count for one user action, shown before the owner confirms it (047 §4). Pure. */

export type ContentAiPlannedAction =
  | { readonly type: 'big_idea' | 'angle'; readonly runs: number; readonly perRun: number }
  | { readonly type: 'caption_poster'; readonly angles: number; readonly caption: boolean; readonly poster: boolean };

export interface ContentAiCallCount { readonly text: number; readonly image: number; readonly total: number; readonly label: string }

const RUN_LABELS = { big_idea: 'Big Idea', angle: 'Angle' } as const;

function boundedInteger(value: unknown, max: number, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max) {
    throw new TypeError(`${name} must be an integer from 1 to ${max}`);
  }
  return value;
}

export function contentAiCallCount(action: ContentAiPlannedAction): ContentAiCallCount {
  if (typeof action !== 'object' || action === null) throw new TypeError('Planned AI action is required');
  if (action.type === 'big_idea' || action.type === 'angle') {
    const runs = boundedInteger(action.runs, 10, 'runs');
    const perRun = boundedInteger(action.perRun, 10, 'perRun');
    const text = runs * perRun;
    return { text, image: 0, total: text, label: `${runs} × ${perRun} ${RUN_LABELS[action.type]} = ${text} lượt AI` };
  }
  if (action.type === 'caption_poster') {
    const angles = boundedInteger(action.angles, 50, 'angles');
    if (typeof action.caption !== 'boolean' || typeof action.poster !== 'boolean') throw new TypeError('caption and poster must be booleans');
    if (!action.caption && !action.poster) throw new TypeError('Choose caption, poster or both');
    const text = action.caption ? angles : 0;
    const image = action.poster ? angles : 0;
    const parts = [...(action.caption ? [`${angles} Caption`] : []), ...(action.poster ? [`${angles} Poster`] : [])];
    return { text, image, total: text + image, label: `${parts.join(' + ')} = ${text + image} lượt AI` };
  }
  throw new TypeError('Unknown planned AI action');
}
