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

import type {
	Form,
	FrappeFileDoc,
	FrappeFileUploaderDataUrlFile,
	FrappeFileUploaderFile,
} from "frappe-types";
import type { UploadedMedia, UploadFunction } from "frappe-ui/editor";

/** An uploaded File document: it has a URL to insert. */
type FileDoc = FrappeFileDoc & { file_url: string };

/**
 * Whether `on_success` was handed an uploaded File document. Without `as_dataurl`
 * it gets the document, or null when the response held none (`FileUploader.vue`).
 */
function isFileDoc(file: FrappeFileDoc | FrappeFileUploaderDataUrlFile | null): file is FileDoc {
	return !!file && "file_url" in file && typeof file.file_url === "string" && file.file_url !== "";
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
	frm: Pick<Form, "doctype" | "docname" | "is_new"> | undefined,
	fieldname: string,
): UploadTarget {
	if (!frm || frm.is_new()) return {};
	return { doctype: frm.doctype, docname: frm.docname, fieldname };
}

/**
 * Whether an upload asked for under `asked` still belongs in the document now
 * open. An unsaved document has no name to go by, and it keeps the upload when
 * it is saved meanwhile.
 */
export function sameDocument(asked: UploadTarget, now: UploadTarget): boolean {
	return !asked.docname || (asked.doctype === now.doctype && asked.docname === now.docname);
}

/**
 * The message of a deliberate cancel. frappe-ui only treats a rejection as quiet
 * when its own abort signal fired, which nothing outside the editor can do, and
 * otherwise writes the message on the image; `images.ts` takes that out instead.
 */
export const UPLOAD_CANCELLED = "ui_text_editor:upload-cancelled";

const cancelled = () => new DOMException(UPLOAD_CANCELLED, "AbortError");

/** The site's own limits still apply, on the server. */
const RESTRICTIONS = { allowed_file_types: ["image/*"] };

/** How long a library or link choice gets to load before it counts as not loading. */
export const IMAGE_CHECK_TIMEOUT = 15_000;

/**
 * The library and the link tab are not restricted by the dialog, so a choice
 * there can be any file, and the server attaches it to the document as soon as
 * it hears of it. So ask the browser first: its answer covers any extension or
 * none, and it is the one that counts for showing the image in the editor.
 */
function loadsAsImage(url: string): Promise<boolean> {
	return new Promise((resolve) => {
		const image = new Image();
		const timer = setTimeout(() => resolve(false), IMAGE_CHECK_TIMEOUT);
		const answer = (loaded: boolean) => {
			clearTimeout(timer);
			resolve(loaded);
		};
		image.addEventListener("load", () => answer(true), { once: true });
		image.addEventListener("error", () => answer(false), { once: true });
		image.src = url;
	});
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
			frappe.utils.escape_html(doc.file_name ?? doc.file_url),
		]),
		indicator: "orange",
	});
}

/** Frappe writes a failure into its list, which nobody sees once the dialog is gone. */
function reportFailure(files: FrappeFileUploaderFile[], failure: FrappeFileUploaderFile): void {
	const lost = files.filter((file) => !file.doc).map((file) => frappe.utils.escape_html(file.name));
	frappe.show_alert({
		message: __("Could not upload {0}: {1}", [
			lost.join(", "),
			frappe.utils.escape_html(failure.error_message ?? __("The upload failed.")),
		]),
		indicator: "red",
	});
}

function openDialog(owner: ImageDialogOptions): Session {
	const waiting = new Map<File, Waiter>();
	// Files the editor is done with: a retry after a failure sends the whole list
	// again, finished files included, and a cancelled file's request cannot be
	// called back, only ignored when it answers.
	const finished = new Set<File>();
	let uploading: Promise<unknown> | undefined;
	let checking = false;
	let closed = false;

	const onSuccess = (doc: FrappeFileDoc | FrappeFileUploaderDataUrlFile | null) => {
		if (!isFileDoc(doc)) {
			frappe.show_alert({ message: __("Could not upload the file."), indicator: "red" });
			return;
		}
		// Files from the device are in the dialog's list; a library or link choice is not.
		const file = dialog.uploader.files.find((entry) => entry.doc?.name === doc.name)?.cropper_file;
		if (file && finished.has(file)) return;
		if (file) finished.add(file);

		warnIfPrivate(doc);
		const waiter = file && waiting.get(file);
		if (waiter) waiter.doc = doc;
		else owner.insert(doc);
	};

	// The desk loads the uploader's bundle at startup (frappe upload.js).
	const FileUploader = frappe.ui.FileUploader;
	if (!FileUploader) throw new Error("frappe.ui.FileUploader is not loaded");
	const dialog = new FileUploader({
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

	// Without a `wrapper` the uploader makes its modal in the constructor (file_uploader.bundle.js).
	const modal = dialog.dialog;
	if (!modal) throw new Error("frappe.ui.FileUploader made no dialog");

	// Closing would otherwise close a grid row form the field is in (dialog.js).
	modal.keep_grid_form_open = true;

	const uploadFiles = dialog.upload_files.bind(dialog);

	const uploadIfImage = async (url: string) => {
		const { web_link: link } = dialog.uploader.$refs;
		const button = modal.get_primary_btn();
		checking = true;
		button.prop("disabled", true);
		const loaded = await loadsAsImage(url);
		checking = false;
		button.prop("disabled", false);
		if (closed) return undefined;
		if (loaded) return uploadFiles();
		const message = __("{0} cannot be shown as an image, so it was not added.", [
			frappe.utils.escape_html(url),
		]);
		if (link) link.invalid_input(message);
		else frappe.show_alert({ message, indicator: "orange" });
		return undefined;
	};

	// A library choice closes the dialog first and uploads after, so a closed
	// dialog does not mean nothing more is coming: remember the running upload.
	dialog.upload_files = () => {
		if (checking && uploading) return uploading;
		const { file_browser: library, web_link: link } = dialog.uploader.$refs;
		const url = library?.selected_node.file_url ?? link?.url;
		uploading = url ? uploadIfImage(url) : uploadFiles();
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
						finished.add(file);
						reject(cancelled());
					},
					{ once: true },
				);
				dialog.uploader.add_files([file]);
				// Refused by the dialog's own checks, which say why in an alert.
				if (!dialog.uploader.files.some((entry) => entry.cropper_file === file)) {
					waiting.delete(file);
					reject(cancelled());
				}
			}),
	};

	modal.$wrapper.on("hidden.bs.modal", () => {
		closed = true;
		if (session === opened) session = null;
		// What failed by now was on show when the dialog was closed.
		const seen = new Set(dialog.uploader.files.filter((entry) => entry.failed));
		// Only now: a multi-file paste uploads its next file when the previous one
		// settles, and that one should get a dialog of its own, not join this one.
		const settle = async () => {
			const { files } = dialog.uploader;
			const failure = files.find((entry) => entry.failed && !entry.doc && !seen.has(entry));
			if (failure) reportFailure(files, failure);
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
