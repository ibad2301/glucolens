import { estimateHbA1c } from './index';

describe('estimateHbA1c', () => {
  // Hand-computed via the Nathan et al. formula: HbA1c = (avgGlucose + 46.7) / 28.7,
  // rounded to 1 decimal. 126/154/183/212 also match the ADA's published
  // eAG-to-A1C conversion table (6% / 7% / 8% / 9%), an independent check.
  test.each([
    [0, 1.6],     // (0 + 46.7) / 28.7 = 1.6272... -> 1.6
    [100, 5.1],   // (100 + 46.7) / 28.7 = 5.1115... -> 5.1
    [126, 6.0],   // (126 + 46.7) / 28.7 = 6.0174... -> 6.0 (ADA table: 6%)
    [154, 7.0],   // (154 + 46.7) / 28.7 = 6.9930... -> 7.0 (ADA table: 7%)
    [183, 8.0],   // (183 + 46.7) / 28.7 = 8.0034... -> 8.0 (ADA table: 8%)
    [212, 9.0],   // (212 + 46.7) / 28.7 = 9.0139... -> 9.0 (ADA table: 9%)
  ])('estimateHbA1c(%d) = %f', (avg, expected) => {
    expect(estimateHbA1c(avg)).toBeCloseTo(expected, 1);
  });
});
