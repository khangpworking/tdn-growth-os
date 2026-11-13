/** A scripted stand-in for the Jev client of rule metric-products-unique-v2. It never reaches the network. */
export type Scripted = [string, Record<string, number>] | 'http-error' | 'malformed' | 'throws';

export function fakeJev(script: Scripted[]) {
  const asked: any[][] = [];
  const jev = {
    model: 'jev-1.13.0',
    answerRaw: async (questions: readonly any[]) => {
      asked.push(structuredClone([...questions]));
      const next = script.shift();
      if (next === undefined) throw new Error('unexpected Jev question');
      if (next === 'throws') throw new Error('network down');
      if (next === 'http-error') return { status: 503, body: null };
      const answer = next === 'malformed' ? { type: 'choice', choice: 'MOI', probabilities: { MOI: 1 }, confidence: 1 }
        : { type: 'choice', choice: next[0], probabilities: next[1], confidence: next[1][next[0]] };
      return { status: 200, body: Buffer.from(JSON.stringify({ model: 'jev-1.13.0', answers: { [questions[0].id]: answer } })) };
    },
  };
  return { jev, asked };
}

/** An answer over SP1..SPn + MOI: probability p on `choice`, the rest spread over the other options. */
export function answer(picked: number, choice: string, p: number): Scripted {
  const options = [...Array.from({ length: picked }, (_, i) => 'SP' + (i + 1)), 'MOI'];
  const rest = (1 - p) / (options.length - 1);
  return [choice, Object.fromEntries(options.map(option => [option, option === choice ? p : rest]))];
}

export const noWait = async () => {};
