import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { tsImport } from 'tsx/esm/api';
import { demoPromptList } from '../src/prompt-data-source';
import { demoIdeaList, type DemoIdea, type DemoIdeaCampaign } from '../src/idea-data-source';
import { setupDom } from './dom';

const at = '2027-01-01T00:00:00.000Z';
const campaignId = '66666666-6666-4666-8666-0000000000c1';
const bigIdeaId = '66666666-6666-4666-8666-0000000000b1';
const campaign: DemoIdeaCampaign = { campaignId, name: 'Synthetic campaign', deleted: false, insightVersion: 1, insight: 'Synthetic insight.' };

function idFor(index: number): string {
  return `66666666-6666-4666-8666-${(100 + index).toString(16).padStart(12, '0')}`;
}

const bigIdea: DemoIdea = { ideaId: bigIdeaId, campaignId, kind: 'BIG_IDEA', ordinal: 1, requestId: idFor(1), concept: 'Synthetic big idea', expression: 'Synthetic expression', model: 'gpt-5.6-sol', promptLabel: 'Synthetic prompt', createdAt: at, sequence: 1, developing: true, purposes: [] };
const angles: DemoIdea[] = Array.from({ length: 21 }, (_, index) => ({
  ideaId: idFor(index + 2), campaignId, kind: 'ANGLE', parentIdeaId: bigIdeaId, ordinal: index + 1, requestId: idFor(index + 30),
  concept: `Synthetic angle ${index + 1}`, name: `Angle ${index + 1}`, model: 'gpt-5.6-sol', promptLabel: 'Synthetic prompt', createdAt: at,
  sequence: 1, developing: false, purposes: ['SALES'],
}));

test('IdeasPage renders CampaignSteps and caps package selection at PACKAGE_BATCH_LIMIT', async () => {
  const { default: IdeasPage } = await tsImport('../src/IdeasPage.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/IdeasPage');
  const dom = setupDom();
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.container);
  let demoIdeas = [...([bigIdea, ...angles])];
  await act(async () => {
    root.render(createElement(IdeasPage, {
      mode: 'demo', campaignId, kind: 'ANGLE', ownerToken: null, writesAvailable: true, demoCampaign: campaign,
      demoIdeas, setDemoIdeas: (next: DemoIdea[]) => { demoIdeas = next; }, demoTags: [], setDemoTags: () => undefined, demoPrompts: demoPromptList([]), notify: () => undefined,
    }));
    await Promise.resolve(); await Promise.resolve();
  });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });

  const steps = dom.container.querySelector('ol.insight-steps');
  assert.ok(steps);
  assert.equal(steps.querySelectorAll('li').length, 4);
  assert.equal(steps.querySelector('li.current a'), null);
  assert.equal(steps.querySelectorAll('li:not(.current) a').length, 3);
  assert.ok(steps.querySelector('li.current')?.textContent?.includes('Góc nội dung'));

  const picks = [...dom.container.querySelectorAll<HTMLInputElement>('input[id^="package-pick-"]')];
  assert.equal(picks.length, 21);
  assert.equal(picks.filter((input) => !input.disabled).length, 20);
  assert.equal(picks.filter((input) => input.disabled).length, 1);
  await act(async () => { picks[0]!.click(); picks[1]!.click(); await Promise.resolve(); });
  const packageLink = [...dom.container.querySelectorAll<HTMLAnchorElement>('a')].find((anchor) => anchor.textContent?.includes('Tạo Caption & Poster (2)'));
  assert.ok(packageLink);
  assert.equal(packageLink.href, `http://localhost/#/content/${campaignId}/package/new?angles=A1,A2`);
  assert.equal(packageLink.getAttribute('href'), `#/content/${campaignId}/package/new?angles=A1,A2`);

  await act(async () => { root.unmount(); });
  dom.cleanup();
});

