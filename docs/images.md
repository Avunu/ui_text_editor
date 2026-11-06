---
title: Images
description: Add an image to a Text Editor field through Frappe's file dialog, by picking, pasting or dropping it, and where the file ends up.
nav_title: Images
order: 5
updated: 2026-11-06
---

Images in a Text Editor field come through Frappe's own file dialog, the one the form's **Attach** button opens. They end up as File documents, and the field stores a link to the file.

## Add an image

Do one of these with the cursor where the image should go:

- Click **Image** in the toolbar. The file dialog opens, and you can choose **My Device**, **Library**, **Link** or **Camera**. Click **Upload**. Each image you chose goes in at the cursor.
- Paste an image, for example a screenshot, into the field. The file dialog opens with the image ready to upload.
- Drag image files onto the field. They land where you release them, and the file dialog opens with all of them ready to upload.

Pasted and dropped images show as a placeholder behind the dialog until they are uploaded. Once an image is in the field, click it to select it, and drag the handle at its corner to resize it.

A pasted or dropped image replaces what you had selected only once it is uploaded. Until then the selection stays where it is, with the placeholder beside it.

Close the dialog without uploading and nothing changes: the placeholder goes away, anything you had selected is still there, and the document is not marked as changed. Undo then carries on with whatever you did before. One undo takes out an image you added, and brings back what it replaced.

Several images pasted at once open the dialog once for each, one after the other. A pasted image that arrives while the dialog is open joins the list in it.

The dialog does not limit the library and the link to images, so the editor checks your choice first, by loading it. If the browser cannot show it as an image, the editor says so and the dialog stays open for another choice. Nothing is attached to the document in that case. See [The editor says it cannot show a file](troubleshooting.md#the-editor-says-it-cannot-show-a-file).

If the field changes while a pasted image waits, for example because someone else saved the document and the form reloaded, the placeholder moves to the end of the paragraph nearest to where it was. Upload as usual, and the document has both your image and their change.

## Where the file goes

The dialog posts each new image to Frappe's `upload_file` endpoint:

- **Public.** A new file is uploaded as a public file (`/files/...`), because rich text is rendered in emails and on web pages, where a private file would not load. Anyone who has the file's address can open it. The dialog's **Private** checkbox is switched off for that reason.
- **In the Home folder** of the File list.
- **Attached to the document** when the document has been saved before: the File's **Attached To** fields point at the document and the Text Editor field. In a new, unsaved document the file is uploaded without being attached to anything. This is also true of a Text Editor field in a dialog, with no document behind it.

Two cases give you a private image, and the editor warns you about both, because the image will not load in an email or on a web page:

- A file chosen from the **Library** keeps the privacy it already had.
- When **Only allow System Managers to upload public files** is ticked in System Settings, the dialog uploads as private for everyone else.

The site's upload rules apply: the maximum file size, the allowed file extensions and the attachment limit of the document's DocType. See [Image uploads](configuration.md#image-uploads).

> [!WARNING]
> Do not put confidential images in a Text Editor field. Unless one of the two cases above applies, they are public files, whatever the document's own permissions are.

## When an upload fails

If the site refuses a file, the dialog stays open and shows the server's message under the file, for example "File type of PNG is not allowed". Close the dialog to give up on it, and its placeholder goes away. [Limitations and troubleshooting](troubleshooting.md#an-image-does-not-upload) lists the common causes.

If you close the dialog while the upload is still running, the placeholder stays until the upload ends. A failure then shows as a red message with the server's reason, and the placeholder goes away.

A running upload cannot be called back. Click the **X** on its placeholder and the image stays out of the field, but the server still finishes the upload, so the file ends up attached to the document. Remove it from the form's **Attachments** if you do not want it there. The same goes for an upload that ends after you opened another document: the file is attached to the first document, and it is not added to either field.
