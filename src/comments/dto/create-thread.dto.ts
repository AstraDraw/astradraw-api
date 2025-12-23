/**
 * DTO for creating a new comment thread with its first comment.
 */
export interface CreateThreadDto {
  /** X coordinate on canvas (scene coordinates) */
  x: number;

  /** Y coordinate on canvas (scene coordinates) */
  y: number;

  /** Content of the first comment in the thread */
  content: string;

  /** Optional array of user IDs to mention */
  mentions?: string[];
}
