export interface NaturalSize {
	width: number;
	height: number;
}

/** Longer side of a new image layer, as percent of the video rect's width. */
export const IMAGE_LAYER_LONG_SIDE_PERCENT = 30;

function isUsable(size: NaturalSize | null | undefined): size is NaturalSize {
	return Boolean(
		size && Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0,
	);
}

/**
 * Box for a new image layer in the stored model (percent of the video rect's width and height).
 * The image keeps its shape: the longer side is `longSidePercent` of the video rect's width, and the
 * other side follows the image's aspect ratio. `videoRectAspect` is the video rect's width / height,
 * needed because height percent is relative to the video rect's height.
 */
export function imageLayerSize(
	natural: NaturalSize | null | undefined,
	videoRectAspect: number,
	longSidePercent = IMAGE_LAYER_LONG_SIDE_PERCENT,
): { width: number; height: number } | null {
	if (!isUsable(natural) || !Number.isFinite(videoRectAspect) || videoRectAspect <= 0) return null;
	// Work in units where the video rect is 1 wide and 1 / aspect tall.
	const long = longSidePercent / 100;
	const wide = natural.width >= natural.height;
	const widthUnits = wide ? long : (long * natural.width) / natural.height;
	const heightUnits = wide ? (long * natural.height) / natural.width : long;
	return {
		width: widthUnits * 100,
		height: heightUnits * videoRectAspect * 100,
	};
}

/** Replacing an image keeps the box width; the height follows the new image's ratio. */
export function heightForImageWidth(
	widthPercent: number,
	natural: NaturalSize | null | undefined,
	videoRectAspect: number,
): number | null {
	if (!isUsable(natural) || !Number.isFinite(videoRectAspect) || videoRectAspect <= 0) return null;
	return widthPercent * (natural.height / natural.width) * videoRectAspect;
}

/** Natural pixel size of an image (data URL or URL); null if it cannot be decoded. */
export function loadImageSize(src: string): Promise<NaturalSize | null> {
	return new Promise((resolve) => {
		const image = new Image();
		image.onload = () =>
			resolve(
				image.naturalWidth > 0 && image.naturalHeight > 0
					? { width: image.naturalWidth, height: image.naturalHeight }
					: null,
			);
		image.onerror = () => resolve(null);
		image.src = src;
	});
}
