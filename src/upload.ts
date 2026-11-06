// Copyright (c) 2026, Avunu LLC and contributors
// For license information, please see license.txt

/**
 * Images come through Frappe's own file dialog (`frappe.ui.FileUploader`).
 *
 * The toolbar opens it empty, so the user can pick from their device, the file
 * library or a link. A pasted or dropped file opens it preloaded, as what the
 * editor's `uploadFunction` waits on. Only one dialog is ever open: further
 * files join it.
 *
 * The dialog has no "closed without uploading" callback and only reports
 * success, so the rest is read from what it does (see `file_uploader.bundle.js`
 * and `FileUploader.vue` in Frappe): it is closed when `hidden.bs.modal` fires,
 * and a failed upload stays in its list with the server's message.
 */

import type { UploadedMedia, UploadFunction } from "frappe-ui/editor";

/** The File document `upload_file` answers with. */
interface FileDoc extends UploadedMedia {
	name: string;
	file_name?: string;
	is_private?: 0 | 1;
}

/** `frappe.ui.FileUploader`, which frappe-types does not declare; the parts used here. */
interface FileUploader {
	dialog: {
		$wrapper: { on(event: string, handler: () => void): unknown };
		keep_grid_form_open: boolean;
	};
	/** The Vue app inside the dialog; `files` is its list, with the device's files. */
	uploader: {
		files: { file_obj: File; doc: FileDoc | null }[];
		add_files(files: File[]): void;
	};
	upload_files(): Promise<unknown>;
}

declare module "frappe-types" {
	interface FrappeUiNamespace {
		FileUploader: new (options: {
			doctype?: string;
			docname?: string;
			fieldname?: string;
			folder?: string;
			dialog_title?: string;
			restrictions?: { allowed_file_types?: string[] };
			make_attachments_public?: boolean;
			allow_toggle_private?: boolean;
			allow_google_drive?: boolean;
			on_success?: (doc: FileDoc | null) => void;
		}) => FileUploader;
	}
}

/** The document an upload is attached to; empty while it is still unsaved. */
export interface UploadTarget {
	doctype?: string;
	docname?: string;
	fieldname?: string;
}

/**
 * Attached to the document and field when the form is saved; unattached for a
 * new document, or a control with no form.
 */
export function uploadTarget(
	frm: { doctype: string; docname: string; is_new(): boolean } | undefined,
	fieldname: string,
): UploadTarget {
	if (!frm || frm.is_new()) return {};
	return { doctype: frm.doctype, docname: frm.docname, fieldname };
}

/**
 * The message of a deliberate cancel. frappe-ui only treats a rejection as quiet
 * when its own abort signal fired, which nothing outside the editor can do, and
 * otherwise shows the message on the image; `images.ts` removes an image that
 * carries this one.
 */
export const UPLOAD_CANCELLED = "ui_text_editor:upload-cancelled";

const cancelled = () => new DOMException(UPLOAD_CANCELLED, "AbortError");

/** The site's own limits still apply, on the server. */
const RESTRICTIONS = { allowed_file_types: ["image/*"] };

const IMAGE_EXTENSION = /\.(avif|bmp|gif|heic|ico|jpe?g|png|svg|tiff?|webp)$/i;

/**
 * The library and the link tab are not restricted by the dialog, so a choice
 * there can be any file. A URL with no extension gets the benefit of the doubt:
 * image hosts often serve those.
 */
export function looksLikeImage(fileUrl: string): boolean {
	const { pathname } = new URL(fileUrl, "http://localhost");
	return !/\.[^./]+$/.test(pathname) || IMAGE_EXTENSION.test(pathname);
}

export interface ImageDialogOptions {
	target: () => UploadTarget;
	/** Whether the field can take an image right now. */
	editable: () => boolean;
	/** Put a chosen image at the cursor. */
	insert: (media: UploadedMedia) => void;
	/** The dialog is gone: give the editor its focus back. */
	focus: () => void;
}

export interface ImageDialog {
	/** What the toolbar's button calls. */
	pick: () => void;
	/** The editor's `uploadFunction`, for pasted and dropped files. */
	upload: UploadFunction;
}

interface Waiter {
	resolve: (media: UploadedMedia) => void;
	reject: (reason: unknown) => void;
	/** Its file, once uploaded. */
	doc?: FileDoc;
}

interface Session {
	owner: ImageDialogOptions;
	/** Preload a file; settles with its File document, or as cancelled. */
	add: (file: File, signal?: AbortSignal) => Promise<UploadedMedia>;
}

/** The open dialog. Module-wide: Frappe's modals would otherwise stack. */
let session: Session | null = null;

function warnIfPrivate(doc: FileDoc): void {
	if (!doc.is_private) return;
	frappe.show_alert({
		message: __("{0} is private, so it will not load in emails or on web pages.", [
			doc.file_name ?? doc.file_url,
		]),
		indicator: "orange",
	});
}

function openDialog(owner: ImageDialogOptions): Session {
	const waiting = new Map<File, Waiter>();
	// A retry after a failure sends the whole list again, finished files included.
	const delivered = new Set<File>();
	let uploading: Promise<unknown> | undefined;

	const onSuccess = (doc: FileDoc | null) => {
		if (!doc?.file_url) {
			frappe.show_alert({ message: __("Could not upload the file."), indicator: "red" });
			return;
		}
		// Files from the device are in the dialog's list; a library or link choice is not.
		const file = dialog.uploader.files.find((entry) => entry.doc?.name === doc.name)?.file_obj;
		if (file && delivered.has(file)) return;
		if (file) delivered.add(file);

		const waiter = file && waiting.get(file);
		if (waiter) {
			warnIfPrivate(doc);
			waiter.doc = doc;
		} else if (file || looksLikeImage(doc.file_url)) {
			warnIfPrivate(doc);
			owner.insert(doc);
		} else {
			frappe.show_alert({
				message: __("{0} is not an image, so it was not inserted.", [doc.file_name ?? doc.file_url]),
				indicator: "orange",
			});
		}
	};

	const dialog = new frappe.ui.FileUploader({
		...owner.target(),
		dialog_title: __("Insert Image"),
		folder: "Home",
		restrictions: { ...RESTRICTIONS },
		// Public: rich text is rendered in emails and web pages, where a private
		// file would not load. The dialog still makes it private for a user who may
		// not upload public files (`can_upload_public_files`), so warnIfPrivate says so.
		make_attachments_public: true,
		allow_toggle_private: false,
		// Its picker closes the dialog first, and its cancel opens the form's own
		// attachment dialog.
		allow_google_drive: false,
		on_success: onSuccess,
	});

	// Closing would otherwise close a grid row form the field is in (dialog.js).
	dialog.dialog.keep_grid_form_open = true;

	// A library choice closes the dialog first and uploads after, so a closed
	// dialog does not mean nothing more is coming: remember the running upload.
	const uploadFiles = dialog.upload_files.bind(dialog);
	dialog.upload_files = () => {
		uploading = uploadFiles();
		return uploading;
	};

	const opened: Session = {
		owner,
		add: (file, signal) =>
			new Promise((resolve, reject) => {
				waiting.set(file, { resolve, reject });
				signal?.addEventListener(
					"abort",
					() => {
						waiting.delete(file);
						reject(cancelled());
					},
					{ once: true },
				);
				dialog.uploader.add_files([file]);
				// Refused by the dialog's own checks, which say why in an alert.
				if (!dialog.uploader.files.some((entry) => entry.file_obj === file)) {
					waiting.delete(file);
					reject(cancelled());
				}
			}),
	};

	dialog.dialog.$wrapper.on("hidden.bs.modal", () => {
		if (session === opened) session = null;
		// Only now: a multi-file paste uploads its next file when the previous one
		// settles, and that one should get a dialog of its own, not join this one.
		const settle = async () => {
			for (const { doc, resolve, reject } of waiting.values()) {
				if (doc) resolve(doc);
				else reject(cancelled());
				// One per task. frappe-ui's content watcher runs mid-way through the next
				// node view update, and two updates in one task make it restore the first
				// one's HTML over the second, which loses that image.
				// oxlint-disable-next-line no-await-in-loop -- one at a time is the point
				await new Promise((next) => setTimeout(next));
			}
			waiting.clear();
			owner.focus();
		};
		void Promise.resolve(uploading).then(settle, settle);
	});

	return opened;
}

/** The two ways into the dialog, for one editor. */
export function createImageDialog(options: ImageDialogOptions): ImageDialog {
	return {
		pick() {
			if (!options.editable() || session) return;
			session = openDialog(options);
		},
		upload(file, request) {
			if (!options.editable()) return Promise.reject(cancelled());
			session ??= openDialog(options);
			// Another field's dialog is up: this file would attach to that field.
			if (session.owner !== options) return Promise.reject(cancelled());
			return session.add(file, request?.signal);
		},
	};
}
