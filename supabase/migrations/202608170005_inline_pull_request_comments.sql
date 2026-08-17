alter table public.pull_request_comments
  add column file_path text,
  add column line_number integer;

alter table public.pull_request_comments
  add constraint pull_request_comments_location_check
  check (
    (file_path is null and line_number is null)
    or (
      file_path is not null
      and char_length(btrim(file_path)) >= 1
      and line_number is not null
      and line_number >= 1
    )
  );
