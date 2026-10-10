import { Modal,
    App,
    Notice,
    Plugin,
    PluginSettingTab,
    Setting,
    TFile,
    requestUrl,
} from "obsidian";

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


class HakiSendNewPostModal
    extends Modal {

    private titleValue = "";

    private categoryUid: string;

    constructor(
        app: App,
        private categories:
            HakiSendCategory[],
        initialCategoryUid: string,
        private destinationFolder:
            string,
        private onSubmit:
            (
                values:
                    HakiSendNewPostValues
            ) => Promise<void>
    ) {
        super(app);

        this.categoryUid =
            initialCategoryUid;
    }

    onOpen(): void {
        const {
            contentEl,
        } = this;

        contentEl.empty();

        contentEl.createEl(
            "h2",
            {
                text:
                    "New HakiSend Post",
            }
        );

        contentEl.createEl(
            "p",
            {
                text:
                    "Create a local draft with stable HakiSend identity. Nothing is sent to HakiSend until you Save, Schedule, or Publish.",
            }
        );

        contentEl.createEl(
            "p",
            {
                text:
                    "Folder: "
                    + (
                        this.destinationFolder
                        || "Vault root"
                    ),
            }
        );

        new Setting(
            contentEl
        )
            .setName("Title")
            .setDesc(
                "Used for the note filename and initial Post title."
            )
            .addText(
                (text) => {
                    text
                        .setPlaceholder(
                            "Post title"
                        )
                        .onChange(
                            (
                                value
                            ) => {
                                this.titleValue =
                                    value;
                            }
                        );

                    text.inputEl
                        .addEventListener(
                            "keydown",
                            (
                                event
                            ) => {
                                if (
                                    event.key
                                    !== "Enter"
                                ) {
                                    return;
                                }

                                event.preventDefault();

                                void this.submit();
                            }
                        );

                    window.setTimeout(
                        () => {
                            text.inputEl
                                .focus();
                        },
                        0
                    );
                }
            );

        new Setting(
            contentEl
        )
            .setName("Category")
            .setDesc(
                "The category is stored explicitly in Properties, so moving the note later does not change it."
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
                            "Create draft"
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
                "Enter a title for the new HakiSend Post."
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

        this.close();

        await this.onSubmit({
            title,
            category,
        });
    }

    onClose(): void {
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

            const selectedCategory =
                categories.find(
                    (
                        category
                    ) =>
                        category.uid
                            === requestedCategory
                        || category.slug
                            .toLowerCase()
                            === lowered
                        || category.title
                            .toLowerCase()
                            === lowered
                        || category.slug
                            .toLowerCase()
                            === slugged
                )
                ?? categories[0];

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


    private async openNewPost():
        Promise<void> {

        try {
            const token =
                await this
                    .getAccessToken();

            if (!token) {
                throw new Error(
                    "HakiSend is not connected."
                );
            }

            const active = this.app.workspace.getActiveFile();
            const destinationFolder = normalizeFolderPath(active?.parent?.path ?? "");
            const siteUid = this.resolveSiteForFolder(destinationFolder);

            const categories =
                await this
                    .categoriesForSite(
                        siteUid,
                        token
                    );

            if (!categories.length) {
                throw new Error(
                    "This Site has no Categories. Create a Category in HakiSend first."
                );
            }

            const folderName =
                active
                    ?.parent
                    ?.name
                    ?.trim()
                ?? "";

            const lowered =
                folderName
                    .toLowerCase();

            const folderSlug =
                simpleSlug(
                    folderName
                );

            const preferred =
                categories.find(
                    (
                        category
                    ) =>
                        category.title
                            .toLowerCase()
                            === lowered
                        || category.slug
                            .toLowerCase()
                            === lowered
                        || category.slug
                            .toLowerCase()
                            === folderSlug
                )
                ?? categories[0];

            new HakiSendNewPostModal(
                this.app,
                categories,
                preferred.uid,
                destinationFolder,
                async (
                    values
                ) => {
                    await this
                        .createNewPost(
                            destinationFolder,
                            values
                        );
                }
            ).open();
        } catch (error) {
            new Notice(
                "HakiSend New Post failed: "
                + this.safeErrorMessage(
                    error
                )
            );
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

    private async createNewPost(
        folderPath: string,
        values:
            HakiSendNewPostValues
    ): Promise<void> {

        const externalId =
            uuidV4();

        const path =
            this.uniqueNewPostPath(
                folderPath,
                values.title
            );

        const siteUid = this.resolveSiteForFolder(folderPath);
        const content =
            [
                "---",
                "site_uid: " + yamlQuotedScalar(siteUid),
                "title: "
                    + yamlQuotedScalar(
                        values.title
                    ),
                "status: draft",
                "category: "
                    + yamlQuotedScalar(
                        values
                            .category
                            .slug
                    ),
                "external_id: "
                    + externalId,
                "---",
                "",
                "",
            ].join("\n");

        const file =
            await this.app.vault
                .create(
                    path,
                    content
                );

        await this.app.workspace
            .getLeaf(false)
            .openFile(
                file
            );

        new Notice(
            "HakiSend draft created: "
            + file.path
        );
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

        const configured =
            typeof frontmatter.category
                === "string"
                ? frontmatter
                    .category
                    .trim()
                : "";

        const folderFallback =
            file.parent?.name?.trim()
            ?? "";

        const requested =
            configured
            || folderFallback;

        if (!requested) {
            throw new Error(
                "A Category is required. Add category: <slug> to frontmatter."
            );
        }

        const lowered =
            requested.toLowerCase();

        const slugged =
            simpleSlug(requested);

        const category =
            categories.find(
                (item) =>
                    item.uid
                        === requested
                    || item.slug
                        .toLowerCase()
                        === lowered
                    || item.title
                        .toLowerCase()
                        === lowered
                    || item.slug
                        .toLowerCase()
                        === slugged
            );

        if (!category) {
            const available =
                categories
                    .map(
                        (item) =>
                            `${item.title} (${item.slug})`
                    )
                    .join(", ");

            throw new Error(
                `Category "${requested}" does not exist in this Site. Available: ${available}`
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
        new Setting(containerEl)
            .setName("Add folder route")
            .setDesc("Vault-relative folder, for example KIEN OS or Parenting/English.")
            .addText((input) => input.setPlaceholder("Parenting/English").onChange((value) => { newFolder = value; }))
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
                if (!this.app.vault.getAbstractFileByPath(folder)) {
                    new Notice("Create this Obsidian folder before mapping it.");
                    return;
                }
                this.plugin.settings.folderSiteMappings = this.plugin.settings.folderSiteMappings.filter((item) => item.folderPath !== folder);
                this.plugin.settings.folderSiteMappings.push({ folderPath: folder, siteUid: newSite });
                await this.plugin.saveSettings();
                this.display();
            }));

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
