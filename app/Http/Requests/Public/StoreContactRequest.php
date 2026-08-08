<?php

declare(strict_types=1);

namespace App\Http\Requests\Public;

use App\Support\Enums\ContactRequestType;
use App\Support\IranProvinces;
use App\Support\PhoneNumber;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreContactRequest extends FormRequest
{
    /**
     * Public form: anyone may submit. Abuse is handled by rate limiting and the
     * honeypot below, not by authorisation.
     */
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
            'type' => ['required', Rule::enum(ContactRequestType::class)],
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'company' => ['nullable', 'string', 'max:160'],

            'phone' => ['required', 'string', 'max:32', PhoneNumber::RULE],

            'email' => ['nullable', 'email:rfc,dns', 'max:190'],
            'province' => ['nullable', 'string', Rule::in(IranProvinces::all())],
            'city' => ['nullable', 'string', 'max:64'],
            'subject' => ['nullable', 'string', 'max:190'],
            'message' => ['required', 'string', 'min:10', 'max:4000'],

            // Set when the enquiry was raised from a product page.
            'product_id' => ['nullable', 'integer', Rule::exists('products', 'id')->where('is_active', true)],

            // Honeypot: a real person never sees this field, so anything in it
            // is a bot. Named innocuously so it is not obviously a trap.
            'website' => ['prohibited'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return [
            'type' => __('contact.field.type'),
            'name' => __('contact.field.name'),
            'company' => __('contact.field.company'),
            'phone' => __('contact.field.phone'),
            'email' => __('contact.field.email'),
            'province' => __('contact.field.province'),
            'city' => __('contact.field.city'),
            'subject' => __('contact.field.subject'),
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
