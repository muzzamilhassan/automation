# Custom n8n image with ffmpeg on top.
# ffmpeg is required so the workflow can run:
#   ffmpeg -i input.mp4 -vn -acodec pcm_s16le audio.wav
# to extract audio before sending it to faster-whisper for transcription.
#
# STRATEGY (multi-stage build):
# The n8n base image has NO package manager (apk and apt-get both missing),
# and HTTP downloads during `docker build` keep failing on the user's ISP
# (throttled / connection closed prematurely). But Docker's OWN image pulls
# work fine via the registry mirror configured in Docker Desktop.
#
# Solution: pull ffmpeg from the `jrottenberg/ffmpeg` image (small, official,
# available on Docker Hub) in a first stage, then COPY just the binaries
# into n8n. Docker's mirror handles the download — no HTTP fetch in build.
#
# ─── Stage 1: extract ffmpeg binaries from a known image ──────────────────
FROM jrottenberg/ffmpeg:4-alpine AS ffmpeg-source

# ─── Stage 2: n8n + the copied ffmpeg ─────────────────────────────────────
FROM n8nio/n8n:latest

USER root

# Copy ffmpeg + ffprobe from the first stage. Their shared libs come along.
COPY --from=ffmpeg-source /usr/local/bin/ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg-source /usr/local/bin/ffprobe /usr/local/bin/ffprobe

# Verify it runs (also surfaces any missing shared-lib issues at build time)
RUN ffmpeg -version | head -1

USER node
