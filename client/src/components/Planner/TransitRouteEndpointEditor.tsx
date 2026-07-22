import type { TransitRouteEndpointsUpdateRequest } from '@trek/shared';
import { useState } from 'react';
import { useTranslation } from '../../i18n';
import type { ReservationEndpoint } from '../../types';

interface EndpointFieldState {
  name: string;
  lat: string;
  lng: string;
}

interface TransitRouteEndpointEditorProps {
  from: ReservationEndpoint;
  to: ReservationEndpoint;
  onSave: (input: TransitRouteEndpointsUpdateRequest) => Promise<unknown>;
  onCancel: () => void;
}

function buildFields(endpoint: ReservationEndpoint): EndpointFieldState {
  return { name: endpoint.name, lat: String(endpoint.lat), lng: String(endpoint.lng) };
}

function normalize(endpoint: EndpointFieldState): { name: string; lat: number; lng: number } | null {
  const name = endpoint.name.trim();
  if (!name || name.length > 300) return null;
  if (endpoint.lat.trim() === '' || endpoint.lng.trim() === '') return null;
  const lat = Number(endpoint.lat);
  const lng = Number(endpoint.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return null;
  return { name, lat, lng };
}

function validateField(
  endpoint: EndpointFieldState,
  t: (key: string) => string
): { name?: string; lat?: string; lng?: string } {
  const errors: { name?: string; lat?: string; lng?: string } = {};
  const name = endpoint.name.trim();
  if (!name || name.length > 300) errors.name = t('transit.endpointInvalidName');
  if (endpoint.lat.trim() === '') {
    errors.lat = t('transit.endpointInvalidLatitude');
  } else {
    const lat = Number(endpoint.lat);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) errors.lat = t('transit.endpointInvalidLatitude');
  }
  if (endpoint.lng.trim() === '') {
    errors.lng = t('transit.endpointInvalidLongitude');
  } else {
    const lng = Number(endpoint.lng);
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) errors.lng = t('transit.endpointInvalidLongitude');
  }
  return errors;
}

function isUnchanged(
  normalized: { name: string; lat: number; lng: number } | null,
  original: ReservationEndpoint
): boolean {
  if (!normalized) return false;
  return normalized.name === original.name && normalized.lat === original.lat && normalized.lng === original.lng;
}

interface EndpointCardProps {
  label: string;
  fields: EndpointFieldState;
  errors: ReturnType<typeof validateField>;
  onChange: (fields: EndpointFieldState) => void;
  t: (key: string) => string;
}

function EndpointCard({ label, fields, errors, onChange, t }: EndpointCardProps) {
  const set = (key: keyof EndpointFieldState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...fields, [key]: e.target.value });
  };
  return (
    <div
      className="bg-surface-tertiary"
      style={{ borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <div
        className="text-content-faint"
        style={{
          fontSize: 'calc(11px * var(--fs-scale-caption, 1))',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <input
            value={fields.name}
            onChange={set('name')}
            aria-label={`${label} — ${t('transit.endpointName')}`}
            className="w-full rounded-[8px] border border-edge bg-surface-input px-[10px] py-[8px] font-[inherit] text-[13px] text-content outline-none"
          />
          {errors.name && (
            <div style={{ fontSize: 'calc(11px * var(--fs-scale-body, 1))', color: '#ef4444', marginTop: 3 }}>
              {errors.name}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <input
              value={fields.lat}
              onChange={set('lat')}
              aria-label={`${label} — ${t('transit.endpointLatitude')}`}
              placeholder={t('transit.endpointLatitude')}
              className="w-full rounded-[8px] border border-edge bg-surface-input px-[10px] py-[8px] font-[inherit] text-[13px] text-content outline-none"
            />
            {errors.lat && (
              <div style={{ fontSize: 'calc(11px * var(--fs-scale-body, 1))', color: '#ef4444', marginTop: 3 }}>
                {errors.lat}
              </div>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <input
              value={fields.lng}
              onChange={set('lng')}
              aria-label={`${label} — ${t('transit.endpointLongitude')}`}
              placeholder={t('transit.endpointLongitude')}
              className="w-full rounded-[8px] border border-edge bg-surface-input px-[10px] py-[8px] font-[inherit] text-[13px] text-content outline-none"
            />
            {errors.lng && (
              <div style={{ fontSize: 'calc(11px * var(--fs-scale-body, 1))', color: '#ef4444', marginTop: 3 }}>
                {errors.lng}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TransitRouteEndpointEditor({ from, to, onSave, onCancel }: TransitRouteEndpointEditorProps) {
  const { t } = useTranslation();
  const [fromFields, setFromFields] = useState(() => buildFields(from));
  const [toFields, setToFields] = useState(() => buildFields(to));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fromErrors = validateField(fromFields, t);
  const toErrors = validateField(toFields, t);
  const normalizedFrom = normalize(fromFields);
  const normalizedTo = normalize(toFields);
  const hasChanges = !isUnchanged(normalizedFrom, from) || !isUnchanged(normalizedTo, to);
  const hasErrors =
    !!fromErrors.name || !!fromErrors.lat || !!fromErrors.lng || !!toErrors.name || !!toErrors.lat || !!toErrors.lng;
  const canSave = hasChanges && !hasErrors && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    const input: TransitRouteEndpointsUpdateRequest = {};
    if (normalizedFrom && !isUnchanged(normalizedFrom, from)) {
      input.from = normalizedFrom;
    }
    if (normalizedTo && !isUnchanged(normalizedTo, to)) {
      input.to = normalizedTo;
    }
    try {
      await onSave(input);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : t('common.error'));
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 8 }}>
      <div className="text-content" style={{ fontSize: 'calc(14px * var(--fs-scale-subtitle, 1))', fontWeight: 700 }}>
        {t('transit.endpointEditorTitle')}
      </div>
      <div
        className="bg-surface-tertiary"
        style={{
          padding: '11px 14px',
          borderRadius: 10,
          fontSize: 'calc(12px * var(--fs-scale-body, 1))',
          lineHeight: 1.45,
          border: '1px solid var(--border-primary)',
        }}
      >
        <div className="text-content-muted">{t('transit.endpointMapOnlyHint')}</div>
      </div>

      <EndpointCard
        label={t('transit.endpointOrigin')}
        fields={fromFields}
        errors={fromErrors}
        onChange={setFromFields}
        t={t}
      />
      <EndpointCard
        label={t('transit.endpointDestination')}
        fields={toFields}
        errors={toErrors}
        onChange={setToFields}
        t={t}
      />

      {saveError && (
        <div style={{ fontSize: 'calc(12px * var(--fs-scale-body, 1))', color: '#ef4444' }}>{saveError}</div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            padding: '8px 16px',
            borderRadius: 10,
            border: '1px solid var(--border-primary)',
            background: 'none',
            fontSize: 'calc(12px * var(--fs-scale-body, 1))',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
          className="text-content"
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="bg-[var(--text-primary)] text-[var(--bg-primary)]"
          style={{
            padding: '8px 20px',
            borderRadius: 10,
            border: 'none',
            fontSize: 'calc(12px * var(--fs-scale-body, 1))',
            fontWeight: 600,
            cursor: canSave ? 'pointer' : 'default',
            fontFamily: 'inherit',
            opacity: canSave ? 1 : 0.5,
          }}
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  );
}
