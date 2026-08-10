export declare const PART_PATH_VERSION: number

export declare function encodePartSegment(name: string): string

export declare function resolveSiblingSegments(childNames: string[]): string[]

export declare function joinPartPath(
  parentPath: string,
  segment: string
): string
