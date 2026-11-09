/**
 * The dsh-comfyui companion skill: canvas analysis and graph→API extraction
 * rules for the model, registered through `ctx.skills.register` (runtime
 * skill, rank 250 — user/project skills can override it).
 */
export const COMFYUI_SKILL = {
    name: 'dsh-comfyui-workflows',
    source: 'runtime',
    description: 'Entry point for generating images/video/audio with ComfyUI (text-to-image, image-to-image, text-to-video, TTS, etc.): always start with comfyui_workflow list to pick a workflow from the library, then run. Also covers workflow management: distinguishing "graph workflows" (UI canvases saved on the ComfyUI side, the source theme) from "API workflows" (executable, the run theme), analyzing multiple independent flows (connected components) in a canvas, and the graph-to-API extraction rules plus panel guidance. Includes quick lookup/snapshot-refresh recipes for the local environment (the user\'s ComfyUI directories) and the TTS-Audio-Suite voice library. Load when handling comfyui_workflow, locating user ComfyUI files/voice libraries, or when the user asks to run a workflow saved on the ComfyUI side.',
    whenToUse: 'When the user wants to generate anything with ComfyUI (list first, then run); when the user asks to run/manage workflows saved in ComfyUI, or comfyui_workflow list shows graph workflows that have not been extracted yet; when you need to judge whether a canvas holds multiple independent flows, or explain why a workflow cannot run directly; when querying the TTS-Audio-Suite voice library, refreshing the voice-parameter snapshot of a saved workflow, or locating the user\'s local ComfyUI directories; or when a workflow in comfyui_workflow list carries a "skill pack" marker and needs to be read before running.',
    content: `# dsh-comfyui workflow management

## Generating content: step one is always comfyui_workflow list

When the user wants to generate anything (images, video, audio, text-to-image, image-to-image, TTS, etc.):

1. **Call \`comfyui_workflow action: list\` first**, and pick the right workflow by name, description and tags. Workflows in the library are set up for this server, so the models and nodes are available.
2. If a workflow has a skill pack, read it with \`action: skill { id }\` first, then \`comfyui_workflow run { id, parameters }\` (details in "The correct way to run a workflow").
3. \`comfyui_object_info\` and \`comfyui_run\` are **not** generation entry points; they are only for hand-written workflows (next section). If the library has a suitable workflow, do not use them.
4. Call the tool directly when you can (only then does a generation card show up in the chat); if the current environment only allows calling from run_code, that is fine too — follow the \`report\` field in the return value.

## Hand-written workflows (secondary: ad-hoc tests, or creating a new workflow for this environment)

Use this only when the library has no suitable workflow, you need a quick test, or you want to create a new workflow for this environment. The steps are fixed:

1. **Inspect the environment**: \`comfyui_object_info { filter }\` to find node class names, inputs, and the model file names actually available in loaders (e.g. \`filter: "Loader"\`).
2. **Write the API JSON**: node id → \`{ class_type, inputs }\`; write links as \`["<node id string>", <output slot>]\`; use only model names found in step 1.
3. **Run a test**: \`comfyui_run { workflow }\`; if it errors, fix the JSON per the error message and run again.

If it works and you want to keep it, tell the user to open "New workflow" in the panel, paste this JSON into the library; afterwards use list → run.

## The two workflow themes

This plugin splits ComfyUI workflows into two themes:

- **Graph workflows (source theme)**: the UI graphs (nodes/links/widgets) the user saves on the ComfyUI canvas. They are the "source". They cannot run directly. One graph may contain **multiple mutually independent flows**.
- **API workflows (run theme)**: executable API-format prompts, the "run unit". They are **extracted** from a graph, or pasted/imported directly by the user. Running always uses API workflows.

\`comfyui_workflow action: list\` returns both: API workflows in the plugin library (\`workflows\`) and graph workflows saved on the ComfyUI side (\`comfyuiWorkflows\`, with \`extracted\` and the \`derived\` list).

## Local environment (read this first; do not ask the user repeatedly)

- \`comfyui_workflow action: list\` always returns an \`env\` field: \`baseUrl\` (the ComfyUI server address) and \`comfyuiDirs\` (the install directories the user configured on the settings page under "ComfyUI directories"; multiple allowed — directory mapping / multiple instances / portable installs). **When you need the server address, or need to locate the user's ComfyUI files (models, custom nodes, voice libraries, output directories — all under these), run list once and read env.** Every call reads the latest values; changes on the settings page take effect immediately.
- An empty \`comfyuiDirs\` = not configured: ask the user first, or probe common locations (\`C:\\ComfyUI\`, \`D:\\ComfyUI\`, the ComfyUI desktop app \`...\\ComfyUI-Installs\\ComfyUI\\ComfyUI\`). Every \`{comfyuiDir}\` below stands for each directory in env.comfyuiDirs.

## TTS-Audio-Suite voice-library lookup (refresh the snapshot first, then query; do not read plugin source)

The "🎭 Character Voices" node (class \`CharacterVoicesNode\`) in TTS-Audio-Suite (\`{comfyuiDir}/custom_nodes/tts_audio_suite\`) picks a voice from the \`voice_name\` dropdown. Voice data exists in **two copies, and both go stale**: TTS's own process cache (affects the dropdown and object_info COMBOs) and the dsh-comfyui workflow parameter snapshot (each parameter's \`options\` / \`numberKind\` / min/max/step copied into \`~/.dsh/data/dsh-comfyui/workflows.json\` at save time, **never auto-updated afterwards**). **Correct flow: refresh first, then query** — querying without refreshing may give a list inconsistent with the snapshot, and new voices will be rejected by pre-run validation.

**Step 1: refresh** (once, after new voices / node definitions changed):

- **\`comfyui_workflow action: refresh { id: "<workflow id>" }\`** (one id at a time) does two things in one step: ① forces TTS-Audio-Suite to rescan the voice library (\`?refresh=1\`, invalidates the process cache so object_info COMBOs use the new list) ② reads the latest object_info and updates all parameters' options / numberKind / min/max/step for that workflow, saving the **snapshot back**. Only object_info-derived fields move: the parameter set (including user-added advanced parameters in the panel) and defaults are preserved. The returned \`changed\` lists the parameter names that actually changed; unchanged ones are left alone. After refreshing, \`action: list\` shows the new options.
- **For other plugins/programs to refresh**: same-origin route \`POST /comfyui/workflows/refresh-params\`, body \`{ "id": "<workflow id>" }\`, returns \`{ ok, parameters, changed }\`. After designing a voice successfully, call it once automatically; no need to re-save the workflow.
- Consequence of not refreshing: the new voice's key is not in the old options, so passing it via \`action: run\` is rejected by pre-run validation ("parameter ... is not one of the allowed options") — **this is a stale snapshot, not an unrefreshed voice library**. The \`voice_name\` dropdown is unaffected (it reads object_info live); new voices appear in the panel immediately.
- Note the distinction: hitting \`?refresh=1\` on its own (or having the user press R on the ComfyUI canvas) only rescans **TTS's process cache** and does **not** update saved workflows' snapshots; to bring the snapshot up to date you must use \`action: refresh\` / refresh-params on the corresponding workflow.

**Step 2: query** (after refreshing, get the current list / metadata / previews):

1. **HTTP query (preferred, while ComfyUI is running)** — the plugin mounts a voice-library endpoint on the ComfyUI server; it returns the full key list shown in the dropdown (the first is \`"none"\`, meaning "no voice, pass audio directly"):
   - PowerShell: \`Invoke-RestMethod "{baseUrl}/api/tts-audio-suite/voice-library"\`
   - curl: \`curl -s "{baseUrl}/api/tts-audio-suite/voice-library"\`
   - Replace \`{baseUrl}\` with env.baseUrl. When skipping step 1 you can also append \`?refresh=1\` to the URL to force a TTS rescan (affects only the TTS cache, not the snapshot).
   - Single metadata: \`{baseUrl}/api/tts-audio-suite/voice-info?voice_name=<key>\`; preview audio: \`{baseUrl}/api/tts-audio-suite/voice-preview?voice_name=<key>\`.
2. **Filesystem query (when you need voice filenames/paths)** — voice-library directories (by priority):
   - \`{comfyuiDir}/models/voices\` (primary; put new voices here)
   - \`{comfyuiDir}/models/TTS/voices\`
   - \`{comfyuiDir}/custom_nodes/tts_audio_suite/voices_examples/\` (plugin-shipped examples)
   - Extra directories mapped under \`voices:\` in \`{comfyuiDir}/extra_model_paths.yaml\` (ComfyUI directories can be mapped; count all of them).
   - List voices (PowerShell): \`Get-ChildItem "{comfyuiDir}\\models\\voices" -Recurse -File | Where-Object { $_.Extension -match '\\.(wav|mp3|flac|ogg)$' }\`

**Rule**: one voice = an audio file (.wav/.mp3/.flac/.ogg/.m4a/.aac) + a same-named reference text (\`same-name.reference.txt\` preferred, else \`same-name.txt\`, non-empty), and **only when both exist** does it appear in the \`voice_name\` dropdown and HTTP endpoint. The dropdown key is the relative path (e.g. \`voices_examples/xxx.wav\`, \`TTS/voices/xxx.wav\`, \`subdir/voice.wav\`); use that key as-is when filling workflow parameters — do not invent one. To add a voice: copy the audio + same-named txt into \`{comfyuiDir}/models/voices\`, then do step 1's refresh.

## Canvas analysis rules (deciding whether a graph is "multiple workflows")

1. **groups (visual groupings) are just rectangles**: title + bounding box, no execution semantics. Do not treat them as workflow boundaries.
2. **Fast Groups Bypasser (rgthree) does not serialize activation state**, but \`mode: 4\` on nodes inside a bypassed group is a reliable signal — conversion/extraction **skips these nodes automatically** (i.e. blocks that were not active at save time enter no run workflow).
3. **Executable unit = connected component** (the set of active nodes connected via links). Dangling single nodes (Markdown, Fast Groups Bypasser, unconnected Primitives, and other UI-only/unused nodes) are ignored automatically.
4. Decision:
   - **1 connected component** → one complete workflow (multiple groups are just its functional blocks); extract directly.
   - **Multiple connected components** → several independent flows lie on the canvas (the user may just have grouped them for testing). **Do not decide on your own**; hand the choice to the user (panel extract options): whole (merge into one, all executed at run time) / per component (recommended, one run workflow per independent flow) / main flow only (the largest component, usually the current test block). The panel's extract options first show an analysis report (each component's node count and groups).
5. When the user says "run the X I saved in ComfyUI": if list shows the graph as \`extracted: false\`, **first tell the user it needs to be "Extracted" in the panel** (explaining the whole / per-component / main-flow choices); do not try to run the graph itself. If already extracted, run via the libraryId in \`derived\`.

## Graph → API extraction: technical rules

- **Node id references must be strings**: \`[String(nodeId), outputSlot]\`. The server does a dict lookup by string key (execution.py validate_inputs); numeric references cause KeyError.
- **Widget order comes from the graph node's own \`inputs\` array** (entries carrying \`widget.name\`, in array order), not from object_info order: it includes dynamic child widgets (e.g. TextGenerate's sampling_mode.temperature) and **linked widgets still occupy their widgets_values position**. object_info is only used to insert \`control_after_generate\` after INT inputs.
- **\`control_after_generate\` placeholder**: INT inputs named \`seed\`/\`noise_seed\` (or explicitly declared \`control_after_generate\` in object_info) get a post-generation control dropdown rendered on the frontend; its value occupies one widgets_values slot but has no API input — extraction consumes the value but must not write it into the workflow, otherwise every subsequent widget is misaligned (e.g. TTS-Audio-Suite's seed followed by "fixed").
- **Object-typed widgets_values** (e.g. VHS_VideoCombine) are read by name, skipping internal state (objects with \`hidden\` like \`videopreview\`).
- **Reroute and bypass (mode 4) nodes are pass-throughs**: the output follows the first wired input.
- **Virtual nodes are rewired before conversion** (analysis and conversion share the same rule): KJNodes \`SetNode\`/\`GetNode\` pair by name — the \`GetNode\`'s output connects to the upstream of the same-named \`SetNode\` (when several share the name, take the one with the largest \`order\` smaller than it); consumers with no matching \`SetNode\` stay unconnected; rgthree \`Mute / Bypass Relay\`/\`Repeater\` links only propagate mute/bypass state, not data — discard them directly (the state is already stored in each node's \`mode\`).
- **DynamicCombo V3 stays flat**: the master input's value is the selected option key string; child controls sit beside it as \`masterName.childName\` (e.g. \`codec: "auto"\`); do not wrap as \`{ key, inputs }\` — the server reassembles it itself; wrapping never matches and the node dies at execute() with a missing parameter.
- **Subgraph instances are not supported**: when encountered, ask the user to convert the subgraph back to regular nodes in ComfyUI before extracting.
- **Unregistered UI-only nodes**: if it is a \`Primitive*\`, inline its first widget value; if it has outputs in use and is not Primitive → error.
- **Out-of-bounds output slots** (a saved graph where SaveImage claims 2 outputs but the server only has 1) → drop the reference and warn.
- **Missing required inputs** (not in required, and not lazy/template type) → a clear error (the source graph itself is broken); do not produce a workflow that "converts but cannot run". Inputs with \`COMFY_AUTOGROW_V3\`/\`template\`/\`lazy\` are exempt.
- Each extracted run workflow is validated with \`POST /prompt\` first (nodeErrors must be empty) to count as success.

## Adjustable parameters (passing values at run time)

- Each run workflow carries a set of **adjustable parameters**: extraction auto-detects prompt (text inputs), resolution (EmptyLatentImage width/height), steps (KSampler.steps), seed (KSampler.seed, random by default each time), duration (duration/length/frames), aspect ratio (aspect_ratio), and loader nodes (LoadImage/LoadVideo/LoadAudio image/video/audio files — the value is the file name on the server; the user can drag-upload in the panel). Detection is by **generic rules** (upload markers / file lists in object info), not per node; inputs the generic rules miss (like MiniMaxH3's combined media_state JSON loader) should be added manually in the panel's "Advanced parameters" — values shaped like a media JSON array are split into \`media_1/media_2/...\` reference slots automatically (values are subdirectory file names; empty string = remove that reference slot). cfg/denoise and model selection are excluded; the workflow keeps its original values. Users can change defaults / random toggles in the panel's "Edit workflow", or add advanced parameters (any node input).
- The \`parameters\` field of each workflow in \`action: list\` is the structured parameter list (\`name\` is the English parameter name, \`label\` is the human-readable meaning, \`default\` is the default value, \`random\` marks whether it randomizes each time, \`numberKind\` is the numeric type (\`int\` accepts integers only; decimals are rounded; \`float\` accepts decimals like cfg 7.5, denoise 0.6; absent means the type is unknown, pass decimals), \`options\` is the dropdown list, \`upload\` is the loader upload type). Read it before using. Parameters with \`options\` must take a value from the list (loaders can pick from the file list, or prompt the user to drag-upload a new file).
- At run time you can pass \`parameters\` overrides: \`{"prompt": "new prompt", "seed": 42, "width": 1024}\`. Explicit values beat defaults; seed-type parameters randomize per the workflow settings when omitted (different each time). **Parameter names must use the English \`name\` from the list** (prompt/seed/width/height/steps/duration/aspect_ratio); do not invent names; parameters with \`options\` must take a value within the list or they error.\`aspect_ratio\`-style linked parameters: passing only it makes \`size\` follow the new ratio's default size automatically (e.g. 9:16 → 768×1376); you can also pass \`size\` explicitly to override.

## Load area and uploads (for the user)

- At the **bottom** of the workflow-library page (run theme) there is a **load area** (like ComfyUI's LoadImage node): it is made of **load slots** (one slot fills the panel; several are laid out at equal width). Clicking any slot opens the picker — a "All / Imported / Generated" tab bar on top plus a paste/click upload zone on the right, with a waterfall list below. Users can add slots with "Add slot", remove one via the × at the slot's top-right corner on hover, and use the picker's first "None" tile to empty a slot while keeping it.
- **Imported** = images/video/audio in the ComfyUI input directory usable by loader nodes; **Generated** = results of previous workflows (output; copied into input on selection); **All** = both merged. Video and audio can be played in place in the picker.
- Paste/upload a new image → auto-upload → the list refreshes to show it; clicking a file name puts it into that slot and closes the picker (pixel size is recorded **at upload** and shown under the preview; old images without a record show no size and do not participate in size matching).
- **Default source media**: filled load slots are assigned in order to the workflow's loader parameters that were **not explicitly passed** — slot 1 → first image parameter, slot 2 → second, video/audio parameters take their same-kind slots; explicit values always win, and parameters with no matching slot keep the workflow's original value.\`comfyui_workflow action: list\` output includes \`loadArea\` (\`slots\` count, \`loaded\` media count, \`items\` file list) — **check it to know how much media the user loaded**; do not ask repeatedly. The same applies to \`[Uploaded image: filename]\` markers in chat messages: the file was already uploaded to the ComfyUI input directory by the "attach image" button and is ready to use; file names carrying a \`subfolder/\` prefix are passed as-is.
- **Automatic size matching**: the panel records pixel sizes on upload/load. For image-to-image runs where **width/height were not explicitly passed**, the plugin uses the source image's resolution as the output size (explicit values win). The size of the selected image (e.g. \`1024×768\`) is shown under the load-area preview.
- **Naming and dedup**: uploaded files are named by content hash (\`originalName_shortHash.ext\`, e.g. \`image_3f9a2b1c0d.png\`); re-uploading the same image reuses the existing file (no \`image(1).png\` duplicates).
- After selecting a **Generated** image, the plugin automatically copies it from output to the input directory (same name) so loader nodes can use it.

## Workflow skill packs (who writes them, when to read them)

Some workflows have many parameters, many pitfalls, or come with a full set of style prompts. These can carry a **skill pack**: a \`SKILL.md\` (when to use / key parameters / cautions) plus sub-directories (\`references/\` \`scripts/\` \`assets/\` \`templates/\` \`agents/\` …, custom directory names allowed, one level only), stored under the skill-pack directory \`skills/<dirName>/\`. The user writes them in the panel, **and you can write them yourself with the \`comfyui_skill\` tool** (below).

Two tools are involved; do not mix their scopes:

- **\`comfyui_workflow\` (the workflow tool)**: manages the "workflow library" layer.\`action: list\` lists the **entire library** (all API workflows + ComfyUI-side graph workflows + load area + env); **it is not a skill-pack listing** — a workflow with a pack just gains one line \`Skill pack: <summary>\` (file count and whether required); the body does not come in.\`action: skill { id }\` fetches **one** workflow's \`SKILL.md\` body. **There is no "list all skill packs" command**: discovery is via the one-line summary in list; details must be fetched per id.
- **\`comfyui_skill\` (the skill-pack tool)**: manages the "inside of one skill pack" layer. Every action carries \`workflow_id\` and operates on **that one** workflow's pack only. Its \`action: list\` shows that pack's internal structure (files/sub-directories/sizes), **not** a library-wide pack overview.

Skill packs are **not resident in the conversation**; fetch them on demand in three steps — do not skip ahead or read everything early:

1. In \`comfyui_workflow action: list\`, a workflow with a pack gains the line \`Skill pack: <summary>\` (required ones read \`Skill pack (must read before running)\`). This is your only clue — one sentence.
2. After you decide to use this workflow and before running, \`comfyui_workflow action: skill { id: "<workflow id>" }\` fetches the \`SKILL.md\` body and the pack's **absolute directory**. The return is a \`<skill_content>\` block; follow the instructions inside.
3. Only when the body names a reference document (e.g. \`references/styles.md\`) do you open it with a file-reading tool using "Base directory + relative path".\`assets/\` may hold reference images (png/jpg, etc.) — read them on demand too (with an image-reading file tool). **Do not** read the whole directory up front — files are split so you fetch only what you need.

Rules:
- **"Must read before running" is a boolean switch**: ticked in the panel's skill-pack editor, or set with \`comfyui_skill action: require { workflow_id, required: true }\` (\`false\` turns it off). It **only blocks the \`action: run\` path**: calling \`action: run\` in this session without having read the workflow's pack is refused outright, with the error pointing at \`action: skill { id }\` first; \`list\` / \`skill\` / \`get\` / \`refresh\` are unaffected.
- **The gate is per session × workflow**: reading once clears it — \`action: skill\`, or \`comfyui_skill action: read\` on \`SKILL.md\`, both count. Runs in the same session afterwards are not gated. **A new session re-gates it** (the state lives on the current agent session, not across sessions or workflows), so an agent in another session running the same workflow must read it first as well.
- A skill pack is **written by the user for this workflow** and outranks your generic experience: when it conflicts with this skill's generic rules, the pack wins.
- A workflow without the \`Skill pack:\` line has no pack — do not guess or call \`action: skill\` (it errors with "no skill pack"). To create one, use \`comfyui_skill action: enable\`.

### Maintaining packs yourself (\`comfyui_skill\` tool)

Packs are not read-only:\`comfyui_skill\` lets you view and author a workflow's pack; every action carries \`workflow_id\`. Per action:

- \`list\` — view the pack's internal structure: file list (with byte sizes), sub-directories (including empty ones), summary, whether required, absolute directory. The pack must exist (a missing one errors "no skill pack").
- \`read { path }\` — read one file (e.g. \`references/styles.md\`); files over 40k characters are truncated and marked. Reading \`SKILL.md\` clears the must-read gate exactly like \`comfyui_workflow action: skill\`.
- \`write { path, content }\` — **create or fully overwrite** a file. Writing to an existing file loses its original content: use it for new files or files you just created; use \`append\` to add to an existing file. Writing \`SKILL.md\` with a \`summary\` parameter updates the one-line summary in list.
- \`append { path, content }\` — append to the file's end (auto blank-line separation), leaving existing content alone. Use it for pitfall conclusions and supplementary notes.
- \`mkdir { name }\` — create one level of sub-directory (\`references\` / \`scripts\` / \`templates\` …, customizable; letters/digits/CJK/underscore/dash). mkdir then write inside is more reliable than writing \`dir/file\` directly.
- \`rename { path, to }\` — rename/move.\`to\` as a bare file name = rename within the same directory;\`to\` with a \`subdir/\` prefix = move into that directory.\`SKILL.md\` cannot be renamed.
- \`delete { path }\` — delete one file.\`SKILL.md\` cannot be deleted; destroying the whole pack has no corresponding action — that is the user's call in the panel.
- \`enable\` — **create a pack for a workflow that has none**: makes the directory and writes a skeleton \`SKILL.md\` (auto-listing all of the workflow's adjustable parameter names as placeholders). **This is the only creation path**: every other action requires the pack to exist; without it, \`write\` / \`mkdir\` / \`read\` etc. all error "no skill pack".
- \`require { required: true/false }\` — toggle "must read before running"; the same boolean as the panel tick, see the rules above.

When to write:
- **After running a workflow and hitting a pitfall** (a parameter combo fails, a voice does not exist, video must be async, etc.), use \`append\` to add the conclusion to \`SKILL.md\`'s cautions, or write it into a topic file under \`references/\`. Next time (even in another session) you will not have to rediscover it.
- **When you have distilled reusable, structured content** (a style-prompt collection, templates, parameter recipes), \`mkdir\` a directory (e.g. \`templates/\` or \`prompts/\`), \`write\` into it, then add one line in \`SKILL.md\` pointing at it.
- **When a workflow has no pack** but you judge it deserves one:\`action: enable\` creates the directory and writes a skeleton (auto-listing all adjustable parameter names); fill it in — do not overwrite the skeleton wholesale.

Writing requirements:
- \`SKILL.md\` is **loaded whole into context**, so it should hold only "how to choose, how to fill, where it breaks" and a table of contents pointing at the other files. Put long structured content in sub-directories so your future self reads it on demand.
- When writing \`SKILL.md\`, pass a \`summary\` parameter (one sentence saying when to use this workflow) — that sentence is the only one-line clue in list.
- Write only **verified** conclusions; do not state guesses as facts. Packs are treated as authoritative by every later session.
- Do not rewrite or delete user-authored content at random; prefer \`append\`. Destroying the whole pack has no corresponding action — that is the user's call in the panel.

## The correct way to run a workflow (token-saving)

1. **Understand via list**: \`comfyui_workflow list\` shows each workflow's name, description, **tags** (image-to-image / text-to-image / text-to-video / image-to-video / reference-to-video / text-to-audio / reference-to-audio, etc., customizable) and the \`parameters\` list (including meaning labels and defaults). Pick the workflow that fits the current task. The panel lets you filter the list by tag.
2. **Read the pack first if there is one**: a workflow with a \`Skill pack:\` line in list has a user-written manual (when to use, how to fill parameters, which steps break). After picking it and before running, read the body in with \`comfyui_workflow action: skill { id }\` and follow it. Ones marked "must read before running" are refused by run if unread. Workflows without the line skip this step.
3. **Parameter decisions**: rely only on the list's parameters (keys in English); pick/override suitable values — **no need to inspect the workflow's internal structure**.
4. **Run with a direct call**: \`comfyui_workflow run { id, parameters: {...} }\`. The plugin pulls the saved JSON from the library and submits it to ComfyUI; **you pass only parameter overrides and never output or copy the full workflow JSON** (that wastes tokens).
   - **Parameters**: keys match list exactly (typos are rejected); omitted parameters use defaults. Fill prompt-type parameters from the user's request; improvise from the request when unspecified.
   - **Video/audio workflows always use \`mode: "async"\`**: generation takes minutes; sync waits time out and aborts (reports generation aborted). async returns a job id immediately — **do not block after starting** (no wait: true on the returned job, no sleep/poll): tell the user it is generating and **end this reply**; finish other independent work first if you must. When the background job completes the system notifies and wakes you; then call job_output once (no wait) to collect the result.
   - **The result is final and the URLs are already right**: do not re-check status, and do not look up assets/history or assemble URLs.
   - **After generation finishes (sync, async job_output, run_code — all the same)**: state in one sentence what was generated (based on "Prompt used" in the result), then paste the Markdown lines from the result **into the reply as-is** (images are \`![image 1](url)\`; video/audio are links) — that is where the user sees the result.
   - Images can be sync (usually under a minute); when in doubt about the output type, use async too.
- \`action: get\` is for **diagnosing/inspecting** workflow content only (it prints the full JSON and costs many tokens); it is **not** the run path.

## Panel operation guidance (relay to the user)

- The panel's "Saved on ComfyUI" section lists each graph workflow: unextracted ones show "Not extracted"; extracted ones show the list of derived run workflows.
- Click **Extract**: a single component extracts directly; multiple components open the options (analysis report + whole / per component / main flow). You can also click **View** to see the node list and JSON.
- The user can skip graphs entirely and create a new workflow in the plugin library by pasting API JSON (or choosing a .json file) as a run workflow.
- Toolbar "Export presets / Import presets": export packages the selected run workflows together with their parameters and skill packs into one .zip; import creates the selected pack workflows as **new workflows** (name clashes get an "(imported)" suffix automatically) and never overwrites library entries; skill packs are restored too (oversized files are skipped with a notice). Point users to these buttons when they want to move/backup/share workflows between machines.
`,
};
