import { scoreNames, scoreResult } from '../src/predictions/scoring';
describe('Starting XI points', () => {
  it('awards one per matching player regardless of lineup order or position', () => {
    const actual = Array.from({ length: 11 }, (_, i) => i + 1);
    expect(scoreNames([...actual].reverse(), actual).score).toBe(11);
    expect(scoreNames([1, 3, 5, 7, 9, 20, 21, 22, 23, 24, 25], actual).score).toBe(5);
  });
  it('cannot double count duplicate names/IDs', () => {
    expect(scoreNames([1, 1, 2, 2, 99], [1, 2, 3]).score).toBe(2);
  });
});

describe('Score prediction points', () => {
  it.each([
    [2, 1, 2, 1, 3], [0, 0, 0, 0, 3], [1, 2, 1, 2, 3],
    [3, 0, 2, 1, 1], [0, 2, 1, 3, 1], [2, 2, 1, 1, 1], [0, 0, 2, 2, 1],
    [2, 0, 1, 1, 0], [0, 1, 2, 0, 0], [1, 1, 2, 0, 0],
  ])('prediction %i–%i vs actual %i–%i earns %i', (home, away, actualHome, actualAway, points) => {
    expect(scoreResult(home, away, actualHome, actualAway)).toBe(points);
  });
});
