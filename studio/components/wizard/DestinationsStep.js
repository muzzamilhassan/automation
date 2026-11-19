'use client';
// Step 6 — optional cross-posting (#106 T4c). The FB/IG/Threads/TikTok lanes
// read these from the registry; an empty field means the lane skips this
// channel honestly. Checked with the same rules the save route uses.
import { validateDestinations } from '@/lib/wizard-steps.mjs';
import { Field } from './fields';

const HANDLES = [
  ['igHandle', 'Instagram'],
  ['threadsHandle', 'Threads'],
  ['tiktokHandle', 'TikTok'],
];

export default function DestinationsStep({ form, setField }) {
  const errs = validateDestinations(form);
  return (
    <div className="space-y-5">
      <p className="t-12 text-muted">Leave a platform empty if the channel has no account there — nothing is posted to it.</p>
      <Field
        label="Facebook page ID"
        optional
        error={errs.fbPageId}
        hint="The numeric page ID (or the UC… page ID). The page must be linked to the Facebook token Studio posts with."
      >
        {(id) => <input id={id} className="input w-full font-mono" value={form.fbPageId} onChange={(e) => setField('fbPageId', e.target.value)} placeholder="114550268199751" />}
      </Field>
      <div className="grid sm:grid-cols-3 gap-4">
        {HANDLES.map(([key, label]) => (
          <Field key={key} label={label} optional error={errs[key]} hint="Saved without the @.">
            {(id) => (
              <div className="flex items-center min-w-0">
                <span className="t-13 text-faint pr-1.5" aria-hidden="true">@</span>
                <input id={id} className="input flex-1 min-w-0 font-mono" value={form[key]} onChange={(e) => setField(key, e.target.value)} placeholder="channel" autoCapitalize="none" spellCheck={false} />
              </div>
            )}
          </Field>
        ))}
      </div>
    </div>
  );
}
