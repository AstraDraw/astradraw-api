/**
 * DTO for updating a comment thread (position only).
 */
export interface UpdateThreadDto {
  /** New X coordinate on canvas (scene coordinates) */
  x?: number;

  /** New Y coordinate on canvas (scene coordinates) */
  y?: number;
}
