// Template registry metadata validator + loader (schema v1).
// Pure logic only — no DB, no UI. The metadata itself lives in
// template-registry.data.js and is seeded by a later task.

const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_FORMATS = ['short', 'long'];
const ALLOWED_CAPABILITIES = ['script-gen', 'tts', 'captions', 'image-gen'];
const ALLOWED_REVIEW_REQUIRED = ['health', 'finance', 'all'];

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

function isStringArray(v) {
  return Array.isArray(v) && v.every(isNonEmptyString);
}

function isSubsetOf(arr, allowlist) {
  return Array.isArray(arr) && arr.every(v => allowlist.includes(v));
}

/**
 * Validate one registry metadata block against schema v1.
 * Collects all errors (not first-only). Pure and fail-closed.
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
export function validateRegistryMeta(meta) {
  const errors = [];

  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    return { ok: false, errors: ['meta: must be an object'] };
  }

  if (!isNonEmptyString(meta.version) || !SEMVER_RE.test(meta.version)) {
    errors.push(`version: must be semver (MAJOR.MINOR.PATCH), got ${JSON.stringify(meta.version)}`);
  }

  if (!Array.isArray(meta.niches) || meta.niches.length === 0 || !meta.niches.every(isNonEmptyString)) {
    errors.push('niches: must be a non-empty array of non-empty strings');
  }

  if (!Array.isArray(meta.formats) || meta.formats.length === 0 || !isSubsetOf(meta.formats, ALLOWED_FORMATS)) {
    errors.push(`formats: must be a non-empty array drawn from {${ALLOWED_FORMATS.join(', ')}}`);
  }

  if (!isNonEmptyString(meta.renderer)) {
    errors.push('renderer: must be a non-empty string');
  }

  if (!Array.isArray(meta.required_capabilities) || !isSubsetOf(meta.required_capabilities, ALLOWED_CAPABILITIES)) {
    errors.push(`required_capabilities: must be an array drawn from {${ALLOWED_CAPABILITIES.join(', ')}}`);
  }

  if (!Array.isArray(meta.variation_rules) || meta.variation_rules.length === 0 || !meta.variation_rules.every(isNonEmptyString)) {
    errors.push('variation_rules: must be a non-empty array of non-empty strings');
  }

  const safety = meta.safety;
  if (safety === null || typeof safety !== 'object' || Array.isArray(safety)) {
    errors.push('safety: must be an object with required_sources and review_required');
  } else {
    if (typeof safety.required_sources !== 'boolean') {
      errors.push('safety.required_sources: must be a boolean');
    }
    if (!Array.isArray(safety.review_required) || !isSubsetOf(safety.review_required, ALLOWED_REVIEW_REQUIRED)) {
      errors.push(`safety.review_required: must be an array drawn from {${ALLOWED_REVIEW_REQUIRED.join(', ')}}`);
    }
  }

  if (typeof meta.deprecated !== 'boolean') {
    errors.push('deprecated: must be a boolean');
  } else if (meta.deprecated) {
    if (!isNonEmptyString(meta.deprecated_on) || !DATE_RE.test(meta.deprecated_on)) {
      errors.push('deprecated_on: required (YYYY-MM-DD) when deprecated is true');
    }
  } else if (meta.deprecated_on !== undefined && (!isNonEmptyString(meta.deprecated_on) || !DATE_RE.test(meta.deprecated_on))) {
    errors.push('deprecated_on: must be a YYYY-MM-DD date string');
  }

  if (!Array.isArray(meta.changelog)) {
    errors.push('changelog: must be an array of {version, date, note} entries');
  } else {
    meta.changelog.forEach((entry, i) => {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        errors.push(`changelog[${i}]: must be an object`);
        return;
      }
      if (!isNonEmptyString(entry.version) || !SEMVER_RE.test(entry.version)) {
        errors.push(`changelog[${i}].version: must be semver (MAJOR.MINOR.PATCH)`);
      }
      if (!isNonEmptyString(entry.date) || !DATE_RE.test(entry.date)) {
        errors.push(`changelog[${i}].date: must be a YYYY-MM-DD date string`);
      }
      if (!isNonEmptyString(entry.note)) {
        errors.push(`changelog[${i}].note: must be a non-empty string`);
      }
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true };
}
