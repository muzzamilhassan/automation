// #112 — target-audience presets for the Add Channel wizard's short-slot
// suggestion. DATA ONLY, like lib/niches.js: the wizard renders from this
// table, never from component-local literals. Each preset names the region's
// typical evening-viewing peak expressed in UTC (what the scheduler/gate
// already accepts: plain HH:MM) plus an honest local-time label — winter/
// summer clock shifts are called out, not hidden.
//
// These are GENERAL best-practice starting points for NEW channels, not
// per-channel data: upgrading the suggestion to the channel's own YouTube
// Analytics viewer-hours is a planned future issue (stated in the UI too).
export const AUDIENCES = [
  { id: 'us-ca', label: 'US & Canada', utc: '00:00', local: '7:00 pm ET (winter) / 8:00 pm (summer)', peak: 'US & Canada' },
  { id: 'uk-ie', label: 'UK & Ireland', utc: '19:00', local: '7:00 pm in London', peak: 'UK & Ireland' },
  { id: 'west-eu', label: 'Western Europe', utc: '18:00', local: '7:00 pm in Berlin/Paris', peak: 'Western Europe' },
  { id: 'gulf', label: 'Middle East (Gulf)', utc: '16:00', local: '8:00 pm in Dubai/Riyadh', peak: 'Gulf viewers' },
  { id: 'south-asia', label: 'South Asia', utc: '15:00', local: '8:00 pm PK / 8:30 pm IST', peak: 'South Asia' },
  { id: 'global', label: 'Global English', utc: '21:00', local: '4:00 pm ET / 9:00 pm UK (winter)', peak: 'mixed English-speaking' },
];

// The preset for an audience id, or null when unknown — the caller treats
// null as "no suggestion" and never touches the slot field.
export function suggestionFor(id) {
  if (!id) return null;
  return AUDIENCES.find((a) => a.id === id) || null;
}

// The suggestion chip's exact text. Pure so node --test pins the wording
// the owner sees ("Suggested: HH:MM UTC ≈ HH:MM local — evening peak…").
export function suggestionText(id) {
  const a = suggestionFor(id);
  if (!a) return '';
  return `Suggested: ${a.utc} UTC ≈ ${a.local} — evening peak for ${a.peak} viewers`;
}
