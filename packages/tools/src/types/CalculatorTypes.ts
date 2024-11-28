import type { Types } from '@cornerstonejs/core';

type Statistics = {
  name: string;
  label?: string;
  value: number | number[];
  unit: null | string;
};

type NamedStatistics = {
  mean: Statistics & { name: 'mean' };
  max: Statistics & { name: 'max' };
  min: Statistics & { name: 'min' };
  stdDev: Statistics & { name: 'stdDev' };
  count: Statistics & { name: 'count' };
  area?: Statistics & { name: 'area' };
  volume?: Statistics & { name: 'volume' };
  circumference?: Statistics & { name: 'circumference' };
  pointsInShape?: Types.IPointsManager<Types.Point3>;
  array: Statistics[];
  /** The array of points that this statistic is calculated on. */
};

export type { Statistics, NamedStatistics };
