export declare const GEOMETRY_HASH_VERSION: number

export interface GeometryHashInput {
  positions: ArrayLike<number>
  indices?: ArrayLike<number> | null
}

export declare function hashGeometry(geometry: GeometryHashInput): string | null
