import cache from '../cache/cache';
import { ImageVolume } from '../cache';
import Events from '../enums/Events';
import eventTarget from '../eventTarget';
import {
  genericMetadataProvider,
  getBufferConfiguration,
  triggerEvent,
  uuidv4,
  VoxelManager,
} from '../utilities';
import {
  IImage,
  ImageLoaderFn,
  IImageLoadObject,
  EventTypes,
  Point2,
  Point3,
  Mat3,
  PixelDataTypedArrayString,
  PixelDataTypedArray,
} from '../types';
import imageLoadPoolManager from '../requestPool/imageLoadPoolManager';
import { metaData } from '../';

export interface ImageLoaderOptions {
  priority: number;
  requestType: string;
  additionalDetails?: Record<string, unknown>;
  ignoreCache?: boolean;
}

type LocalImageOptions = {
  scalarData?: PixelDataTypedArray;
  targetBufferType?: PixelDataTypedArrayString;
  dimensions?: Point2;
  spacing?: Point3;
  origin?: Point3;
  direction?: Mat3;
  /**
   * Skip creation of the actual buffer object.
   * In fact, this creates a very short buffer, as there are lots of places
   * assuming a buffer exists.
   * This can be used when there are alternative representations of the image data.
   */
  skipCreateBuffer?: boolean;
  /**
   * A method to call to update the image object when it gets added to the cache.
   * This can be used to create alternative representations of the image data,
   * such as a VoxelManager.
   */
  onCacheAdd?: (image: IImage) => void;
};

type DerivedImageOptions = LocalImageOptions & {
  imageId?: string;
};

/**
 * This module deals with ImageLoaders, loading images and caching images
 */
const imageLoaders = {};
let unknownImageLoader;

/**
 * Loads an image using a registered Cornerstone Image Loader.
 *
 * The image loader that is used will be
 * determined by the image loader scheme matching against the imageId.
 *
 * @param imageId - A Cornerstone Image Object's imageId
 * @param Options - to be passed to the Image Loader
 *
 * @returns - An Object which can be used to act after an image is loaded or loading fails
 */
function loadImageFromImageLoader(
  imageId: string,
  options: ImageLoaderOptions
): IImageLoadObject {
  // Extract the image loader scheme: wadors:https://image1 => wadors
  const colonIndex = imageId.indexOf(':');
  const scheme = imageId.substring(0, colonIndex);
  const loader = imageLoaders[scheme];
  if (loader === undefined || loader === null) {
    if (unknownImageLoader !== undefined) {
      return unknownImageLoader(imageId);
    }
    throw new Error('loadImageFromImageLoader: no image loader for imageId');
  }
  // Load using the registered loader
  const imageLoadObject = loader(imageId, options);

  // Broadcast an image loaded event once the image is loaded
  imageLoadObject.promise
    .then((image: IImage) => {
      const scalarData = image.getPixelData();
      const { width, height, numComps } = image;

      const voxelManager = VoxelManager.createImageVoxelManager({
        scalarData,
        width,
        height,
        numComps,
      });

      image.voxelManager = voxelManager;

      image.getPixelData = () => voxelManager.getScalarData();
      delete image.imageFrame.pixelData;

      triggerEvent(eventTarget, Events.IMAGE_LOADED, { image });
    })
    .catch((error) => {
      const errorObject: EventTypes.ImageLoadedFailedEventDetail = {
        imageId,
        error,
      };
      triggerEvent(eventTarget, Events.IMAGE_LOAD_FAILED, errorObject);
    });
  return imageLoadObject;
}

/**
 * Loads an image given an imageId and optional priority and returns a promise
 * which will resolve to the loaded image object or fail if an error occurred.
 * The loaded image is not stored in the cache.
 *
 *
 * @param imageId - A Cornerstone Image Object's imageId
 * @param options - Options to be passed to the Image Loader
 *
 * @returns An Object which can be used to act after an image is loaded or loading fails
 */
export function loadImage(
  imageId: string,
  options: ImageLoaderOptions = { priority: 0, requestType: 'prefetch' }
): Promise<IImage> {
  if (imageId === undefined) {
    throw new Error('loadImage: parameter imageId must not be undefined');
  }

  return loadImageFromImageLoader(imageId, options).promise;
}

/**
 * Loads an image given an imageId and optional priority and returns a promise
 * which will resolve to the loaded image object or fail if an error occurred.
 * The image is stored in the cache.
 *
 * @param imageId -  A Cornerstone Image Object's imageId
 * @param options - Options to be passed to the Image Loader
 *
 * @returns Image Loader Object
 */
export function loadAndCacheImage(
  imageId: string,
  options: ImageLoaderOptions = { priority: 0, requestType: 'prefetch' }
): Promise<IImage> {
  if (imageId === undefined) {
    throw new Error(
      'loadAndCacheImage: parameter imageId must not be undefined'
    );
  }
  const imageLoadObject = loadImageFromImageLoader(imageId, options);

  // if not inside cache, store it
  if (!cache.getImageLoadObject(imageId)) {
    cache.putImageLoadObject(imageId, imageLoadObject).catch((err) => {
      console.warn(err);
    });
  }

  return imageLoadObject.promise;
}

/**
 * Load and cache a list of imageIds
 *
 * @param imageIds - list of imageIds
 * @param options - options for loader
 *
 */
export function loadAndCacheImages(
  imageIds: Array<string>,
  options: ImageLoaderOptions = { priority: 0, requestType: 'prefetch' }
): Promise<IImage>[] {
  if (!imageIds || imageIds.length === 0) {
    throw new Error(
      'loadAndCacheImages: parameter imageIds must be list of image Ids'
    );
  }

  const allPromises = imageIds.map((imageId) => {
    return loadAndCacheImage(imageId, options);
  });

  return allPromises;
}

/**
 * Loads an image given an imageId and optional priority and returns a promise
 * which will resolve to the loaded image object or fail if an error occurred.
 * The image is stored in the cache.
 *
 * @param referencedImageId -  A Cornerstone Image Object's imageId
 * @param options - Options to be passed to the Image Loader
 *
 * @returns Image Loader Object
 */
export function createAndCacheDerivedImage(
  referencedImageId: string,
  options: DerivedImageOptions = {}
): IImage {
  if (referencedImageId === undefined) {
    throw new Error(
      'createAndCacheDerivedImage: parameter imageId must not be undefined'
    );
  }

  if (options.imageId === undefined) {
    options.imageId = `derived:${uuidv4()}`;
  }

  const { imageId, skipCreateBuffer, onCacheAdd } = options;

  const imagePlaneModule = metaData.get('imagePlaneModule', referencedImageId);

  const length = imagePlaneModule.rows * imagePlaneModule.columns;

  const { TypedArrayConstructor } = getBufferConfiguration(
    options.targetBufferType,
    length
  );

  // Use a buffer of size 1 for no data
  const imageScalarData = new TypedArrayConstructor(
    skipCreateBuffer ? 1 : length
  );
  const derivedImageId = imageId;
  ['imagePlaneModule', 'generalSeriesModule'].forEach((type) => {
    genericMetadataProvider.add(derivedImageId, {
      type,
      metadata: metaData.get(type, referencedImageId),
    });
  });

  const imagePixelModule = metaData.get('imagePixelModule', referencedImageId);
  // TODO - add a general way to specify this
  genericMetadataProvider.add(derivedImageId, {
    type: 'imagePixelModule',
    metadata: {
      ...imagePixelModule,
      bitsAllocated: 8,
      bitsStored: 8,
      highBit: 7,
      samplesPerPixel: 1,
      pixelRepresentation: 0,
    },
  });

  const localImage = createAndCacheLocalImage(
    {
      scalarData: imageScalarData,
      onCacheAdd,
      skipCreateBuffer,
      targetBufferType: imageScalarData.constructor
        .name as PixelDataTypedArrayString,
    },
    imageId
  );

  // 3. Caching the image
  if (!cache.getImageLoadObject(imageId)) {
    cache.putImageSync(imageId, localImage);
  }

  return localImage;
}

/**
 * Load and cache a list of imageIds
 *
 * @param referencedImageIds - list of imageIds
 * @param options
 * @param options.getDerivedImageId - function to get the derived imageId
 * @param options.targetBufferType - target buffer type
 * @param options.skipBufferCreate - avoid creating the buffer
 */
export function createAndCacheDerivedImages(
  referencedImageIds: Array<string>,
  options: DerivedImageOptions & {
    getDerivedImageId?: (referencedImageId: string) => string;
    targetBufferType?: PixelDataTypedArrayString;
  } = {}
): IImage[] {
  if (referencedImageIds?.length === 0) {
    throw new Error(
      'createAndCacheDerivedImages: parameter imageIds must be list of image Ids'
    );
  }

  const derivedImageIds = [];
  const images = referencedImageIds.map((referencedImageId) => {
    const newOptions: DerivedImageOptions = {
      imageId:
        options.getDerivedImageId?.(referencedImageId) || `derived:${uuidv4()}`,
      ...options,
    };
    derivedImageIds.push(newOptions.imageId);
    return createAndCacheDerivedImage(referencedImageId, newOptions);
  });

  return images;
}

export function createAndCacheLocalImage(
  options: LocalImageOptions,
  imageId: string
): IImage {
  const imagePlaneModule = metaData.get('imagePlaneModule', imageId);

  const width = imagePlaneModule.columns;
  const height = imagePlaneModule.rows;
  const length = width * height;
  const numComps = 1;

  const image = {
    imageId: imageId,
    intercept: 0,
    windowCenter: 0,
    windowWidth: 0,
    color: false,
    numComps: 1,
    dataType: options.targetBufferType,
    slope: 1,
    minPixelValue: 0,
    maxPixelValue: 255,
    rows: height,
    columns: width,
    getCanvas: undefined, // todo: which canvas?
    height,
    width,
    rgba: undefined, // todo: how
    columnPixelSpacing: imagePlaneModule.columnPixelSpacing,
    rowPixelSpacing: imagePlaneModule.rowPixelSpacing,
    FrameOfReferenceUID: imagePlaneModule.FrameOfReferenceUID,
    invert: false,
  } as IImage;

  if (options.scalarData) {
    const imageScalarData = options.scalarData;

    if (
      !(
        imageScalarData instanceof Uint8Array ||
        imageScalarData instanceof Float32Array ||
        imageScalarData instanceof Uint16Array ||
        imageScalarData instanceof Int16Array
      )
    ) {
      throw new Error(
        'To use createLocalVolume you should pass scalarData of type Uint8Array, Uint16Array, Int16Array or Float32Array'
      );
    }

    image.sizeInBytes = imageScalarData.byteLength;
    image.getPixelData = () => imageScalarData;
  } else if (options.skipCreateBuffer !== true) {
    const { numBytes, TypedArrayConstructor } = getBufferConfiguration(
      options.targetBufferType,
      length
    );

    const imageScalarData = new TypedArrayConstructor(length);

    image.sizeInBytes = numBytes;
    image.getPixelData = () => imageScalarData;
  }

  const voxelManager = VoxelManager.createImageVoxelManager({
    height,
    width,
    numComps,
    scalarData: image.getPixelData(),
  });

  image.getPixelData = () => voxelManager.getScalarData();

  image.voxelManager = voxelManager;

  // The onCacheAdd may modify the size in bytes for this image, which is ok,
  // as this is used after resolution for cache storage.  It may also do
  // thinks like adding alternative representations such as VoxelManager
  options.onCacheAdd?.(image);

  cache.putImageSync(image.imageId, image);

  return image;
}

/**
 * Removes the imageId from the request pool manager and executes the `cancel`
 * function if it exists.
 *
 * @param imageId - A Cornerstone Image Object's imageId
 *
 */
export function cancelLoadImage(imageId: string): void {
  const filterFunction = ({ additionalDetails }) => {
    if (additionalDetails.imageId) {
      return additionalDetails.imageId !== imageId;
    }

    // for volumes
    return true;
  };

  // Instruct the request pool manager to filter queued
  // requests to ensure requests we no longer need are
  // no longer sent.
  imageLoadPoolManager.filterRequests(filterFunction);

  // TODO: Cancel decoding and retrieval as well (somehow?)

  // cancel image loading if in progress
  const imageLoadObject = cache.getImageLoadObject(imageId);

  if (imageLoadObject) {
    imageLoadObject.cancelFn();
  }
}

/**
 * Removes the imageIds from the request pool manager and calls the `cancel`
 * function if it exists.
 *
 * @param imageIds - Array of Cornerstone Image Object's imageIds
 *
 */
export function cancelLoadImages(imageIds: Array<string>): void {
  imageIds.forEach((imageId) => cancelLoadImage(imageId));
}

/**
 * Removes all the ongoing image loads by calling the `cancel` method on each
 * imageLoadObject. If no `cancel` method is available, it will be ignored.
 *
 */
export function cancelLoadAll(): void {
  const requestPool = imageLoadPoolManager.getRequestPool();

  Object.keys(requestPool).forEach((type: string) => {
    const requests = requestPool[type];

    Object.keys(requests).forEach((priority) => {
      const requestDetails = requests[priority].pop();
      const additionalDetails = requestDetails.additionalDetails as any;
      const { imageId, volumeId } = additionalDetails;

      let loadObject;

      if (imageId) {
        loadObject = cache.getImageLoadObject(imageId);
      } else if (volumeId) {
        loadObject = cache.getVolumeLoadObject(volumeId);
      }
      if (loadObject) {
        loadObject.cancel();
      }
    });
    // resetting the pool types to be empty
    imageLoadPoolManager.clearRequestStack(type);

    // TODO: Clear retrieval and decoding queues as well
  });
}

/**
 * Registers an imageLoader plugin with cornerstone for the specified scheme
 *
 * @param scheme - The scheme to use for this image loader (e.g. 'dicomweb', 'wadouri', 'http')
 * @param imageLoader - A Cornerstone Image Loader function
 */
export function registerImageLoader(
  scheme: string,
  imageLoader: ImageLoaderFn
): void {
  imageLoaders[scheme] = imageLoader;
}
/**
 * Registers a new unknownImageLoader and returns the previous one
 *
 * @param imageLoader - A Cornerstone Image Loader
 *
 * @returns The previous Unknown Image Loader
 */
export function registerUnknownImageLoader(
  imageLoader: ImageLoaderFn
): ImageLoaderFn {
  const oldImageLoader = unknownImageLoader;
  unknownImageLoader = imageLoader;
  return oldImageLoader;
}
/**
 * Removes all registered and unknown image loaders. This should be called
 * when the application is unmounted to prevent memory leaks.
 *
 */
export function unregisterAllImageLoaders(): void {
  Object.keys(imageLoaders).forEach(
    (imageLoader) => delete imageLoaders[imageLoader]
  );
  unknownImageLoader = undefined;
}

/**
 * Creates and caches derived segmentation images based on the referenced imageIds, this
 * is a helper function, we don't have segmentation concept in the cornerstone core; however,
 * this helper would make it clear that the segmentation images SHOULD be Uint8Array type
 * always until we have a better solution.
 *
 * @param referencedImageIds - An array of referenced image IDs.
 * @param options - The options for creating the derived images (default: { targetBufferType: 'Uint8Array' }).
 * @returns The derived images.
 */
export function createAndCacheDerivedSegmentationImages(
  referencedImageIds: Array<string>,
  options = {} as DerivedImageOptions
): IImage[] {
  return createAndCacheDerivedImages(referencedImageIds, {
    ...options,
    targetBufferType: 'Uint8Array',
  });
}

/**
 * Creates and caches a derived segmentation image based on the referenced image ID.
 * this is a helper function, we don't have segmentation concept in the cornerstone core; however,
 * this helper would make it clear that the segmentation images SHOULD be Uint8Array type
 * always until we have a better solution.
 *
 * @param referencedImageId The ID of the referenced image.
 * @param options The options for creating the derived image (default: { targetBufferType: 'Uint8Array' }).
 * @returns A promise that resolves to the created derived segmentation image.
 */
export function createAndCacheDerivedSegmentationImage(
  referencedImageId: string,
  options = {} as DerivedImageOptions
): IImage {
  return createAndCacheDerivedImage(referencedImageId, {
    ...options,
    targetBufferType: 'Uint8Array',
  });
}
