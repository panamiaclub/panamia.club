export const STORY_FRAME_WIDTH = 720;
export const STORY_FRAME_HEIGHT = 1280;
export const STORY_FRAME_RATIO = STORY_FRAME_WIDTH / STORY_FRAME_HEIGHT;

export function storyFrameCrop(width: number, height: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error(
      'The camera is not ready for a portrait capture. Try again.'
    );
  }
  const cropWidth = Math.min(width, height * STORY_FRAME_RATIO);
  const cropHeight = Math.min(height, width / STORY_FRAME_RATIO);
  return {
    x: (width - cropWidth) / 2,
    y: (height - cropHeight) / 2,
    width: cropWidth,
    height: cropHeight,
  };
}

export function drawStoryFrame(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement
) {
  const crop = storyFrameCrop(video.videoWidth, video.videoHeight);
  context.drawImage(
    video,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    STORY_FRAME_WIDTH,
    STORY_FRAME_HEIGHT
  );
}
