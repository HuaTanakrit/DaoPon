import { predictionWindow } from '../src/predictions/prediction-window';

describe('Seven-day prediction window in replay time', () => {
  const kickoff = new Date('2024-11-02T15:00:00Z');
  it('opens exactly seven days before kickoff, including historical FT fixtures', () => {
    expect(predictionWindow(kickoff, '2024-10-26T14:59:59.999Z', 'FT').state).toBe('NOT_OPEN');
    expect(predictionWindow(kickoff, '2024-10-26T15:00:00.000Z', 'FT').canPredict).toBe(true);
  });
  it('closes at kickoff and stays closed afterwards', () => {
    expect(predictionWindow(kickoff, '2024-11-02T14:59:59.999Z', 'FT').canPredict).toBe(true);
    expect(predictionWindow(kickoff, '2024-11-02T15:00:00.000Z', 'FT').state).toBe('CLOSED');
    expect(predictionWindow(kickoff, '2024-11-02T17:00:00.000Z', 'FT').canPredict).toBe(false);
  });
  it('does not open for postponed, cancelled or undated fixtures', () => {
    expect(predictionWindow(kickoff, '2024-11-01T15:00:00Z', 'PST').state).toBe('UNAVAILABLE');
    expect(predictionWindow(kickoff, '2024-11-01T15:00:00Z', 'CANC').canPredict).toBe(false);
    expect(predictionWindow(null, '2024-11-01T15:00:00Z', 'TBD').canPredict).toBe(false);
  });
});
