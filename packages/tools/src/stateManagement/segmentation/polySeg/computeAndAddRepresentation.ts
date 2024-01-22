import { eventTarget } from '@cornerstonejs/core';
import { Events, SegmentationRepresentations } from '../../../enums';
import addRepresentationData from '../addRepresentationData';
import { triggerSegmentationModified } from '../triggerSegmentationEvents';
import { debounce } from '../../../utilities';

const computedRepresentations = new Map<
  string,
  SegmentationRepresentations[]
>();

// const debouncedSegmentationModified = debounce((event: CustomEvent) => {
//   const segmentationId = event.detail.segmentationId;
//   const representations = computedRepresentations.get(segmentationId);

//   if (representations?.length) {
//     triggerSegmentationModified(segmentationId);
//   }
// }, 300);

/**
 * Computes a representation using the provided computation function, adds the computed data,
 * subscribes to segmentation changes, and triggers segmentation modification.
 *
 * @param segmentationId - The ID of the segmentation.
 * @param representationType - The type of the segmentation representation.
 * @param computeFunction - The function that computes the representation data.
 * @param options - Additional options for computing the representation.
 * @returns - A promise that resolves with the computed representation data.
 */
async function computeAndAddRepresentation<T>(
  segmentationId: string,
  representationType: SegmentationRepresentations,
  computeFunction: () => Promise<T>,
  options: any
): Promise<T> {
  // Compute the specific representation data
  const data = await computeFunction();

  // Add the computed data to the system
  addRepresentationData({
    segmentationId,
    type: representationType,
    data: { ...data },
  });

  // Update internal structures and possibly UI components
  if (!computedRepresentations.has(segmentationId)) {
    computedRepresentations.set(segmentationId, []);
  }

  const representations = computedRepresentations.get(segmentationId);
  if (!representations.includes(representationType)) {
    representations.push(representationType);
  }

  // Subscribe to any changes in the segmentation data for real-time updates
  // subscribeToSegmentationChanges();

  // Notify other system parts that segmentation data has been modified
  triggerSegmentationModified(segmentationId);

  return data;
}

function unsubscribeFromSegmentationChanges() {
  eventTarget.removeEventListener(
    Events.SEGMENTATION_DATA_MODIFIED,
    this._debouncedSegmentationModified
  );
}

/**
 * Subscribes to segmentation changes by adding an event listener for the SEGMENTATION_DATA_MODIFIED event.
 * If there is an existing listener, it will be unsubscribed before adding the new listener.
 */
function subscribeToSegmentationChanges() {
  this.unsubscribeFromSegmentationChanges();

  eventTarget.addEventListener(
    Events.SEGMENTATION_DATA_MODIFIED,
    this._debouncedSegmentationModified
  );
}

export { computeAndAddRepresentation };
