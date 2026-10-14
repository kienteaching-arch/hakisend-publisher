import { Modal,
    App,
    FuzzySuggestModal,
    DropdownComponent,
    Notice,
    Plugin,
    PluginSettingTab,
    Setting,
    TFile,
    TFolder,
    requestUrl,
} from "obsidian";

import {requestPrivateDraft} from "./email/hakisend-draft-api";
import {parsePrivateDraftList, parsePrivateDraftDetail, type PrivateDraftListRow, type PrivateDraftReadOnlyDetail} from "./email/private-draft-list";
import {
    parseStandalonePlan, isAudience, isRevisionConflict, canAdoptRevision,
    decorateLocalPlan, type StandalonePlan, type Audience,
} from "./email/private-draft-contract";
import {explicitlySavePrivateDraft} from "./email/explicit-private-draft-save";

/**
 * Fuzzy search across existing folders. Searching by path is more reliable
 * than typing a folder by hand, and works in desktop and mobile Obsidian.
 */
class HakiSendFolderPicker extends FuzzySuggestModal<TFolder> {
    constructor(
        app: App,
        private readonly onChooseFolder: (folder: TFolder) => void
    ) {
        super(app);
        this.setPlaceholder("Search Obsidian folders by name or path...");
        this.setInstructions([
            { command: "↑↓", purpose: "Navigate" },
            { command: "↵", purpose: "Choose folder" },
            { command: "esc", purpose: "Cancel" },
        ]);
    }

    getItems(): TFolder[] {
        return this.app.vault.getAllLoadedFiles()
            .filter((item): item is TFolder =>
                item instanceof TFolder && item.path.length > 0 && item.path !== "/"
            )
            .sort((left, right) => left.path.localeCompare(right.path));
    }

    getItemText(folder: TFolder): string {
        return folder.path;
    }

    onChooseItem(folder: TFolder): void {
        this.onChooseFolder(folder);
    }
}

interface HakiSendSite {
    uid: string;
    name: string;
    slug?: string;
    status?: string;
    default_locale?: string;
    excerpt_max_length?: number;
}

interface FolderSiteMapping { folderPath: string; siteUid: string; }
interface FolderCategoryMapping {
    folderPath: string;
    siteUid: string;
    categoryUid: string;
    categoryTitle?: string;
}

interface HakiSendPublisherSettings {
    apiBaseUrl: string;
    defaultSiteUid: string;
    folderSiteMappings: FolderSiteMapping[];
    folderCategoryMappings: FolderCategoryMapping[];

    /**
     * S5.3B legacy field.
     *
     * Never display this value.
     * It is retained only until browser-connect succeeds,
     * then it is cleared from data.json.
     */
    bearerToken?: string;

    sites: HakiSendSite[];
}

interface PendingConnection {
    state: string;
    verifier: string;
    apiBaseUrl: string;
    createdAt: number;
}

interface ExchangeResponse {
    success?: boolean;
    data?: {
        access_token?: string;
        token_type?: string;
        expires_at?: string | null;
        scopes?: string[];
        token_uid?: string;
    };
    error?: {
        code?: string;
        message?: string;
    };
}

interface SitesResponse {
    success?: boolean;
    data?: HakiSendSite[] | {
        sites?: HakiSendSite[];
    };
    error?: {
        code?: string;
        message?: string;
    };
}


interface HakiSendCategory {
    uid: string;
    title: string;
    slug: string;
    status?: string;
    post_count?: number;
}

interface PostUpsertData {
    operation: "created" | "updated" | "unchanged";
    type: string;
    uid: string;
    category_uid: string;
    slug: string;
    status: string;
    publishing_state?: string;
    source_hash?: string;
    tags?: Array<{
        uid: string;
        name: string;
        slug: string;
    }>;
    external?: {
        source?: string;
        id?: string;
    };
}


interface HakiSendMediaAsset {
    uid: string;
    url: string;
    format?: string;
    mime_type?: string;
    bytes?: number;
    source_bytes?: number;
    width?: number;
    height?: number;
    source_sha256?: string;
    sha256?: string;
    original_name?: string;
    storage_node?: string;
    status?: string;
    storage_bytes?: number;
    variants?: Array<Record<string, unknown>>;
    reused?: boolean;
}

async function sha256Hex(
    data: ArrayBuffer
): Promise<string> {
    const digest =
        await crypto.subtle.digest(
            "SHA-256",
            data
        );

    return Array.from(
        new Uint8Array(digest)
    )
        .map((value) =>
            value
                .toString(16)
                .padStart(2, "0")
        )
        .join("");
}

function mediaMimeType(
    file: TFile
): string {
    const extension =
        file.extension
            .toLowerCase();

    const types:
        Record<string, string> = {
            png: "image/png",
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            webp: "image/webp",
            gif: "image/gif",
            avif: "image/avif",
        };

    const mime =
        types[extension];

    if (!mime) {
        throw new Error(
            `Unsupported local image type: .${extension}`
        );
    }

    return mime;
}

function externalImageTarget(
    target: string
): boolean {
    return (
        /^https?:\/\//i.test(target)
        || /^data:/i.test(target)
        || /^\/\//.test(target)
    );
}

function safeMarkdownAlt(
    value: string
): string {
    return value
        .replace(/\]/g, "\\]")
        .replace(/\r?\n/g, " ")
        .trim();
}


interface SaveCurrentNoteResult {
    file: TFile;
    token: string;
    siteUid: string;
    post: PostUpsertData;
}

interface PublicationData {
    operation: "published" | "unchanged";
    site_uid: string;
    publication_uid: string;
    version: number;
    content_hash: string;
    published_at?: string | null;
    live?: {
        bound?: boolean;
        hostname?: string | null;
        root_url?: string | null;
        sync_status?: string | null;
        publication_uid?: string | null;
        version?: number | null;
    };
}

function uuidV4(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);

    bytes[6] =
        (bytes[6] & 0x0f) | 0x40;

    bytes[8] =
        (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes)
        .map((value) =>
            value
                .toString(16)
                .padStart(2, "0")
        );

    return [
        hex.slice(0, 4).join(""),
        hex.slice(4, 6).join(""),
        hex.slice(6, 8).join(""),
        hex.slice(8, 10).join(""),
        hex.slice(10, 16).join(""),
    ].join("-");
}

function stripYamlFrontmatter(
    markdown: string
): string {
    let source =
        markdown.replace(/^\uFEFF/, "");

    const lines =
        source.split(/\r?\n/);

    if (
        lines.length < 3
        || lines[0].trim() !== "---"
    ) {
        return source;
    }

    const limit =
        Math.min(lines.length, 200);

    for (
        let i = 1;
        i < limit;
        i++
    ) {
        const line =
            lines[i].trim();

        if (
            line === "---"
            || line === "..."
        ) {
            return lines
                .slice(i + 1)
                .join("\n")
                .replace(/^\n/, "");
        }
    }

    return source;
}

/**
 * Strip only authoring-control blocks whose
 * first non-whitespace token on a line is INPUT[.
 *
 * Fenced code blocks are never touched.
 * An unclosed INPUT[ block is preserved rather
 * than deleting the rest of the document.
 */
function stripAuthoringInputBlocks(
    markdown: string
): string {
    const lines =
        markdown.split("\n");

    const output: string[] = [];

    let inFence = false;
    let fenceMarker = "";

    const bracketDelta = (
        value: string
    ): number => {
        let depth = 0;

        for (const char of value) {
            if (char === "[") {
                depth++;
            } else if (char === "]") {
                depth--;
            }
        }

        return depth;
    };

    for (
        let i = 0;
        i < lines.length;
        i++
    ) {
        const line = lines[i];
        const trimmed =
            line.trimStart();

        const fenceMatch =
            trimmed.match(/^(```+|~~~+)/);

        if (fenceMatch) {
            const marker =
                fenceMatch[1][0];

            if (!inFence) {
                inFence = true;
                fenceMarker = marker;
            } else if (
                marker === fenceMarker
            ) {
                inFence = false;
                fenceMarker = "";
            }

            output.push(line);
            continue;
        }

        if (
            !inFence
            && trimmed.startsWith(
                "INPUT["
            )
        ) {
            let depth =
                bracketDelta(trimmed);

            let closing = i;

            while (
                depth > 0
                && closing + 1
                    < lines.length
            ) {
                closing++;

                depth +=
                    bracketDelta(
                        lines[closing]
                    );
            }

            if (depth <= 0) {
                i = closing;
                continue;
            }

            // Malformed/unclosed control:
            // preserve original content.
        }

        output.push(line);
    }

    return output.join("\n");
}

function hasLocalMediaReference(
    markdown: string
): boolean {
    if (/!\[\[[^\]]+\]\]/.test(markdown)) {
        return true;
    }

    const re =
        /!\[[^\]]*\]\(([^)]+)\)/g;

    let match: RegExpExecArray | null;

    while (
        (match = re.exec(markdown))
        !== null
    ) {
        let target =
            (match[1] ?? "").trim();

        target =
            target.replace(
                /^<|>$/g,
                ""
            );

        if (
            !/^https?:\/\//i.test(
                target
            )
            && !/^data:/i.test(
                target
            )
        ) {
            return true;
        }
    }

    return false;
}

function normalizeTagValues(
    value: unknown
): string[] {
    if (Array.isArray(value)) {
        return value
            .map((item) =>
                String(item).trim()
            )
            .filter(Boolean)
            .slice(0, 20);
    }

    if (
        typeof value === "string"
        && value.trim()
    ) {
        return [value.trim()];
    }

    return [];
}

function simpleSlug(
    value: string
): string {
    return value
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .toLowerCase()
        .replace(
            /[^a-z0-9]+/g,
            "-"
        )
        .replace(/^-+|-+$/g, "");
}

const DEFAULT_SETTINGS: HakiSendPublisherSettings = {
    apiBaseUrl: "https://app.hakisend.com",
    defaultSiteUid: "",
    folderSiteMappings: [],
    folderCategoryMappings: [],
    bearerToken: "",
    sites: [],
};

const ACCESS_TOKEN_SECRET =
    "hakisend-publisher-access-token";

const PENDING_CONNECTION_SECRET =
    "hakisend-publisher-pkce-pending";

const CONNECT_CALLBACK_ACTION =
    "hakisend-connect";

const PENDING_MAX_AGE_MS =
    30 * 60 * 1000;

function normalizeFolderPath(value: string): string {
    return value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
}

function pathIsWithinFolder(path: string, folder: string): boolean {
    return path === folder || path.startsWith(folder + "/");
}

function normalizeBaseUrl(value: string): string {
    const trimmed = value.trim();

    if (!trimmed) {
        return DEFAULT_SETTINGS.apiBaseUrl;
    }

    return trimmed.replace(/\/+$/, "");
}

function base64Url(bytes: Uint8Array): string {
    let binary = "";

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

function randomBase64Url(byteLength: number): string {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);

    return base64Url(bytes);
}

async function sha256Base64Url(
    value: string
): Promise<string> {
    const input = new TextEncoder().encode(value);

    const digest = await crypto.subtle.digest(
        "SHA-256",
        input
    );

    return base64Url(
        new Uint8Array(digest)
    );
}


interface HakiSendPostPropertiesValues {
    title: string;
    slug: string;
    category: HakiSendCategory;
    tags: string[];
    excerpt: string;
}

interface HakiSendNewPostValues {
    title: string;
    category: HakiSendCategory;
    siteUid: string;
    folderPath: string;
}

interface HakiSendNewPostDestination {
    folderPath: string;
    siteUid: string;
    siteName: string;
    categories: HakiSendCategory[];
    preferredCategoryUid: string;
}

function safeMarkdownBasename(
    raw: string
): string {
    let value =
        raw
            .normalize("NFKC")
            .replace(
                /[\\/:*?"<>|]/g,
                "-"
            )
            .replace(
                /\s+/g,
                " "
            )
            .trim()
            .replace(
                /[. ]+$/g,
                ""
            );

    if (!value) {
        value = "Untitled";
    }

    if (
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
            .test(value)
    ) {
        value =
            "_" + value;
    }

    if (value.length > 120) {
        value =
            value
                .slice(0, 120)
                .trim()
                .replace(
                    /[. ]+$/g,
                    ""
                );
    }

    return value || "Untitled";
}

function yamlQuotedScalar(
    value: string
): string {
    /*
     * JSON double-quoted strings are valid YAML 1.2 scalars
     * and safely preserve Vietnamese / punctuation.
     */
    return JSON.stringify(
        value
    );
}

interface HakiSendScheduleValues {
    publishAtIso: string;
    unpublishAtIso: string | null;
    display: string;
}

function padDatePart(value: number): string {
    return String(value).padStart(2, "0");
}

function localInputValue(
    date: Date
): string {
    return [
        date.getFullYear(),
        "-",
        padDatePart(
            date.getMonth() + 1
        ),
        "-",
        padDatePart(
            date.getDate()
        ),
        "T",
        padDatePart(
            date.getHours()
        ),
        ":",
        padDatePart(
            date.getMinutes()
        ),
    ].join("");
}

function isoWithLocalOffset(
    date: Date
): string {
    const offsetMinutes =
        -date.getTimezoneOffset();

    const sign =
        offsetMinutes >= 0
            ? "+"
            : "-";

    const absolute =
        Math.abs(
            offsetMinutes
        );

    const offsetHour =
        Math.floor(
            absolute / 60
        );

    const offsetMinute =
        absolute % 60;

    return [
        date.getFullYear(),
        "-",
        padDatePart(
            date.getMonth() + 1
        ),
        "-",
        padDatePart(
            date.getDate()
        ),
        "T",
        padDatePart(
            date.getHours()
        ),
        ":",
        padDatePart(
            date.getMinutes()
        ),
        ":00",
        sign,
        padDatePart(
            offsetHour
        ),
        ":",
        padDatePart(
            offsetMinute
        ),
    ].join("");
}

function dateFromScheduleValue(
    value: unknown
): Date | null {
    if (
        typeof value !== "string"
        || !value.trim()
    ) {
        return null;
    }

    const date =
        new Date(
            value.trim()
        );

    return Number.isNaN(
        date.getTime()
    )
        ? null
        : date;
}

class HakiSendPostPropertiesModal
    extends Modal {

    private titleValue: string;
    private slugValue: string;
    private categoryUid: string;
    private tagsValue: string;
    private excerptValue: string;

    constructor(
        app: App,
        private categories:
            HakiSendCategory[],
        initial: {
            title: string;
            slug: string;
            categoryUid: string;
            tags: string[];
            excerpt: string;
            externalId: string;
            status: string;
        },
        private onSubmit:
            (
                values:
                    HakiSendPostPropertiesValues
            ) => Promise<void>
    ) {
        super(app);

        this.titleValue =
            initial.title;

        this.slugValue =
            initial.slug;

        this.categoryUid =
            initial.categoryUid;

        this.tagsValue =
            initial.tags.join(", ");

        this.excerptValue =
            initial.excerpt;

        this.initialExternalId =
            initial.externalId;

        this.initialStatus =
            initial.status;
    }

    private initialExternalId: string;
    private initialStatus: string;

    onOpen(): void {
        const {
            contentEl,
        } = this;

        contentEl.empty();

        contentEl.createEl(
            "h2",
            {
                text:
                    "HakiSend Post Properties",
            }
        );

        const stateParts: string[] = [];

        if (this.initialStatus) {
            stateParts.push(
                "Status: "
                + this.initialStatus
            );
        }

        if (this.initialExternalId) {
            stateParts.push(
                "Identity: "
                + this.initialExternalId
            );
        }

        if (stateParts.length) {
            contentEl.createEl(
                "p",
                {
                    text:
                        stateParts.join(
                            " · "
                        ),
                }
            );
        }

        contentEl.createEl(
            "p",
            {
                text:
                    "Changes are local only until you use Save, Schedule, or Publish.",
            }
        );

        new Setting(
            contentEl
        )
            .setName("Title")
            .setDesc(
                "Public Post title. It does not rename the Markdown file."
            )
            .addText(
                (text) => {
                    text
                        .setValue(
                            this.titleValue
                        )
                        .onChange(
                            (
                                value
                            ) => {
                                this.titleValue =
                                    value;
                            }
                        );
                }
            );

        new Setting(
            contentEl
        )
            .setName("Slug")
            .setDesc(
                "Optional. Leave blank to keep automatic/server slug behavior."
            )
            .addText(
                (text) => {
                    text
                        .setPlaceholder(
                            "my-post-slug"
                        )
                        .setValue(
                            this.slugValue
                        )
                        .onChange(
                            (
                                value
                            ) => {
                                this.slugValue =
                                    value;
                            }
                        );
                }
            );

        new Setting(
            contentEl
        )
            .setName("Category")
            .setDesc(
                "Stored explicitly so moving the note does not change category."
            )
            .addDropdown(
                (dropdown) => {
                    for (
                        const category
                        of this.categories
                    ) {
                        dropdown
                            .addOption(
                                category.uid,
                                `${category.title} (${category.slug})`
                            );
                    }

                    dropdown
                        .setValue(
                            this.categoryUid
                        )
                        .onChange(
                            (
                                value
                            ) => {
                                this.categoryUid =
                                    value;
                            }
                        );
                }
            );

        new Setting(
            contentEl
        )
            .setName("Tags")
            .setDesc(
                "Comma-separated tags. Blank removes local HakiSend tags."
            )
            .addText(
                (text) => {
                    text
                        .setPlaceholder(
                            "parenting, education"
                        )
                        .setValue(
                            this.tagsValue
                        )
                        .onChange(
                            (
                                value
                            ) => {
                                this.tagsValue =
                                    value;
                            }
                        );
                }
            );

        new Setting(
            contentEl
        )
            .setName("Excerpt")
            .setDesc(
                "Optional short description."
            )
            .addTextArea(
                (text) => {
                    text
                        .setPlaceholder(
                            "Short description"
                        )
                        .setValue(
                            this.excerptValue
                        )
                        .onChange(
                            (
                                value
                            ) => {
                                this.excerptValue =
                                    value;
                            }
                        );
                }
            );

        new Setting(
            contentEl
        )
            .addButton(
                (button) => {
                    button
                        .setButtonText(
                            "Cancel"
                        )
                        .onClick(
                            () => {
                                this.close();
                            }
                        );
                }
            )
            .addButton(
                (button) => {
                    button
                        .setButtonText(
                            "Update Properties"
                        )
                        .setCta()
                        .onClick(
                            async () => {
                                await this.submit();
                            }
                        );
                }
            );
    }

    private async submit():
        Promise<void> {

        const title =
            this.titleValue
                .trim();

        if (!title) {
            new Notice(
                "Title is required."
            );

            return;
        }

        const category =
            this.categories
                .find(
                    (
                        item
                    ) =>
                        item.uid
                        === this.categoryUid
                );

        if (!category) {
            new Notice(
                "Choose a HakiSend Category."
            );

            return;
        }

        const tags =
            Array.from(
                new Set(
                    this.tagsValue
                        .split(",")
                        .map(
                            (
                                value
                            ) =>
                                value.trim()
                        )
                        .filter(Boolean)
                )
            );

        this.close();

        await this.onSubmit({
            title,
            slug:
                this.slugValue
                    .trim(),
            category,
            tags,
            excerpt:
                this.excerptValue
                    .trim(),
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}


class HakiSendNewPostModal extends Modal {
    private titleValue = "";
    private categoryUid = "";
    private destination: HakiSendNewPostDestination | null = null;
    private loadSequence = 0;
    private loading = false;
    private submitting = false;
    private folderSetting: Setting | null = null;
    private siteSetting: Setting | null = null;
    private categorySetting: Setting | null = null;

    constructor(
        app: App,
        private readonly initialFolder: string,
        private readonly resolveFolder:
            (folder: string) => Promise<HakiSendNewPostDestination>,
        private readonly onSubmit:
            (values: HakiSendNewPostValues) => Promise<void>
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "New HakiSend Post" });
        contentEl.createEl("p", {
            text: "Choose a destination folder. HakiSend Site and Category are resolved automatically. Creating a local draft does not publish it.",
        });

        this.folderSetting = new Setting(contentEl)
            .setName("Obsidian folder")
            .setDesc("Select a folder in this vault.");
        this.folderSetting.addButton((button) => button
            .setButtonText("Choose folder…")
            .onClick(() => {
                new HakiSendFolderPicker(this.app, (folder) => {
                    void this.loadFolder(folder.path);
                }).open();
            }));

        this.siteSetting = new Setting(contentEl)
            .setName("HakiSend Site")
            .setDesc("Choose a folder to resolve the Site.");

        new Setting(contentEl)
            .setName("Title")
            .setDesc("Used as the filename and initial Post title.")
            .addText((input) => {
                input.setPlaceholder("Post title");
                input.onChange((value) => { this.titleValue = value; });
                input.inputEl.addEventListener("keydown", (event) => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        void this.submit();
                    }
                });
                window.setTimeout(() => input.inputEl.focus(), 0);
            });

        this.categorySetting = new Setting(contentEl)
            .setName("Category")
            .setDesc("Choose a folder to load this Site's Categories.");

        new Setting(contentEl)
            .addButton((button) => button.setButtonText("Cancel")
                .onClick(() => this.close()))
            .addButton((button) => button.setButtonText("Create draft").setCta()
                .onClick(() => { void this.submit(); }));

        const initial = normalizeFolderPath(this.initialFolder);
        if (initial) {
            void this.loadFolder(initial);
        } else {
            this.folderSetting.setDesc("No folder selected. Use Choose folder to continue.");
        }
    }

    private async loadFolder(path: string): Promise<void> {
        const seq = ++this.loadSequence;
        const normalized = normalizeFolderPath(path);
        this.loading = true;
        this.destination = null;
        this.categoryUid = "";

        this.folderSetting?.setDesc(normalized || "No folder selected");
        this.siteSetting?.setDesc("Resolving Site...");
        if (this.categorySetting) {
            this.categorySetting.controlEl.empty();
            this.categorySetting.setDesc("Loading Categories for this folder...");
        }

        try {
            const resolved = await this.resolveFolder(normalized);
            if (seq !== this.loadSequence) return;
            this.destination = resolved;
            this.categoryUid = resolved.preferredCategoryUid;
            this.siteSetting?.setDesc(resolved.siteName);
            this.folderSetting?.setDesc(resolved.folderPath);
            if (this.categorySetting) {
                this.categorySetting.setDesc(
                    this.categoryUid
                        ? "Detected from the nearest folder mapping. You can choose a different Category."
                        : "Choose the Category for the selected Site."
                );
                this.categorySetting.addDropdown((dropdown) => {
                    dropdown.addOption("", "Choose a Category");
                    for (const item of resolved.categories) {
                        dropdown.addOption(item.uid, `${item.title} (${item.slug})`);
                    }
                    dropdown.setValue(this.categoryUid);
                    dropdown.onChange((value) => {
                        this.categoryUid = value;
                    });
                });
            }
        } catch (error) {
            if (seq !== this.loadSequence) return;
            const message = error instanceof Error ? error.message : String(error);
            this.siteSetting?.setDesc("Cannot resolve Site: " + message);
            this.categorySetting?.setDesc("Choose a valid folder to continue.");
        } finally {
            if (seq === this.loadSequence) this.loading = false;
        }
    }

    private async submit(): Promise<void> {
        if (this.submitting) return;
        if (this.loading) {
            new Notice("Wait for the Site and Category to finish loading.");
            return;
        }
        const title = this.titleValue.trim();
        if (!title) {
            new Notice("Enter a title for the new HakiSend Post.");
            return;
        }

        const selected = this.destination;
        if (!selected) {
            new Notice("Choose a valid Obsidian folder with an accessible HakiSend Site.");
            return;
        }

        const category = selected.categories.find((item) => item.uid === this.categoryUid);
        if (!category) {
            new Notice("Choose a Category from the selected HakiSend Site.");
            return;
        }

        this.submitting = true;
        try {
            await this.onSubmit({
                title,
                category,
                siteUid: selected.siteUid,
                folderPath: selected.folderPath,
            });
            this.close();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            new Notice("HakiSend New Post failed: " + message);
        } finally {
            this.submitting = false;
        }
    }

    onClose(): void {
        this.loadSequence++;
        this.contentEl.empty();
    }
}


class HakiSendScheduleModal
    extends Modal {

    private publishInput:
        HTMLInputElement | null =
        null;

    private unpublishInput:
        HTMLInputElement | null =
        null;

    constructor(
        app: App,
        private readonly initialPublish:
            Date | null,
        private readonly initialUnpublish:
            Date | null,
        private readonly onSubmit:
            (
                values:
                    HakiSendScheduleValues
            ) => Promise<void>
    ) {
        super(app);
    }

    onOpen(): void {
        const {
            contentEl
        } = this;

        contentEl.empty();

        contentEl.createEl(
            "h2",
            {
                text:
                    "Schedule HakiSend post",
            }
        );

        const timezone =
            Intl.DateTimeFormat()
                .resolvedOptions()
                .timeZone
            || "Local timezone";

        contentEl.createEl(
            "p",
            {
                text:
                    `Timezone: ${timezone}`,
                cls:
                    "setting-item-description",
            }
        );

        const defaultPublish =
            this.initialPublish
            ?? new Date(
                Date.now()
                + 60 * 60 * 1000
            );

        const publishSetting =
            new Setting(
                contentEl
            )
                .setName(
                    "Publish at"
                )
                .setDesc(
                    "The post stays hidden until this time."
                );

        this.publishInput =
            publishSetting
                .controlEl
                .createEl(
                    "input"
                );

        this.publishInput.type =
            "datetime-local";

        this.publishInput.value =
            localInputValue(
                defaultPublish
            );

        const unpublishSetting =
            new Setting(
                contentEl
            )
                .setName(
                    "Unpublish at"
                )
                .setDesc(
                    "Optional. Leave empty to keep the post online."
                );

        this.unpublishInput =
            unpublishSetting
                .controlEl
                .createEl(
                    "input"
                );

        this.unpublishInput.type =
            "datetime-local";

        if (
            this.initialUnpublish
        ) {
            this.unpublishInput.value =
                localInputValue(
                    this.initialUnpublish
                );
        }

        new Setting(
            contentEl
        )
            .addButton(
                (button) => {
                    button
                        .setButtonText(
                            "Cancel"
                        )
                        .onClick(
                            () => {
                                this.close();
                            }
                        );
                }
            )
            .addButton(
                (button) => {
                    button
                        .setButtonText(
                            "Schedule"
                        )
                        .setCta()
                        .onClick(
                            async () => {
                                await this.submit();
                            }
                        );
                }
            );
    }

    private async submit():
        Promise<void> {

        const publishRaw =
            this.publishInput
                ?.value
                .trim()
            ?? "";

        if (!publishRaw) {
            new Notice(
                "Choose a publish date and time."
            );

            return;
        }

        const publishDate =
            new Date(
                publishRaw
            );

        if (
            Number.isNaN(
                publishDate
                    .getTime()
            )
        ) {
            new Notice(
                "Invalid publish date."
            );

            return;
        }

        if (
            publishDate.getTime()
            <= Date.now()
        ) {
            new Notice(
                "Publish time must be in the future."
            );

            return;
        }

        const unpublishRaw =
            this.unpublishInput
                ?.value
                .trim()
            ?? "";

        let unpublishDate:
            Date | null =
            null;

        if (unpublishRaw) {
            unpublishDate =
                new Date(
                    unpublishRaw
                );

            if (
                Number.isNaN(
                    unpublishDate
                        .getTime()
                )
            ) {
                new Notice(
                    "Invalid unpublish date."
                );

                return;
            }

            if (
                unpublishDate.getTime()
                <= publishDate.getTime()
            ) {
                new Notice(
                    "Unpublish time must be later than publish time."
                );

                return;
            }
        }

        const values:
            HakiSendScheduleValues = {
                publishAtIso:
                    isoWithLocalOffset(
                        publishDate
                    ),

                unpublishAtIso:
                    unpublishDate
                        ? isoWithLocalOffset(
                            unpublishDate
                        )
                        : null,

                display:
                    `${publishRaw.replace(
                        "T",
                        " "
                    )} · ${Intl
                        .DateTimeFormat()
                        .resolvedOptions()
                        .timeZone
                        || "local"}`,
            };

        this.close();

        await this.onSubmit(
            values
        );
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

/**
 * Explicit read-only Private Email Draft browser for the development source.
 * Never writes Vault files, schedules Campaigns, or automatically fetches.
 * The existing Sites API has a hard 50-row bound and NO pagination cursor.
 */
class HakiSendPrivateEmailBrowserModal extends Modal {
    private siteUid = "";
    private sequence = 0;
    constructor(
        app: App,
        private readonly sites: readonly HakiSendSite[],
        private readonly loadRows: (siteUid: string) => Promise<PrivateDraftListRow[]>,
        private readonly loadDetail: (siteUid: string, draftUid: string) => Promise<PrivateDraftReadOnlyDetail>
    ) {
        super(app);
    }

    onOpen(): void {
        const {contentEl} = this;
        contentEl.empty();
        contentEl.createEl("h2", {text:"Private Standalone Email Drafts"});
        contentEl.createEl("p", {
            text:"Read-only server view. Nothing will be sent, scheduled, synced, or copied into your Vault."
        });
        const results = contentEl.createDiv();
        new Setting(contentEl)
            .setName("HakiSend Site")
            .setDesc("Choose a Site explicitly; emails from other Sites are never requested.")
            .addDropdown(dropdown => {
                dropdown.addOption("", "Choose Site");
                for (const site of this.sites) {
                    dropdown.addOption(site.uid, site.name);
                }
                dropdown.onChange(value => {
                    this.siteUid = value;
                    this.sequence++;
                    results.empty();
                });
            });
        new Setting(contentEl)
            .addButton(button => button
                .setButtonText("Load private drafts")
                .onClick(async () => {
                    if (!this.siteUid || !this.sites.some(s => s.uid === this.siteUid)) {
                        new Notice("Choose an authorized HakiSend Site.");
                        return;
                    }
                    const chosen = this.siteUid;
                    const current = ++this.sequence;
                    results.empty();
                    results.createEl("p", {text:"Loading private Email Draft metadata..."});
                    try {
                        const rows = await this.loadRows(chosen);
                        if (current !== this.sequence || chosen !== this.siteUid) return;
                        results.empty();
                        results.createEl("p", {
                            text: rows.length
                                ? "Only unsent private Draft metadata is shown."
                                : "No accessible private Email Drafts were returned."
                        });
                        const list = results.createEl("ul");
                        for (const row of rows) {
                            const item = list.createEl("li");
                            item.createEl("strong", {text:row.subject});
                            item.createSpan({text:" · Revision "+row.revision+" · Private Draft — NOT sent"});
                            const detailBox = item.createDiv();
                            new Setting(item).addButton(button => button
                                .setButtonText("Read-only preview")
                                .onClick(async () => {
                                    if (chosen !== this.siteUid || current !== this.sequence) return;
                                    const reqSeq = this.sequence;
                                    detailBox.empty();
                                    detailBox.createEl("p", {text:"Reading the private Draft..."});
                                    try {
                                        const detail = await this.loadDetail(chosen, row.uid);
                                        if (reqSeq !== this.sequence || chosen !== this.siteUid) return;
                                        detailBox.empty();
                                        detailBox.createEl("p", {text:"Server Draft · Revision "+detail.revision+" · NOT sent"});
                                        // Render as plain text only: Markdown can contain
                                        // untrusted HTML and private message content.
                                        detailBox.createEl("pre", {text:detail.body});
                                    } catch {
                                        if (reqSeq !== this.sequence) return;
                                        detailBox.empty();
                                        detailBox.createEl("p", {text:"Private Draft preview unavailable."});
                                    }
                                }));
                        }
                        results.createEl("p", {
                            text:"HakiSend returns at most 50 records and does not provide a cursor. This view may be incomplete."
                        });
                    } catch {
                        if (current !== this.sequence) return;
                        results.empty();
                        results.createEl("p", {
                            text:"Cannot read this Site's private drafts. Check connection, permissions, or network."
                        });
                    }
                }));
    }

    onClose(): void {
        this.sequence++;
        this.contentEl.empty();
    }
}


/** Manual Standalone Email Private Draft Save. Never sends, schedules or pulls notes. */
class HakiSendManualDraftSaveModal extends Modal {
    private selectedListUid = "";
    private busy = false;

    constructor(
        app: App,
        private readonly plan: StandalonePlan,
        private readonly authorizedAudiences: readonly Audience[],
        private readonly onSave: (listUid: string) => Promise<void>
    ) {
        super(app);
        this.selectedListUid = plan.listUid;
    }

    onOpen(): void {
        const c = this.contentEl;
        c.empty();
        c.createEl("h2", {text:"Save Standalone Email · Private Draft"});
        c.createEl("p", {
            text:"This is an explicit save to your own HakiSend Site. It will NOT send, schedule, publish or import any email."
        });
        c.createEl("p", {text:"Subject: "+this.plan.subject});
        c.createEl("p", {text:this.plan.draftUid
            ? "Existing Private Draft · expected revision "+this.plan.revision
            : "New Private Draft · request UID preserved for safe recovery"});
        new Setting(c)
            .setName("Authorized Email audience")
            .setDesc("Only a list enabled for this Site may be selected. A saved Draft's audience cannot change.")
            .addDropdown(dropdown => {
                dropdown.addOption("", "Choose an audience");
                for (const item of this.authorizedAudiences) {
                    dropdown.addOption(item.uid, item.name);
                }
                dropdown.setValue(this.authorizedAudiences.some(a => a.uid === this.selectedListUid)
                    ? this.selectedListUid : "");
                dropdown.onChange(value => {this.selectedListUid=value;});
            });
        new Setting(c)
            .addButton(button => button
                .setButtonText("Cancel")
                .onClick(() => this.close()))
            .addButton(button => button
                .setButtonText("Save Private Draft — NOT sent")
                .setCta()
                .onClick(async () => {
                    if (this.busy) return;
                    if (!this.authorizedAudiences.some(a => a.uid===this.selectedListUid)) {
                        new Notice("Choose an authorized audience.");
                        return;
                    }
                    this.busy=true;button.setDisabled(true);
                    try {
                        await this.onSave(this.selectedListUid);
                        this.close();
                        new Notice("Private Email Draft verified on HakiSend. NOT sent or scheduled.");
                    } catch {
                        new Notice("Private Draft save could not be verified. Inspect the server Draft before retrying. No automatic retry.");
                    } finally {
                        this.busy=false;button.setDisabled(false);
                    }
                }));
    }
    onClose():void {this.contentEl.empty();}
}

class HakiSendManualDraftConflictModal extends Modal {
    private acknowledged=false;
    private busy=false;
    constructor(
        app:App,
        private readonly plan:StandalonePlan,
        private readonly remote:PrivateDraftReadOnlyDetail,
        private readonly acceptRevision:()=>Promise<void>
    ){super(app);}
    onOpen():void {
        const c=this.contentEl;c.empty();
        c.createEl("h2",{text:"Private Draft conflict · read-only comparison"});
        c.createEl("p",{text:"Local base revision "+this.plan.revision+" differs from server revision "+this.remote.revision+". Nothing has been overwritten."});
        c.createEl("h3",{text:"Local Markdown (unchanged)"});
        c.createEl("pre",{text:this.plan.body});
        c.createEl("h3",{text:"HakiSend server Markdown (read-only)"});
        c.createEl("pre",{text:this.remote.body});
        c.createEl("p",{text:"Merge content manually in the local note. Accepting the revision only updates local revision metadata; it never saves to HakiSend."});
        new Setting(c)
            .setName("I compared both versions and handled all differences in my note")
            .addToggle(t=>t.setValue(false).onChange(v=>{this.acknowledged=v;}));
        new Setting(c)
            .addButton(b=>b.setButtonText("Close without changes").onClick(()=>this.close()))
            .addButton(b=>b.setButtonText("Accept revision for NEXT manual save").onClick(async()=>{
                if(!this.acknowledged||this.busy){new Notice("Review both versions and acknowledge first.");return;}
                this.busy=true;b.setDisabled(true);
                try{
                    await this.acceptRevision();
                    this.close();
                    new Notice("Only local revision metadata updated. No server write. Review the note before another manual Save.");
                }catch{
                    new Notice("Could not accept the remote revision; verify both versions again.");
                }finally{this.busy=false;b.setDisabled(false);}
            }));
    }
    onClose():void {this.contentEl.empty();}
}

export default class HakiSendPublisherPlugin
    extends Plugin
{
    settings: HakiSendPublisherSettings =
        DEFAULT_SETTINGS;

    private settingTab:
        HakiSendPublisherSettingTab | null = null;

    async onload(): Promise<void> {
        await this.loadSettings();

        this.registerObsidianProtocolHandler(
            CONNECT_CALLBACK_ACTION,
            async (params) => {
                await this.handleConnectCallback(
                    params
                );
            }
        );

        this.addCommand({
            id: "connect-hakisend",
            name: "HakiSend: Connect account",
            callback: async () => {
                await this.startBrowserConnect();
            },
        });

        this.addCommand({
            id: "new-post",
            name: "HakiSend: New Post",
            callback: async () => {
                await this.openNewPost();
            },
        });

        this.addCommand({
            id: "select-note-site",
            name: "HakiSend: Choose Site for this Note",
            callback: () => this.openSelectSiteForNote(),
        });

        this.addCommand({
            id: "edit-post-properties",
            name: "HakiSend: Edit Post Properties",
            callback: async () => {
                await this.openPostProperties();
            },
        });

        this.addCommand({
            id: "save-current-note",
            name: "HakiSend: Save Changes",
            callback: async () => {
                await this.saveCurrentNote();
            },
        });

        this.addCommand({
            id: "publish-current-note",
            name: "HakiSend: Publish Now",
            callback: async () => {
                await this.publishCurrentNote();
            },
        });

        this.addCommand({
            id: "schedule-current-note",
            name: "HakiSend: Schedule",
            callback: () => {
                this.openScheduleCurrentNote();
            },
        });

        this.addCommand({
            id: "save-standalone-email-private-draft",
            name: "HakiSend: Save Standalone Email as Private Draft (NOT sent)",
            callback: async () => {
                await this.openManualPrivateDraftSave();
            },
        });

        this.addCommand({
            id: "browse-private-email-drafts",
            name: "HakiSend: Browse Private Email Drafts (read-only)",
            callback: () => {
                new HakiSendPrivateEmailBrowserModal(
                    this.app,
                    this.settings.sites,
                    async siteUid => {
                        // The Site was explicitly selected; no background pull or write.
                        const token = await this.getAccessToken();
                        if (!token) throw Error("Connection required.");
                        const data = await requestPrivateDraft<unknown>(
                            request => requestUrl(request),
                            normalizeBaseUrl(this.settings.apiBaseUrl),
                            siteUid,
                            token,
                            "drafts",
                            "GET"
                        );
                        return parsePrivateDraftList(data);
                    },
                    async (siteUid, draftUid) => {
                        const token = await this.getAccessToken();
                        if (!token) throw Error("Connection required.");
                        const data = await requestPrivateDraft<unknown>(
                            request => requestUrl(request),
                            normalizeBaseUrl(this.settings.apiBaseUrl),
                            siteUid,
                            token,
                            "drafts/" + draftUid,
                            "GET"
                        );
                        return parsePrivateDraftDetail(data, draftUid);
                    }
                ).open();
            },
        });

        this.addCommand({
            id: "show-local-status",
            name: "HakiSend: Show Local Status",
            callback: async () => {
                await this.showCurrentPostStatus();
            },
        });

        this.settingTab =
            new HakiSendPublisherSettingTab(
                this.app,
                this
            );

        this.addSettingTab(this.settingTab);
    }


    private async openManualPrivateDraftSave():Promise<void> {
        try {
            const file=this.app.workspace.getActiveFile();
            if(!file || file.extension!=="md") throw Error("Open a Standalone Email Plan.");
            const fields={
                ...(this.app.metadataCache.getFileCache(file)?.frontmatter ?? {})
            } as Record<string,unknown>;
            const originalRaw=await this.app.vault.read(file);
            const plan=parseStandalonePlan(file,fields,originalRaw);
            if(!this.settings.sites.some(s=>s.uid===plan.siteUid)) {
                throw Error("Email Site is not in the connected account's Site list.");
            }
            const token=await this.getAccessToken();
            if(!token || !this.hasSecureConnection()) throw Error("Secure OAuth Email connection required.");
            const apiOrigin=normalizeBaseUrl(this.settings.apiBaseUrl);
            const requester=(suffix:string,method:"GET"|"POST"|"PUT"="GET",payload?:Record<string,unknown>)=>
                requestPrivateDraft<unknown>(
                    req=>requestUrl(req),apiOrigin,plan.siteUid,token,suffix,method,payload
                );
            const rawAudiences=await requester("audiences");
            if(!Array.isArray(rawAudiences) || rawAudiences.length>500
                || !rawAudiences.every(isAudience)) {
                throw Error("Cannot verify available Email audiences.");
            }
            const audiences:Audience[]=rawAudiences;
            new HakiSendManualDraftSaveModal(this.app,plan,audiences,async chosenListUid=>{
                // Explicit user selection, fresh current-note check immediately
                // before the first possible remote write.
                if(await this.app.vault.read(file)!==originalRaw) {
                    throw Error("Local note changed since the save confirmation opened.");
                }
                const newUid=plan.requestUid||uuidV4();
                try {
                    await explicitlySavePrivateDraft({
                        plan,authorizedAudiences:audiences,
                        selectedAudienceUid:chosenListUid,
                        newRequestUid:newUid,
                        io:{
                            persistCreateIdentity:async (requestUid,audienceUid)=>{
                                await this.app.fileManager.processFrontMatter(file,fm=>{
                                    if(fm.site_uid!==plan.siteUid ||
                                        fm.email_subject!==plan.subject ||
                                        (fm.email_preheader??"")!==plan.preheader ||
                                        !!fm.hakisend_remote_email_draft_uid ||
                                        (fm.hakisend_remote_email_request_uid &&
                                         fm.hakisend_remote_email_request_uid!==requestUid) ||
                                        (fm.email_list_uid && fm.email_list_uid!==audienceUid)) {
                                        throw Error("Local Email identity changed.");
                                    }
                                    fm.hakisend_remote_email_request_uid=requestUid;
                                    fm.email_list_uid=audienceUid;
                                });
                            },
                            getRemoteDraft:uid=>requester("drafts/"+uid),
                            mutateRemote:m=>requester(m.suffix,m.method,m.payload),
                            persistVerifiedReceipt:async verified=>{
                                const currentRaw=await this.app.vault.read(file);
                                const match=/^## Email body\\s*$/im.exec(currentRaw);
                                if(!match || currentRaw.slice(match.index+match[0].length).trim()!==plan.body) {
                                    throw Error("Local note body changed; server must be reviewed manually.");
                                }
                                await this.app.fileManager.processFrontMatter(file,fm=>{
                                    if(fm.site_uid!==plan.siteUid ||
                                        fm.email_subject!==plan.subject ||
                                        (fm.email_preheader??"")!==plan.preheader ||
                                        fm.email_list_uid!==chosenListUid ||
                                        (plan.draftUid
                                            ? fm.hakisend_remote_email_draft_uid!==plan.draftUid ||
                                              fm.hakisend_remote_email_revision!==plan.revision
                                            : fm.hakisend_remote_email_request_uid!==newUid ||
                                              !!fm.hakisend_remote_email_draft_uid)) {
                                        throw Error("Local Email metadata changed during HTTP save.");
                                    }
                                    fm.hakisend_remote_email_draft_uid=verified.uid;
                                    fm.hakisend_remote_email_revision=verified.revision;
                                    fm.hakisend_remote_email_status="private_draft";
                                });
                                await this.app.vault.process(file,raw=>{
                                    const heading=/^## Email body\\s*$/im.exec(raw);
                                    if(!heading || raw.slice(heading.index+heading[0].length).trim()!==plan.body) {
                                        throw Error("Local Markdown changed while updating verified callout.");
                                    }
                                    return decorateLocalPlan(raw,verified.revision);
                                });
                            }
                        }
                    });
                }catch(error){
                    if(isRevisionConflict(error) && !!plan.draftUid) {
                        let remote:PrivateDraftReadOnlyDetail;
                        try {
                            remote=parsePrivateDraftDetail(
                                await requester("drafts/"+plan.draftUid),plan.draftUid
                            );
                        }catch{throw error;}
                        new HakiSendManualDraftConflictModal(this.app,plan,remote,async()=>{
                            const fresh=parsePrivateDraftDetail(
                                await requester("drafts/"+plan.draftUid),plan.draftUid
                            );
                            if(!canAdoptRevision(plan.draftUid,plan.revision,{
                                uid:fresh.uid,revision:fresh.revision,status:"private_draft",
                                send_enabled:false,subject:fresh.subject
                            },remote.revision)){
                                throw Error("Remote revision changed again.");
                            }
                            const currentRaw=await this.app.vault.read(file);
                            const heading=/^## Email body\\s*$/im.exec(currentRaw);
                            if(!heading || currentRaw.slice(heading.index+heading[0].length).trim()!==plan.body) {
                                throw Error("Local content changed during conflict review.");
                            }
                            await this.app.fileManager.processFrontMatter(file,fm=>{
                                if(fm.site_uid!==plan.siteUid ||
                                    fm.hakisend_remote_email_draft_uid!==plan.draftUid ||
                                    fm.hakisend_remote_email_revision!==plan.revision) {
                                    throw Error("Local Draft identity changed.");
                                }
                                fm.hakisend_remote_email_revision=fresh.revision;
                                // Do not mark it saved; the user must manually merge
                                // and initiate another explicit Save.
                            });
                        }).open();
                    }
                    throw error;
                }
            }).open();
        }catch{
            new Notice("Standalone Private Draft unavailable. Open a valid Email Plan and verify your secure connection and Site permissions.");
        }
    }

    private async loadSettings(): Promise<void> {
        const stored =
            (await this.loadData()) ?? {};

        this.settings = {
            ...DEFAULT_SETTINGS,
            ...stored,
            apiBaseUrl: normalizeBaseUrl(
                stored.apiBaseUrl
                    ?? DEFAULT_SETTINGS.apiBaseUrl
            ),
            sites: Array.isArray(stored.sites)
                ? stored.sites
                : [],
            folderSiteMappings: Array.isArray(stored.folderSiteMappings)
                ? stored.folderSiteMappings.filter((mapping: unknown): mapping is FolderSiteMapping => {
                    if (!mapping || typeof mapping !== "object") return false;
                    const candidate = mapping as Partial<FolderSiteMapping>;
                    return typeof candidate.folderPath === "string"
                        && !!normalizeFolderPath(candidate.folderPath)
                        && typeof candidate.siteUid === "string"
                        && !!candidate.siteUid.trim();
                }).map((mapping: FolderSiteMapping) => ({
                    folderPath: normalizeFolderPath(mapping.folderPath),
                    siteUid: mapping.siteUid.trim(),
                }))
                : [],
            folderCategoryMappings: Array.isArray(stored.folderCategoryMappings)
                ? stored.folderCategoryMappings.filter((mapping: unknown): mapping is FolderCategoryMapping => {
                    if (!mapping || typeof mapping !== "object") return false;
                    const candidate = mapping as Partial<FolderCategoryMapping>;
                    return typeof candidate.folderPath === "string"
                        && !!normalizeFolderPath(candidate.folderPath)
                        && typeof candidate.siteUid === "string" && !!candidate.siteUid.trim()
                        && typeof candidate.categoryUid === "string" && !!candidate.categoryUid.trim();
                }).map((mapping: FolderCategoryMapping) => ({
                    folderPath: normalizeFolderPath(mapping.folderPath),
                    siteUid: mapping.siteUid.trim(),
                    categoryUid: mapping.categoryUid.trim(),
                    categoryTitle: typeof mapping.categoryTitle === "string" ? mapping.categoryTitle : undefined,
                }))
                : [],
        };
    }

    async saveSettings(): Promise<void> {
        await this.saveData(
            this.settings
        );
    }

    async getAccessToken(): Promise<string> {
        const secure =
            this.app.secretStorage.getSecret(
                ACCESS_TOKEN_SECRET
            );

        if (
            typeof secure === "string"
            && secure.trim() !== ""
        ) {
            return secure.trim();
        }

        const legacy =
            this.settings.bearerToken?.trim()
            ?? "";

        return legacy;
    }

    hasSecureConnection(): boolean {
        const token =
            this.app.secretStorage.getSecret(
                ACCESS_TOKEN_SECRET
            );

        return !!token?.trim();
    }

    hasLegacyToken(): boolean {
        return !!this.settings
            .bearerToken
            ?.trim();
    }

    async startBrowserConnect(): Promise<void> {
        try {
            const apiBaseUrl =
                normalizeBaseUrl(
                    this.settings.apiBaseUrl
                );

            this.settings.apiBaseUrl =
                apiBaseUrl;

            await this.saveSettings();

            const state =
                randomBase64Url(32);

            const verifier =
                randomBase64Url(64);

            const challenge =
                await sha256Base64Url(
                    verifier
                );

            const pending:
                PendingConnection = {
                    state,
                    verifier,
                    apiBaseUrl,
                    createdAt: Date.now(),
                };

            this.app.secretStorage.setSecret(
                PENDING_CONNECTION_SECRET,
                JSON.stringify(pending)
            );

            const url = new URL(
                apiBaseUrl
                + "/rui/sites/integrations/obsidian/connect"
            );

            url.searchParams.set(
                "state",
                state
            );

            url.searchParams.set(
                "code_challenge",
                challenge
            );

            url.searchParams.set(
                "code_challenge_method",
                "S256"
            );

            const opened = window.open(
                url.toString(),
                "_blank"
            );

            if (!opened) {
                new Notice(
                    "Could not open the browser. Check popup/external-link permissions."
                );
                return;
            }

            new Notice(
                "Continue authorization in your browser."
            );
        } catch (error) {
            this.clearPendingConnection();

            new Notice(
                "Could not start HakiSend connection: "
                + this.safeErrorMessage(error)
            );
        }
    }

    private async handleConnectCallback(
        params: Record<string, string>
    ): Promise<void> {
        const rawPending =
            this.app.secretStorage.getSecret(
                PENDING_CONNECTION_SECRET
            );

        if (!rawPending) {
            new Notice(
                "No pending HakiSend connection was found."
            );
            return;
        }

        let pending: PendingConnection;

        try {
            pending = JSON.parse(rawPending) as PendingConnection;
        } catch {
            this.clearPendingConnection();

            new Notice(
                "The pending HakiSend connection is invalid."
            );
            return;
        }

        if (
            !pending.state
            || !pending.verifier
            || !pending.apiBaseUrl
            || !pending.createdAt
        ) {
            this.clearPendingConnection();

            new Notice(
                "The pending HakiSend connection is incomplete."
            );
            return;
        }

        if (
            Date.now()
            - pending.createdAt
            > PENDING_MAX_AGE_MS
        ) {
            this.clearPendingConnection();

            new Notice(
                "The HakiSend connection request expired. Please connect again."
            );
            return;
        }

        const returnedState =
            params.state ?? "";

        if (
            !returnedState
            || returnedState
                !== pending.state
        ) {
            new Notice(
                "HakiSend connection state did not match. No credential was accepted."
            );
            return;
        }

        if (params.error) {
            this.clearPendingConnection();

            new Notice(
                params.error ===
                    "access_denied"
                    ? "HakiSend connection was cancelled."
                    : "HakiSend connection failed."
            );

            return;
        }

        const code =
            params.code ?? "";

        if (!code) {
            this.clearPendingConnection();

            new Notice(
                "HakiSend did not return an authorization code."
            );
            return;
        }

        try {
            const response =
                await requestUrl({
                    url:
                        pending.apiBaseUrl
                        + "/api/v1/hakisend/connect/exchange",
                    method: "POST",
                    headers: {
                        "Accept":
                            "application/json",
                        "Content-Type":
                            "application/json",
                    },
                    body: JSON.stringify({
                        code,
                        state:
                            pending.state,
                        code_verifier:
                            pending.verifier,
                    }),
                    throw: false,
                });

            const payload = response.json as ExchangeResponse;

            if (
                response.status < 200
                || response.status >= 300
                || !payload?.success
            ) {
                throw new Error(
                    this.apiErrorMessage(
                        response.status,
                        response.headers,
                        payload?.error
                    )
                );
            }

            const token =
                payload.data
                    ?.access_token
                    ?.trim()
                ?? "";

            if (!token) {
                throw new Error(
                    "HakiSend exchange response did not include an access token."
                );
            }

            this.app.secretStorage.setSecret(
                ACCESS_TOKEN_SECRET,
                token
            );

            /**
             * Browser-connect is now authoritative.
             * Remove the old plain bearer from data.json.
             */
            this.settings.bearerToken =
                "";

            this.settings.apiBaseUrl =
                pending.apiBaseUrl;

            await this.saveSettings();

            this.clearPendingConnection();

            await this.discoverSites();

            new Notice(
                "HakiSend connected successfully."
            );

            this.settingTab?.display();
        } catch (error) {
            /**
             * Do not clear pending state on network /
             * transient exchange failure.
             *
             * The server authorization code may
             * still be usable until its 2-minute TTL.
             */
            new Notice(
                "HakiSend connection failed: "
                + this.safeErrorMessage(error)
            );
        }
    }

    private clearPendingConnection(): void {
        this.app.secretStorage.setSecret(
            PENDING_CONNECTION_SECRET,
            ""
        );
    }

    private async clearLocalConnectionState():
        Promise<void> {
        this.app.secretStorage.setSecret(
            ACCESS_TOKEN_SECRET,
            ""
        );

        this.clearPendingConnection();

        this.settings.bearerToken = "";
        this.settings.sites = [];
        this.settings.defaultSiteUid = "";

        await this.saveSettings();

        this.settingTab?.display();
    }

    async disconnect(): Promise<void> {
        const token =
            await this.getAccessToken();

        /*
         * Nothing is stored locally anymore.
         * Normalize settings without making a network request.
         */
        if (!token) {
            await this
                .clearLocalConnectionState();

            new Notice(
                "HakiSend disconnected from Obsidian."
            );

            return;
        }

        try {
            const response =
                await requestUrl({
                    url:
                        normalizeBaseUrl(
                            this.settings
                                .apiBaseUrl
                        )
                        + "/api/v1/hakisend/connect/revoke",
                    method: "POST",
                    headers: {
                        "Accept":
                            "application/json",
                        "Authorization":
                            `Bearer ${token}`,
                    },
                    throw: false,
                });

            const payload =
                response.json as {
                    success?: boolean;
                    data?: {
                        token_uid?: string;
                        revoked?: boolean;
                    };
                    error?: {
                        code?: string;
                        message?: string;
                    };
                    message?: string;
                };

            /*
             * 401 means the credential is already unusable:
             * revoked, expired, malformed, or otherwise invalid.
             * Keeping that dead credential locally provides no
             * security or recovery benefit, so clear it.
             */
            const alreadyInvalid =
                response.status === 401;

            if (
                !alreadyInvalid
                && (
                    response.status < 200
                    || response.status >= 300
                    || !payload?.success
                )
            ) {
                throw new Error(
                    this.apiErrorMessage(
                        response.status,
                        response.headers,
                        payload?.error
                            ?? {
                                message:
                                    payload?.message,
                            }
                    )
                );
            }

            await this
                .clearLocalConnectionState();

            new Notice(
                alreadyInvalid
                    ? "HakiSend disconnected. The saved credential was already invalid or revoked."
                    : "HakiSend disconnected and server credential revoked."
            );
        } catch (error) {
            /*
             * Network / rate-limit / server failures must not
             * silently discard the only local credential before
             * server revocation is confirmed.
             */
            new Notice(
                "HakiSend Disconnect failed; local credential was kept so you can retry: "
                + this.safeErrorMessage(
                    error
                )
            );
        }
    }

    async discoverSites(): Promise<HakiSendSite[]> {
        const token =
            await this.getAccessToken();

        if (!token) {
            throw new Error(
                "HakiSend is not connected."
            );
        }

        const response =
            await requestUrl({
                url:
                    normalizeBaseUrl(
                        this.settings.apiBaseUrl
                    )
                    + "/api/v1/hakisend/sites",
                method: "GET",
                headers: {
                    "Accept":
                        "application/json",
                    "Authorization":
                        `Bearer ${token}`,
                },
                throw: false,
            });

        const payload = response.json as SitesResponse;

        if (
            response.status < 200
            || response.status >= 300
            || !payload?.success
        ) {
            throw new Error(
                this.apiErrorMessage(
                    response.status,
                    response.headers,
                    payload?.error
                )
            );
        }

        let sites: HakiSendSite[] = [];

        if (
            Array.isArray(
                payload.data
            )
        ) {
            sites =
                payload.data;
        } else if (
            payload.data
            && Array.isArray(
                payload.data.sites
            )
        ) {
            sites =
                payload.data.sites;
        }

        this.settings.sites =
            sites.filter(
                (
                    site
                ): site is HakiSendSite =>
                    !!site
                    && typeof site.uid
                        === "string"
                    && typeof site.name
                        === "string"
            );

        const currentStillExists =
            this.settings.sites.some(
                (site) =>
                    site.uid
                    === this.settings
                        .defaultSiteUid
            );

        if (!currentStillExists) {
            this.settings.defaultSiteUid =
                this.settings.sites.length
                    === 1
                    ? this.settings
                        .sites[0].uid
                    : "";
        }

        await this.saveSettings();

        this.settingTab?.display();

        return this.settings.sites;
    }


    resolveSiteForFile(file: TFile, frontmatter: Record<string, unknown> = {}): string {
        const explicit = [frontmatter.site_uid, frontmatter.site]
            .find((value) => typeof value === "string" && !!value.trim());
        if (typeof explicit === "string") {
            const key = explicit.trim().toLowerCase();
            const site = this.settings.sites.find((candidate) =>
                candidate.uid.toLowerCase() === key
                || (candidate.slug || "").toLowerCase() === key
                || candidate.name.toLowerCase() === key
            );
            if (!site) throw new Error(`Site "${explicit}" in Properties is not accessible. Refresh HakiSend Sites.`);
            return site.uid;
        }
        const routes = [...this.settings.folderSiteMappings]
            .filter((route) => pathIsWithinFolder(file.path, route.folderPath))
            .sort((a, b) => b.folderPath.length - a.folderPath.length);
        if (routes.length) {
            const uid = routes[0].siteUid;
            if (!this.settings.sites.some((site) => site.uid === uid))
                throw new Error(`Folder route "${routes[0].folderPath}" refers to an unavailable HakiSend Site.`);
            return uid;
        }
        const fallback = this.settings.defaultSiteUid.trim();
        if (!fallback) throw new Error("Choose a Default Site or configure Folder → Site routes.");
        if (this.settings.sites.length && !this.settings.sites.some((site) => site.uid === fallback))
            throw new Error("Default Site unavailable. Refresh HakiSend Sites.");
        return fallback;
    }

    resolveSiteForFolder(folder: string): string {
        return this.resolveSiteForFile({ path: normalizeFolderPath(folder) + "/_new.md" } as TFile);
    }

    private findCategoryRoute(filePath: string, siteUid: string): FolderCategoryMapping | null {
        const routes = [...this.settings.folderCategoryMappings]
            .filter((route) => pathIsWithinFolder(filePath, route.folderPath))
            .sort((a, b) => b.folderPath.length - a.folderPath.length);
        if (!routes.length) return null;
        if (routes[0].siteUid !== siteUid) {
            throw new Error(`Category folder "${routes[0].folderPath}" belongs to a different HakiSend Site. Review site_uid or the folder route.`);
        }
        return routes[0];
    }

    openAddCategoryRouteModal(): void {
        const sites = this.settings.sites;
        if (!sites.length) {
            new Notice("Connect HakiSend and refresh Sites before mapping Categories.");
            return;
        }
        const modal = new Modal(this.app);
        modal.titleEl.setText("Map Obsidian folder to HakiSend Category");
        modal.contentEl.createEl("p", {
            text: "Each Site has its own Categories. Child folders inherit the closest Category route.",
        });
        let folderPath = "";
        let siteUid = sites[0].uid;
        let categoryUid = "";
        let loadedCategories: HakiSendCategory[] = [];
        let loadSequence = 0;
        let siteDropdown: DropdownComponent | null = null;

        const folderSetting = new Setting(modal.contentEl)
            .setName("Obsidian folder")
            .setDesc("No folder selected. Search the folders in this vault.");
        folderSetting.addButton((button) => button
            .setButtonText("Choose folder…")
            .onClick(() => {
                new HakiSendFolderPicker(this.app, (folder) => {
                    folderPath = folder.path;
                    folderSetting.setDesc(folderPath);
                    try {
                        const routedSite = this.resolveSiteForFolder(folder.path);
                        if (routedSite !== siteUid) {
                            siteUid = routedSite;
                            siteDropdown?.setValue(siteUid);
                            void reloadCategories();
                        }
                    } catch (error) {
                        folderSetting.setDesc(folderPath + " · " + this.safeErrorMessage(error));
                    }
                }).open();
            }));

        const categorySetting = new Setting(modal.contentEl)
            .setName("Category")
            .setDesc("Loading Categories from selected HakiSend Site...");
        const reloadCategories = async (): Promise<void> => {
            const request = ++loadSequence;
            loadedCategories = [];
            categoryUid = "";
            categorySetting.controlEl.empty();
            categorySetting.setDesc("Loading authorized Categories...");
            try {
                const token = await this.getAccessToken();
                if (!token) throw new Error("HakiSend is not connected.");
                const loaded = await this.categoriesForSite(siteUid, token);
                if (request !== loadSequence) return;
                loadedCategories = loaded;
                categorySetting.setDesc(loaded.length
                    ? "Select one Category from this Site."
                    : "No Categories exist on this Site.");
                categorySetting.addDropdown((dropdown) => {
                    dropdown.addOption("", "Choose a Category");
                    for (const category of loaded) {
                        dropdown.addOption(category.uid, category.title + " (" + category.slug + ")");
                    }
                    dropdown.setValue("");
                    dropdown.onChange((value) => { categoryUid = value; });
                });
            } catch (error) {
                if (request !== loadSequence) return;
                categorySetting.setDesc("Cannot load Categories: " + this.safeErrorMessage(error));
            }
        };

        new Setting(modal.contentEl)
            .setName("Site")
            .setDesc("Selected automatically from the folder's Site route.")
            .addDropdown((dropdown) => {
                siteDropdown = dropdown;
                for (const site of sites) dropdown.addOption(site.uid, site.name);
                dropdown.setValue(siteUid);
                dropdown.onChange((value) => {
                    siteUid = value;
                    void reloadCategories();
                });
            });

        // Load the selected Site's live Categories after setting up the modal.
        void reloadCategories();

        new Setting(modal.contentEl)
            .addButton((button) => button.setButtonText("Cancel")
                .onClick(() => modal.close()))
            .addButton((button) => button.setButtonText("Save mapping").setCta()
                .onClick(async () => {
                    const folder = normalizeFolderPath(folderPath);
                    const selected = loadedCategories.find((item) => item.uid === categoryUid);
                    if (!folder || !selected) {
                        new Notice("Choose an existing folder and a HakiSend Category.");
                        return;
                    }
                    const target = this.app.vault.getAbstractFileByPath(folder);
                    if (!target || !(target instanceof TFolder)) {
                        new Notice("Create this folder in Obsidian before mapping it.");
                        return;
                    }
                    try {
                        const resolvedSite = this.resolveSiteForFolder(folder);
                        if (resolvedSite !== siteUid) {
                            throw new Error("This folder routes to a different Site. Set its parent Site route first.");
                        }
                        this.settings.folderCategoryMappings = this.settings.folderCategoryMappings
                            .filter((item) => item.folderPath !== folder);
                        this.settings.folderCategoryMappings.push({
                            folderPath: folder,
                            siteUid,
                            categoryUid: selected.uid,
                            categoryTitle: selected.title,
                        });
                        await this.saveSettings();
                        modal.close();
                        this.settingTab?.display();
                        new Notice("Category folder mapping saved.");
                    } catch (error) {
                        new Notice("Category mapping failed: " + this.safeErrorMessage(error));
                    }
                }));
        modal.open();
    }

    private openSelectSiteForNote(): void {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension.toLowerCase() !== "md") {
            new Notice("Open a Markdown note first.");
            return;
        }
        const sites = this.settings.sites;
        if (!sites.length) {
            new Notice("Connect HakiSend and load available Sites first.");
            return;
        }
        const initial = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
        const pinned = typeof initial.site_uid === "string" ? initial.site_uid : "";
        const modal = new Modal(this.app);
        modal.titleEl.setText("Choose HakiSend Site");
        modal.contentEl.createEl("p", {
            text: "Pin this note to one Site, or use its folder route. Changing Site after publishing may create a Post on the new Site.",
        });
        let chosen = pinned;
        new Setting(modal.contentEl)
            .setName("Publishing Site")
            .addDropdown((dropdown) => {
                dropdown.addOption("", "Use folder mapping / Default Site");
                for (const site of sites) dropdown.addOption(site.uid, site.name);
                dropdown.setValue(chosen);
                dropdown.onChange((value) => { chosen = value; });
            });
        new Setting(modal.contentEl).addButton((button) => button
            .setButtonText("Apply to Properties").setCta().onClick(async () => {
                try {
                    await this.app.fileManager.processFrontMatter(file, (data) => {
                        delete data.site;
                        if (chosen) data.site_uid = chosen;
                        else delete data.site_uid;
                    });
                    modal.close();
                    new Notice("Site saved locally. Review Category before publishing.");
                } catch (error) {
                    new Notice("Cannot set Site: " + this.safeErrorMessage(error));
                }
            }));
        modal.open();
    }

    private async openPostProperties():
        Promise<void> {

        try {
            const file =
                this.app.workspace
                    .getActiveFile();

            if (
                !file
                || file.extension
                    .toLowerCase()
                    !== "md"
            ) {
                throw new Error(
                    "Open a Markdown note before editing HakiSend Properties."
                );
            }

            const token =
                await this
                    .getAccessToken();

            if (!token) {
                throw new Error(
                    "HakiSend is not connected."
                );
            }

            const siteUid = this.resolveSiteForFile(file,
                this.app.metadataCache.getFileCache(file)?.frontmatter ?? {});

            const categories =
                await this
                    .categoriesForSite(
                        siteUid,
                        token
                    );

            if (!categories.length) {
                throw new Error(
                    "This Site has no Categories."
                );
            }

            const cached =
                this.app.metadataCache
                    .getFileCache(
                        file
                    );

            const frontmatter:
                Record<string, unknown> =
                cached?.frontmatter
                    ? {
                        ...cached
                            .frontmatter,
                    }
                    : {};

            const title =
                typeof frontmatter.title
                    === "string"
                    && frontmatter
                        .title
                        .trim()
                    ? frontmatter
                        .title
                        .trim()
                    : file.basename;

            const slug =
                typeof frontmatter.slug
                    === "string"
                    ? frontmatter
                        .slug
                        .trim()
                    : "";

            const excerpt =
                typeof frontmatter.excerpt
                    === "string"
                    ? frontmatter
                        .excerpt
                        .trim()
                    : "";

            const externalId =
                typeof frontmatter
                    .external_id
                    === "string"
                    ? frontmatter
                        .external_id
                        .trim()
                    : "";

            const status =
                typeof frontmatter.status
                    === "string"
                    ? frontmatter
                        .status
                        .trim()
                    : "";

            const tags =
                normalizeTagValues(
                    frontmatter.tags
                );

            const configuredCategory =
                typeof frontmatter.category
                    === "string"
                    ? frontmatter
                        .category
                        .trim()
                    : "";

            const fallbackCategory =
                file.parent
                    ?.name
                    ?.trim()
                ?? "";

            const requestedCategory =
                configuredCategory
                || fallbackCategory;

            const lowered =
                requestedCategory
                    .toLowerCase();

            const slugged =
                simpleSlug(
                    requestedCategory
                );

            const categoryRoute = this.findCategoryRoute(file.path, siteUid);
            const pinnedCategoryUid = typeof frontmatter.category_uid === "string"
                ? frontmatter.category_uid.trim() : "";
            const pinnedCategory = pinnedCategoryUid
                ? categories.find((item) => item.uid === pinnedCategoryUid)
                : null;
            if (pinnedCategoryUid && !pinnedCategory)
                throw new Error("This note's category_uid does not belong to its current Site. Choose a new Category for the Site.");

            const manualCategory = categories.find((category) =>
                category.uid === requestedCategory
                || category.slug.toLowerCase() === lowered
                || category.title.toLowerCase() === lowered
                || category.slug.toLowerCase() === slugged
            );
            if (configuredCategory && !manualCategory && !pinnedCategory)
                throw new Error("This note's Category does not belong to its current Site. Update its category in Properties.");
            const mappedCategory = categoryRoute
                ? categories.find((item) => item.uid === categoryRoute.categoryUid)
                : null;
            if (categoryRoute && !mappedCategory)
                throw new Error("Mapped Category no longer exists on this Site. Update the Category folder mapping.");

            const selectedCategory = pinnedCategory ?? manualCategory
                ?? mappedCategory ?? categories[0];

            new HakiSendPostPropertiesModal(
                this.app,
                categories,
                {
                    title,
                    slug,
                    categoryUid:
                        selectedCategory.uid,
                    tags,
                    excerpt,
                    externalId,
                    status,
                },
                async (
                    values
                ) => {
                    await this
                        .updatePostProperties(
                            file,
                            values
                        );
                }
            ).open();
        } catch (error) {
            new Notice(
                "HakiSend Properties failed: "
                + this.safeErrorMessage(
                    error
                )
            );
        }
    }

    private async updatePostProperties(
        file: TFile,
        values:
            HakiSendPostPropertiesValues
    ): Promise<void> {

        await this.app.fileManager
            .processFrontMatter(
                file,
                (
                    data
                ) => {
                    data.title =
                        values.title;

                    data.category =
                        values
                            .category
                            .slug;
                    data.category_uid = values.category.uid;

                    if (
                        values.slug
                    ) {
                        data.slug =
                            values.slug;
                    } else {
                        delete data.slug;
                    }

                    if (
                        values.tags
                            .length
                    ) {
                        data.tags =
                            values.tags;
                    } else {
                        delete data.tags;
                    }

                    if (
                        values.excerpt
                    ) {
                        data.excerpt =
                            values.excerpt;
                    } else {
                        delete data.excerpt;
                    }

                    /*
                     * Intentionally untouched:
                     *
                     * status
                     * external_id
                     * publish_at
                     * unpublish_at
                     * featured_image
                     *
                     * Publishing state, identity and Media have
                     * their own workflows.
                     */
                }
            );

        new Notice(
            "HakiSend Properties updated locally. Save, Schedule, or Publish when ready."
        );
    }


    /**
     * This folder's resolved Site and mapped Category control all default
     * values. A nested folder inherits the closest Category route; a folder
     * with no matching mapping requires an explicit Category selection.
     */
    private async resolveNewPostDestination(
        folderPath: string
    ): Promise<HakiSendNewPostDestination> {
        const folder = normalizeFolderPath(folderPath);
        const target = this.app.vault.getAbstractFileByPath(folder);
        if (!folder || !(target instanceof TFolder)) {
            throw new Error("Choose an existing Obsidian folder.");
        }

        const token = await this.getAccessToken();
        if (!token) {
            throw new Error("HakiSend is not connected.");
        }

        const siteUid = this.resolveSiteForFolder(folder);
        const site = this.settings.sites.find((item) => item.uid === siteUid);
        if (!site) {
            throw new Error("The folder is not linked to an accessible HakiSend Site.");
        }
        const categories = await this.categoriesForSite(siteUid, token);
        if (!categories.length) {
            throw new Error("This Site has no Categories. Create a Category in HakiSend first.");
        }

        const route = this.findCategoryRoute(folder + "/_new.md", siteUid);
        const mapped = route
            ? categories.find((item) => item.uid === route.categoryUid)
            : undefined;
        if (route && !mapped) {
            throw new Error(
                "The mapped Category no longer exists on this Site. Update its Category folder mapping."
            );
        }

        const folderName = target.name.trim();
        const normalizedName = folderName.toLowerCase();
        const folderSlug = simpleSlug(folderName);
        const matchedByName = categories.find((item) =>
            item.title.toLowerCase() === normalizedName
            || item.slug.toLowerCase() === normalizedName
            || item.slug.toLowerCase() === folderSlug
        );

        return {
            folderPath: folder,
            siteUid,
            siteName: site.name,
            categories,
            preferredCategoryUid: (mapped ?? matchedByName)?.uid ?? "",
        };
    }

    private async openNewPost(): Promise<void> {
        try {
            const token = await this.getAccessToken();
            if (!token) {
                throw new Error("HakiSend is not connected.");
            }

            const active = this.app.workspace.getActiveFile();
            const initialFolder = active?.parent?.path ?? "";

            new HakiSendNewPostModal(
                this.app,
                initialFolder,
                async (folder) => this.resolveNewPostDestination(folder),
                async (values) => this.createNewPost(values)
            ).open();
        } catch (error) {
            new Notice("HakiSend New Post failed: " + this.safeErrorMessage(error));
        }
    }

    private uniqueNewPostPath(
        folderPath: string,
        title: string
    ): string {
        const folder =
            folderPath
                .replace(
                    /^\/+|\/+$/g,
                    ""
                );

        const prefix =
            folder
                ? folder + "/"
                : "";

        const basename =
            safeMarkdownBasename(
                title
            );

        let candidate =
            prefix
            + basename
            + ".md";

        let suffix = 2;

        while (
            this.app.vault
                .getAbstractFileByPath(
                    candidate
                )
        ) {
            candidate =
                prefix
                + basename
                + " "
                + suffix
                + ".md";

            suffix++;
        }

        return candidate;
    }

    private async createNewPost(values: HakiSendNewPostValues): Promise<void> {
        // Recheck on submit: folder routing may have changed while modal was open.
        const resolved = await this.resolveNewPostDestination(values.folderPath);
        if (resolved.siteUid !== values.siteUid) {
            throw new Error("Folder Site mapping changed. Reopen New Post and choose the destination again.");
        }
        const category = resolved.categories.find((item) => item.uid === values.category.uid);
        if (!category) {
            throw new Error("The selected Category is no longer available on this Site. Choose it again.");
        }

        const path = this.uniqueNewPostPath(resolved.folderPath, values.title);
        const externalId = uuidV4();
        const content = [
            "---",
            "site_uid: " + yamlQuotedScalar(resolved.siteUid),
            "title: " + yamlQuotedScalar(values.title),
            "status: draft",
            "category: " + yamlQuotedScalar(category.slug),
            "category_uid: " + yamlQuotedScalar(category.uid),
            "external_id: " + externalId,
            "---",
            "",
            "",
        ].join("\n");

        const file = await this.app.vault.create(path, content);
        await this.app.workspace.getLeaf(false).openFile(file);
        new Notice("HakiSend draft created: " + file.path);
    }


    private async ensureExternalId(
        file: TFile,
        frontmatter: Record<string, unknown>
    ): Promise<string> {
        const current =
            typeof frontmatter.external_id
                === "string"
                ? frontmatter
                    .external_id
                    .trim()
                : "";

        if (current) {
            if (current.length > 255) {
                throw new Error(
                    "external_id is longer than 255 characters."
                );
            }

            return current;
        }

        const generated =
            uuidV4();

        await this.app.fileManager
            .processFrontMatter(
                file,
                (data) => {
                    const existing =
                        typeof data.external_id
                            === "string"
                            ? data
                                .external_id
                                .trim()
                            : "";

                    if (
                        existing
                        && existing
                            !== generated
                    ) {
                        throw new Error(
                            "external_id changed while saving. Save aborted."
                        );
                    }

                    data.external_id =
                        generated;
                }
            );

        frontmatter.external_id =
            generated;

        return generated;
    }


    private normalizeLocalMediaTarget(
        raw: string
    ): string {
        let value =
            raw.trim();

        if (
            value.startsWith("<")
            && value.endsWith(">")
        ) {
            value =
                value.slice(1, -1);
        }

        try {
            value =
                decodeURIComponent(
                    value
                );
        } catch {
            // Preserve literal path when it is
            // not URL-encoded correctly.
        }

        value =
            value
                .replace(
                    /[#?].*$/,
                    ""
                )
                .trim();

        if (
            value.startsWith("/")
        ) {
            value =
                value.slice(1);
        }

        return value;
    }

    private resolveLocalMediaFile(
        target: string,
        sourceFile: TFile
    ): TFile {
        const normalized =
            this.normalizeLocalMediaTarget(
                target
            );

        if (!normalized) {
            throw new Error(
                `Empty local image reference in ${sourceFile.path}.`
            );
        }

        const resolved =
            this.app.metadataCache
                .getFirstLinkpathDest(
                    normalized,
                    sourceFile.path
                );

        if (
            !resolved
            || !(resolved instanceof TFile)
        ) {
            throw new Error(
                `Local image not found: ${target}`
            );
        }

        mediaMimeType(resolved);

        return resolved;
    }

    private validateMediaAsset(
        value: unknown
    ): HakiSendMediaAsset {
        if (
            !value
            || typeof value
                !== "object"
        ) {
            throw new Error(
                "HakiSend Media returned an invalid asset."
            );
        }

        const asset =
            value as HakiSendMediaAsset;

        if (
            typeof asset.uid
                !== "string"
            || !/^[0-9a-fA-F-]{36}$/
                .test(asset.uid)
        ) {
            throw new Error(
                "HakiSend Media returned an invalid asset UID."
            );
        }

        if (
            typeof asset.url
                !== "string"
            || !/^https?:\/\//i
                .test(asset.url)
        ) {
            throw new Error(
                "HakiSend Media returned an invalid asset URL."
            );
        }

        if (
            asset.status
            && asset.status
                !== "ready"
        ) {
            throw new Error(
                `HakiSend Media asset is not ready: ${asset.status}`
            );
        }

        return asset;
    }

    private async resolveMediaByHash(
        sourceSha256: string,
        token: string
    ): Promise<HakiSendMediaAsset | null> {
        const response =
            await requestUrl({
                url:
                    normalizeBaseUrl(
                        this.settings
                            .apiBaseUrl
                    )
                    + "/api/v1/hakisend/media/assets/resolve",
                method: "POST",
                headers: {
                    "Accept":
                        "application/json",
                    "Content-Type":
                        "application/json",
                    "Authorization":
                        `Bearer ${token}`,
                },
                body:
                    JSON.stringify({
                        source_sha256:
                            sourceSha256,
                    }),
                throw: false,
            });

        const payload =
            response.json as {
                success?: boolean;
                data?: {
                    found?: boolean;
                    asset?: unknown;
                };
                error?: {
                    code?: string;
                    message?: string;
                };
            };

        if (
            response.status < 200
            || response.status >= 300
            || !payload?.success
        ) {
            throw new Error(
                this.apiErrorMessage(
                    response.status,
                    response.headers,
                    payload?.error
                )
            );
        }

        if (!payload.data?.found) {
            return null;
        }

        return this.validateMediaAsset(
            payload.data.asset
        );
    }

    private buildMultipartBody(
        file: TFile,
        bytes: ArrayBuffer,
        sourceSha256: string
    ): {
        body: ArrayBuffer;
        contentType: string;
    } {
        const boundary =
            "----HakiSendPublisher"
            + uuidV4()
                .replace(/-/g, "");

        const mime =
            mediaMimeType(file);

        const safeName =
            file.name
                .replace(
                    /["\\\r\n]/g,
                    "_"
                );

        const encoder =
            new TextEncoder();

        const head =
            encoder.encode(
                `--${boundary}\r\n`
                + `Content-Disposition: form-data; name="source_sha256"\r\n\r\n`
                + `${sourceSha256}\r\n`
                + `--${boundary}\r\n`
                + `Content-Disposition: form-data; name="file"; filename="${safeName}"\r\n`
                + `Content-Type: ${mime}\r\n\r\n`
            );

        const fileBytes =
            new Uint8Array(bytes);

        const tail =
            encoder.encode(
                `\r\n--${boundary}--\r\n`
            );

        const combined =
            new Uint8Array(
                head.byteLength
                + fileBytes.byteLength
                + tail.byteLength
            );

        combined.set(
            head,
            0
        );

        combined.set(
            fileBytes,
            head.byteLength
        );

        combined.set(
            tail,
            head.byteLength
            + fileBytes.byteLength
        );

        return {
            body:
                combined.buffer,
            contentType:
                `multipart/form-data; boundary=${boundary}`,
        };
    }

    private async uploadMedia(
        file: TFile,
        bytes: ArrayBuffer,
        sourceSha256: string,
        token: string
    ): Promise<HakiSendMediaAsset> {
        if (
            bytes.byteLength
            > 31457280
        ) {
            throw new Error(
                `Local image is larger than 30 MiB: ${file.path}`
            );
        }

        const multipart =
            this.buildMultipartBody(
                file,
                bytes,
                sourceSha256
            );

        const response =
            await requestUrl({
                url:
                    normalizeBaseUrl(
                        this.settings
                            .apiBaseUrl
                    )
                    + "/api/v1/hakisend/media/assets",
                method: "POST",
                headers: {
                    "Accept":
                        "application/json",
                    "Content-Type":
                        multipart
                            .contentType,
                    "Authorization":
                        `Bearer ${token}`,
                },
                body:
                    multipart.body,
                throw: false,
            });

        const payload =
            response.json as {
                success?: boolean;
                data?: unknown;
                error?: {
                    code?: string;
                    message?: string;
                };
            };

        if (
            response.status < 200
            || response.status >= 300
            || !payload?.success
            || !payload.data
        ) {
            throw new Error(
                this.apiErrorMessage(
                    response.status,
                    response.headers,
                    payload?.error
                )
            );
        }

        return this.validateMediaAsset(
            payload.data
        );
    }

    private async mediaForFile(
        file: TFile,
        token: string,
        cache:
            Map<string, HakiSendMediaAsset>
    ): Promise<HakiSendMediaAsset> {
        const bytes =
            await this.app.vault
                .readBinary(file);

        const sourceSha256 =
            await sha256Hex(bytes);

        const cached =
            cache.get(
                sourceSha256
            );

        if (cached) {
            return cached;
        }

        const existing =
            await this
                .resolveMediaByHash(
                    sourceSha256,
                    token
                );

        if (existing) {
            cache.set(
                sourceSha256,
                existing
            );

            return existing;
        }

        const uploaded =
            await this.uploadMedia(
                file,
                bytes,
                sourceSha256,
                token
            );

        cache.set(
            sourceSha256,
            uploaded
        );

        return uploaded;
    }

    private async rewriteWikiImages(
        markdown: string,
        sourceFile: TFile,
        token: string,
        cache:
            Map<string, HakiSendMediaAsset>
    ): Promise<string> {
        const regex =
            /!\[\[([^\]\n]+)\]\]/g;

        let output = "";
        let lastIndex = 0;
        let match:
            RegExpExecArray | null;

        while (
            (
                match =
                    regex.exec(markdown)
            ) !== null
        ) {
            const whole =
                match[0];

            const inner =
                match[1];

            const parts =
                inner.split("|");

            const target =
                parts[0].trim();

            const resolved =
                this.resolveLocalMediaFile(
                    target,
                    sourceFile
                );

            const asset =
                await this.mediaForFile(
                    resolved,
                    token,
                    cache
                );

            let alt =
                parts
                    .slice(1)
                    .join("|")
                    .trim();

            if (
                !alt
                || /^\d+(?:x\d+)?$/i
                    .test(alt)
            ) {
                alt =
                    resolved.basename;
            }

            output +=
                markdown.slice(
                    lastIndex,
                    match.index
                );

            output +=
                `![${safeMarkdownAlt(alt)}](${asset.url})`;

            lastIndex =
                match.index
                + whole.length;
        }

        output +=
            markdown.slice(
                lastIndex
            );

        return output;
    }

    private markdownImageTarget(
        raw: string
    ): {
        target: string;
        suffix: string;
    } {
        const value =
            raw.trim();

        if (
            value.startsWith("<")
        ) {
            const closing =
                value.indexOf(">");

            if (closing > 0) {
                return {
                    target:
                        value.slice(
                            1,
                            closing
                        ),
                    suffix:
                        value
                            .slice(
                                closing + 1
                            ),
                };
            }
        }

        const match =
            value.match(
                /^(\S+)([\s\S]*)$/
            );

        if (!match) {
            return {
                target: value,
                suffix: "",
            };
        }

        return {
            target:
                match[1],
            suffix:
                match[2] ?? "",
        };
    }

    private async rewriteMarkdownImages(
        markdown: string,
        sourceFile: TFile,
        token: string,
        cache:
            Map<string, HakiSendMediaAsset>
    ): Promise<string> {
        const regex =
            /!\[([^\]\n]*)\]\(([^)\n]+)\)/g;

        let output = "";
        let lastIndex = 0;
        let match:
            RegExpExecArray | null;

        while (
            (
                match =
                    regex.exec(markdown)
            ) !== null
        ) {
            const whole =
                match[0];

            const alt =
                match[1] ?? "";

            const parsed =
                this.markdownImageTarget(
                    match[2] ?? ""
                );

            output +=
                markdown.slice(
                    lastIndex,
                    match.index
                );

            if (
                externalImageTarget(
                    parsed.target
                )
            ) {
                output += whole;

                lastIndex =
                    match.index
                    + whole.length;

                continue;
            }

            const resolved =
                this.resolveLocalMediaFile(
                    parsed.target,
                    sourceFile
                );

            const asset =
                await this.mediaForFile(
                    resolved,
                    token,
                    cache
                );

            output +=
                `![${safeMarkdownAlt(alt)}](${asset.url}${parsed.suffix})`;

            lastIndex =
                match.index
                + whole.length;
        }

        output +=
            markdown.slice(
                lastIndex
            );

        return output;
    }

    private async rewriteLocalImages(
        markdown: string,
        sourceFile: TFile,
        token: string,
        cache:
            Map<string, HakiSendMediaAsset>
    ): Promise<string> {
        let result =
            await this
                .rewriteWikiImages(
                    markdown,
                    sourceFile,
                    token,
                    cache
                );

        result =
            await this
                .rewriteMarkdownImages(
                    result,
                    sourceFile,
                    token,
                    cache
                );

        return result;
    }

    private async resolveFeaturedImage(
        value: unknown,
        sourceFile: TFile,
        token: string,
        cache:
            Map<string, HakiSendMediaAsset>
    ): Promise<unknown> {
        if (
            value === null
            || value === undefined
            || value === ""
        ) {
            return null;
        }

        if (
            typeof value
                === "string"
        ) {
            let target =
                value.trim();

            if (
                /^[0-9a-fA-F-]{36}$/
                    .test(target)
            ) {
                return target;
            }

            if (
                target.startsWith(
                    "![["
                )
                && target.endsWith(
                    "]]"
                )
            ) {
                target =
                    target
                        .slice(3, -2)
                        .split("|")[0]
                        .trim();
            }

            if (
                externalImageTarget(
                    target
                )
            ) {
                throw new Error(
                    "featured_image must be a local image or a HakiSend Media UID."
                );
            }

            const file =
                this.resolveLocalMediaFile(
                    target,
                    sourceFile
                );

            const asset =
                await this.mediaForFile(
                    file,
                    token,
                    cache
                );

            return {
                uid: asset.uid,
                alt: file.basename,
            };
        }

        if (
            typeof value
                === "object"
            && value !== null
        ) {
            const object =
                value as {
                    uid?: unknown;
                    alt?: unknown;
                };

            if (
                typeof object.uid
                    === "string"
                && /^[0-9a-fA-F-]{36}$/
                    .test(
                        object.uid
                    )
            ) {
                return {
                    uid:
                        object.uid,
                    alt:
                        typeof object.alt
                            === "string"
                            ? object.alt
                            : "",
                };
            }
        }

        throw new Error(
            "featured_image must be a local image path, Media UID, or {uid, alt}."
        );
    }

    private async categoriesForSite(
        siteUid: string,
        token: string
    ): Promise<HakiSendCategory[]> {
        const response =
            await requestUrl({
                url:
                    normalizeBaseUrl(
                        this.settings
                            .apiBaseUrl
                    )
                    + "/api/v1/hakisend/sites/"
                    + encodeURIComponent(
                        siteUid
                    )
                    + "/categories",
                method: "GET",
                headers: {
                    "Accept":
                        "application/json",
                    "Authorization":
                        `Bearer ${token}`,
                },
                throw: false,
            });

        const payload =
            response.json as {
                success?: boolean;
                data?: HakiSendCategory[];
                error?: {
                    code?: string;
                    message?: string;
                };
            };

        if (
            response.status < 200
            || response.status >= 300
            || !payload?.success
            || !Array.isArray(
                payload.data
            )
        ) {
            throw new Error(
                this.apiErrorMessage(
                    response.status,
                    response.headers,
                    payload?.error
                )
            );
        }

        return payload.data;
    }

    private async resolveCategoryForFile(
        file: TFile,
        frontmatter:
            Record<string, unknown>,
        siteUid: string,
        token: string
    ): Promise<HakiSendCategory> {
        const categories =
            await this.categoriesForSite(
                siteUid,
                token
            );

        const categoryRoute = this.findCategoryRoute(file.path, siteUid);
        const pinnedUid = typeof frontmatter.category_uid === "string"
            ? frontmatter.category_uid.trim() : "";
        const explicitCategory = typeof frontmatter.category === "string"
            ? frontmatter.category.trim() : "";

        let category: HakiSendCategory | undefined;
        if (pinnedUid) {
            category = categories.find((item) => item.uid === pinnedUid);
            if (!category) throw new Error("category_uid does not belong to the selected Site. Choose a Category for this Site.");
        } else if (explicitCategory) {
            const key = explicitCategory.toLowerCase();
            const slugged = simpleSlug(explicitCategory);
            category = categories.find((item) =>
                item.uid === explicitCategory
                || item.slug.toLowerCase() === key
                || item.title.toLowerCase() === key
                || item.slug.toLowerCase() === slugged
            );
            if (!category) throw new Error(`Category "${explicitCategory}" does not exist on this Site.`);
        } else if (categoryRoute) {
            category = categories.find((item) => item.uid === categoryRoute.categoryUid);
            if (!category) throw new Error("The mapped Category is no longer available on the selected Site.");
        } else {
            const folderName = file.parent?.name?.trim() ?? "";
            const key = folderName.toLowerCase();
            const slugged = simpleSlug(folderName);
            category = categories.find((item) =>
                item.uid === folderName
                || item.slug.toLowerCase() === key
                || item.title.toLowerCase() === key
                || item.slug.toLowerCase() === slugged
            );
            if (!category) throw new Error(
                `No Category assigned for folder "${file.parent?.path ?? ""}". Set category_uid, choose a Category in Properties or configure a Category folder mapping.`
            );
        }

        return category;
    }

    private buildPostMetadata(
        file: TFile,
        frontmatter:
            Record<string, unknown>,
        externalId: string,
        siteUid: string,
        category:
            HakiSendCategory
    ): Record<string, unknown> {
        const metadata:
            Record<string, unknown> = {
                title:
                    typeof frontmatter.title
                        === "string"
                        && frontmatter
                            .title
                            .trim()
                        ? frontmatter
                            .title
                            .trim()
                        : file.basename,

                site: siteUid,

                type: "post",

                external_id:
                    externalId,

                category:
                    category.slug,
            };

        const scalarFields = [
            "slug",
            "status",
            "excerpt",
        ];

        for (
            const key
            of scalarFields
        ) {
            const value =
                frontmatter[key];

            if (
                typeof value
                    === "string"
                && value.trim() !== ""
            ) {
                metadata[key] =
                    value.trim();
            }
        }

        /*
         * Schedule timestamps have three states:
         *
         * absent  -> preserve server value
         * string  -> set timestamp
         * null / blank -> explicitly clear timestamp
         */
        const scheduleFields = [
            "publish_at",
            "unpublish_at",
        ];

        for (
            const key
            of scheduleFields
        ) {
            if (
                !Object.prototype
                    .hasOwnProperty.call(
                        frontmatter,
                        key
                    )
            ) {
                continue;
            }

            const value =
                frontmatter[key];

            if (
                value === null
                || (
                    typeof value
                        === "string"
                    && value.trim() === ""
                )
            ) {
                metadata[key] =
                    null;

                continue;
            }

            if (
                typeof value
                    === "string"
            ) {
                metadata[key] =
                    value.trim();
            }
        }

        if (
            Object.prototype
                .hasOwnProperty.call(
                    frontmatter,
                    "tags"
                )
        ) {
            metadata.tags =
                normalizeTagValues(
                    frontmatter.tags
                );
        }

        return metadata;
    }

    private preparePublishNowMetadata(
        frontmatter:
            Record<string, unknown>
    ): void {
        /*
         * Publish Now cancels the entire previous schedule
         * in the API payload.
         *
         * Local Properties are committed only after both the
         * Post Save and Site publication succeed.
         */
        frontmatter.status =
            "published";

        frontmatter.publish_at =
            null;

        frontmatter.unpublish_at =
            null;
    }

    private async commitPublishNowFrontmatter(
        file: TFile
    ): Promise<void> {
        await this.app.fileManager
            .processFrontMatter(
                file,
                (data) => {
                    data.status =
                        "published";

                    delete data.publish_at;
                    delete data.unpublish_at;
                }
            );
    }

    private async commitScheduleFrontmatter(
        file: TFile,
        values:
            HakiSendScheduleValues
    ): Promise<void> {
        await this.app.fileManager
            .processFrontMatter(
                file,
                (data) => {
                    data.status =
                        "published";

                    data.publish_at =
                        values.publishAtIso;

                    if (
                        values.unpublishAtIso
                    ) {
                        data.unpublish_at =
                            values
                                .unpublishAtIso;
                    } else {
                        delete data
                            .unpublish_at;
                    }
                }
            );
    }

    private async saveCurrentNoteCore(
        publishIntent = false,
        metadataOverrides:
            Record<string, unknown>
            | null = null
    ): Promise<SaveCurrentNoteResult> {
        const file =
            this.app.workspace
                .getActiveFile();

        if (
            !file
            || file.extension
                .toLowerCase()
                !== "md"
        ) {
            throw new Error(
                "Open a Markdown note before saving to HakiSend."
            );
        }

        const token =
            await this.getAccessToken();

        if (!token) {
            throw new Error(
                "HakiSend is not connected."
            );
        }

        const cached =
            this.app.metadataCache
                .getFileCache(file);

        const frontmatter:
            Record<string, unknown> =
            cached?.frontmatter
                ? {
                    ...cached
                        .frontmatter,
                }
                : {};

        const siteUid = this.resolveSiteForFile(file, frontmatter);

        if (
            metadataOverrides
        ) {
            for (
                const [
                    key,
                    value
                ]
                of Object.entries(
                    metadataOverrides
                )
            ) {
                frontmatter[key] =
                    value;
            }
        }

        const externalId =
            await this.ensureExternalId(
                file,
                frontmatter
            );

        if (publishIntent) {
            this.preparePublishNowMetadata(
                frontmatter
            );
        }

        const category =
            await this
                .resolveCategoryForFile(
                    file,
                    frontmatter,
                    siteUid,
                    token
                );

        const raw =
            await this.app.vault
                .read(file);

        let body =
            stripYamlFrontmatter(
                raw
            );

        body =
            stripAuthoringInputBlocks(
                body
            );

        const mediaCache =
            new Map<
                string,
                HakiSendMediaAsset
            >();

        body =
            await this
                .rewriteLocalImages(
                    body,
                    file,
                    token,
                    mediaCache
                );

        if (
            typeof body
                !== "string"
        ) {
            throw new Error(
                "Internal HakiSend error: Markdown body is not a string."
            );
        }

        const metadata =
            this.buildPostMetadata(
                file,
                frontmatter,
                externalId,
                siteUid,
                category
            );

        if (
            Object.prototype
                .hasOwnProperty.call(
                    frontmatter,
                    "featured_image"
                )
        ) {
            metadata.featured_image =
                await this
                    .resolveFeaturedImage(
                        frontmatter
                            .featured_image,
                        file,
                        token,
                        mediaCache
                    );
        }

        const payload = {
            external: {
                source: "obsidian",
                id: externalId,
            },
            metadata,
            content: {
                format: "markdown",
                body,
            },
        };

        const response =
            await requestUrl({
                url:
                    normalizeBaseUrl(
                        this.settings
                            .apiBaseUrl
                    )
                    + "/api/v1/hakisend/sites/"
                    + encodeURIComponent(
                        siteUid
                    )
                    + "/posts/upsert",
                method: "PUT",
                headers: {
                    "Accept":
                        "application/json",
                    "Content-Type":
                        "application/json",
                    "Authorization":
                        `Bearer ${token}`,
                },
                body:
                    JSON.stringify(
                        payload
                    ),
                throw: false,
            });

        const result =
            response.json as {
                success?: boolean;
                data?: PostUpsertData;
                error?: {
                    code?: string;
                    message?: string;
                };
                message?: string;
                errors?: unknown;
            };

        if (
            response.status < 200
            || response.status >= 300
            || !result?.success
            || !result.data
        ) {
            throw new Error(
                this.apiErrorMessage(
                    response.status,
                    response.headers,
                    result?.error
                        ?? {
                            message:
                                result?.message,
                        }
                )
            );
        }

        return {
            file,
            token,
            siteUid,
            post: result.data,
        };
    }

    async saveCurrentNote():
        Promise<void> {
        try {
            const saved =
                await this
                    .saveCurrentNoteCore(
                        false
                    );

            new Notice(
                `HakiSend saved: ${saved.post.operation} · ${saved.post.uid}`
            );
        } catch (error) {
            new Notice(
                "HakiSend Save failed: "
                + this.safeErrorMessage(
                    error
                )
            );
        }
    }

    private async publishSavedState(
        saved:
            SaveCurrentNoteResult
    ): Promise<PublicationData> {
        const response =
            await requestUrl({
                url:
                    normalizeBaseUrl(
                        this.settings
                            .apiBaseUrl
                    )
                    + "/api/v1/hakisend/sites/"
                    + encodeURIComponent(
                        saved.siteUid
                    )
                    + "/publish",
                method: "POST",
                headers: {
                    "Accept":
                        "application/json",
                    "Authorization":
                        `Bearer ${saved.token}`,
                },
                throw: false,
            });

        const result =
            response.json as {
                success?: boolean;
                data?: PublicationData;
                error?: {
                    code?: string;
                    message?: string;
                };
                message?: string;
            };

        if (
            response.status < 200
            || response.status >= 300
            || !result?.success
            || !result.data
        ) {
            throw new Error(
                this.apiErrorMessage(
                    response.status,
                    response.headers,
                    result?.error
                        ?? {
                            message:
                                result
                                    ?.message,
                        }
                )
            );
        }

        return result.data;
    }

    private openScheduleCurrentNote():
        void {
        const file =
            this.app.workspace
                .getActiveFile();

        if (
            !file
            || file.extension
                .toLowerCase()
                !== "md"
        ) {
            new Notice(
                "Open a Markdown note before scheduling."
            );

            return;
        }

        const frontmatter =
            this.app.metadataCache
                .getFileCache(
                    file
                )
                ?.frontmatter
            ?? {};

        const initialPublish =
            dateFromScheduleValue(
                frontmatter
                    .publish_at
            );

        const initialUnpublish =
            dateFromScheduleValue(
                frontmatter
                    .unpublish_at
            );

        new HakiSendScheduleModal(
            this.app,
            initialPublish,
            initialUnpublish,
            async (
                values
            ) => {
                await this
                    .scheduleCurrentNote(
                        values
                    );
            }
        ).open();
    }

    private async scheduleCurrentNote(
        values:
            HakiSendScheduleValues
    ): Promise<void> {
        let postSaved = false;
        let publicationArmed = false;

        try {
            const file =
                this.app.workspace
                    .getActiveFile();

            if (
                !file
                || file.extension
                    .toLowerCase()
                    !== "md"
            ) {
                throw new Error(
                    "Open a Markdown note before scheduling."
                );
            }

            const publishDate =
                new Date(
                    values.publishAtIso
                );

            if (
                Number.isNaN(
                    publishDate
                        .getTime()
                )
                || publishDate
                    .getTime()
                    <= Date.now()
            ) {
                throw new Error(
                    "Publish time must be in the future."
                );
            }

            if (
                values
                    .unpublishAtIso
            ) {
                const unpublishDate =
                    new Date(
                        values
                            .unpublishAtIso
                    );

                if (
                    Number.isNaN(
                        unpublishDate
                            .getTime()
                    )
                    || unpublishDate
                        .getTime()
                        <= publishDate
                            .getTime()
                ) {
                    throw new Error(
                        "Unpublish time must be later than publish time."
                    );
                }
            }

            /*
             * Do not mutate Obsidian Properties yet.
             *
             * The desired publishing state is sent to the
             * authoring API in-memory below. Local Properties
             * are committed only after publication succeeds.
             */

            const saved =
                await this
                    .saveCurrentNoteCore(
                        false,
                        {
                            status:
                                "published",

                            publish_at:
                                values
                                    .publishAtIso,

                            /*
                             * Explicit null clears an older expiry on
                             * the server even if Obsidian metadata cache
                             * has not refreshed yet.
                             */
                            unpublish_at:
                                values
                                    .unpublishAtIso,
                        }
                    );

            postSaved = true;

            const publication =
                await this
                    .publishSavedState(
                        saved
                    );

            publicationArmed =
                true;

            await this
                .commitScheduleFrontmatter(
                    saved.file,
                    values
                );

            new Notice(
                `HakiSend scheduled: ${values.display} · v${publication.version}`
            );
        } catch (error) {
            const prefix =
                publicationArmed
                    ? "HakiSend Schedule succeeded on HakiSend, but updating local Properties failed: "
                    : postSaved
                        ? "HakiSend Schedule publication failed after saving the Post; local Properties were not changed. Retry Schedule to arm it live: "
                        : "HakiSend Schedule failed; local publishing Properties were not changed: ";

            new Notice(
                prefix
                + this.safeErrorMessage(
                    error
                )
            );
        }
    }

    async publishCurrentNote():
        Promise<void> {
        let postSaved = false;
        let publicationPublished = false;

        try {
            /*
             * Publish current note = Publish NOW.
             * saveCurrentNoteCore(true) sends status=published
             * and explicitly clears publish_at/unpublish_at in-memory.
             * Local Properties are committed only after the Site
             * publication succeeds.
             */
            const saved =
                await this
                    .saveCurrentNoteCore(
                        true
                    );

            postSaved =
                true;

            const publication =
                await this
                    .publishSavedState(
                        saved
                    );

            publicationPublished =
                true;

            await this
                .commitPublishNowFrontmatter(
                    saved.file
                );

            if (
                publication.operation
                    === "unchanged"
            ) {
                new Notice(
                    `HakiSend publication unchanged: v${publication.version} · ${publication.publication_uid}`
                );

                return;
            }

            new Notice(
                `HakiSend published: v${publication.version} · ${publication.publication_uid}`
            );
        } catch (error) {
            const prefix =
                publicationPublished
                    ? "HakiSend Publish succeeded on HakiSend, but updating local Properties failed: "
                    : postSaved
                        ? "HakiSend Publish failed after saving the Post; local publishing Properties were not changed: "
                        : "HakiSend Publish failed; local publishing Properties were not changed: ";

            new Notice(
                prefix
                + this.safeErrorMessage(
                    error
                )
            );
        }
    }

    async showCurrentPostStatus():
        Promise<void> {

        const file =
            this.app.workspace
                .getActiveFile();

        if (
            !file
            || file.extension
                .toLowerCase()
                !== "md"
        ) {
            new Notice(
                "Open a Markdown note to view HakiSend status."
            );

            return;
        }

        const cached =
            this.app.metadataCache
                .getFileCache(
                    file
                );

        const frontmatter:
            Record<string, unknown> =
            cached?.frontmatter
                ? {
                    ...cached
                        .frontmatter,
                }
                : {};

        const rawStatus =
            typeof frontmatter.status
                === "string"
                ? frontmatter
                    .status
                    .trim()
                    .toLowerCase()
                : "";

        const publishAt =
            dateFromScheduleValue(
                frontmatter
                    .publish_at
            );

        const unpublishAt =
            dateFromScheduleValue(
                frontmatter
                    .unpublish_at
            );

        const now =
            Date.now();

        let state =
            "Draft";

        if (
            rawStatus === "published"
            || rawStatus === "publish"
        ) {
            if (
                publishAt
                && publishAt.getTime()
                    > now
            ) {
                state =
                    "Scheduled";
            } else if (
                unpublishAt
                && unpublishAt.getTime()
                    <= now
            ) {
                state =
                    "Expired";
            } else {
                state =
                    "Published";
            }
        } else if (
            rawStatus
            && rawStatus !== "draft"
        ) {
            state =
                "Legacy status: "
                + rawStatus;
        }

        const category =
            typeof frontmatter.category
                === "string"
                && frontmatter
                    .category
                    .trim()
                ? frontmatter
                    .category
                    .trim()
                : (
                    file.parent
                        ?.name
                        ?.trim()
                    || "not set"
                );

        const slug =
            typeof frontmatter.slug
                === "string"
                && frontmatter
                    .slug
                    .trim()
                ? frontmatter
                    .slug
                    .trim()
                : "automatic";

        const externalId =
            typeof frontmatter
                .external_id
                === "string"
                ? frontmatter
                    .external_id
                    .trim()
                : "";

        const identity =
            externalId
                ? "reserved"
                : "not reserved";

        const scheduleParts:
            string[] = [];

        if (
            state === "Scheduled"
            && publishAt
        ) {
            scheduleParts.push(
                "publish "
                + publishAt
                    .toLocaleString()
            );
        }

        if (
            unpublishAt
        ) {
            scheduleParts.push(
                "unpublish "
                + unpublishAt
                    .toLocaleString()
            );
        }

        let destination = "unresolved";
        try {
            const uid = this.resolveSiteForFile(file, frontmatter);
            destination = this.settings.sites.find((site) => site.uid === uid)?.name ?? uid;
        } catch (error) {
            destination = this.safeErrorMessage(error);
        }
        const lines = [
            "Site: " + destination,
            "HakiSend local state: "
                + state,
            "Category: "
                + category,
            "Slug: "
                + slug,
            "Identity: "
                + identity,
        ];

        if (
            scheduleParts.length
        ) {
            lines.push(
                "Schedule: "
                + scheduleParts.join(
                    " · "
                )
            );
        }

        new Notice(
            lines.join("\n"),
            8000
        );
    }


    async testConnection(): Promise<void> {
        try {
            const sites =
                await this.discoverSites();

            new Notice(
                `HakiSend connection OK. ${sites.length} Site(s) available.`
            );
        } catch (error) {
            new Notice(
                "HakiSend connection failed: "
                + this.safeErrorMessage(error)
            );
        }
    }

    private apiErrorMessage(
        status: number,
        headers:
            Record<string, string>,
        error?: {
            code?: string;
            message?: string;
        }
    ): string {
        const requestId =
            headers["x-hakisend-request-id"]
            ?? headers["X-HakiSend-Request-ID"]
            ?? headers["x-request-id"]
            ?? headers["X-Request-Id"]
            ?? headers["x-requestid"]
            ?? "";

        const code =
            error?.code
            ? ` ${error.code}`
            : "";

        const message =
            error?.message
            ? ` — ${error.message}`
            : "";

        const request =
            requestId
            ? ` [request ${requestId}]`
            : "";

        return `HTTP ${status}${code}${message}${request}`;
    }

    private safeErrorMessage(
        error: unknown
    ): string {
        if (error instanceof Error) {
            return error.message;
        }

        return "Unknown error.";
    }
}

class HakiSendPublisherSettingTab
    extends PluginSettingTab
{
    constructor(
        app: App,
        private plugin:
            HakiSendPublisherPlugin
    ) {
        super(app, plugin);
    }

    display(): void {
        const {
            containerEl,
        } = this;

        containerEl.empty();

        const secure =
            this.plugin
                .hasSecureConnection();

        const legacy =
            this.plugin
                .hasLegacyToken();

        new Setting(containerEl)
            .setName("Connection")
            .setDesc(
                secure
                    ? "Connected securely to HakiSend."
                    : legacy
                        ? "Legacy token detected. Connect through the browser to move to secure storage."
                        : "Not connected."
            )
            .addButton((button) => {
                button
                    .setButtonText(
                        secure
                            ? "Reconnect"
                            : "Connect to HakiSend"
                    )
                    .setCta()
                    .onClick(
                        async () => {
                            await this.plugin
                                .startBrowserConnect();
                        }
                    );
            });

        if (secure || legacy) {
            new Setting(containerEl)
                .setName(
                    "Test connection"
                )
                .setDesc(
                    "Verify credentials and refresh available Sites."
                )
                .addButton(
                    (button) => {
                        button
                            .setButtonText(
                                "Test connection"
                            )
                            .onClick(
                                async () => {
                                    await this.plugin
                                        .testConnection();
                                }
                            );
                    }
                );
        }

        if (secure) {
            new Setting(containerEl)
                .setName("Disconnect")
                .setDesc(
                    "Remove the HakiSend credential from Obsidian."
                )
                .addButton(
                    (button) => {
                        button
                            .setButtonText(
                                "Disconnect"
                            )
                            .setWarning()
                            .onClick(
                                async () => {
                                    await this.plugin
                                        .disconnect();
                                }
                            );
                    }
                );
        }

        new Setting(containerEl)
            .setName(
                "HakiSend API base URL"
            )
            .setDesc(
                "Normally https://app.hakisend.com"
            )
            .addText((text) => {
                text
                    .setPlaceholder(
                        "https://app.hakisend.com"
                    )
                    .setValue(
                        this.plugin
                            .settings
                            .apiBaseUrl
                    )
                    .onChange(
                        async (
                            value
                        ) => {
                            this.plugin
                                .settings
                                .apiBaseUrl =
                                normalizeBaseUrl(
                                    value
                                );

                            await this.plugin
                                .saveSettings();
                        }
                    );
            });

        const sites =
            this.plugin.settings.sites;

        containerEl.createEl("h3", { text: "Folder → Site publishing routes" });
        containerEl.createEl("p", {
            text: "Subfolders inherit the closest parent route. site_uid in note Properties overrides routes.",
            cls: "setting-item-description",
        });
        for (const route of this.plugin.settings.folderSiteMappings) {
            new Setting(containerEl)
                .setName(route.folderPath)
                .addDropdown((dropdown) => {
                    for (const site of sites) dropdown.addOption(site.uid, site.name);
                    dropdown.setValue(route.siteUid);
                    dropdown.onChange(async (value) => {
                        route.siteUid = value;
                        await this.plugin.saveSettings();
                    });
                })
                .addButton((button) => button.setButtonText("Remove").onClick(async () => {
                    this.plugin.settings.folderSiteMappings = this.plugin.settings.folderSiteMappings.filter((item) => item !== route);
                    await this.plugin.saveSettings();
                    this.display();
                }));
        }
        let newFolder = "";
        let newSite = sites[0]?.uid ?? "";
        const newRouteSetting = new Setting(containerEl)
            .setName("Add folder route")
            .setDesc("Choose an existing Obsidian folder.");
        newRouteSetting
            .addButton((button) => button.setButtonText("Choose folder…")
                .onClick(() => new HakiSendFolderPicker(this.app, (folder) => {
                    newFolder = folder.path;
                    newRouteSetting.setDesc(folder.path);
                }).open()))
            .addDropdown((dropdown) => {
                for (const site of sites) dropdown.addOption(site.uid, site.name);
                if (newSite) dropdown.setValue(newSite);
                dropdown.onChange((value) => { newSite = value; });
            })
            .addButton((button) => button.setButtonText("Add route").onClick(async () => {
                const folder = normalizeFolderPath(newFolder);
                if (!folder || !newSite) {
                    new Notice("Select a folder and a Site.");
                    return;
                }
                const target = this.app.vault.getAbstractFileByPath(folder);
                if (!target || !(target instanceof TFolder)) {
                    new Notice("Choose a valid folder from this Obsidian vault.");
                    return;
                }
                this.plugin.settings.folderSiteMappings = this.plugin.settings.folderSiteMappings.filter((item) => item.folderPath !== folder);
                this.plugin.settings.folderSiteMappings.push({ folderPath: folder, siteUid: newSite });
                await this.plugin.saveSettings();
                this.display();
            }));

        containerEl.createEl("h3", { text: "Category folder mappings" });
        containerEl.createEl("p", {
            text: "A Category is specific to one HakiSend Site. Map each Category folder to its actual server Category UID. Child folders inherit the mapping.",
            cls: "setting-item-description",
        });
        for (const route of this.plugin.settings.folderCategoryMappings) {
            const site = sites.find((candidate) => candidate.uid === route.siteUid);
            new Setting(containerEl)
                .setName(route.folderPath)
                .setDesc((site?.name ?? "Unavailable Site")
                    + " → " + (route.categoryTitle ?? route.categoryUid))
                .addButton((button) => button.setButtonText("Remove").onClick(async () => {
                    this.plugin.settings.folderCategoryMappings = this.plugin.settings.folderCategoryMappings
                        .filter((item) => item !== route);
                    await this.plugin.saveSettings();
                    this.display();
                }));
        }
        new Setting(containerEl)
            .setName("Map a Category folder")
            .setDesc("Select the folder, parent Site, and a real Category from HakiSend.")
            .addButton((button) => button.setButtonText("Add Category mapping")
                .onClick(() => this.plugin.openAddCategoryRouteModal()));

        new Setting(containerEl)
            .setName("Default Site")
            .setDesc(
                sites.length
                    ? "Site used by default when a note does not specify another Site."
                    : "Connect or test the connection to load Sites."
            )
            .addDropdown(
                (dropdown) => {
                    dropdown.addOption(
                        "",
                        sites.length
                            ? "Choose a Site"
                            : "No Sites loaded"
                    );

                    for (
                        const site
                        of sites
                    ) {
                        dropdown.addOption(
                            site.uid,
                            site.name
                        );
                    }

                    dropdown.setValue(
                        this.plugin
                            .settings
                            .defaultSiteUid
                    );

                    dropdown.onChange(
                        async (
                            value
                        ) => {
                            this.plugin
                                .settings
                                .defaultSiteUid =
                                value;

                            await this.plugin
                                .saveSettings();
                        }
                    );
                }
            );
    }
}
