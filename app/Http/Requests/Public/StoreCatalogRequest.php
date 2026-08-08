<?php

declare(strict_types=1);

namespace App\Http\Requests\Public;

use App\Support\PhoneNumber;
use Illuminate\Foundation\Http\FormRequest;

class StoreCatalogRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'company' => ['nullable', 'string', 'max:160'],
            'phone' => ['required', 'string', 'max:32', PhoneNumber::RULE],
            'email' => ['nullable', 'email:rfc,dns', 'max:190'],
            'city' => ['nullable', 'string', 'max:64'],
            'message' => ['nullable', 'string', 'max:2000'],
            'website' => ['prohibited'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return [
            'name' => __('contact.field.name'),
            'company' => __('contact.field.company'),
            'phone' => __('contact.field.phone'),
            'email' => __('contact.field.email'),
            'city' => __('contact.field.city'),
            'message' => __('contact.field.message'),
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'phone.regex' => __('contact.validation.phone'),
            'website.prohibited' => __('contact.validation.spam'),
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'phone' => PhoneNumber::normalise((string) $this->input('phone', '')),
        ]);
    }
}
