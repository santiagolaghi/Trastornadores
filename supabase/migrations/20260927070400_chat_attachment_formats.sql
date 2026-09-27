-- Support the document types offered by the chat attachment menu.
update storage.buckets
set allowed_mime_types=array[
  'image/jpeg','image/png','image/webp','image/heic','image/heif',
  'application/pdf','text/plain','text/csv','application/zip',
  'application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'audio/mpeg','audio/mp4','audio/webm','audio/ogg',
  'video/webm','video/mp4','video/quicktime'
]
where id='tnt-chat-files';
