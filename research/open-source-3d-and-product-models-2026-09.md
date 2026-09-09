# Open-Source Models for Product Imagery & 3D Generation — Research Notes

**Researched:** September 2026. All license/VRAM/demo claims verified against primary sources (official HuggingFace model cards, GitHub repos, vendor announcement pages). Numbered sources at the bottom; bracketed numbers like [1] cite the source for each load-bearing claim.

**Author's context baked in:** Windows, $0/month budget, HF account with free monthly Inference credits, C: drive has only ~2.5 GB free (everything below needs model downloads measured in GB, so cache relocation to another drive is mandatory — see "Recommended setup").

---

## Important clarification first: Ollama is the wrong tool here

**Ollama only runs GGUF text models (LLMs). It cannot run diffusion image models (SD/FLUX/Qwen-Image/Z-Image) or 3D generation models at all** [55]. If your image results have been "not the best," part of the problem may be that you've been using whatever Ollama or the plain HF Inference API exposes rather than a proper diffusion stack.

The right local tools are:
- **ComfyUI** (node-based, Windows portable build, zero cost, day-0 support for all the new models below) — the recommended option.
- **diffusers** (Python library) if you prefer scripting.

Both are free and run the same open weights from HuggingFace.

---

## TL;DR — Top picks

### Product / SaaS-style imagery (text-to-image + image editing)
1. **Z-Image Turbo (Alibaba Tongyi)** — best photorealism-per-watt. 6B params, Apache 2.0 (fully commercial), 8 steps, fits 16 GB VRAM, sub-second on datacenter GPUs, strong English+Chinese text rendering. Day-0 ComfyUI support. **This is the single best "upgrade" for photorealistic product shots on a budget.** [5][7]
2. **Qwen-Image-Edit-2511 (Apache 2.0, 20B)** — the killer app for product content: multi-image editing with **explicit "person + product" composition support, product identity preservation for posters, batch industrial product design, material replacement, text/font/logo editing baked in**. The most useful open model for e-commerce-style product imagery. [3][4][14]
3. **FLUX.2 [klein] 4B (Apache 2.0, Jan 2026)** — unified generation + single/multi-reference editing, fits ~8 GB VRAM, permissive license. Choose it over klein-9B/dev, which are non-commercial. [8][13]

Background relighting for product photos: **Qwen-Image-Edit-2511** (re-place product on any background, preserve identity) [3] or **IC-Light v2** (Flux-based relighting; non-commercial license) [24][25].

### True 3D generation (image → GLB/OBJ mesh)
1. **TRELLIS.2-4B (Microsoft, Dec 2025/Jan 2026)** — the new quality leader: image → fully textured mesh with **PBR materials (basecolor/roughness/metallic/opacity) at 512³–1536³**, MIT license for code AND weights, free official HF Space. Local run needs 24 GB GPU + Linux; the free Space is the zero-GPU path. [26][27][28]
2. **Hunyuan3D-2 / 2.1 (Tencent)** — best free hosted workflow: official HF Space takes a single image, multiple views, or text and outputs a downloadable OBJ/GLB. Local: 6 GB VRAM for shape-only, ~16 GB with textures; Windows supported. License is Tencent's community license — non-commercial by default, commercial use requires applying to Tencent. [30][31][32]
3. **TripoSR (MIT)** — the lightweight fallback: single image → mesh in seconds on ~6 GB VRAM, permissive license, but visibly dated quality vs. the two above. Good for quick drafts. [35][36]

---

## A. Text-to-image / image-edit models for product imagery & 3D-looking renders

### Comparison table

| Model | Params | License (commercial?) | VRAM | Approx. download | ComfyUI / HF API | Why it matters for product shots |
|---|---|---|---|---|---|---|
| **Z-Image Turbo** (Tongyi-MAI/Alibaba) | 6B | Apache 2.0 ✅ | fits 16 GB [5] | ~12 GB BF16 (est.) | ComfyUI day-0 [7][53]; diffusers `ZImagePipeline` [5] | Best-in-class photorealism at 8 steps; bilingual text rendering; SOTA among open models in Alibaba's Elo evals [5] |
| **Z-Image** (base, non-distilled) | 6B | Apache 2.0 ✅ | ~16 GB+ | ~12 GB | ComfyUI (day-0 support incl. non-distilled) [7] | Foundation model for LoRA training/finetuning [6] |
| **Qwen-Image-Edit-2511** | 20B (MMDiT) | Apache 2.0 ✅ [3] | 24 GB BF16; ~10–16 GB with GGUF/Nunchaku quants (community) | ~40 GB BF16; ~11–15 GB GGUF Q4 (est.) | ComfyUI native + docs workflow [14][54]; diffusers `QwenImageEditPlusPipeline` [3] | **Person+product composition, product identity preservation, industrial design + material replacement, font/color/text editing, ControlNet depth/edge/keypoints** [3] |
| **Qwen-Image** (base) | 20B | Apache 2.0 ✅ [1][4] | ~24 GB BF16 | ~40 GB (est.) | ComfyUI; HF Inference Providers [1] | Best open text rendering (posters, ads); 87 adapters / 41 finetunes on HF [2] |
| **FLUX.2 [klein] 4B** (BFL, Jan 15 2026) | 4B | **Apache 2.0 ✅** (4B + base) [8] | ~8 GB ("RTX 3090/4070 and up") [8] | ~8 GB (est.) | ComfyUI [13]; HF | Unified t2i + single/multi-reference editing; 4-step distilled for production, 50-step base for LoRA training [8] |
| **FLUX.2 [klein] 9B** | 9B | FLUX Non-Commercial ❌ | ~12–16 GB (est.) | ~18 GB (est.) | ComfyUI [13] | Better quality; KV variant best for multi-reference editing [8] |
| **FLUX.2 [dev]** (Nov 25 2025) | 32B | FLUX.2-dev Non-Commercial ❌ [10] | H100-class full; RTX 4090 with HF-quantized weights + remote text encoder [8] | ~64 GB BF16 (est.) | ComfyUI [13]; HF (gated) | Quality benchmark; slow even with Turbo LoRA [8] |
| **FLUX.1 Kontext [dev]** | 12B | Non-commercial weights; **outputs usable commercially** (per card) [11] | ~12–16 GB (community) | ~24 GB BF16 (est.) | ComfyUI ✅ [11]; diffusers | Instruction-based editing, object/character reference, multi-turn edits with low drift; 242 adapters on HF [11] |
| **FLUX.1 schnell** | 12B | Apache 2.0 ✅ [12] | ~12 GB (community) | ~24 GB BF16 (est.) | ComfyUI; HF API | Fast 4-step generation; the permissive member of FLUX.1 |
| **HiDream-I1 (Full/Fast/Dev)** | 17B | MIT ✅ (transformer weights) [15][16] | ~24 GB full; ~9 GB community NF4 quant | ~34 GB BF16; ~8–9 GB NF4 (est.) | ComfyUI (community); HF | Strong quality + permissive MIT; heavy to run |
| **Lumina-Image 2.0** | 2.6B | Apache 2.0 ✅ [17] | ~6–8 GB (est.) | ~5 GB (est.) | ComfyUI (community); diffusers | Tiny, trainable, decent base — niche choice |
| **SANA / SANA 1.5 / SANA-Sprint** (NVIDIA) | 0.6B–1.6B | Early releases NVIDIA research-only; newer releases **NVIDIA Open Model License / Apache 2.0** (commercial OK) [18][20] | 0.6B runs on a 16 GB laptop GPU, <1 s per 1024² image [19] | 2–6 GB (est.) | ComfyUI (community); diffusers | Fast + tiny; up to 4096² output [18] |
| **SD 3.5 (Medium/Large/Large-Turbo)** | 2.5B–8B | Community License — **free commercial if revenue < $1M/yr** ✅ [21][22] | Medium ~8 GB; Large ~16 GB (community) | Medium ~5 GB; Large ~16 GB (est.) | ComfyUI; HF | Solid mid-tier; license is fine for a small creator |
| **SDXL 1.0** | ~3B (per HF card) [23] | CreativeML Open RAIL++-M ✅ [23] | **6–8 GB** (community consensus) | ~6.9 GB (est.) | Runs everywhere incl. HF Inference | The **LoRA ecosystem king** — CivitAI hosts hundreds of product-photography / isometric / claymorphism / studio-lighting LoRAs you can stack in ComfyUI |

### Notes on the standouts

- **Z-Image Turbo is the 2026 default for photorealistic products.** Official card: 6B params, Apache 2.0, Decoupled-DMD distillation, 8 NFEs, guidance_scale must be 0.0, "matches or exceeds leading competitors," fits 16 GB consumer VRAM with CPU offload available, strong EN/CN text rendering [5]. ComfyUI shipped day-0 native support and a tutorial workflow [7][53]. Weakness: smaller LoRA ecosystem than FLUX/SD so far [5]. Download note: the official checkpoint is ~12 GB BF16 (est.) — will NOT fit your C: drive.
- **Qwen-Image-Edit-2511 is purpose-built for your use case.** The 2509→2511 monthly iterations added: multi-image inputs officially framed as "person + product" and "person + scene" combos (1–3 images best), product identity preservation for poster editing, batch industrial product design, material replacement for industrial components, integrated community LoRA capabilities (lighting enhancement, new viewpoints), reduced image drift, and ControlNet depth/edge/keypoint support — all Apache 2.0 [2][3]. ComfyUI has a native workflow with official docs [14][54]. At 20B it's heavy: full BF16 ≈ 40 GB download; use GGUF/Nunchaku quantized versions for smaller GPUs (community conversions exist on HF).
- **FLUX.2 changed the landscape in 2026.** FLUX.2 [dev] (32B, Nov 2025) is non-commercial [8][9][10], but the **FLUX.2 [klein] family (Jan 15, 2026) gives away the 4B model under Apache 2.0**, runs in ~8 GB VRAM, and unifies text-to-image with single- and multi-reference editing (feed 1–3 product photos as reference). The 9B variants and dev are non-commercial — pick the 4B for commercial work [8]. ComfyUI supports the whole klein family [13].
- **Relighting/compositing for product photos:**
  - **IC-Light v2** (lllyasviel): Flux-based relighting models, 16ch VAE, native high-res; weights/demo non-commercial; HF Space demo available [24][25]. Use it to relight a cut-out product into any environment.
  - **Qwen-Image-Edit-2511** effectively replaces much of IC-Light's role: background replacement with product consistency is an explicit, trained capability, and it's Apache 2.0 (safe commercially) [3]. For a zero-budget commercial pipeline, prefer Qwen-Image-Edit-2511; keep IC-Light v2 for pure relighting looks.
- **SDXL is still worth keeping installed.** 6–8 GB VRAM, ~7 GB download, permissive license [23], and the deepest CivitAI LoRA ecosystem for stylized product photography, isometric 3D-looking renders, and claymorphism — often a LoRA on SDXL gives you the "3D SaaS illustration" look faster than prompting a bigger base model. All the 2025–26 models above (Z-Image, Qwen, FLUX.2, SD 3.5) are supported in ComfyUI and most are served via HF Inference Providers with your free monthly credits [52].

---

## B. True 3D generation (image-to-3D / text-to-3D → GLB/OBJ meshes)

### Comparison table

| Model | Org | Input | Output | License | VRAM (local) | Free hosted demo |
|---|---|---|---|---|---|---|
| **TRELLIS.2-4B** ⭐ (Dec 2025 / 2026 leader) | Microsoft | Image(s); shape-conditioned image for texturing | GLB mesh with **PBR textures (basecolor/roughness/metallic/opacity)**; 512³–1536³; MP4 render | **MIT (code AND weights)** [27] | **24 GB NVIDIA + Linux only** (verified A100/H100) [27][28] | HF Space demo shipped with repo [27][28] |
| **TRELLIS 1** | Microsoft | Image or text | 3D Gaussians (.ply), radiance fields, or **textured .glb** (mesh simplification + texture size options) | **MIT** (models + most code; 2 submodules differ) [26] | **16 GB min** NVIDIA; Linux-oriented (Windows "not fully tested," issue #3) [26] | Official Space: huggingface.co/spaces/Microsoft/TRELLIS [26][29] |
| **Hunyuan3D-2** (+ mini/Turbo/mv) | Tencent | Single image; multi-view (2mv); text (via API server) | trimesh → **glb/obj/other** | `tencent-hunyuan-community` (non-commercial default; commercial via Tencent application) [31] | **6 GB shape-only; ~16 GB shape+texture**; 2mini 0.6B runs on lighter setups; `--low_vram_mode` flag; Windows supported [30] | Official Space: huggingface.co/spaces/tencent/Hunyuan3D-2 [30][31] |
| **Hunyuan3D-2.1** | Tencent | Single image, multiple views, or text | Downloadable mesh (OBJ/GLB) | Tencent Hunyuan Non-Commercial/Community License by default; billed as "fully open-source" with training code + PBR model [30][32] | 10 GB shape / ~29 GB shape+texture (per Tencent's table) [30] | **Official Space: huggingface.co/spaces/tencent/Hunyuan3D-2.1** — upload image(s) or text, download mesh [32] |
| **Hunyuan3D-Omni** | Tencent | Image, **point cloud, skeleton, voxel** (multi-condition control) | 3D assets | Tencent Hunyuan Community License (commercial needs written Tencent approval) [34] | inherits 2.1 architecture (est. 20 GB+) | — |
| **TripoSR** | Stability AI + Tripo AI | Single image | Mesh (OBJ/GLB), adjustable texture resolution | **MIT** [35][36] | **~6 GB default; tunable down via `--chunk-size`** [36] | Community Spaces; extremely light |
| **SPAR3D (Stable Point Aware 3D)** | Stability AI | Single image → **editable point cloud** → mesh | **GLB**, settable texture res, tri/quad remesh | Stability AI Community License; **gated weights** (request access) [37][38] | **10.5 GB default; ~7 GB low-VRAM mode; ~6 GB via `run.py` options**; Windows experimental [37] | Stability Developer Platform API; community Spaces |
| **InstantMesh** | Tencent ARC | Single image (via Zero123++ multiview) | Mesh (OBJ/GLB) | Code Apache 2.0; **model weights non-commercial** (Tencent research terms) [39] | ~8 GB+ (community; OOM quirks under 11 GB) [39] | Community Spaces |
| **Direct3D-S2** | DreamTechAI / NJU | Single image | High-res mesh (sparse volumes, up to 1024³) | **MIT** [40] | **~10 GB @ 512³; ~24 GB @ 1024³**; RTX 30+ [40] | HF Space: wushuang98/Direct3D-S2-v1.0-demo [41] |
| **PartCrafter** | PKU/wgsxm (academic) | Single RGB image | **Multiple separately-editable parts** (compositional meshes) | Research-oriented — check repo LICENSE before commercial use [42] | ~16 GB+ (est., research rig) | Community Spaces |
| **Step1X-3D** | StepFun AI | Single image | Geometry (TSDF-DiT) + texture stages | **Apache 2.0** [43][44] | ~16 GB+ (est.) | ComfyUI wrapper (community) [43] |

### Notes — who leads in 2026

- **TRELLIS.2 is the biggest 2026 landscape-changer.** Microsoft's successor to TRELLIS (paper Dec 2025, arXiv 2512.14692) adds a new field-free "O-Voxel" sparse structure (handles open surfaces, non-manifold geometry, internal structures), a 16× downsampling sparse 3D VAE, and — crucially for product visualization — **native PBR material + opacity output**, at 512³ in ~3 s up to 1536³ in ~60 s on an H100. MIT licensed for both code and weights, with a hosted HF Space demo for GPU-less use [26][27][28]. Caveats: local install needs 24 GB VRAM and is Linux-only; your Windows box should use the Space (or run TRELLIS 1 instead).
- **Quality leaders for "product photo → usable 3D model" today: (1) TRELLIS.2-4B, (2) Hunyuan3D-2.1/2.5 line.** Community consensus through 2026 has coalesced on exactly these two families: TRELLIS(.2) for geometry quality and permissive licensing, Hunyuan3D for texture fidelity and the best free hosted demo [26]-[32].
- **Hunyuan3D is the best free hosted workflow:** the official Space at huggingface.co/spaces/tencent/Hunyuan3D-2.1 takes a single image, several views, or a text description and gives you a downloadable mesh — genuinely usable with zero local GPU [32]. Watch the license: Tencent's community license is non-commercial by default; commercial use requires applying to Tencent [30][31][34]. If commercial safety matters and you self-host, MIT-licensed TRELLIS/TRELLIS.2/TripoSR/Direct3D-S2 are the clean options.
- **Lowest-VRAM paths:** TripoSR (~6 GB, tunable lower) [36] → SPAR3D low-VRAM (~6–7 GB, plus you can hand-edit the intermediate point cloud to fix the unseen back side before meshing) [37] → Hunyuan3D-2mini shape-only (6 GB; add textures later on a cloud Space) [30].
- **Everything outputs GLB/OBJ** (TRELLIS exports .glb; Hunyuan3D returns a trimesh you save as glb/obj; SPAR3D writes .glb) — all importable into Blender, which is also free [26][27][30][37].

---

## C. Hosted SaaS products (for comparison) & free-tier hosted inference

### 3D SaaS

| Service | Free tier | Export formats | Commercial use on free tier | Notes |
|---|---|---|---|---|
| **Meshy** | 100 credits/month, auto-reset; download cap ~10 models/month on latest engine [45] | FBX, OBJ, GLB/glTF, STL, USDZ [45] | Yes but **CC-BY 4.0 (attribution required)**; full rights on Pro ($20/mo) [45] | Best-known; paid tiers unlock more |
| **Tripo AI** (by VAST — same team as TripoSR) | ~200–300 credits/month (sources vary; check current pricing page) [46] | OBJ, GLB, FBX, STL, 3MF, more (paid unlock full formats) [46] | **No — free plan explicitly non-commercial**; commercial from ~$19.90/mo [46] | Fast, good quality |
| **Rodin / Hyper3D** (Deemos) | Small trial allowance (~10 credits); $1.5/credit or ~$30/mo [47] | Standard mesh formats incl. GLB/OBJ/FBX (varies) | Per paid plan terms [47] | Widely regarded as the top commercial-quality closed model; also sold via fal.ai API |
| **Luma Genie** | — | — | — | **Effectively discontinued** — Luma pivoted to video (Ray/Uni); Genie no longer a prominent offering [48] |
| **Spline AI** | 3D design tool is free; **AI 3D generation requires Super plan (~$20/mo)** [49] | glTF-ish web exports | Per plan | More a design tool than a generator |

**Verdict:** For $0, the **free official HF Spaces (TRELLIS, Hunyuan3D-2.1)** beat all SaaS free tiers — no credit meter, no attribution requirement (TRELLIS MIT outputs), no forced non-commercial terms (except Tencent's, pending application) [27][29][32].

### Free-tier hosted inference for the image models

- **HF Inference Providers (your current credits):** free accounts get **$0.10/month** in credits usable across providers (fal, Replicate, Together, etc.); PRO ($9/mo) raises this to roughly $2/month plus higher rate limits [52]. Fine for testing Z-Image/Qwen prompts, not for batch production.
- **fal.ai:** no recurring free tier — one-time promo credits for new accounts, then prepaid pay-per-use [50].
- **Replicate:** pay-as-you-go; small one-time sign-up allowance and a curated set of free-to-run models; no monthly free credits [51].
- **HuggingFace Spaces (ZeroGPU):** many community demos of the models above run free in-browser — often the cheapest way to iterate before committing disk/GPU locally.

---

## Recommended setup for your machine (Windows, $0, 2.5 GB free on C:)

### Step 0 — free disk space is your blocker
Your C: drive (~2.5 GB free) cannot hold ANY of these models. Mitigations:
1. Install ComfyUI portable to a drive with space (e.g., `D:\ComfyUI`).
2. Point the HuggingFace cache to that drive before downloading anything:
   - `setx HF_HOME "D:\hf_cache"` (and `setx HF_HUB_CACHE "D:\hf_cache\hub"`)
3. ComfyUI models live inside the ComfyUI folder (`models/checkpoints`, `models/unet`, `models/loras`), so installing it off C: solves both.

### Step 1 — product imagery (image path)
- **Install ComfyUI** (Windows portable, free) [7].
- **Download Z-Image Turbo** (Apache 2.0, ~12 GB, runs on 16 GB VRAM; Comfy-Org repack available) → your photorealistic product-shot base [5][7][53].
- **Download Qwen-Image-Edit-2511 GGUF/Nunchaku quant** if VRAM < 24 GB (~11–15 GB download) → product-on-model composites, background replacement, poster text edits [3][14][54].
- **Add FLUX.2 [klein] 4B** (Apache 2.0, ~8 GB VRAM) if you want multi-reference product consistency with lighter hardware [8][13].
- **Keep SDXL + a couple of CivitAI product-photo/isometric LoRAs** as the 6–8 GB-VRAM fallback with the biggest stylized-LoRA ecosystem [23].
- **Relighting:** do it with Qwen-Image-Edit-2511 (commercial-safe) [3]; IC-Light v2 only for personal work (non-commercial) [24][25].

VRAM decision table:

| Your GPU VRAM | Realistic local image stack |
|---|---|
| 6 GB | SDXL (+ product LoRAs), SANA 0.6B |
| 8–12 GB | FLUX.2-klein-4B, Z-Image Turbo GGUF/FP8 quants, FLUX.1 schnell |
| 16 GB | Z-Image Turbo full, klein-9B (non-commercial), FLUX.1 Kontext quantized |
| 24 GB+ | Qwen-Image-Edit-2511 BF16 (or quant at 12–16 GB), FLUX.2-dev quantized |

### Step 2 — true 3D (mesh path)
1. **Zero-GPU (start here):** use the free official HF Spaces —
   - TRELLIS (MIT, textured GLB out): huggingface.co/spaces/Microsoft/TRELLIS [29]
   - Hunyuan3D-2.1 (single image/multi-view/text → OBJ/GLB): huggingface.co/spaces/tencent/Hunyuan3D-2.1 [32]
2. **Local (needs another drive + GPU):**
   - ≤ 6 GB VRAM: **TripoSR** (MIT, ~6 GB VRAM) for drafts [35][36]
   - 10–16 GB VRAM: **Hunyuan3D-2** (shape-only at 6 GB; full shape+texture ~16 GB; Windows supported) [30], **SPAR3D** (7–10.5 GB, editable point cloud) [37], **Direct3D-S2 @512³** (~10 GB, MIT) [40]
   - 24 GB + Linux (or WSL2 caveats): **TRELLIS.2-4B** for PBR-quality results; on Windows stick with TRELLIS 1 (16 GB) or the Spaces [26][27]
3. **Import GLB/OBJ into Blender (free)** for cleanup, renders, and turntable MP4s for social posts.

### Budget summary
Everything in the recommended stack is $0: ComfyUI (free) + open weights (free downloads, on your non-C: drive) + free official HF Spaces for 3D + your $0.10/mo HF credits for prompt experiments [52]. SaaS free tiers (Meshy/Tripo) are useful only as occasional quality cross-checks given their download caps and license restrictions [45][46].

---

## Sources

1. Qwen-Image model card (Apache 2.0, 20B) — https://huggingface.co/Qwen/Qwen-Image
2. Qwen-Image-Edit-2509 model card (multi-image person+product, product consistency, ControlNet) — https://huggingface.co/Qwen/Qwen-Image-Edit-2509
3. Qwen-Image-Edit-2511 model card (latest; Apache 2.0; industrial design, drift fixes) — https://huggingface.co/Qwen/Qwen-Image-Edit-2511
4. QwenLM/Qwen-Image official GitHub — https://github.com/QwenLM/Qwen-Image
5. Z-Image-Turbo model card (6B, Apache 2.0, 8 NFEs, 16 GB VRAM) — https://huggingface.co/Tongyi-MAI/Z-Image-Turbo
6. Tongyi-MAI/Z-Image official GitHub — https://github.com/Tongyi-MAI/Z-Image
7. ComfyUI blog: Z-Image day-0 native support — https://blog.comfy.org/p/z-image-day-0-support-in-comfyui
8. black-forest-labs/flux2 GitHub (FLUX.2 family table: klein 4B Apache 2.0 / 9B + dev non-commercial, VRAM, dates) — https://github.com/black-forest-labs/flux2
9. BFL announcement: FLUX.2 — https://bfl.ai/blog/flux-2
10. FLUX.2-dev model card (32B, non-commercial) — https://huggingface.co/black-forest-labs/FLUX.2-dev
11. FLUX.1-Kontext-dev model card (12B, non-commercial weights / commercial outputs, ComfyUI) — https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev
12. FLUX.1-schnell model card (Apache 2.0) — https://huggingface.co/black-forest-labs/FLUX.1-schnell
13. ComfyUI blog: FLUX.2 [klein] 4B & 9B support — https://blog.comfy.org/p/flux2-klein-4b-fast-local-image-editing
14. ComfyUI blog: Qwen Image Edit 2511 in ComfyUI — https://blog.comfy.org/p/qwen-image-edit-2511-and-qwen-image
15. HiDream-I1-Full model card (MIT) — https://huggingface.co/HiDream-ai/HiDream-I1-Full
16. HiDream-ai/HiDream-I1 GitHub (17B params) — https://github.com/HiDream-ai/HiDream-I1
17. Lumina-Image 2.0 model card (2.6B, Apache 2.0) — https://huggingface.co/Alpha-VLLM/Lumina-Image-2.0
18. Sana_1600M_1024px model card (NVIDIA SANA family) — https://huggingface.co/Efficient-Large-Model/Sana_1600M_1024px
19. SANA paper (0.6B on 16 GB laptop GPU, <1 s @1024²) — https://arxiv.org/abs/2410.10629
20. NVIDIA Open Model License (permissive, commercial use) — https://www.nvidia.com/en-us/agreements/enterprise-software/nvidia-open-model-license/
21. SD 3.5 Medium model card (Community License, <$1M free commercial) — https://huggingface.co/stabilityai/stable-diffusion-3.5-medium
22. Stability AI Community License — https://stability.ai/license
23. SDXL base 1.0 model card (Open RAIL++-M, ~3B) — https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0
24. lllyasviel/IC-Light repo — https://github.com/lllyasviel/IC-Light
25. IC-Light V2 announcement (Flux-based, non-commercial) — https://github.com/lllyasviel/IC-Light/discussions/98
26. microsoft/TRELLIS GitHub (MIT, 16 GB min, GLB export, official Space) — https://github.com/microsoft/TRELLIS
27. microsoft/TRELLIS.2 GitHub (TRELLIS.2-4B, MIT code+weights, PBR, 24 GB, Linux, GLB) — https://github.com/microsoft/TRELLIS.2
28. TRELLIS.2-4B weights — https://huggingface.co/microsoft/TRELLIS.2-4B
29. Official TRELLIS HF Space (free demo) — https://huggingface.co/spaces/Microsoft/TRELLIS
30. Tencent-Hunyuan/Hunyuan3D-2 GitHub (VRAM 6/16 GB, variants, Windows, Blender addon) — https://github.com/Tencent-Hunyuan/Hunyuan3D-2
31. Hunyuan3D-2 model card (tencent-hunyuan-community license) — https://huggingface.co/tencent/Hunyuan3D-2
32. Official Hunyuan3D-2.1 HF Space (image/multi-view/text → downloadable mesh) — https://huggingface.co/spaces/tencent/Hunyuan3D-2.1
33. Hunyuan3D-2.1 model card — https://huggingface.co/tencent/Hunyuan3D-2.1
34. Tencent-Hunyuan/Hunyuan3D-Omni GitHub (community license, multi-condition) — https://github.com/Tencent-Hunyuan/Hunyuan3D-Omni
35. stabilityai/TripoSR model card (MIT) — https://huggingface.co/stabilityai/TripoSR
36. VAST-AI-Research/TripoSR GitHub (VRAM ~6 GB, chunk-size tuning) — https://github.com/VAST-AI-Research/TripoSR
37. Stability-AI/stable-point-aware-3d GitHub (SPAR3D VRAM 10.5/7/6 GB, GLB, point cloud editing) — https://github.com/Stability-AI/stable-point-aware-3d
38. Stability AI SPAR3D announcement — https://stability.ai/news-updates/stable-point-aware-3d
39. TencentARC/InstantMesh GitHub (Apache 2.0 code / non-commercial weights) — https://github.com/tencentarc/instantmesh
40. DreamTechAI/Direct3D-S2 GitHub (MIT, 10 GB @512³ / 24 GB @1024³) — https://github.com/DreamTechAI/Direct3D-S2
41. Direct3D-S2 HF Space demo — https://huggingface.co/spaces/wushuang98/Direct3D-S2-v1.0-demo
42. wgsxm/PartCrafter GitHub (parts-aware generation; check license) — https://github.com/wgsxm/PartCrafter
43. stepfun-ai/Step1X-3D GitHub (Apache 2.0) — https://github.com/stepfun-ai/Step1X-3D
44. Step1X-3D model card — https://huggingface.co/stepfun-ai/Step1X-3D
45. Meshy pricing / free tier (100 credits/mo, ~10 downloads, formats, CC-BY) — https://www.meshy.ai/pricing
46. Tripo AI pricing (free plan non-commercial, formats) — https://www.tripo3d.ai/pricing
47. Hyper3D (Rodin) pricing — https://hyper3d.ai/pricing
48. Luma AI homepage (pivoted to video; Genie sunset) — https://lumalabs.ai/
49. Spline AI (free tool; AI generation on paid Super plan) — https://spline.design/
50. fal.ai pricing (no recurring free tier) — https://fal.ai/pricing
51. Replicate pricing (pay-as-you-go; no monthly free credits) — https://replicate.com/pricing
52. HF Inference Providers pricing ($0.10/mo free credits) — https://huggingface.co/docs/inference-providers/en/pricing
53. ComfyUI docs: Z-Image Turbo workflow — https://docs.comfy.org/tutorials/image/z-image/z-image-turbo
54. ComfyUI docs: Qwen-Image-Edit-2511 workflow — https://docs.comfy.org/tutorials/image/qwen/qwen-image-edit-2511
55. Ollama (LLM/GGUF runtime only — not for diffusion or 3D models) — https://ollama.com
56. HunyuanImage 3.0 (80B MoE open image model; heavyweight curiosity) — https://huggingface.co/tencent-hunyuan/HunyuanImage-3.0

**Approximation disclaimer:** file sizes marked "est." are derived from parameter counts × dtype (e.g., 6B BF16 ≈ 12 GB) — confirm the actual safetensors size on each HF repo's "Files" tab before downloading. VRAM figures quoted without "est." come from the linked primary source.
