import numpy as np


def project_3d(matrix: np.ndarray) -> np.ndarray:
    """PCA from k feature dimensions down to 3 for the playground view."""
    n = matrix.shape[0]
    centered = matrix - matrix.mean(axis=0)
    if n < 2 or not centered.any():
        return np.zeros((n, 3))
    u, s, _ = np.linalg.svd(centered, full_matrices=False)
    coords = u[:, :3] * s[:3]
    if coords.shape[1] < 3:
        coords = np.pad(coords, ((0, 0), (0, 3 - coords.shape[1])))
    return coords / max(np.abs(coords).max(), 1e-9)
