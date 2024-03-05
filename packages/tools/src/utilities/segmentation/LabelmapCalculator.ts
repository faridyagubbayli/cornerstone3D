import { NamedStatistics } from '../../types';
import { segmentIndex } from '../../stateManagement/segmentation';
import { BasicStatsCalculator } from '../math/basic';
import { LabelmapToolOperationDataAny } from '../../types/LabelmapToolOperationData';
import { getStrategyData } from '../../tools/segmentation/strategies/utils/getStrategyData';

/**
 * A labelmap calculator, to find the basic statistics for labelmap volume data.
 */
export default class LabelmapCalculator {
  public static getStatistics(
    operationData: LabelmapToolOperationDataAny,
    viewport,
    options: { indices?: number | number[] }
  ): NamedStatistics {
    let { indices } = options;
    const { segmentationId } = operationData;
    if (!indices) {
      indices = [segmentIndex.getActiveSegmentIndex(segmentationId)];
    } else if (!Array.isArray(indices)) {
      // Include the preview index
      indices = [indices, 255];
    }
    const indicesArr = indices as number[];

    const {
      segmentationVoxelManager,
      imageVoxelManager,
      segmentationImageData,
    } = getStrategyData({
      operationData,
      viewport,
    });

    const spacing = segmentationImageData.getSpacing();

    segmentationVoxelManager.forEach((voxel) => {
      const { value, pointIJK } = voxel;
      if (indicesArr.indexOf(value) === -1) {
        return;
      }
      const imageValue = imageVoxelManager.getAtIJKPoint(pointIJK);
      BasicStatsCalculator.statsCallback({ value: imageValue });
    });

    const volumeUnit = spacing ? 'mm\xb3' : 'voxels\xb3';
    const volumeScale = spacing ? spacing[0] * spacing[1] * spacing[2] : 1;

    const stats = BasicStatsCalculator.getStatistics();
    stats.volume = {
      value: Array.isArray(stats.count.value)
        ? stats.count.value.map((v) => v * volumeScale)
        : stats.count.value * volumeScale,
      unit: volumeUnit,
      name: 'volume',
    };
    stats.array.push(stats.volume);
    return stats;
  }
}
