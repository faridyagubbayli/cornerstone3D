import type {
  IImage,
  ViewPresentation,
  ViewReference,
  ViewportInputOptions,
  Point3,
  IVolume,
} from '../types';

import { loadAndCacheImage } from '../loaders/imageLoader';
import * as metaData from '../metaData';
import { RequestType } from '../enums';
import imageLoadPoolManager from '../requestPool/imageLoadPoolManager';
import renderToCanvasGPU from './renderToCanvasGPU';
import renderToCanvasCPU from './renderToCanvasCPU';
import { getConfiguration } from '../init';
import cache from '../cache';

/**
 * A type constraint to define the imageId and exclude the viewReference,
 * used in the image load options.
 */
type ImageIdConstraint = {
  imageId: string;
  viewReference: undefined;
};

/**
 * A type constraint to define the view reference, and not allow the imageId in the
 * image load options.
 */
type ViewReferenceConstraint = {
  viewReference: ViewReference;
  imageId: undefined;
};

/**
 * The image canvas can be loaded/set with various view conditions to specify the initial
 * view as well as how and where to render the image.
 * Stack views are specified with an imageId to view, while volume views are
 * specified with a viewReference and optionally a viewPresentation.
 */
export type LoadImageOptions = {
  canvas: HTMLCanvasElement;
  /**
   * Either the imageID or view reference is required, as defined in type
   * constraints.
   */
  imageId?: string;
  viewReference?: ViewReference;
  viewPresentation?: ViewPresentation;
  requestType?: RequestType;
  priority?: number;
  renderingEngineId?: string;
  useCPURendering?: boolean;
  // Render a thumbnail in a 256x256 viewport
  // Also set imageAspect to render thumbnail in an aspect ratio width viewport
  thumbnail?: boolean;
  // Sets the CSS width to the image aspect ratio
  imageAspect?: boolean;
  // Sets the canvas pixel size to the physical pixel size of the image area
  physicalPixels?: boolean;
  // Sets the viewport input options  Defaults to scale to fit 110%
  viewportOptions?: ViewportInputOptions;
} & (ImageIdConstraint | ViewReferenceConstraint);

/**
 * The canvas load position allows for determining the rendered position of
 * image data within the canvas, and can be used to map loaded canvas points
 * to and from other viewport positions for things like external computations
 * on the load image to canvas view and the viewport view (which may contain
 * extraneous data such as segmentation and thus not be usable for external
 * computations.)
 */
export type CanvasLoadPosition = {
  /**
   *  The origin of canvas rendered, as world point.  This is the
   * canvas position `[0,0]` in world coordinates.
   */
  origin: Point3;
  /**
   * The top right canvas position in world coordinates - that is, the canvas
   * point `[width,0]` in world coordinates.
   */
  topRight: Point3;
  /**
   * The bottom left canvas position in world coordinates.  That is, `[0,height]`
   * in world coordinates.
   */
  bottomLeft: Point3;
};

/**
 * Loads and renders an imageId to a Canvas. It will use the GPU rendering pipeline
 * for image by default but you can force the CPU rendering pipeline by setting the
 * useCPURendering parameter to true.
 *
 * For volume views, the volume is specified by a volumeId, which must be in the
 * same rendering engine in which it was originally created.  This isn't otherwise
 * loaded, and the data needs to already be available.
 *
 * @example
 * ```
 * const canvas = document.getElementById('myCanvas')
 * const imageId = 'myImageId'
 *
 * loadImageToCanvas(canvas, imageId)
 * ```
 * @param canvas - Canvas element to render to
 * @param imageId - The imageId to render
 * @param requestType - The type of request (default to interaction), can be 'interaction' or 'prefetch' or 'thumbnail'
 * the order of loading for the pool manager is interaction, thumbnail, prefetch
 * @param priority - The priority of the request within the request type (lower is higher priority)
 * @param useCPURendering - Force the use of the CPU rendering pipeline (default to false)
 * @param thumbnail - Render a thumbnail image
 * @param imageAspect - assign the width based on the aspect ratio of the image
 * @returns - A promise that resolves when the image has been rendered with the imageId
 */
export default function loadImageToCanvas(
  options: LoadImageOptions
): Promise<CanvasLoadPosition> {
  const {
    canvas,
    imageId,
    viewReference = null,
    requestType = RequestType.Thumbnail,
    priority = -5,
    renderingEngineId = '_thumbnails',
    useCPURendering = false,
    thumbnail = false,
    imageAspect = false,
    viewportOptions: baseViewportOptions,
  } = options;
  const volumeId = viewReference?.volumeId;
  const isVolume = volumeId && !imageId;
  const viewportOptions =
    viewReference && baseViewportOptions
      ? { ...baseViewportOptions, viewReference }
      : baseViewportOptions;

  const renderFn = useCPURendering ? renderToCanvasCPU : renderToCanvasGPU;

  return new Promise((resolve, reject) => {
    function successCallback(imageOrVolume: IImage | IVolume, imageId: string) {
      const { modality } = metaData.get('generalSeriesModule', imageId) || {};

      const image = !isVolume && (imageOrVolume as IImage);
      const volume = isVolume && (imageOrVolume as IVolume);
      if (image) {
        image.isPreScaled = image.isPreScaled || image.preScale?.scaled;
      }

      if (thumbnail) {
        canvas.height = 256;
        canvas.width = 256;
      }
      if (imageAspect && image) {
        canvas.width = image && (canvas.height * image.width) / image.height;
      }
      canvas.style.width = `${canvas.width / devicePixelRatio}px`;
      canvas.style.height = `${canvas.height / devicePixelRatio}px`;
      if (volume && useCPURendering) {
        reject(new Error('CPU rendering of volume not supported'));
      }
      renderFn(
        canvas,
        imageOrVolume,
        modality,
        renderingEngineId,
        viewportOptions
      ).then(resolve);
    }

    function errorCallback(error: Error, imageId: string) {
      console.error(error, imageId);
      reject(error);
    }

    function sendRequest(imageId, imageIdIndex, options) {
      return loadAndCacheImage(imageId, options).then(
        (image) => {
          successCallback.call(this, image, imageId);
        },
        (error) => {
          errorCallback.call(this, error, imageId);
        }
      );
    }

    const { useNorm16Texture, preferSizeOverAccuracy } =
      getConfiguration().rendering;
    const useNativeDataType = useNorm16Texture || preferSizeOverAccuracy;

    // IMPORTANT: Request type should be passed if not the 'interaction'
    // highest priority will be used for the request type in the imageRetrievalPool
    const options = {
      targetBuffer: {
        type: useNativeDataType ? undefined : 'Float32Array',
      },
      preScale: {
        enabled: true,
      },
      useNativeDataType,
      useRGBA: !!useCPURendering,
      requestType,
    };

    if (volumeId) {
      const volume = cache.getVolume(volumeId) as unknown as IVolume;
      if (!volume) {
        reject(new Error(`Volume id ${volumeId} not found in cache`));
      }
      const useImageId = volume.imageIds[0];
      successCallback(volume, useImageId);
    } else {
      imageLoadPoolManager.addRequest(
        sendRequest.bind(null, imageId, null, options),
        requestType,
        { imageId },
        priority
      );
    }
  });
}
