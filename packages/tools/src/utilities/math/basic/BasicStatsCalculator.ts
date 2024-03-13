import { utilities } from '@cornerstonejs/core';
import { NamedStatistics } from '../../../types';
import Calculator from './Calculator';

const { PointsManager } = utilities;

export default class BasicStatsCalculator extends Calculator {
  private static max = [-Infinity];
  private static min = [-Infinity];
  private static sum = [0];
  private static sumSquares = [0];
  private static squaredDiffSum = [0];
  private static count = 0;
  // Collect the points to be returned
  private static pointsInShape = PointsManager.create3(1024);

  public static statsInit(options: { noPointsCollection: boolean }) {
    if (options.noPointsCollection) {
      this.pointsInShape = null;
    }
  }

  /**
   * This callback is used when we verify if the point is in the annotion drawn so we can get every point
   * in the shape to calculate the statistics
   * @param value of the point in the shape of the annotation
   */
  static statsCallback = ({ value: newValue, pointLPS = null }): void => {
    if (
      Array.isArray(newValue) &&
      newValue.length > 1 &&
      this.max.length === 1
    ) {
      this.max.push(this.max[0], this.max[0]);
      this.min.push(this.min[0], this.min[0]);
      this.sum.push(this.sum[0], this.sum[0]);
      this.sumSquares.push(this.sumSquares[0], this.sumSquares[0]);
      this.squaredDiffSum.push(this.squaredDiffSum[0], this.squaredDiffSum[0]);
      this.pointsInShape?.push(pointLPS);
    }

    const newArray = Array.isArray(newValue) ? newValue : [newValue];
    this.count += 1;

    this.max.forEach(
      (it, idx) => (this.max[idx] = Math.max(it, newArray[idx]))
    );
    this.min.forEach(
      (it, idx) => (this.min[idx] = Math.min(it, newArray[idx]))
    );
    this.sum.map((it, idx) => (this.sum[idx] += newArray[idx]));
    this.sumSquares.map(
      (it, idx) => (this.sumSquares[idx] += newArray[idx] ** 2)
    );
    this.squaredDiffSum.map(
      (it, idx) =>
        (this.squaredDiffSum[idx] += Math.pow(
          newArray[idx] - this.sum[idx] / this.count,
          2
        ))
    );
    this.pointsInShape = PointsManager.create3(1024);
  };

  /**
   * Basic function that calculates statictics for a given array of points.
   * @returns An object that contains :
   * max : The maximum value of the array
   * mean : mean of the array
   * stdDev : standard deviation of the array
   * stdDevWithSumSquare : standard deviation of the array using sum²
   * array : An array of hte above values, in order.
   */

  static getStatistics = (options?: { unit: string }): NamedStatistics => {
    const mean = this.sum.map((sum) => sum / this.count);
    const stdDev = this.squaredDiffSum.map((squaredDiffSum) =>
      Math.sqrt(squaredDiffSum / this.count)
    );
    const stdDevWithSumSquare = this.sumSquares.map((it, idx) =>
      Math.sqrt(this.sumSquares[idx] / this.count - mean[idx] ** 2)
    );

    const unit = options?.unit || null;

    const named: NamedStatistics = {
      max: {
        name: 'max',
        label: 'Max Pixel',
        value: singleArrayAsNumber(this.max),
        unit,
      },
      min: {
        name: 'min',
        label: 'Min Pixel',
        value: singleArrayAsNumber(this.min),
        unit,
      },
      mean: {
        name: 'mean',
        label: 'Mean Pixel',
        value: singleArrayAsNumber(mean),
        unit,
      },
      stdDev: {
        name: 'stdDev',
        label: 'Standard Deviation',
        value: singleArrayAsNumber(stdDev),
        unit,
      },
      stdDevWithSumSquare: {
        name: 'stdDevWithSumSquare',
        value: singleArrayAsNumber(stdDevWithSumSquare),
        unit,
      },
      count: {
        name: 'count',
        label: 'Pixel Count',
        value: this.count,
        unit: null,
      },
      pointsInShape: this.pointsInShape,
      array: [],
    };
    named.array.push(
      named.max,
      named.mean,
      named.stdDev,
      named.stdDevWithSumSquare,
      named.count
    );

    this.max = [-Infinity];
    this.min = [Infinity];
    this.sum = [0];
    this.sumSquares = [0];
    this.squaredDiffSum = [0];
    this.count = 0;

    return named;
  };
}

function singleArrayAsNumber(val: number[]) {
  return val.length === 1 ? val[0] : val;
}
