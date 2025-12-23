/**
 * DTO for adding a reply to an existing thread.
 */
export interface CreateCommentDto {
  /** Content of the comment */
  content: string;

  /** Optional array of user IDs to mention */
  mentions?: string[];
}
