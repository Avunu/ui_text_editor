// Copyright (c) 2026, Avunu LLC and contributors
// For license information, please see license.txt

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { FrappeFileDoc, FrappeFileUploaderFile, FrappeFileUploaderOptions } from "frappe-types";
import type { UploadedMedia } from "frappe-ui/editor";
import {
	IMAGE_CHECK_TIMEOUT,
	UPLOAD_CANCELLED,
	createImageDialog,
	sameDocument,
	uploadTarget,
	type ImageDialogOptions,
} from "./upload.ts";

/** Stands in for `frappe.ui.FileUploader`, with what `FileUploader.vue` does to its list. */
class FakeUploader {
	static opened: FakeUploader[] = [];
	/** What the dialog's own checks refuse, as `check_restrictions` does. */
	static refuse = new Set<File>();

	entries: FrappeFileUploaderFile[] = [];
	dialog = {
		keep_grid_form_open: false,
		get_primary_btn: () => ({
			prop: (_name: string, value: boolean) => {
				this.buttonDisabled = value;
			},
		}),
		$wrapper: {
			on: (event: string, handler: () => void) => {
				assert.equal(event, "hidden.bs.modal");
				this.hidden = handler;
			},
		},
	};
	uploader = {
		files: this.entries,
		add_files: (files: File[]) => {
			for (const file of files) {
				if (FakeUploader.refuse.has(file)) continue;
				this.entries.push({
					cropper_file: file,
					file_obj: file,
					crop_box_data: null,
					optimize: false,
					name: file.name,
					doc: null,
					progress: 0,
					total: file.size,
					failed: false,
					request_succeeded: false,
					error_message: null,
					uploading: false,
					private: false,
				});
			}
		},
		$refs: {} as {
			file_browser?: { selected_node: { file_url?: string } };
			web_link?: { url: string; invalid_input(error: string): void };
		},
	};
	buttonDisabled = false;
	hidden: () => void = () => undefined;
	options: FrappeFileUploaderOptions;
	upload_files: () => Promise<unknown> = () => Promise.resolve();

	constructor(options: FrappeFileUploaderOptions = {}) {
		this.options = options;
		FakeUploader.opened.push(this);
	}

	/** Reports an uploaded document (or none) to the caller, as the dialog does. */
	succeed(doc: FrappeFileDoc | null) {
		assert.ok(this.options.on_success);
		this.options.on_success(doc);
	}

	/** A device file finished: the dialog sets `doc`, then reports it. */
	uploaded(file: File, doc: FrappeFileDoc) {
		const entry = this.entries.find((candidate) => candidate.cropper_file === file);
		assert.ok(entry);
		entry.doc = doc;
		this.succeed(doc);
	}

	/** What the server's refusal does to a row: the dialog writes it there, and nothing else. */
	failed(file: File, message: string | null) {
		const entry = this.entries.find((candidate) => candidate.cropper_file === file);
		assert.ok(entry);
		entry.failed = true;
		entry.error_message = message;
	}
}

const alerts: { message: string; indicator: string }[] = [];
/** The URLs the browser can show as an image, and those it never answers for. */
const loads = new Set<string>();
const hanging = new Set<string>();
const loadRequests: string[] = [];

Object.assign(globalThis, {
	__: (text: string, args: string[] = []) => text.replace(/\{(\d)\}/g, (_, i: string) => args[Number(i)]),
	frappe: {
		ui: { FileUploader: FakeUploader },
		show_alert: (alert: { message: string; indicator: string }) => alerts.push(alert),
		utils: { escape_html: (text: string) => text.replaceAll("<", "&lt;") },
	},
	Image: class {
		#listeners = new Map<string, () => void>();
		addEventListener(event: string, listener: () => void) {
			this.#listeners.set(event, listener);
		}
		set src(url: string) {
			loadRequests.push(url);
			if (hanging.has(url)) return;
			setTimeout(() => this.#listeners.get(loads.has(url) ? "load" : "error")?.());
		}
	},
});

const useUploader = (uploader: typeof FakeUploader) => {
	frappe.ui.FileUploader = uploader;
};

const inserted: UploadedMedia[] = [];

function editor(overrides: Partial<ImageDialogOptions> = {}) {
	return createImageDialog({
		target: () => ({ doctype: "Note", docname: "N-1", fieldname: "content" }),
		editable: () => true,
		insert: (media) => inserted.push(media),
		focus: () => undefined,
		...overrides,
	});
}

const png = (name = "a.png") => new File(["x"], name, { type: "image/png" });
/** The File document `upload_file` answers with. */
const doc = (name: string, extra: Partial<FrappeFileDoc> = {}): FrappeFileDoc => ({
	doctype: "File",
	name,
	file_name: `${name}.png`,
	file_url: `/files/${name}.png`,
	is_private: 0,
	is_home_folder: 0,
	is_attachments_folder: 0,
	is_folder: 0,
	uploaded_to_dropbox: 0,
	uploaded_to_google_drive: 0,
	...extra,
});
const tick = () => new Promise((resolve) => setTimeout(resolve));
const last = () => {
	const uploader = FakeUploader.opened.at(-1);
	assert.ok(uploader);
	return uploader;
};
const assertCancelled = (error: unknown) => {
	assert.ok(error instanceof DOMException);
	assert.equal(error.name, "AbortError");
	assert.equal(error.message, UPLOAD_CANCELLED);
	return true;
};

beforeEach(async () => {
	// Close whatever the previous test left open: the session is module-wide.
	FakeUploader.opened.at(-1)?.hidden();
	await tick();
	FakeUploader.opened = [];
	FakeUploader.refuse.clear();
	alerts.length = 0;
	inserted.length = 0;
	loads.clear();
	hanging.clear();
	loadRequests.length = 0;
});

test("the toolbar opens an empty dialog restricted to public images", () => {
	editor().pick();
	const { options, entries, dialog } = last();
	assert.equal(entries.length, 0);
	assert.deepEqual(options.restrictions, { allowed_file_types: ["image/*"] });
	assert.equal(options.make_attachments_public, true);
	assert.equal(options.allow_toggle_private, false);
	assert.equal(options.allow_google_drive, false);
	assert.equal(options.folder, "Home");
	assert.equal(dialog.keep_grid_form_open, true);
});

test("the target is read when the dialog opens", () => {
	let target = { doctype: "Note", docname: "new-note-1", fieldname: "content" };
	const images = editor({ target: () => target });
	target = { doctype: "Note", docname: "N-2", fieldname: "content" };
	images.pick();
	assert.equal(last().options.docname, "N-2");
});

test("attachment target for a saved, a new and a form-less control", () => {
	// Form#is_new() is 1 for an unsaved document, and undefined once it is saved.
	const form = (isNew: 1 | undefined) => ({ doctype: "Note", docname: "N-1", is_new: () => isNew });
	assert.deepEqual(uploadTarget(form(undefined), "content"), {
		doctype: "Note",
		docname: "N-1",
		fieldname: "content",
	});
	assert.deepEqual(uploadTarget(form(1), "content"), {});
	assert.deepEqual(uploadTarget(undefined, "content"), {});
});

test("a new document's dialog passes no attachment", () => {
	editor({
		target: () => uploadTarget({ doctype: "Note", docname: "x", is_new: () => 1 as const }, "c"),
	}).pick();
	const { options } = last();
	assert.equal(options.doctype, undefined);
	assert.equal(options.docname, undefined);
	assert.equal(options.fieldname, undefined);
});

test("a chosen image is inserted at the cursor, each one of several", () => {
	editor().pick();
	last().succeed(doc("one"));
	last().succeed(doc("two"));
	assert.deepEqual(
		inserted.map((media) => media.file_url),
		["/files/one.png", "/files/two.png"],
	);
	assert.equal(alerts.length, 0);
});

test("a device file picked in an open dialog is inserted too", () => {
	editor().pick();
	const picked = png();
	last().uploader.add_files([picked]);
	last().uploaded(picked, doc("one"));
	assert.equal(inserted.length, 1);
});

test("a pasted file preloads the dialog and resolves with its File document", async () => {
	const file = png();
	const upload = editor().upload(file);
	assert.equal(last().entries[0]?.file_obj, file);
	const uploaded = doc("one");
	last().uploaded(file, uploaded);
	last().hidden();
	assert.equal(await upload, uploaded);
	assert.equal(inserted.length, 0);
});

test("an upload settles only once the dialog is gone, so the next file gets a dialog of its own", async () => {
	const first = png("first.png");
	const images = editor();
	let settled = false;
	const firstUpload = images.upload(first).then((media) => {
		settled = true;
		return media;
	});
	last().uploaded(first, doc("first"));
	await tick();
	assert.equal(settled, false);
	last().hidden();
	await firstUpload;

	// What frappe-ui's multi-file paste does next.
	const second = png("second.png");
	const secondUpload = images.upload(second);
	assert.equal(FakeUploader.opened.length, 2);
	assert.deepEqual(
		last().entries.map((entry) => entry.file_obj),
		[second],
	);
	last().uploaded(second, doc("second"));
	last().hidden();
	assert.equal((await secondUpload).file_url, "/files/second.png");
});

test("closing the dialog settles the upload as a quiet cancel", async () => {
	let focused = 0;
	const upload = editor({ focus: () => focused++ }).upload(png());
	last().hidden();
	await assert.rejects(upload, assertCancelled);
	await tick();
	assert.equal(alerts.length, 0);
	assert.equal(focused, 1);
});

test("closing the toolbar's dialog inserts nothing and allows a new one", async () => {
	const images = editor();
	images.pick();
	last().hidden();
	await tick();
	assert.equal(inserted.length, 0);
	images.pick();
	assert.equal(FakeUploader.opened.length, 2);
});

test("a file removed from the list is cancelled when the dialog closes", async () => {
	const kept = png("kept.png");
	const removed = png("removed.png");
	const images = editor();
	const keptUpload = images.upload(kept);
	const removedUpload = images.upload(removed);
	last().entries.pop();
	last().uploaded(kept, doc("kept"));
	last().hidden();
	assert.equal((await keptUpload).file_url, "/files/kept.png");
	await assert.rejects(removedUpload, assertCancelled);
});

test("with nothing uploading, a closed dialog settles at once", async () => {
	const pasted = editor().upload(png());
	let settled = false;
	void pasted.catch(() => (settled = true));
	last().hidden();
	await tick();
	assert.equal(settled, true);
});

test("while an upload runs, a closed dialog waits for it", async () => {
	let finish = () => {};
	class Slow extends FakeUploader {
		constructor(options?: FrappeFileUploaderOptions) {
			super(options);
			this.upload_files = () => new Promise<void>((resolve) => (finish = resolve));
		}
	}
	useUploader(Slow);
	try {
		const pasted = editor().upload(png());
		let settled = false;
		void pasted.catch(() => (settled = true));
		const uploader = last();

		// The primary action calls the instance's method, which the session wraps.
		const running = uploader.upload_files();
		uploader.hidden();
		await tick();
		assert.equal(settled, false);

		// The library's document arrives after the dialog has gone: it goes to the cursor.
		uploader.succeed(doc("library"));
		assert.equal(inserted[0]?.file_url, "/files/library.png");

		finish();
		await running;
		await tick();
		assert.equal(settled, true);
	} finally {
		useUploader(FakeUploader);
	}
});

test("a failed upload leaves the promise waiting, and closing still settles it", async () => {
	class Failing extends FakeUploader {
		constructor(options?: FrappeFileUploaderOptions) {
			super(options);
			this.upload_files = () => Promise.reject(new Error("417"));
		}
	}
	useUploader(Failing);
	try {
		const pasted = editor().upload(png());
		let settled = false;
		void pasted.catch(() => (settled = true));
		await assert.rejects(last().upload_files());
		await tick();
		assert.equal(settled, false);
		last().hidden();
		await assert.rejects(pasted, assertCancelled);
	} finally {
		useUploader(FakeUploader);
	}
});

test("a second paste joins the open dialog, and each file gets its own document", async () => {
	const first = png("first.png");
	const second = png("second.png");
	const images = editor();
	const firstUpload = images.upload(first);
	const secondUpload = images.upload(second);
	assert.equal(FakeUploader.opened.length, 1);
	assert.equal(last().entries.length, 2);
	last().uploaded(second, doc("second"));
	last().uploaded(first, doc("first"));
	last().hidden();
	assert.equal((await firstUpload).file_url, "/files/first.png");
	assert.equal((await secondUpload).file_url, "/files/second.png");
});

test("uploads settle one per task, as the editor loses an update made in the same one", async () => {
	const first = png("first.png");
	const second = png("second.png");
	const images = editor();
	const order: string[] = [];
	const uploads = [first, second].map((file) =>
		images.upload(file).then(
			() => order.push(file.name),
			() => undefined,
		),
	);
	last().uploaded(first, doc("first"));
	last().uploaded(second, doc("second"));
	last().hidden();
	await Promise.resolve(); // the running upload
	await Promise.resolve();
	await Promise.resolve();
	assert.deepEqual(order, ["first.png"]);
	await Promise.all(uploads);
	assert.deepEqual(order, ["first.png", "second.png"]);
});

test("a paste joins a dialog the toolbar opened", async () => {
	const images = editor();
	images.pick();
	const file = png();
	const upload = images.upload(file);
	assert.equal(FakeUploader.opened.length, 1);
	last().uploaded(file, doc("one"));
	last().hidden();
	assert.equal((await upload).file_url, "/files/one.png");
});

test("the toolbar does not stack a dialog on an open one", () => {
	const images = editor();
	void images.upload(png()).catch(() => undefined);
	images.pick();
	images.pick();
	assert.equal(FakeUploader.opened.length, 1);
});

test("another field's paste does not join a dialog attached to this one", async () => {
	editor().pick();
	await assert.rejects(editor().upload(png()), assertCancelled);
	assert.equal(FakeUploader.opened.length, 1);
	assert.equal(last().entries.length, 0);
});

test("a read-only field offers no upload", async () => {
	const images = editor({ editable: () => false });
	images.pick();
	await assert.rejects(images.upload(png()), assertCancelled);
	assert.equal(FakeUploader.opened.length, 0);
});

test("a file the dialog refuses is cancelled at once; the dialog says why", async () => {
	const file = png();
	FakeUploader.refuse.add(file);
	await assert.rejects(editor().upload(file), assertCancelled);
});

test("the editor's abort signal cancels", async () => {
	const controller = new AbortController();
	const upload = editor().upload(png(), { signal: controller.signal });
	controller.abort();
	await assert.rejects(upload, assertCancelled);
	last().hidden();
});

test("a retry does not insert a finished file twice", () => {
	editor().pick();
	const file = png();
	last().uploader.add_files([file]);
	last().uploaded(file, doc("one"));
	last().uploaded(file, doc("again"));
	assert.equal(inserted.length, 1);
});

class Counting extends FakeUploader {
	static sent = 0;
	constructor(options?: FrappeFileUploaderOptions) {
		super(options);
		this.upload_files = () => {
			Counting.sent += 1;
			return Promise.resolve();
		};
	}
}

test("a library choice the browser cannot show never reaches the server", async () => {
	useUploader(Counting);
	Counting.sent = 0;
	try {
		editor().pick();
		const uploader = last();
		uploader.uploader.$refs = { file_browser: { selected_node: { file_url: "/files/report.pdf" } } };
		await uploader.upload_files();
		assert.equal(Counting.sent, 0);
		assert.equal(inserted.length, 0);
		assert.equal(alerts[0]?.indicator, "orange");
		assert.match(alerts[0]?.message ?? "", /report\.pdf cannot be shown as an image/);
		assert.equal(uploader.buttonDisabled, false);
	} finally {
		useUploader(FakeUploader);
	}
});

test("a library choice the browser can show goes through, whatever it is called", async () => {
	useUploader(Counting);
	Counting.sent = 0;
	try {
		for (const url of [
			"/files/a.jfif",
			"/files/a.apng",
			"https://x.com/img.php?id=1",
			"https://x.com/photo",
		]) {
			loads.add(url);
			editor().pick();
			const uploader = last();
			uploader.uploader.$refs = { file_browser: { selected_node: { file_url: url } } };
			const running = uploader.upload_files();
			assert.equal(uploader.buttonDisabled, true);
			// oxlint-disable-next-line no-await-in-loop -- one dialog at a time, as a person would
			await running;
			uploader.succeed(doc("chosen", { file_url: url }));
			assert.equal(inserted.at(-1)?.file_url, url);
			uploader.hidden();
			// oxlint-disable-next-line no-await-in-loop -- one dialog at a time, as a person would
			await tick();
		}
		assert.equal(Counting.sent, 4);
		assert.equal(alerts.length, 0);
	} finally {
		useUploader(FakeUploader);
	}
});

test("a link the browser cannot show is refused on the link tab itself", async () => {
	useUploader(Counting);
	Counting.sent = 0;
	try {
		editor().pick();
		const uploader = last();
		const errors: string[] = [];
		const link = "https://[bad/a.png";
		uploader.uploader.$refs = { web_link: { url: link, invalid_input: (error) => errors.push(error) } };
		await uploader.upload_files();
		assert.equal(Counting.sent, 0);
		assert.equal(alerts.length, 0);
		assert.match(errors[0] ?? "", /cannot be shown as an image/);
	} finally {
		useUploader(FakeUploader);
	}
});

test("nothing chosen yet is left to the dialog's own message", async () => {
	useUploader(Counting);
	Counting.sent = 0;
	try {
		editor().pick();
		const uploader = last();
		uploader.uploader.$refs = { file_browser: { selected_node: {} } };
		await uploader.upload_files();
		uploader.uploader.$refs = { web_link: { url: "", invalid_input: () => undefined } };
		await uploader.upload_files();
		assert.equal(Counting.sent, 2);
		assert.equal(loadRequests.length, 0);
	} finally {
		useUploader(FakeUploader);
	}
});

test("a second click while a choice is being checked sends it once", async () => {
	useUploader(Counting);
	Counting.sent = 0;
	try {
		const url = "/files/a.png";
		loads.add(url);
		editor().pick();
		const uploader = last();
		uploader.uploader.$refs = { file_browser: { selected_node: { file_url: url } } };
		await Promise.all([uploader.upload_files(), uploader.upload_files()]);
		assert.equal(Counting.sent, 1);
		assert.equal(loadRequests.length, 1);
	} finally {
		useUploader(FakeUploader);
	}
});

test("closing the dialog while a choice is being checked sends nothing", async () => {
	useUploader(Counting);
	Counting.sent = 0;
	try {
		const url = "/files/a.png";
		loads.add(url);
		editor().pick();
		const uploader = last();
		uploader.uploader.$refs = { file_browser: { selected_node: { file_url: url } } };
		const running = uploader.upload_files();
		uploader.hidden();
		await running;
		await tick();
		assert.equal(Counting.sent, 0);
		assert.equal(inserted.length, 0);
	} finally {
		useUploader(FakeUploader);
	}
});

test("a host that never answers counts as not showing, and the dialog recovers", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	useUploader(Counting);
	Counting.sent = 0;
	try {
		const url = "https://slow.example.com/a.png";
		hanging.add(url);
		editor().pick();
		const uploader = last();
		uploader.uploader.$refs = { file_browser: { selected_node: { file_url: url } } };
		const running = uploader.upload_files();
		t.mock.timers.tick(IMAGE_CHECK_TIMEOUT);
		await running;
		assert.equal(Counting.sent, 0);
		assert.match(alerts[0]?.message ?? "", /cannot be shown/);
		assert.equal(uploader.buttonDisabled, false);
	} finally {
		t.mock.timers.reset();
		useUploader(FakeUploader);
	}
});

test("a private image is inserted with a warning", () => {
	editor().pick();
	last().succeed(doc("secret", { is_private: 1, file_url: "/private/files/secret.png" }));
	assert.equal(inserted.length, 1);
	assert.match(alerts[0]?.message ?? "", /secret\.png is private/);
});

test("a public image brings no warning", () => {
	editor().pick();
	last().succeed(doc("open", { is_private: 0 }));
	assert.equal(alerts.length, 0);
});

test("a response without a File document is an error", () => {
	editor().pick();
	last().succeed(null);
	assert.equal(inserted.length, 0);
	assert.equal(alerts[0]?.indicator, "red");
});

test("file names in a message are escaped", () => {
	editor().pick();
	last().succeed(doc("x", { is_private: 1, file_name: "<img src=x>.png" }));
	assert.match(alerts[0]?.message ?? "", /&lt;img/);
	assert.doesNotMatch(alerts[0]?.message ?? "", /<img/);
});

test("a pasted private image brings the warning too", async () => {
	const file = png();
	const upload = editor().upload(file);
	last().uploaded(file, doc("secret", { is_private: 1 }));
	last().hidden();
	await upload;
	assert.match(alerts[0]?.message ?? "", /is private/);
});

test("a cropped file still finds its placeholder", async () => {
	const file = png();
	const upload = editor().upload(file);
	const [entry] = last().entries;
	assert.ok(entry);
	// What ImageCropper.vue does when the crop is applied.
	entry.file_obj = new File(["cropped"], file.name, { type: file.type });
	last().uploaded(file, doc("cropped"));
	last().hidden();
	assert.equal((await upload).file_url, "/files/cropped.png");
	assert.equal(inserted.length, 0);
});

test("a device file picked in the dialog is inserted whatever its name says", () => {
	editor().pick();
	const picked = png("photo.jfif");
	last().uploader.add_files([picked]);
	last().uploaded(picked, doc("photo", { file_url: "/files/photo.jfif" }));
	assert.equal(inserted[0]?.file_url, "/files/photo.jfif");
	assert.equal(loadRequests.length, 0);
});

test("a cancelled file's late answer inserts nothing", async () => {
	let finish = () => {};
	class Slow extends FakeUploader {
		constructor(options?: FrappeFileUploaderOptions) {
			super(options);
			this.upload_files = () => new Promise<void>((resolve) => (finish = resolve));
		}
	}
	useUploader(Slow);
	try {
		const controller = new AbortController();
		const file = png();
		const upload = editor().upload(file, { signal: controller.signal });
		const uploader = last();
		const running = uploader.upload_files();
		uploader.hidden();
		controller.abort();
		await assert.rejects(upload, assertCancelled);

		// The request has gone out and cannot be called back.
		uploader.uploaded(file, doc("late"));
		finish();
		await running;
		await tick();
		assert.equal(inserted.length, 0);
		assert.equal(alerts.length, 0);
	} finally {
		useUploader(FakeUploader);
	}
});

test("an upload that fails after the dialog closed says so, naming what was lost", async () => {
	let fail: (reason: Error) => void = () => {};
	class Slow extends FakeUploader {
		constructor(options?: FrappeFileUploaderOptions) {
			super(options);
			this.upload_files = () => new Promise<void>((_resolve, reject) => (fail = reject));
		}
	}
	useUploader(Slow);
	try {
		const first = png("first.png");
		const second = png("<second>.png");
		const images = editor();
		const uploads = [images.upload(first), images.upload(second)];
		const uploader = last();
		const running = uploader.upload_files();
		uploader.hidden();
		uploader.failed(first, "File type of PNG is not allowed");
		fail(new Error("417"));
		await assert.rejects(running);
		await assert.rejects(uploads[0], assertCancelled);
		await assert.rejects(uploads[1], assertCancelled);
		assert.equal(alerts.length, 1);
		assert.equal(alerts[0]?.indicator, "red");
		assert.match(alerts[0]?.message ?? "", /first\.png, &lt;second>\.png: File type of PNG is not allowed/);
	} finally {
		useUploader(FakeUploader);
	}
});

test("a failure with no message from the server still says so", async () => {
	const file = png();
	const upload = editor().upload(file);
	const uploader = last();
	uploader.upload_files = () => Promise.reject(new Error("network"));
	const running = uploader.upload_files();
	uploader.hidden();
	uploader.failed(file, null);
	await assert.rejects(running);
	await assert.rejects(upload, assertCancelled);
	assert.match(alerts[0]?.message ?? "", /The upload failed/);
});

test("closing the dialog on a failure it was showing is a quiet cancel", async () => {
	const file = png();
	const upload = editor().upload(file);
	last().failed(file, "File type of PNG is not allowed");
	last().hidden();
	await assert.rejects(upload, assertCancelled);
	await tick();
	assert.equal(alerts.length, 0);
});

test("the document an upload was asked for", () => {
	const saved = { doctype: "Note", docname: "N-1", fieldname: "c" };
	assert.equal(sameDocument(saved, saved), true);
	assert.equal(sameDocument(saved, { ...saved, docname: "N-2" }), false);
	assert.equal(sameDocument(saved, { ...saved, doctype: "ToDo" }), false);
	assert.equal(sameDocument(saved, {}), false);
	// An unsaved document, saved meanwhile.
	assert.equal(sameDocument({}, saved), true);
	assert.equal(sameDocument({}, {}), true);
});
