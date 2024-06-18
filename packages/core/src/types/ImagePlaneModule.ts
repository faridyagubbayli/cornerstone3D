import Point2 from './Point2.js';
import Point3 from './Point3.js';

export interface ImagePlaneModule {
  columnCosines?: Point3;
  columnPixelSpacing?: number;
  imageOrientationPatient?: Float32Array;
  imagePositionPatient?: Point3;
  pixelSpacing?: Point2;
  rowCosines?: Point3;
  rowPixelSpacing?: number;
  sliceLocation?: number;
  sliceThickness?: number;
  frameOfReferenceUID: string;
  columns: number;
  rows: number;
}
