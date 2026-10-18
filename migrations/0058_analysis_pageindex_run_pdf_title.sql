-- Document title of each run PDF (S25 reader wording): the title the search result showed for an
-- automatically found PDF, or the title stored inside the PDF itself, kept only when it is plain
-- Vietnamese reader text. The report cites "<title>, trang N" and never a file name; a PDF without
-- a usable title is cited by its order ("Tài liệu PDF số k"). Rows written before this column
-- existed have no title and use the order wording.
-- Never apply this migration to runtime data as part of implementation tests.
ALTER TABLE analysis_pageindex_run_pdfs
  ADD COLUMN document_title TEXT CHECK (document_title IS NULL OR length(document_title) BETWEEN 1 AND 200);
