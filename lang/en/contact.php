<?php

declare(strict_types=1);

return [
    'submitted' => 'Your request has been received. Our team will contact you shortly.',
    'form_heading' => 'Send a request',
    'field' => [
        'type' => 'Request type',
        'name' => 'Full name',
        'company' => 'Company',
        'phone' => 'Phone',
        'email' => 'Email',
        'province' => 'Province',
        'city' => 'City',
        'subject' => 'Subject',
        'message' => 'Your message',
    ],
    'hint' => [
        'phone' => 'For example 09121234567 or 02112345678',
        'message' => 'Include the thickness, dimensions and quantity you need so we can answer faster.',
    ],
    'validation' => [
        'phone' => 'That phone number does not look valid.',
        'spam' => 'The form could not be submitted. Please try again.',
    ],
    'channels' => [
        'phone' => 'Factory phone',
        'sales' => 'Sales',
        'email' => 'Email',
        'address' => 'Address',
        'hours' => 'Opening hours',
    ],
];
