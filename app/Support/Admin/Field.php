<?php

declare(strict_types=1);

namespace App\Support\Admin;

use App\Support\Enums\HasLabel;
use BackedEnum;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;
use Stringable;

/**
 * Describes one field of an admin resource, for both the list table and the
 * edit form.
 *
 * Resources declare their fields once; the generic index and form views render
 * them. Twenty hand-written view pairs would drift apart within a month, and a
 * field added to a form but forgotten in validation is exactly the sort of gap
 * that becomes a mass-assignment bug.
 */
final readonly class Field
{
    /**
     * @param  string  $type  text|textarea|translated|translated-area|number|select|checkbox|date|media|slug|color
     * @param  array<string, string>  $options  for select fields
     * @param  list<string>  $rules  validation rules for this field
     */
    private function __construct(
        public string $name,
        public string $label,
        public string $type = 'text',
        public array $options = [],
        public array $rules = [],
        public ?string $hint = null,
        public bool $inIndex = false,
        public bool $inForm = true,
        public bool $required = false,
        public ?string $relation = null,
        public bool $multiple = false,
    ) {}

    public static function text(string $name, string $label, array $rules = ['nullable', 'string', 'max:190']): self
    {
        return new self($name, $label, 'text', rules: $rules);
    }

    /**
     * A translatable field, rendered as one input per locale and validated as
     * an array keyed by locale.
     */
    public static function translated(string $name, string $label, bool $required = false, bool $long = false): self
    {
        $default = config('localization.default', 'fa');

        return new self(
            name: $name,
            label: $label,
            type: $long ? 'translated-area' : 'translated',
            rules: $required
                ? ['required', 'array', "required_array_keys:{$default}"]
                : ['nullable', 'array'],
            required: $required,
        );
    }

    public static function number(string $name, string $label, array $rules = ['nullable', 'integer', 'min:0']): self
    {
        return new self($name, $label, 'number', rules: $rules);
    }

    /**
     * @param  array<string, string>  $options
     */
    public static function select(string $name, string $label, array $options, array $rules = ['nullable']): self
    {
        return new self($name, $label, 'select', options: $options, rules: $rules);
    }

    /**
     * A select over a backed enum.
     *
     * Options and validation both derive from the enum itself, so a case can
     * never be offered without also being accepted — nor, more dangerously,
     * accepted without being offered. Hand-written variants of this had already
     * drifted: two of them listed the cases but validated only `nullable`, so
     * any string at all could be stored in the column.
     *
     * @param  class-string<BackedEnum&HasLabel>  $enum
     */
    public static function enum(string $name, string $label, string $enum, bool $required = false): self
    {
        $options = [];

        foreach ($enum::cases() as $case) {
            $options[(string) $case->value] = $case->label();
        }

        return new self(
            name: $name,
            label: $label,
            type: 'select',
            options: $options,
            rules: [$required ? 'required' : 'nullable', Rule::enum($enum)],
            required: $required,
        );
    }

    /**
     * A belongsToMany relation, rendered as a multi-select and synced by the
     * controller rather than mass assigned.
     *
     * @param  array<string, string>  $options
     */
    public static function relation(string $name, string $label, array $options, string $relation): self
    {
        return new self(
            name: $name,
            label: $label,
            type: 'select',
            options: $options,
            rules: ['nullable', 'array'],
            relation: $relation,
            multiple: true,
        );
    }

    public static function checkbox(string $name, string $label): self
    {
        return new self($name, $label, 'checkbox', rules: ['nullable', 'boolean']);
    }

    public static function date(string $name, string $label, array $rules = ['nullable', 'date']): self
    {
        return new self($name, $label, 'date', rules: $rules);
    }

    public static function media(string $name, string $label, string $hint = ''): self
    {
        return new self(
            $name,
            $label,
            'media',
            rules: ['nullable', 'integer', 'exists:media,id'],
            hint: $hint !== '' ? $hint : null,
        );
    }

    public static function color(string $name, string $label): self
    {
        return new self($name, $label, 'color', rules: ['nullable', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/']);
    }

    /** Also render this field as a column in the list table. */
    public function listed(): self
    {
        return $this->with(inIndex: true);
    }

    /** Show in the list table only, never in the form (computed columns). */
    public function readOnly(): self
    {
        return $this->with(inIndex: true, inForm: false);
    }

    public function hint(string $hint): self
    {
        return $this->with(hint: $hint);
    }

    /**
     * @param  list<string>  $rules
     */
    public function rules(array $rules): self
    {
        return $this->with(rules: $rules);
    }

    public function required(): self
    {
        return $this->with(required: true);
    }

    public function isTranslated(): bool
    {
        return in_array($this->type, ['translated', 'translated-area'], true);
    }

    /**
     * The option-map key a stored value corresponds to.
     *
     * A column cast to a backed enum hands back an enum instance, while the
     * options map is keyed by the scalar behind it. Casting that object to
     * string throws — and it throws while evaluating the array subscript, so a
     * trailing `?? $fallback` never gets the chance to run.
     */
    public function optionKey(mixed $value): string
    {
        return match (true) {
            $value instanceof BackedEnum => (string) $value->value,
            is_bool($value) => $value ? '1' : '0',
            is_scalar($value) => (string) $value,
            // Dates and other value objects still render as themselves.
            $value instanceof Stringable => (string) $value,
            default => '',
        };
    }

    /**
     * The human label for a stored value: the option map first, the enum's own
     * label second, and the raw value only as a last resort.
     *
     * Handles the multi-value case too, so listing a relation column shows the
     * related names rather than fatally stringifying a Collection.
     */
    public function optionLabel(mixed $value, string $empty = '—'): string
    {
        if ($value instanceof Collection || is_array($value)) {
            $labels = collect($value)
                ->map(fn (mixed $item): string => $this->optionLabel(
                    $item instanceof Model ? $item->getKey() : $item,
                    empty: '',
                ))
                ->filter()
                ->all();

            return $labels === [] ? $empty : implode('، ', $labels);
        }

        $key = $this->optionKey($value);

        return $this->options[$key]
            ?? match (true) {
                $value instanceof HasLabel => $value->label(),
                $key !== '' => $key,
                default => $empty,
            };
    }

    private function with(mixed ...$overrides): self
    {
        return new self(
            name: $overrides['name'] ?? $this->name,
            label: $overrides['label'] ?? $this->label,
            type: $overrides['type'] ?? $this->type,
            options: $overrides['options'] ?? $this->options,
            rules: $overrides['rules'] ?? $this->rules,
            hint: $overrides['hint'] ?? $this->hint,
            inIndex: $overrides['inIndex'] ?? $this->inIndex,
            inForm: $overrides['inForm'] ?? $this->inForm,
            required: $overrides['required'] ?? $this->required,
            relation: $overrides['relation'] ?? $this->relation,
            multiple: $overrides['multiple'] ?? $this->multiple,
        );
    }
}
