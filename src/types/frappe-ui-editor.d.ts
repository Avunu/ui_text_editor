// Copyright (c) 2026, Avunu LLC and contributors
// For license information, please see license.txt

/**
 * Type surface of `frappe-ui/editor` as used by this bundle.
 *
 * frappe-ui ships raw TypeScript / Vue sources that don't pass this repo's
 * strict compiler settings, so `tsconfig.json` maps the package to this
 * declaration instead of type-checking the library. Components are typed as
 * plain Vue components (their props are frappe-ui's own concern); add an export
 * here when the bundle starts using another one.
 */

// The extensions whose commands the toolbar chains (toggleUnderline,
// toggleTaskList, toggleCodeBlock) add them to TipTap's `Commands` here.
/// <reference types="@tiptap/extension-underline" />
/// <reference types="@tiptap/extension-list" />
/// <reference types="@tiptap/extension-code-block" />

import type { Editor as CoreEditor } from "@tiptap/core";
import type { Component } from "vue";

// The image and drop commands frappe-ui's extensions add.
declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		image: {
			setImage: (options: { src: string }) => ReturnType;
			uploadImage: (file: File) => ReturnType;
			selectAndUploadImage: () => ReturnType;
			replaceImage: (pos: number, file: File) => ReturnType;
		};
		mediaDrop: {
			dropFiles: (files: File[]) => ReturnType;
		};
	}
}

/** TipTap's `Editor` instance, as passed to menu item callbacks. */
export type TiptapEditor = CoreEditor;

export interface UploadedMedia {
	file_url: string;
	[key: string]: unknown;
}

export interface MediaUploadProgress {
	loaded: number;
	total: number;
	percent: number;
}

export type UploadFunction = (
	file: File,
	options?: { signal?: AbortSignal; onProgress?: (progress: MediaUploadProgress) => void },
) => Promise<UploadedMedia>;

export const Editor: Component;
export const EditorContent: Component;
export const EditorFixedMenu: Component;
export const EditorBubbleMenu: Component;
export const EditorTableMenu: Component;

/** A toolbar button (frappe-ui `menu.ts`). */
export interface CommandMenuItem {
	label: string;
	/** A `lucide-*` icon name or a component. */
	icon?: Component | string;
	action: (editor: TiptapEditor) => boolean | void | Promise<boolean | void>;
	isActive?: (editor: TiptapEditor) => boolean;
	isDisabled?: (editor: TiptapEditor) => boolean;
	/** Hide the item when the extension behind it is not loaded. */
	isAvailable?: (editor: TiptapEditor) => boolean;
}

/** A dropdown of toolbar buttons. */
export interface MenuGroupItem {
	type: "group";
	icon?: Component | string;
	label: string;
	items: CommandMenuItem[];
}

export type MenuItem = CommandMenuItem | MenuGroupItem | { type: "separator" };

export const Bold: CommandMenuItem;
export const Italic: CommandMenuItem;
export const Strike: CommandMenuItem;
export const InlineCode: CommandMenuItem;
export const H1: CommandMenuItem;
export const H2: CommandMenuItem;
export const H3: CommandMenuItem;
export const H4: CommandMenuItem;
export const BulletList: CommandMenuItem;
export const OrderedList: CommandMenuItem;
export const Blockquote: CommandMenuItem;
export const HorizontalRule: CommandMenuItem;
export const AlignLeft: CommandMenuItem;
export const AlignCenter: CommandMenuItem;
export const AlignRight: CommandMenuItem;
export const FontColor: CommandMenuItem;
export const FontHighlight: CommandMenuItem;
export const InsertLink: CommandMenuItem;
export const InsertImage: CommandMenuItem;
export const InsertTable: CommandMenuItem;
export const Undo: CommandMenuItem;
export const Redo: CommandMenuItem;
export const Separator: MenuItem;

/** The contextual table toolbar preset. */
export const tableToolbar: MenuItem[];

/** The heading node on its own, without the kit's table-of-contents ids. */
export const Heading: { configure(options: { levels: number[] }): unknown };

/** The rich-text extension bundle; each member takes options or `false`. */
export const RichTextKit: {
	configure(options: Record<string, unknown>): unknown;
};
