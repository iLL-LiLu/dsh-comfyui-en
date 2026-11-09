/**
 * Media proxy: serves generated ComfyUI files to the browser through the
 * same-origin route /comfyui/media?prompt=&node=&index=, so the client never
 * talks to the ComfyUI server directly (no CORS, no mixed content, no key in
 * the browser) and remote installs work unchanged.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ComfyUIRuntime } from './tools.js';
/**
 * Mount the media proxy route on the host web server.
 * @returns the disposer, or undefined when no web server is present.
 */
export declare function mountComfyUIProxy(ctx: Context, runtime: ComfyUIRuntime): (() => void) | undefined;
