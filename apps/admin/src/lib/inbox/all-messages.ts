/**
 * Every contact message, however many there are.
 *
 * The repository's `list()` is a page: its limit defaults to 100 and is
 * capped at 500. A backup or export that called it once silently stopped at
 * the hundredth message, which is the worst way for a backup to fail. This
 * walks the pages until one comes back short.
 */

import type { ContactMessageRepository } from "@portfolio/database";
import type { ContactMessage } from "@portfolio/types";

const PAGE = 500;

export async function listAllContactMessages(
  repository: ContactMessageRepository,
): Promise<ContactMessage[]> {
  const all: ContactMessage[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await repository.list({ limit: PAGE, offset });
    all.push(...page);
    if (page.length < PAGE) return all;
  }
}
