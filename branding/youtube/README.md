# ClearFlow Academy YouTube Assets

Official channel: https://www.youtube.com/@ClearFlowAcademy

Use this folder to track public YouTube publishing metadata, channel links, local source file paths, and replacement status.

## Update Flow

1. Render or replace the local MP4 under `academy/generated/`.
2. Upload the MP4 to the ClearFlow Academy YouTube channel.
3. Copy the final YouTube video URL into `branding/youtube/clearflow-academy-catalog.json`.
4. Copy the same URL into the matching `youtubeUrl` field in `src/components/pages/AIStudioPage.tsx`.
5. Redeploy so the in-app Academy card opens YouTube and preserves public views.

Keep scripts in `scripts/` and written narration packages in `academy/`.

Generated guided replacements:

- `academy/generated/clearflow-overview-guided-video.mp4`
- `academy/generated/clearflow-bill-guided-video.mp4`

## Production Standard

Future videos should not be read-only slide decks. Use one of these formats:

- Screen walkthrough: record the actual ClearFlow desk while a narrator explains what to click and where the saved result appears.
- UI-guided explainer: use branded slides only as chapter cards, then show tab/button paths, saved record cards, and verification areas.

Voiceover direction:

- Professional, clear, calm, and lightly upbeat.
- Avoid dull compliance-reading tone.
- Use a helpful teacher personality: direct, encouraging, and practical.
- Do not promise financial execution, payment success, investment returns, or legal/tax outcomes unless the app is showing a verified provider/status path.
