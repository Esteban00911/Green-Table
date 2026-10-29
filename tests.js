const assert = require('node:assert/strict');
const { calculateSidePots, getUncalledExcess, isRaiseReopened, splitPot } = require('./poker-rules.js');
const p = (name, handBet, folded = false) => ({ id: name, name, handBet, folded, eliminated: false });

// Pot principal + pot secondaire avec tapis inégaux : 100 / 200 / 200.
{
  const pots = calculateSidePots([p('A', 100), p('B', 200), p('C', 200)]);
  assert.deepEqual(pots.map(x => x.amount), [300, 200]);
  assert.deepEqual(pots.map(x => x.eligible.map(y => y.id)), [['A','B','C'], ['B','C']]);
  assert.equal(pots.reduce((sum, x) => sum + x.amount, 0), 500);
}
// A folded player's chips remain in the pot, but they cannot win it.
{
  const pots = calculateSidePots([p('A', 100, true), p('B', 200), p('C', 300)]);
  assert.deepEqual(pots.map(x => x.amount), [300, 200, 100]);
  assert.deepEqual(pots.map(x => x.eligible.map(y => y.id)), [['B','C'], ['B','C'], ['C']]);
  assert.equal(pots.reduce((sum, x) => sum + x.amount, 0), 600);
}
// An uncalled layer still needs a live eligible player; ordinary all-in side pot.
{
  const pots = calculateSidePots([p('A', 50), p('B', 50), p('C', 125)]);
  assert.deepEqual(pots.map(x => x.amount), [150, 75]);
  assert.deepEqual(pots[1].eligible.map(y => y.id), ['C']);
}
// Uncalled excess is returned before the side pots are awarded.
{
  const players = [p('A', 300), p('B', 200), p('C', 100)];
  const unmatched = getUncalledExcess(players);
  assert.equal(unmatched.player.id, 'A');
  assert.equal(unmatched.amount, 100);
  unmatched.player.handBet -= unmatched.amount;
  const pots = calculateSidePots(players);
  assert.deepEqual(pots.map(x => x.amount), [300, 200]);
  assert.ok(pots.every(pot => pot.eligible.length > 0));
}
// Short all-in does not reopen raising until the cumulative increase reaches the prior full raise.
{
  const player = { acted: true, lastActedBet: 100, lastActedRaiseSize: 50 };
  assert.equal(isRaiseReopened(player, 125), false);
  assert.equal(isRaiseReopened(player, 150), true);
  assert.equal(isRaiseReopened({ acted: false }, 125), true);
}
assert.deepEqual(splitPot(101, 2), [51, 50]);
assert.deepEqual(splitPot(17, 3), [6, 6, 5]);
console.log('Poker rules tests passed: side pots, folded contributions, all-in eligibility, raise reopening, split pots.');
