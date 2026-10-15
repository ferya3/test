import { Field } from './form';
import { Input, Select, Textarea } from '@/components/ui/input';
import { getSettings, TRANSLATED_SETTINGS, type SettingKey, type TranslatedSettingKey } from '@/lib/queries';

export type SettingsItem = {
  key: SettingKey;
  label: string;
  long?: boolean;
  ltr?: boolean;
  hint?: string;
  /** A fixed choice (value, label) instead of free text. */
  options?: [string, string][];
};
export type SettingsGroup = { title: string; description?: string; items: SettingsItem[] };

/**
 * Settings fields in titled groups, for a form posting to saveSettings. A text
 * setting has its English version beside it; the English shown is what the
 * English site shows now — the saved English, or its built-in default.
 */
export function SettingsFields({ groups }: { groups: SettingsGroup[] }) {
  const settings = getSettings();
  const english = getSettings('en');

  return groups.map((group) => (
    <fieldset key={group.title} className="grid gap-5 border-b border-ink-100 pb-6 last-of-type:border-0 [&+&]:mt-6">
      <legend className="mb-1 text-h3 font-bold text-ink-950">{group.title}</legend>
      {group.description && <p className="-mt-3 text-sm text-ink-500">{group.description}</p>}
      {group.items.map((item) => {
        const translated = (TRANSLATED_SETTINGS as readonly string[]).includes(item.key);
        const enKey = `${item.key}_en`;

        if (item.options) {
          return (
            <Field key={item.key} name={item.key} label={item.label} hint={item.hint} className="max-w-sm">
              <Select id={item.key} name={item.key} defaultValue={settings[item.key]}>
                {item.options.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          );
        }

        return (
          <div key={item.key} className={translated ? 'grid gap-3 lg:grid-cols-2 lg:gap-5' : undefined}>
            <Field name={item.key} label={item.label} hint={item.hint}>
              {item.long ? (
                <Textarea id={item.key} name={item.key} defaultValue={settings[item.key]} className="min-h-28" maxLength={6000} />
              ) : (
                <Input id={item.key} name={item.key} defaultValue={settings[item.key]} dir={item.ltr ? 'ltr' : undefined} maxLength={300} />
              )}
            </Field>

            {/* The English version, beside it on wide screens. */}
            {translated && (
              <Field name={enKey} label={`${item.label} — انگلیسی`}>
                {item.long ? (
                  <Textarea id={enKey} name={enKey} defaultValue={english[item.key as TranslatedSettingKey]} dir="ltr" className="min-h-28" maxLength={6000} />
                ) : (
                  <Input id={enKey} name={enKey} defaultValue={english[item.key as TranslatedSettingKey]} dir="ltr" maxLength={300} />
                )}
              </Field>
            )}
          </div>
        );
      })}
    </fieldset>
  ));
}
