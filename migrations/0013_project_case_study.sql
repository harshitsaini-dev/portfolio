-- Case-study fields on projects: problem, solution, learnings.
--
-- ## Why three columns and not one longer description
--
-- `description` already exists and stays as it is — free prose, whatever the
-- project needs. These three answer specific questions a reader of a portfolio
-- is actually asking: what was wrong, what did you build, what do you know now
-- that you did not before. Keeping them apart from `description` means the page
-- can label and order them, and an unanswered one simply does not render.
--
-- The obvious alternative was one Markdown blob with the editor writing their
-- own headings. That puts the page's structure inside the content, where the
-- site cannot reason about it: no way to show "Learnings" in a summary card, no
-- way to tell a project with a case study from one without.
--
-- The fourth part of the pattern — the stack — is deliberately absent. It
-- already exists as the `project_technologies` join, which is a real relation
-- with its own rows and its own ordering. A `stack` text column would be a
-- second, worse copy of it that could disagree.
--
-- ## Nullable, no default
--
-- Every existing project keeps working and shows nothing new until someone
-- writes it. `NULL` and `''` both mean "not written" to the reader, so the
-- schema normalises blank input to NULL rather than storing an empty string
-- that renders as an empty section.

ALTER TABLE projects ADD COLUMN problem   TEXT;
ALTER TABLE projects ADD COLUMN solution  TEXT;
ALTER TABLE projects ADD COLUMN learnings TEXT;
