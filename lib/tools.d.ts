/**
 * Model-facing tools for dsh-comfyui, registered into the host `tools`
 * registry. The main entry is `comfyui_workflow`: list and run saved
 * workflows from the panel-managed library (synchronously or as a background
 * job); `comfyui_skill` maintains their skill packs. Secondary, for
 * hand-written workflows only (temporary tests, building a workflow for this
 * environment): `comfyui_object_info` exposes the server's node definitions
 * and `comfyui_run` submits a hand-written API workflow.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Config } from './config.js';
import { ComfyUIClient } from './comfyui.js';
import type { AssetRecord, LoadSlot, StoredWorkflow } from './store.js';
import type { GraphAnalysis } from './analyze.js';
import type { RunProgress } from './progress.js';
import type { QueuedRun } from './queue.js';
import { type WorkflowParameter } from './params.js';
import type { HostHint } from './host-hint.js';
import { type WorkflowSkillPacks } from './skillpack.js';
/** A workflow saved on the ComfyUI server (userdata/workflows), with extract status. */
export interface ComfyUIComfyWorkflow {
    name: string;
    size?: number;
    modified?: number;
    /** Whether at least one runnable API workflow was extracted from this graph. */
    extracted: boolean;
    /** Runnable API workflows extracted from this graph (run theme). */
    derived: Array<{
        libraryId: string;
        name: string;
    }>;
}
/** Live runtime the tools, routes, and proxy share. */
export interface ComfyUIRuntime {
    getConfig(): Config;
    /** Resolve the API key per request (credentials store, then environment). */
    getApiKey(): Promise<string | undefined>;
    createClient(apiKey: string | undefined): ComfyUIClient;
    /** Absolute media proxy URL base: explicit config > detected request host > loopback. */
    proxyBase(): string | undefined;
    /** Remembers the origin browsers use to reach this server (Host header). */
    hostHint: HostHint;
    /** Whether the settings service can persist config writes. */
    settingsWritable(): boolean;
    updateConfig(patch: Record<string, unknown>): Promise<{
        ok: true;
    } | {
        ok: false;
        error: string;
    }>;
    /** Queue a workflow and track it in the queue tracker. `meta.parameters`
     * applies adjustable parameters (values/random seeds) before submitting. */
    queue(workflow: unknown, meta: {
        workflowName: string | null;
        workflowId?: string | null;
        source: string;
        parameters?: WorkflowParameter[];
        values?: Record<string, unknown>;
    }): Promise<string>;
    /** Stop tracking a prompt (used when a tool call fails before completion). */
    untrack(promptId: string): void;
    /** Every prompt this plugin queued and is still waiting on. */
    trackedRuns(): QueuedRun[];
    /** Live generation progress for one prompt (from the ComfyUI WebSocket). */
    queueProgress(promptId: string): RunProgress | undefined;
    /** Saved workflows from the library. */
    listWorkflows(): Promise<StoredWorkflow[]>;
    getWorkflow(id: string): Promise<StoredWorkflow | undefined>;
    /** Create or update a workflow in the library. */
    saveWorkflow(input: {
        id?: string;
        name: string;
        description: string;
        workflow: unknown;
        parameters?: WorkflowParameter[];
        tags?: string[];
        source?: 'user' | 'comfyui';
        comfyuiFile?: string;
    }): Promise<{
        ok: true;
        workflow: StoredWorkflow;
    } | {
        ok: false;
        error: string;
    }>;
    /** Delete a workflow from the library; false when it did not exist. */
    deleteWorkflow(id: string): Promise<boolean>;
    /** Per-workflow skill packs (SKILL.md bundles under `<dataDir>/skills/`). */
    skillPacks: WorkflowSkillPacks;
    /** Force TTS-Audio-Suite to rescan its voice library (best-effort; false
     * when the server has no such endpoint). Call before re-deriving parameter
     * snapshots so object_info reports newly added voices. */
    refreshVoiceLibrary(): Promise<boolean>;
    /** Pixel sizes of panel-uploaded files, keyed by file name. */
    listMediaSizes(): Promise<Record<string, {
        width: number;
        height: number;
    }>>;
    /** Record the pixel size of one uploaded file. */
    saveMediaSize(name: string, size: {
        width: number;
        height: number;
    }): Promise<void>;
    /** File name recorded for a content hash (dedup index), if any. */
    lookupMediaHash(hash: string): Promise<string | undefined>;
    /** Record a content hash → file name pair for dedup. */
    saveMediaHash(hash: string, name: string): Promise<void>;
    /** The load-area slots, in order; `null` is an empty slot the user added.
     * Filled slots are the default source media for loader parameters. */
    loadSlots(): Promise<Array<LoadSlot>>;
    /** Persist the load-area slots. */
    saveSlots(slots: Array<LoadSlot>): Promise<void>;
    /** The asset index (newest first). */
    listAssets(): Promise<AssetRecord[]>;
    /** Remove one asset record from the index, returning what was removed. */
    deleteAsset(promptId: string): Promise<AssetRecord | undefined>;
    /** Move completed tracked runs into the asset index. */
    sweep(): Promise<AssetRecord[]>;
    /** Workflows the user saved on the ComfyUI server, with extract status. */
    listComfyWorkflows(): Promise<ComfyUIComfyWorkflow[]>;
    /** Read one ComfyUI-side saved workflow graph (UI format, not runnable as-is). */
    getComfyWorkflow(file: string): Promise<unknown>;
    /** Analyze one ComfyUI-side graph: connected components, groups, dangling nodes. */
    analyzeComfyWorkflow(file: string): Promise<GraphAnalysis | {
        ok: false;
        error: string;
    }>;
    /** Extract runnable API workflows from a ComfyUI-side graph (whole / per component / main flow). */
    extractComfyWorkflow(input: {
        file: string;
        mode: 'all' | 'split' | 'main';
    }): Promise<{
        ok: true;
        saved: StoredWorkflow[];
        analysis: GraphAnalysis;
        warnings: string[];
    } | {
        ok: false;
        error: string;
    }>;
}
/** One media item returned by comfyui_run (JSON-safe). */
export interface RunMediaItem {
    filename: string;
    subfolder: string;
    type: string;
    node: string;
    index: number;
    kind: 'image' | 'video' | 'audio' | 'other';
    url: string;
}
/** Synchronous completion result. */
export interface RunResult {
    kind: 'sync';
    promptId: string;
    status: 'completed' | 'interrupted';
    elapsedMs: number;
    media: RunMediaItem[];
    summary: string;
    /** Saved-workflow runs: the prompt-type parameters as actually submitted. */
    prompts?: PromptUsed[];
    /** The model-facing text (`runResultText`), carried in the value for code-dispatched calls. */
    report?: string;
}
/** One prompt-type parameter of a saved-workflow run, as actually submitted. */
export interface PromptUsed {
    name: string;
    text: string;
    /** false = the caller did not pass it, so the saved default was used. */
    passed: boolean;
}
/** Background mode result: collect later with job_output. */
export interface BackgroundResult {
    kind: 'background';
    jobId: string;
    promptId: string;
    label: string;
    /** The host posts a completion notice (and wakes an idle agent) — dsh 0.1.7+ jobs. */
    notifies: boolean;
    /** The model-facing receipt (`backgroundText`), carried in the value for code-dispatched calls. */
    report?: string;
}
/** Register the plugin tools; returns disposers. */
export declare function registerComfyUITools(ctx: Context, runtime: ComfyUIRuntime): Array<() => void>;
