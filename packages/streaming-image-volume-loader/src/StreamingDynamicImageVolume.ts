import { eventTarget, triggerEvent, type Types } from '@cornerstonejs/core';
import BaseStreamingImageVolume from './BaseStreamingImageVolume';
import { Events as StreamingEvents } from './enums';

/**
 * Streaming Image Volume Class that extends StreamingImageVolume base class.
 * It implements load method to load the imageIds and insert them into the volume.
 */
export default class StreamingDynamicImageVolume
  extends BaseStreamingImageVolume
  implements Types.IDynamicImageVolume
{
  private _timePointIndex = 0;
  private _splittingTag: string;
  private _imageIdGroups: string[][];

  public numTimePoints: number;

  constructor(
    imageVolumeProperties: Types.ImageVolumeProps & {
      splittingTag: string;
      imageIdGroups: string[][];
    },
    streamingProperties: Types.IStreamingVolumeProperties
  ) {
    super(imageVolumeProperties, streamingProperties);
    const { imageIdGroups, splittingTag } = imageVolumeProperties;
    this._splittingTag = splittingTag;
    this._imageIdGroups = imageIdGroups;
    this.numTimePoints = this._imageIdGroups.length;
  }

  private _getImageIdsToLoad(): string[] {
    const imageIdGroups = this._imageIdGroups;
    const initialImageIdGroupIndex = this._timePointIndex;
    const imageIds = [...imageIdGroups[initialImageIdGroupIndex]];

    let leftIndex = initialImageIdGroupIndex - 1;
    let rightIndex = initialImageIdGroupIndex + 1;

    while (leftIndex >= 0 || rightIndex < imageIdGroups.length) {
      if (leftIndex >= 0) {
        imageIds.push(...imageIdGroups[leftIndex--]);
      }

      if (rightIndex < imageIdGroups.length) {
        imageIds.push(...imageIdGroups[rightIndex++]);
      }
    }

    return imageIds;
  }

  private _getImageIdRequests = (imageIds, priority: number) => {
    return this.getImageIdsRequests(imageIds, priority);
  };

  public getImageIdsToLoad(): string[] {
    return this._getImageIdsToLoad();
  }

  /**
   * Returns the active imageIdGroup index
   * @returns active imageIdGroup index
   */
  public get timePointIndex(): number {
    return this._timePointIndex;
  }

  /**
   * Scroll properly to enable looping
   * @param delta
   */
  public scroll(delta: number): void {
    const newIndex = this._timePointIndex + delta;

    if (newIndex < 0) {
      this.timePointIndex = this.numTimePoints - 1;
    } else if (newIndex >= this.numTimePoints) {
      this.timePointIndex = 0;
    } else {
      this.timePointIndex = newIndex;
    }
  }

  /**
   * Set the active imageIdGroup index which also updates the active scalar data
   * @returns current imageIdGroup index
   */
  public set timePointIndex(index: number) {
    // Nothing to do when imageIdGroup index does not change
    if (this._timePointIndex === index) {
      return;
    }

    this._timePointIndex = index;
    // @ts-ignore
    this.voxelManager.setTimePoint(index);

    this.invalidateVolume(true);

    triggerEvent(
      eventTarget,
      StreamingEvents.DYNAMIC_VOLUME_TIME_POINT_INDEX_CHANGED,
      {
        volumeId: this.volumeId,
        imageIdGroupIndex: index,
        numImageIdGroups: this.numTimePoints,
        splittingTag: this.splittingTag,
      }
    );
  }

  public getCurrentTimePointImageIds(): string[] {
    return this._imageIdGroups[this._timePointIndex];
  }

  public flatImageIdIndexToTimePointIndex(flatImageIdIndex: number): number {
    return Math.floor(flatImageIdIndex / this._imageIdGroups[0].length);
  }

  public flatImageIdIndexToImageIdIndex(flatImageIdIndex: number): number {
    return flatImageIdIndex % this._imageIdGroups[0].length;
  }

  /**
   * Returns the splitting tag used to split the imageIds in 4D volume
   */
  public get splittingTag(): string {
    return this._splittingTag;
  }

  /**
   * It returns the imageLoad requests for the streaming image volume instance.
   * It involves getting all the imageIds of the volume and creating a success callback
   * which would update the texture (when the image has loaded) and the failure callback.
   * Note that this method does not execute the requests but only returns the requests.
   * It can be used for sorting requests outside of the volume loader itself
   * e.g. loading a single slice of CT, followed by a single slice of PET (interleaved), before
   * moving to the next slice.
   *
   * @returns Array of requests including imageId of the request, its imageIdIndex,
   * options (targetBuffer and scaling parameters), and additionalDetails (volumeId)
   */
  public getImageLoadRequests = (priority: number) => {
    const imageIds = this.getImageIdsToLoad();
    return this._getImageIdRequests(imageIds, priority);
  };
}
