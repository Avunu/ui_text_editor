// Copyright (c) 2026, Avunu LLC and contributors
// For license information, please see license.txt

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { UploadedMedia } from "frappe-ui/editor";
import {
	UPLOAD_CANCELLED,
	createImageDialog,
	looksLikeImage,
	uploadTarget,
	type ImageDialogOptions,
} from "./upload.ts";

type Doc = UploadedMedia & { name: string; file_name?: string; is_private?: 0 | 1 };
type Entry = { file_obj: File; doc: Doc | null };

/** Stands in for `frappe.ui.FileUploader`, with what `FileUploader.vue` does to its list. */
class FakeUploader {
	static opened: FakeUploader[] = [];
	/** What the dialog's own checks refuse, as `check_restrictions` does. */
	static refuse = new Set<File>();

	entries: Entry[] = [];
	dialog = {
		keep_grid_form_open: false,
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
				if (!FakeUploader.refuse.has(file)) this.entries.push({ file_obj: file, doc: null });
			}
		},
	};
	hidden: () => void = () => undefined;
	options: Record<string, unknown> & { on_success: (doc: Doc | null) => void };
	upload_files: () => Promise<unknown> = () => Promise.resolve();

	constructor(options: FakeUploader["options"]) {
		this.options = options;
		FakeUploader.opened.push(this);
	}

	/** A device file finished: the dialog sets `doc`, then reports it. */
	uploaded(file: File, doc: Doc) {
		const entry = this.entries.find((candidate) => candidate.file_obj === file);
		assert.ok(entry);
		entry.doc = doc;
		this.options.on_success(doc);
	}
}

const alerts: { message: string; indicator: string }[] = [];

Object.assign(globalThis, {
	__: (text: string, args: string[] = []) => text.replace(/\{(\d)\}/g, (_, i: string) => args[Number(i)]),
	frappe: {
		ui: { FileUploader: FakeUploader },
		show_alert: (alert: { message: string; indicator: string }) => alerts.push(alert),
	},
});

const useUploader = (uploader: typeof FakeUploader) => {
	(frappe.ui as unknown as { FileUploader: unknown }).FileUploader = uploader;
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
const doc = (name: string, extra: Partial<Doc> = {}): Doc => ({
	name,
	file_name: `${name}.png`,
	file_url: `/files/${name}.png`,
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
	const form = (isNew: boolean) => ({ doctype: "Note", docname: "N-1", is_new: () => isNew });
	assert.deepEqual(uploadTarget(form(false), "content"), {
		doctype: "Note",
		docname: "N-1",
		fieldname: "content",
	});
	assert.deepEqual(uploadTarget(form(true), "content"), {});
	assert.deepEqual(uploadTarget(undefined, "content"), {});
});

test("a new document's dialog passes no attachment", () => {
	editor({ target: () => uploadTarget({ doctype: "Note", docname: "x", is_new: () => true }, "c") }).pick();
	const { options } = last();
	assert.equal(options.doctype, undefined);
	assert.equal(options.docname, undefined);
	assert.equal(options.fieldname, undefined);
});

test("a chosen image is inserted at the cursor, each one of several", () => {
	editor().pick();
	last().options.on_success(doc("one"));
	last().options.on_success(doc("two"));
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
		constructor(options: FakeUploader["options"]) {
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
		uploader.options.on_success(doc("library"));
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
		constructor(options: FakeUploader["options"]) {
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

test("a library file that is not an image is reported, not inserted", () => {
	editor().pick();
	last().options.on_success(doc("report", { file_name: "report.pdf", file_url: "/files/report.pdf" }));
	assert.equal(inserted.length, 0);
	assert.equal(alerts[0]?.indicator, "orange");
	assert.match(alerts[0]?.message ?? "", /report\.pdf is not an image/);
});

test("a private image is inserted with a warning", () => {
	editor().pick();
	last().options.on_success(doc("secret", { is_private: 1, file_url: "/private/files/secret.png" }));
	assert.equal(inserted.length, 1);
	assert.match(alerts[0]?.message ?? "", /secret\.png is private/);
});

test("a public image brings no warning", () => {
	editor().pick();
	last().options.on_success(doc("open", { is_private: 0 }));
	assert.equal(alerts.length, 0);
});

test("a response without a File document is an error", () => {
	editor().pick();
	last().options.on_success(null);
	assert.equal(inserted.length, 0);
	assert.equal(alerts[0]?.indicator, "red");
});

test("what counts as an image", () => {
	for (const url of [
		"/files/a.png",
		"/files/a.JPG",
		"/private/files/a.webp",
		"https://example.com/a.svg?x=1.pdf",
		"https://images.example.com/photo-123?w=800",
		"https://example.com",
	]) {
		assert.equal(looksLikeImage(url), true, url);
	}
	for (const url of ["/files/a.pdf", "https://example.com/a.docx?x=1.png", "https://example.com/page.html"]) {
		assert.equal(looksLikeImage(url), false, url);
	}
});
