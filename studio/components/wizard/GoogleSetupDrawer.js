'use client';
// One-time Google setup help — opened from the Connect step, the error
// notice, or automatically when the login can't start (HTTP 500).
import { Settings2 } from 'lucide-react';
import Drawer from '@/components/Drawer';

export default function GoogleSetupDrawer({ open, onClose, origin }) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="One-time Google setup"
      description="Fixes “redirect_uri_mismatch” when the Google login fails"
      icon={Settings2}
      size="md"
      footer={<button type="button" className="btn btn-primary" onClick={onClose}>Done</button>}
    >
      <ol className="list-decimal ml-5 space-y-3 t-13 text-muted leading-relaxed">
        <li>
          Open <span className="font-mono text-ink">console.cloud.google.com → APIs &amp; Services → Credentials</span> and open the OAuth client
          whose ID matches <span className="font-mono text-ink">YOUTUBE_CLIENT_ID</span>.
        </li>
        <li>
          Under <b className="text-ink">Authorized redirect URIs</b>, add both:
          <span className="font-mono t-12 text-accent block mt-1.5 break-all">{origin}/api/oauth/callback</span>
          <span className="font-mono t-12 text-accent block break-all">http://localhost:3000/api/oauth/callback</span>
        </li>
        <li>Save (it can take a few minutes to apply), then press “Connect with Google” again.</li>
      </ol>
    </Drawer>
  );
}
