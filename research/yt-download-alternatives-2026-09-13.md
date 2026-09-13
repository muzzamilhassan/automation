# Deep Research: Alternatives for YouTube Download from CI (2026-09-13)

## The problem (recap)

The recycler needs to DOWNLOAD the channel's own old Short before re-uploading it.
YouTube blocks ALL automated downloads from datacenter IPs with "Sign in to confirm
you're not a bot" — GitHub Actions runners (Azure IPs) are heavily flagged
(yt-dlp#12264, #9890). Confirmed experimentally: runs 34722571043 / 34722761908 /
34749926158 — 30+ attempts, 8 clients, cookies + no-cookies, bgutil plugin → same wall.

## A. Fix the wall on CI (stay 100% cloud)

### A1. bgutil PO-token — one more debug pass possible (uncertain)
- bgutil is THE standard open-source fix (Brainicism/bgutil-ytdlp-pot-provider, 2.0.0).
  Purpose-built to bypass this exact message on flagged IPs.
- BUT its own issue #37 reports the error persisting on GitHub Actions even with the
  provider running — DC IPs may need cookies AND PO tokens together.
- Our setup had a likely silent failure: pip plugin version vs server 2.0.0 may mismatch
  (plugin fetched no tokens — we never verified with -v after the path fix).
- One more pass would: pin plugin+server versions, run `yt-dlp -v` to confirm
  "Generating POT" lines, add `--impersonate` (curl-cffi fixes TLS fingerprint mismatch —
  a second blocker documented in GitHub community discussions), try mweb-only.
- Cost $0. Success chance: unknown, maybe 30-50%.

### A2. Residential proxy (high success, ~$0 possible)
- `yt-dlp --proxy http://user:pass@proxy:port` routes the download through a
  residential IP. Residential IPs pass the wall (android client from home IP works with
  NO cookies — proven locally).
- **Webshare free tier: 10 proxies + ~1GB/mo free, no card** (webshare.io). A recycled
  Short is ~2-4MB → free tier covers ~250 recycles/month.
- Paid: IPRoyal/Decodo/Bright Data ~$1.80-7/GB if ever needed.
- Risk: proxy quality varies; some "residential" IPs are flagged too. Test before commit.
- Sources: webshare.io, huntapi.com/blog/yt-dlp-proxy-guide, roundproxies.com 2026 guide.

### A3. `--impersonate` (TLS fingerprint)
- Cheap addition (`pip install yt-dlp[default,curl-cffi]` + `--impersonate chrome`).
  Fixes the TLS-fingerprint mismatch that can block even proxied downloads. Worth adding
  to any attempt; not sufficient alone on Azure IPs.

## B. Avoid YouTube download entirely (architecture change)

### B1. ⭐ GitHub Releases archive (RECOMMENDED)
- Every rendered Short is ALSO attached to a GitHub Release in the private repo
  (`gh release create archive-YYYY-MM-DD file.mp4`). Release assets: 2GB per file,
  no meaningful total cap, free, private on a private repo.
- Recycler then downloads from **GitHub Releases** — no YouTube involved, no bot wall,
  works 100% on CI, $0, survives forever (unlike Actions artifacts = 90 days).
- One-time local seeding: agent downloads the existing oldest ~50-60 Shorts per channel
  from the PC once (local downloads proven working) and pushes them to Releases.
  After that, the recycle pool is fully cloud-served and the PC is never needed again.
- Effort: ~60 lines (archive step in yt-daily + release download in recycler) + one
  seeding session.

### B2. Alternatives to Releases
- Git LFS: free 1GB storage + 1GB bandwidth/mo — too tight at ~1GB/mo of renders.
- Hugging Face private dataset repo: free, works, but Releases are simpler (already
  authenticated in CI).

### B3. Self-hosted GitHub runner on the PC
- Register the PC as a `runs-on: self-hosted` runner: the recycle job runs "in GitHub"
  but executes from the home IP. Free, keeps Actions UI/logs. PC must be on at that time.

## C. Other platforms (all hit the same wall — researched and ruled out)

| Platform | Result |
|---|---|
| GitLab CI / CircleCI / Azure DevOps | datacenter IPs, same bot-wall |
| Google Colab | Google IPs, blocked + ToS risk |
| Oracle/AWS/GCP free VPS | datacenter IPs, same wall |
| Cloudflare Workers | no yt-dlp runtime, egress = DC IPs |
| Public Invidious / Piped instances | effectively dead for streams since 2024-2025 (PO-token requirements killed them); self-host = same DC problem |
| Paid "YouTube download" APIs (RapidAPI etc.) | unreliable, against ToS, costs — not recommended |

## Verdict

1. **Permanent fix:** B1 archive plan ($0, no bot wall, PC needed only once for seeding).
2. **Quick supplement:** A2 Webshare free proxy for any stragglers not in the archive.
3. **Optional experiment:** A1 debug pass, only if curious — not required.
4. C-platforms: dead end, stop looking there.

## Sources
- yt-dlp issues 12264, 9890, 11053, 12475, 15800 (github.com/yt-dlp/yt-dlp)
- bgutil-ytdlp-pot-provider + issue #37 (github.com/Brainicism/bgutil-ytdlp-pot-provider)
- webshare.io free tier; huntapi.com yt-dlp proxy guide; roundproxies.com 2026 guide
- r/youtubedl scaling thread (1rbihik), hosted-backend thread (1pkcxsf)
