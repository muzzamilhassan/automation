// CI Doctor alert planning (audit 2026-11-13 #7b). Pure — unit-tested in
// tests/doctor-alerts.test.mjs.
//
// Before: every doctor run (3/day) with any non-OK channel pushed ntfy,
// commented on issue #90 and exited 1 — investors-compass STALE for 420h meant
// ~50 identical pages, and the red exit skipped the report commit. Now the
// previous committed report (ci-doctor-report.json) carries `alerts`
// { slug: { status, at } } — what was last paged and when:
//   - new problem, or a problem that changed kind  -> alertNow
//   - same problem, last page >= reminderHours ago  -> reminders (one per window)
//   - previously alerted slug now OK               -> recovered (announced once)

export const DEFAULT_REMINDER_HOURS = 24;

export function planDoctorAlerts(prevReport, results, now = new Date(), { reminderHours = DEFAULT_REMINDER_HOURS } = {}) {
  const prevAlerts = (prevReport && typeof prevReport.alerts === 'object' && prevReport.alerts) || {};
  const nowIso = new Date(now).toISOString();
  const alertNow = [];
  const reminders = [];
  const recovered = [];
  const alerts = {};

  for (const r of results || []) {
    const last = prevAlerts[r.slug];
    if (r.status === 'OK') {
      if (last) recovered.push(r.slug);
      continue;
    }
    if (!last || last.status !== r.status) {
      alertNow.push(r);
      alerts[r.slug] = { status: r.status, at: nowIso };
    } else if (new Date(now) - new Date(last.at) >= reminderHours * 3600000) {
      reminders.push(r);
      alerts[r.slug] = { status: r.status, at: nowIso };
    } else {
      alerts[r.slug] = last;
    }
  }
  return { alertNow, reminders, recovered, alerts };
}

// Red only when an alert was due and could not be delivered anywhere — the
// issue #69 rule ("a watchdog that can't bark" must be visible), without
// painting every run red for a problem that was already paged.
export function doctorExitCode({ due, delivered }) {
  return due && !delivered ? 1 : 0;
}
