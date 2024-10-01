import { addAnnotation } from '../../../../stateManagement/annotation/annotationState';
import type { Types, StackViewport } from '@cornerstonejs/core';
import { cache, utilities } from '@cornerstonejs/core';
import { getClosestImageIdForStackViewport } from '../../../../utilities/annotationHydration';

import { addContourSegmentationAnnotation } from '../../../../utilities/contourSegmentation';

import { validateGeometry } from './utils';
import type { ContourRepresentation } from '../../../../types/SegmentationStateTypes';
import { SegmentationRepresentations } from '../../../../enums';
import { segmentationStyle } from '../../../../stateManagement/segmentation/SegmentationStyle';
import { internalGetHiddenSegmentIndices } from '../../../../stateManagement/segmentation/helpers/internalGetHiddenSegmentIndices';

function handleContourSegmentation(
  viewport: StackViewport | Types.IVolumeViewport,
  geometryIds: string[],
  annotationUIDsMap: Map<number, Set<string>>,
  contourRepresentation: ContourRepresentation
) {
  if (annotationUIDsMap.size) {
    updateContourSets(viewport, geometryIds, contourRepresentation);
  } else {
    addContourSetsToElement(viewport, geometryIds, contourRepresentation);
  }
}

function updateContourSets(
  viewport: Types.IVolumeViewport | StackViewport,
  geometryIds: string[],
  contourRepresentation: ContourRepresentation
) {
  const { segmentationId } = contourRepresentation;

  const { segmentSpecificConfigs } = geometryIds.reduce(
    (acc, geometryId) => {
      const geometry = cache.getGeometry(geometryId);
      const { data: contourSet } = geometry;
      const segmentIndex = (contourSet as Types.IContourSet).getSegmentIndex();
      const segmentSpecificConfig = segmentationStyle.getStyle({
        viewportId: viewport.id,
        segmentationId,
        type: SegmentationRepresentations.Contour,
        segmentIndex,
      });
      acc.segmentSpecificConfigs[segmentIndex] = segmentSpecificConfig ?? {};

      return acc;
    },
    { contourSets: [], segmentSpecificConfigs: {} }
  );

  viewport.render();
}

function addContourSetsToElement(
  viewport: StackViewport | Types.IVolumeViewport,
  geometryIds: string[],
  contourRepresentation: ContourRepresentation
) {
  const { segmentationId } = contourRepresentation;

  const segmentSpecificMap = new Map();

  geometryIds.forEach((geometryId) => {
    const geometry = cache.getGeometry(geometryId);

    if (!geometry) {
      console.warn(
        `No geometry found for geometryId ${geometryId}. Skipping render.`
      );
      return;
    }

    const segmentIndex = (geometry.data as Types.IContourSet).getSegmentIndex();

    validateGeometry(geometry);

    const segmentSpecificConfig = segmentationStyle.getStyle({
      viewportId: viewport.id,
      segmentationId,
      type: SegmentationRepresentations.Contour,
      segmentIndex,
    });

    const contourSet = geometry.data as Types.IContourSet;

    contourSet.contours.forEach((contour) => {
      const { points, color, id } = contour;
      const contourSegmentationAnnotation = {
        annotationUID: utilities.uuidv4(),
        data: {
          contour: {
            closed: true,
            polyline: points,
          },
          segmentation: {
            segmentationId,
            segmentIndex,
            color,
            id,
          },
          handles: {},
        },
        handles: {},
        highlighted: false,
        autoGenerated: false,
        invalidated: false,
        isLocked: true,
        isVisible: true,
        metadata: {
          referencedImageId: getClosestImageIdForStackViewport(
            viewport as StackViewport,
            points[0],
            viewport.getCamera().viewPlaneNormal
          ),
          toolName: 'PlanarFreehandContourSegmentationTool',
          FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
          viewPlaneNormal: viewport.getCamera().viewPlaneNormal,
        },
      };
      const annotationGroupSelector = viewport.element;

      addAnnotation(contourSegmentationAnnotation, annotationGroupSelector);

      addContourSegmentationAnnotation(contourSegmentationAnnotation);
    });

    if (segmentSpecificConfig) {
      segmentSpecificMap.set(segmentIndex, segmentSpecificConfig);
    }
  });

  viewport.resetCamera();
  viewport.render();
}

export {
  handleContourSegmentation,
  updateContourSets,
  addContourSetsToElement,
};
