"""Ways of getting the tin out of the photograph, cheapest first.

The point of this module is not the crops. It is that a learned segmenter has to beat
something, and the something has to be in the repository before the segmenter is, or the
comparison quietly becomes "my model versus my memory of how bad the alternative was".

Three strategies, in increasing order of what they cost to own:

``full_frame``   the photograph, uncropped. The floor.
``center_crop``  a fixed central fraction. Zero parameters learned, zero dependencies,
                 and — given that the app asks people to centre the tin — most of the
                 benefit. This is the one to beat.
``grabcut_crop`` classical foreground extraction seeded from a central rectangle. Still
                 no training and no labels, but it adapts to how much of the frame the
                 tin actually fills, which a fixed fraction cannot.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

#: Anthropic's image-token approximation, and close enough to what a local model pays in
#: compute to be worth reporting either way. Cropping is the only lever on this number
#: that does not also throw away pixels the reader needs.
TOKENS_PER_PIXEL = 1 / 750

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".heic", ".webp"}


@dataclass(frozen=True)
class Crop:
    """A crop plus how it was arrived at, so a contact sheet can be labelled honestly."""

    image: np.ndarray
    strategy: str
    #: (x0, y0, x1, y1) in the coordinates of the original photograph, or None for full frame.
    box: tuple[int, int, int, int] | None

    @property
    def tokens(self) -> int:
        h, w = self.image.shape[:2]
        return round(h * w * TOKENS_PER_PIXEL)


def image_tokens(width: int, height: int) -> int:
    """Roughly what an image of this size costs to send to a vision model."""
    return round(width * height * TOKENS_PER_PIXEL)


def load_images(directory: Path | str, limit: int | None = None) -> list[tuple[Path, np.ndarray]]:
    """Load photographs as RGB arrays, sorted by name so runs are reproducible."""
    directory = Path(directory)
    paths = sorted(p for p in directory.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES)
    if limit is not None:
        paths = paths[:limit]

    out: list[tuple[Path, np.ndarray]] = []
    for path in paths:
        # imread returns BGR and returns None rather than raising on an unreadable file.
        bgr = cv2.imread(str(path), cv2.IMREAD_COLOR)
        if bgr is None:
            continue
        out.append((path, cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)))
    return out


def full_frame(image: np.ndarray) -> Crop:
    return Crop(image=image, strategy="full_frame", box=None)


def center_crop(image: np.ndarray, frac: float = 0.65) -> Crop:
    """Keep the central ``frac`` of each axis.

    ``frac`` is the whole model. It is worth sweeping it in the notebook rather than
    accepting 0.65: too tight clips the tops of tall tins, too loose gives most of the
    saving back, and where the optimum sits depends entirely on how people actually hold
    the camera — which is a fact about your photographs, not about tea.
    """
    h, w = image.shape[:2]
    cw, ch = int(w * frac), int(h * frac)
    x0, y0 = (w - cw) // 2, (h - ch) // 2
    return Crop(
        image=image[y0 : y0 + ch, x0 : x0 + cw],
        strategy="center_crop",
        box=(x0, y0, x0 + cw, y0 + ch),
    )


def grabcut_mask(image: np.ndarray, rect_frac: float = 0.6, iterations: int = 5) -> np.ndarray:
    """Foreground mask from GrabCut, seeded with a central rectangle.

    The seed is where the app's "put the tin in the middle" instruction is cashed in:
    GrabCut normally needs a human to draw that rectangle, and the instruction lets us
    assume it. Everything inside the rectangle starts as probable foreground, everything
    outside as definite background, and the Gaussian mixtures do the rest.

    Colour space does not matter here — permuting RGB to BGR just permutes the axes of
    the mixtures — so the RGB arrays from ``load_images`` go straight in.
    """
    h, w = image.shape[:2]
    rw, rh = int(w * rect_frac), int(h * rect_frac)
    rect = ((w - rw) // 2, (h - rh) // 2, rw, rh)

    mask = np.zeros((h, w), np.uint8)
    # GrabCut writes its learned mixtures into these; they must be float64 1x65 or it throws.
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(image, mask, rect, bgd, fgd, iterations, cv2.GC_INIT_WITH_RECT)

    # GC_FGD (1) and GC_PR_FGD (3) are foreground; GC_BGD (0) and GC_PR_BGD (2) are not.
    binary = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 1, 0).astype(np.uint8)
    return largest_component(binary)


def largest_component(mask: np.ndarray) -> np.ndarray:
    """Keep only the biggest blob.

    A glare band across a metal tin splits the foreground in two often enough that this is
    not a refinement — without it the bounding box occasionally spans a bright highlight
    and a reflection of the window, and is larger than the uncropped photograph is useful.
    """
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if count <= 1:
        return mask
    # Row 0 is the background component; argmax over the rest, offset back.
    biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return (labels == biggest).astype(np.uint8)


def bbox_from_mask(mask: np.ndarray, pad: int = 8) -> tuple[int, int, int, int] | None:
    """Tight box around a mask, padded a little. None if the mask is empty."""
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return None
    h, w = mask.shape[:2]
    return (
        max(0, int(xs.min()) - pad),
        max(0, int(ys.min()) - pad),
        min(w, int(xs.max()) + pad),
        min(h, int(ys.max()) + pad),
    )


def grabcut_crop(image: np.ndarray, rect_frac: float = 0.6, iterations: int = 5) -> Crop:
    """Crop to the GrabCut foreground, falling back to a centre crop if it finds nothing."""
    mask = grabcut_mask(image, rect_frac=rect_frac, iterations=iterations)
    box = bbox_from_mask(mask)
    if box is None:
        return center_crop(image)
    x0, y0, x1, y1 = box
    return Crop(image=image[y0:y1, x0:x1], strategy="grabcut_crop", box=box)


STRATEGIES = {
    "full_frame": full_frame,
    "center_crop": center_crop,
    "grabcut_crop": grabcut_crop,
}
