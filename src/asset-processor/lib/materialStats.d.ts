export declare const MATERIAL_STATS_VERSION: number

export interface RawImage {
  data: Uint8Array | Buffer | number[]
  width: number
  height: number
  channels: number
}

export interface ChannelStats {
  mean: number | null
  variance: number | null
}

export interface Tileability {
  horizontal: number | null
  vertical: number | null
  seamScore: number | null
}

export declare function channelStats(
  image: RawImage,
  channel?: number
): ChannelStats
export declare function tileability(image: RawImage): Tileability
export declare function detailFrequency(image: RawImage): number | null
export declare function meanColor(image: RawImage): Array<number | null>
export declare function placeholderKind(image: RawImage): string | null
export declare function computeMaterialStats(
  image: RawImage
): Record<string, unknown>
