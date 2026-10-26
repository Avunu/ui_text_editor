---
title: Images
description: Add an image to a Text Editor field by picking, pasting or dropping it, and where the uploaded file ends up.
nav_title: Images
order: 5
updated: 2026-10-26
---

Images in a Text Editor field are uploaded to the site as File documents, and the field stores a link to the file.

## Add an image

Do one of these with the cursor where the image should go:

- Click **Image / Gallery** in the toolbar and pick one image.
- Paste an image, for example a screenshot, into the field.
- Drag one image file onto the field. It lands where you release it.

The image appears at once with a progress indicator while it uploads. Once it is uploaded, click it to select it, and drag the handle at its corner to resize it.

Add images one at a time. The app turns off frappe-ui's image gallery, which is what the editor opens when you pick or drop several images at once.

## Where the file goes

The editor posts each image to Frappe's `upload_file` endpoint:

- **Public.** The file is uploaded as a public file (`/files/...`), because rich text is rendered in emails and on web pages, where a private file would not load. Anyone who has the file's address can open it.
- **In the Home folder** of the File list.
- **Attached to the document** when the document has been saved before: the File's **Attached To** fields point at the document and the Text Editor field. In a new, unsaved document the file is uploaded without being attached to anything.

The site's upload rules apply: the maximum file size, the allowed file extensions, and whether only System Managers may upload public files. See [Image uploads](configuration.md#image-uploads).

> [!WARNING]
> Do not put confidential images in a Text Editor field. They are always uploaded as public files, whatever the document's own permissions are.

## When an upload fails

If the site refuses the file, the image shows the server's message, for example "File size exceeded the maximum allowed size of 25 MB", with three buttons:

- **Try again** uploads the same file again.
- **Choose another** opens the file picker to replace it.
- **Remove** takes the image out of the field.

When the server gives no message, the editor shows "Could not upload the file.". [Limitations and troubleshooting](troubleshooting.md#an-image-does-not-upload) lists the common causes.
