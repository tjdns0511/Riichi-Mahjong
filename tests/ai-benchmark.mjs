import { mkdir, writeFile } from 'node:fs/promises';
import { runBenchmarkMatch, summarizeBenchmark } from './benchmark-core.js';
const seeds = [104729, 130363, 155921, 196613, 262147, 327673, 393241, 524287];
const baseline = [], candidate = [], games = [];
for (const seed of seeds) {
  const old = runBenchmarkMatch(seed);
  games.push(old);
  for (let seat = 0; seat < 4; seat++) {
    baseline.push({ ...old.players[seat], rounds: old.rounds, seed, seat });
    const game = runBenchmarkMatch(seed, seat); games.push(game);
    candidate.push({ ...game.players[seat], rounds: game.rounds, seed, seat });
  }
  console.log('benchmark seed ' + seed + ' complete: baseline + four seat rotations');
}
const result = {
  baselineCommit: '1f5bee656b22d9dd3efd0e1f4ef29fe827da5632',
  seeds, matchCount: games.length, baseline: summarizeBenchmark(baseline),
  candidate: summarizeBenchmark(candidate), observations: { baseline, candidate }, games,
  limitations: [
    'Eight seeds, 32 paired seat observations; observations sharing a seed are correlated.',
    'No statistical significance or generalized strength improvement is asserted.',
    'Tenpai frequency counts all discard actions, including forced riichi discards.',
    'Unseen counts include hidden opponents and dead wall, never actual live-wall composition.',
    'Non-improving calls means no immediate shanten reduction, not proven strategic error.',
    'Late/threatened kan means live wall <12 or a public threat, not proven unnecessary.',
    'No opponent policy diversity: three frozen baseline Hard opponents.'
  ]
};
await mkdir('test-results', { recursive: true });
await writeFile('test-results/ai-benchmark.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ matches: result.matchCount, baseline: result.baseline, candidate: result.candidate }, null, 2));
